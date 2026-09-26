import type { Plugin } from 'vite'
import _traverse, { type NodePath } from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'
import { parseObservatoryScript } from './parse-script'
import { resolveTransformTarget } from './transform-utils'

// CJS/ESM compat shims
const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse
const generate = (_generate as typeof _generate & { default?: typeof _generate }).default ?? _generate

const FETCH_FNS = new Set(['useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData'])

type TObservableCallExpression = t.CallExpression & { __observatoryTransformed?: boolean }

interface IFetchCallShape {
    keyArg?: t.Expression
    handlerArg?: t.Expression
    optsArg?: t.Expression
}

interface IInstrumentedFetchCall extends IFetchCallShape {
    originalName: string
    key: string
}

function isHandlerExpression(node: t.Expression | undefined): node is t.Expression {
    return Boolean(node && (t.isIdentifier(node) || t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)))
}

function getExpr(node: t.Node | null | undefined): t.Expression | undefined {
    return t.isExpression(node) ? node : undefined
}

function isAsyncDataName(name: string): boolean {
    return name === 'useAsyncData' || name === 'useLazyAsyncData'
}

function trimHyphens(value: string): string {
    let start = 0
    let end = value.length

    while (start < end && value[start] === '-') {
        start += 1
    }

    while (end > start && value[end - 1] === '-') {
        end -= 1
    }

    return value.slice(start, end)
}

function slugifyFetchKey(value: string): string {
    return trimHyphens(value.replace(/[^a-z0-9]/gi, '-'))
}

function isAlreadyWrapped(path: NodePath<t.CallExpression>): boolean {
    const parent = path.parent

    if (!t.isCallExpression(parent) || !t.isIdentifier(parent.callee)) {
        return false
    }

    return parent.callee.name === '__devFetchCall' || parent.callee.name === 'useTracedAsyncData'
}

function shouldSkipFetchCall(path: NodePath<t.CallExpression>): boolean {
    if ((path.node as TObservableCallExpression).__observatoryTransformed) {
        return true
    }

    const callee = path.node.callee

    if (!t.isIdentifier(callee) || !FETCH_FNS.has(callee.name)) {
        return true
    }

    return isAlreadyWrapped(path)
}

function parseAsyncDataCall(args: t.CallExpression['arguments']): IFetchCallShape | undefined {
    const first = getExpr(args[0])

    if (args.length === 1 && isHandlerExpression(first)) {
        return { handlerArg: first }
    }

    const second = getExpr(args[1])

    if (args.length >= 2 && first && isHandlerExpression(second)) {
        return {
            keyArg: first,
            handlerArg: second,
            optsArg: getExpr(args[2]) ?? t.objectExpression([]),
        }
    }

    return undefined
}

function parseFetchCall(originalName: string, args: t.CallExpression['arguments']): IFetchCallShape | undefined {
    if (isAsyncDataName(originalName)) {
        return parseAsyncDataCall(args)
    }

    return {
        keyArg: getExpr(args[0]) ?? t.stringLiteral(''),
        optsArg: getExpr(args[1]) ?? t.objectExpression([]),
    }
}

function isStringKeyProperty(property: t.ObjectMethod | t.ObjectProperty | t.SpreadElement): property is t.ObjectProperty {
    return t.isObjectProperty(property) && t.isIdentifier(property.key) && property.key.name === 'key' && t.isStringLiteral(property.value)
}

function readStringOptionKey(optsArg: t.Expression | undefined): string | undefined {
    if (!optsArg || !t.isObjectExpression(optsArg)) {
        return undefined
    }

    const keyProp = optsArg.properties.find(isStringKeyProperty)

    if (!keyProp || !t.isStringLiteral(keyProp.value)) {
        return undefined
    }

    return keyProp.value.value
}

function resolveObservatoryKey(originalName: string, keyArg: t.Expression | undefined, optsArg: t.Expression | undefined): string {
    if (originalName !== 'useFetch' && originalName !== 'useLazyFetch') {
        return originalName
    }

    if (optsArg && t.isObjectExpression(optsArg)) {
        const explicitKey = readStringOptionKey(optsArg)

        if (explicitKey) {
            return explicitKey
        }

        if (keyArg && t.isStringLiteral(keyArg)) {
            return slugifyFetchKey(keyArg.value)
        }

        return originalName
    }

    if (keyArg && t.isStringLiteral(keyArg)) {
        return slugifyFetchKey(keyArg.value)
    }

    return originalName
}

function readFetchCall(path: NodePath<t.CallExpression>): IInstrumentedFetchCall | undefined {
    if (shouldSkipFetchCall(path)) {
        return undefined
    }

    const callee = path.node.callee

    if (!t.isIdentifier(callee)) {
        return undefined
    }

    const parsed = parseFetchCall(callee.name, path.node.arguments)

    if (!parsed) {
        return undefined
    }

    return {
        originalName: callee.name,
        ...parsed,
        key: resolveObservatoryKey(callee.name, parsed.keyArg, parsed.optsArg),
    }
}

function markTransformed(call: t.CallExpression): t.CallExpression {
    const marked = call as TObservableCallExpression

    marked.__observatoryTransformed = true

    return marked
}

function buildInstrumentedCall(call: IInstrumentedFetchCall, fileId: string, line: number): t.CallExpression {
    const meta = t.objectExpression([
        t.objectProperty(t.identifier('key'), t.stringLiteral(call.key)),
        t.objectProperty(t.identifier('file'), t.stringLiteral(fileId.split('/').pop() ?? fileId)),
        t.objectProperty(t.identifier('line'), t.numericLiteral(line)),
        t.objectProperty(t.identifier('originalFn'), t.stringLiteral(call.originalName)),
    ])

    if (isAsyncDataName(call.originalName) && call.handlerArg) {
        const rewrittenArgs = call.keyArg ? [call.keyArg, call.handlerArg, call.optsArg ?? t.objectExpression([])] : [call.handlerArg]

        return markTransformed(
            t.callExpression(t.identifier('useTracedAsyncData'), [
                t.identifier(call.originalName),
                t.arrayExpression(rewrittenArgs),
                t.numericLiteral(call.keyArg ? 1 : 0),
                call.keyArg ?? t.stringLiteral(call.key),
                meta,
            ])
        )
    }

    return markTransformed(
        t.callExpression(t.identifier('__devFetchCall'), [
            t.identifier(call.originalName),
            call.keyArg ?? t.stringLiteral(''),
            call.optsArg ?? t.objectExpression([]),
            meta,
        ])
    )
}

export function fetchInstrumentPlugin(): Plugin {
    return {
        name: 'vite-plugin-observatory-fetch',
        enforce: 'pre',

        transform(code, id) {
            // Skip the observatory's own runtime files to prevent infinite recursion
            if (
                id.includes('node_modules') ||
                id.includes('composable-registry') ||
                id.includes('provide-inject-registry') ||
                id.includes('fetch-registry') ||
                id.includes('instrumentation/asyncData')
            ) {
                return
            }

            const target = resolveTransformTarget(code, id)

            if (!target) {
                return
            }

            const { scriptCode, scriptStart, isVue, filename, lang } = target

            // Quick bail if none of the target functions appear in source
            if (![...FETCH_FNS].some((fn) => scriptCode.includes(fn))) {
                return
            }

            try {
                const ast = parseObservatoryScript(scriptCode, lang, filename)

                let modified = false

                traverse(ast, {
                    CallExpression(path: NodePath<t.CallExpression>) {
                        // Unrecognised async-data shapes stay untouched. Wrapping them would pass the wrong arguments.
                        const call = readFetchCall(path)

                        if (!call) {
                            return
                        }

                        path.replaceWith(buildInstrumentedCall(call, id, path.node.loc?.start.line ?? 0))
                        modified = true
                    },
                })

                if (!modified) {
                    return null
                }

                // Imports are registered as Nuxt auto-imports in module.ts — no injection needed here.
                const output = generate(ast, { retainLines: true }, scriptCode)

                let finalCode: string

                if (isVue) {
                    finalCode = code.slice(0, scriptStart) + output.code + code.slice(scriptStart + scriptCode.length)
                } else {
                    finalCode = output.code
                }

                return {
                    code: finalCode,
                    map: output.map,
                }
            } catch (err) {
                // If AST transform fails, return original code unchanged
                console.warn('[observatory] fetch transform error:', err)

                return null
            }
        },
    }
}
