import type { Plugin } from 'vite'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'
import { parseObservatoryScript } from './parse-script'
import { resolveTransformTarget } from './transform-utils'

// CJS/ESM compat shims
const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse
const generate = (_generate as typeof _generate & { default?: typeof _generate }).default ?? _generate

const FETCH_FNS = new Set(['useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData'])

type TObservableCallExpression = t.CallExpression & { __observatoryTransformed?: boolean }

type TFetchCallArgs = {
    keyArg?: t.Expression
    handlerArg?: t.Expression
    optsArg?: t.Expression
}

function isHandlerExpression(node: t.Expression | undefined): node is t.Expression {
    return Boolean(node && (t.isIdentifier(node) || t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)))
}

function shouldSkipTransformFile(id: string): boolean {
    return ['node_modules', 'composable-registry', 'provide-inject-registry', 'fetch-registry', 'instrumentation/asyncData'].some(
        (segment) => id.includes(segment)
    )
}

function getExpression(node: t.Node | null | undefined): t.Expression | undefined {
    return t.isExpression(node) ? node : undefined
}

function shouldSkipWrappedCall(path: import('@babel/traverse').NodePath<t.CallExpression>): boolean {
    const parent = path.parent

    return Boolean(
        parent &&
        t.isCallExpression(parent) &&
        t.isIdentifier(parent.callee) &&
        ['__devFetchCall', 'useTracedAsyncData'].includes(parent.callee.name)
    )
}

function resolveFetchCallArgs(originalName: string, args: t.CallExpression['arguments']): TFetchCallArgs | null {
    if (originalName === 'useAsyncData' || originalName === 'useLazyAsyncData') {
        const first = getExpression(args[0])
        const second = getExpression(args[1])
        const third = getExpression(args[2])

        if (args.length === 1 && first && isHandlerExpression(first)) {
            return { handlerArg: first }
        }

        if (args.length >= 2 && first && second && isHandlerExpression(second)) {
            return {
                keyArg: first,
                handlerArg: second,
                optsArg: third ?? t.objectExpression([]),
            }
        }

        return null
    }

    return {
        keyArg: getExpression(args[0]) ?? t.stringLiteral(''),
        optsArg: getExpression(args[1]) ?? t.objectExpression([]),
    }
}

function slugifyKey(value: string): string {
    return value.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')
}

function resolveFetchKey(originalName: string, keyArg: t.Expression | undefined, optsArg: t.Expression | undefined): string {
    if (originalName !== 'useFetch' && originalName !== 'useLazyFetch') {
        return originalName
    }

    if (optsArg && t.isObjectExpression(optsArg)) {
        const keyProp = optsArg.properties.find(
            (property): property is t.ObjectProperty =>
                t.isObjectProperty(property) &&
                t.isIdentifier(property.key) &&
                property.key.name === 'key' &&
                t.isStringLiteral(property.value)
        )

        if (keyProp && t.isStringLiteral(keyProp.value)) {
            return keyProp.value.value
        }

        if (keyArg && t.isStringLiteral(keyArg)) {
            return slugifyKey(keyArg.value)
        }
    } else if (keyArg && t.isStringLiteral(keyArg)) {
        return slugifyKey(keyArg.value)
    }

    return originalName
}

function buildFetchMeta(id: string, originalName: string, key: string, loc: t.SourceLocation | null | undefined): t.ObjectExpression {
    return t.objectExpression([
        t.objectProperty(t.identifier('key'), t.stringLiteral(key)),
        t.objectProperty(t.identifier('file'), t.stringLiteral(id.split('/').pop() ?? id)),
        t.objectProperty(t.identifier('line'), t.numericLiteral(loc?.start.line ?? 0)),
        t.objectProperty(t.identifier('originalFn'), t.stringLiteral(originalName)),
    ])
}

function buildTransformedFetchCall(
    originalName: string,
    { keyArg, handlerArg, optsArg }: TFetchCallArgs,
    key: string,
    meta: t.ObjectExpression
): TObservableCallExpression | null {
    if ((originalName === 'useAsyncData' || originalName === 'useLazyAsyncData') && handlerArg) {
        const rewrittenArgs = keyArg ? [keyArg, handlerArg, optsArg ?? t.objectExpression([])] : [handlerArg]
        const handlerIndex = keyArg ? 1 : 0

        const newCall = t.callExpression(t.identifier('useTracedAsyncData'), [
            t.identifier(originalName),
            t.arrayExpression(rewrittenArgs),
            t.numericLiteral(handlerIndex),
            keyArg ?? t.stringLiteral(key),
            meta,
        ]) as TObservableCallExpression
        newCall.__observatoryTransformed = true

        return newCall
    }

    const newCall = t.callExpression(t.identifier('__devFetchCall'), [
        t.identifier(originalName),
        keyArg ?? t.stringLiteral(''),
        optsArg ?? t.objectExpression([]),
        meta,
    ]) as TObservableCallExpression
    newCall.__observatoryTransformed = true

    return newCall
}

export function fetchInstrumentPlugin(): Plugin {
    return {
        name: 'vite-plugin-observatory-fetch',
        enforce: 'pre',

        transform(code, id) {
            if (shouldSkipTransformFile(id)) {
                return
            }

            const target = resolveTransformTarget(code, id)

            if (!target) {
                return
            }

            const { scriptCode, scriptStart, isVue, filename, lang } = target

            if (![...FETCH_FNS].some((fn) => scriptCode.includes(fn))) {
                return
            }

            try {
                const ast = parseObservatoryScript(scriptCode, lang, filename)
                let modified = false

                traverse(ast, {
                    CallExpression(path: import('@babel/traverse').NodePath<t.CallExpression>) {
                        if ((path.node as TObservableCallExpression).__observatoryTransformed) {
                            return
                        }

                        const callee = path.node.callee

                        if (!t.isIdentifier(callee) || !FETCH_FNS.has(callee.name)) {
                            return
                        }

                        if (shouldSkipWrappedCall(path)) {
                            return
                        }

                        const originalName = callee.name
                        const args = resolveFetchCallArgs(originalName, path.node.arguments)

                        if (!args) {
                            return
                        }

                        const key = resolveFetchKey(originalName, args.keyArg, args.optsArg)
                        const meta = buildFetchMeta(id, originalName, key, path.node.loc)
                        const newCall = buildTransformedFetchCall(originalName, args, key, meta)

                        if (!newCall) {
                            return
                        }

                        path.replaceWith(newCall)
                        modified = true
                    },
                })

                if (!modified) {
                    return null
                }

                const output = generate(ast, { retainLines: true }, scriptCode)
                const finalCode = isVue
                    ? code.slice(0, scriptStart) + output.code + code.slice(scriptStart + scriptCode.length)
                    : output.code
                const map = output.map ? { ...output.map, file: output.map.file ?? undefined } : null

                return {
                    code: finalCode,
                    map,
                }
            } catch (err) {
                console.warn('[observatory] fetch transform error:', err)

                return null
            }
        },
    }
}
