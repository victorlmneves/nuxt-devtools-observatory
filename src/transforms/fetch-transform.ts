import type { Plugin } from 'vite'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'
import { extractScriptBlock } from './transform-utils'

// CJS/ESM compat shims
const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse
const generate = (_generate as typeof _generate & { default?: typeof _generate }).default ?? _generate

const FETCH_FNS = new Set(['useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData'])

type ObservableCallExpression = t.CallExpression & { __observatoryTransformed?: boolean }

function isHandlerExpression(node: t.Expression | undefined): node is t.Expression {
    return Boolean(node && (t.isIdentifier(node) || t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)))
}

export function fetchInstrumentPlugin(): Plugin {
    return {
        name: 'vite-plugin-observatory-fetch',
        enforce: 'pre',

        transform(code, id) {
            const isVue = id.endsWith('.vue')

            if (!isVue && !id.endsWith('.ts') && !id.endsWith('.js')) {
                return
            }

            // Skip the observatory's own runtime files to prevent infinite recursion
            if (
                id.includes('node_modules') ||
                id.includes('composable-registry') ||
                id.includes('provide-inject-registry') ||
                id.includes('fetch-registry')
            ) {
                return
            }

            // For Vue SFCs, extract only the <script> block to avoid parsing <template>
            let scriptCode = code
            let scriptStart = 0

            if (isVue) {
                const block = extractScriptBlock(code)

                if (!block) {
                    return null
                }

                scriptCode = block.content
                scriptStart = block.start
            }

            // Quick bail if none of the target functions appear in source
            if (![...FETCH_FNS].some((fn) => scriptCode.includes(fn))) {
                return
            }

            try {
                const ast = parse(scriptCode, {
                    sourceType: 'module',
                    plugins: ['typescript'],
                })

                let modified = false
                let needsFetchCallHelper = false
                let needsFetchHandlerHelper = false

                // Inject imports at top if not present
                const hasFetchCallImport = scriptCode.includes('__devFetchCall')
                const hasFetchHandlerImport = scriptCode.includes('__devFetchHandler')

                traverse(ast, {
                    CallExpression(path: import('@babel/traverse').NodePath<t.CallExpression>) {
                        if ((path.node as ObservableCallExpression).__observatoryTransformed) {
                            return
                        }

                        const callee = path.node.callee

                        if (!t.isIdentifier(callee)) {
                            return
                        }

                        if (!FETCH_FNS.has(callee.name)) {
                            return
                        }

                        // Skip if already wrapped
                        if (
                            path.parent &&
                            t.isCallExpression(path.parent) &&
                            t.isIdentifier(path.parent.callee) &&
                            ['__devFetchCall', '__devFetchHandler'].includes(path.parent.callee.name)
                        ) {
                            return
                        }

                        const originalName = callee.name
                        const args = path.node.arguments

                        // Detect useAsyncData signature: (handler) or (key, handler, opts)
                        let keyArg: t.Expression | undefined = undefined
                        let handlerArg: t.Expression | undefined = undefined
                        let optsArg: t.Expression | undefined = undefined

                        // Helper to check if node is Expression
                        function getExpr(node: t.Node | null | undefined): t.Expression | undefined {
                            return t.isExpression(node) ? node : undefined
                        }

                        if (originalName === 'useAsyncData' || originalName === 'useLazyAsyncData') {
                            if (args.length === 1 && isHandlerExpression(getExpr(args[0]))) {
                                // useAsyncData(handler)
                                handlerArg = getExpr(args[0])
                            } else if (args.length >= 2 && getExpr(args[0]) && isHandlerExpression(getExpr(args[1]))) {
                                // useAsyncData(key, handler, opts?)
                                keyArg = getExpr(args[0])
                                handlerArg = getExpr(args[1])
                                optsArg = getExpr(args[2]) ?? t.objectExpression([])
                            } else {
                                // Fallback for non-standard or invalid call shapes.
                                keyArg = getExpr(args[0]) ?? t.stringLiteral('')
                                optsArg = getExpr(args[1]) ?? t.objectExpression([])
                                handlerArg = undefined
                            }
                        } else {
                            // useFetch(url, opts?)
                            keyArg = getExpr(args[0]) ?? t.stringLiteral('')
                            optsArg = getExpr(args[1]) ?? t.objectExpression([])
                        }

                        let key = originalName

                        if (originalName === 'useFetch' || originalName === 'useLazyFetch') {
                            if (optsArg && t.isObjectExpression(optsArg)) {
                                const keyProp = optsArg.properties.find(
                                    (property): property is t.ObjectProperty =>
                                        t.isObjectProperty(property) &&
                                        t.isIdentifier(property.key) &&
                                        property.key.name === 'key' &&
                                        t.isStringLiteral(property.value)
                                )

                                if (keyProp && t.isStringLiteral(keyProp.value)) {
                                    key = keyProp.value.value
                                } else if (keyArg && t.isStringLiteral(keyArg)) {
                                    key = keyArg.value.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')
                                }
                            } else if (keyArg && t.isStringLiteral(keyArg)) {
                                key = keyArg.value.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')
                            }
                        }

                        const loc = path.node.loc
                        const meta = t.objectExpression([
                            t.objectProperty(t.identifier('key'), t.stringLiteral(key)),
                            t.objectProperty(t.identifier('file'), t.stringLiteral(id.split('/').pop() ?? id)),
                            t.objectProperty(t.identifier('line'), t.numericLiteral(loc?.start.line ?? 0)),
                            t.objectProperty(t.identifier('originalFn'), t.stringLiteral(originalName)),
                        ])

                        // Replace with correct signature
                        if ((originalName === 'useAsyncData' || originalName === 'useLazyAsyncData') && handlerArg) {
                            if (handlerArg) {
                                const wrappedHandler = t.arrowFunctionExpression(
                                    [t.restElement(t.identifier('args'))],
                                    t.conditionalExpression(
                                        t.logicalExpression(
                                            '&&',
                                            t.memberExpression(t.identifier('process'), t.identifier('dev')),
                                            t.memberExpression(t.identifier('process'), t.identifier('client'))
                                        ),
                                        t.callExpression(
                                            t.callExpression(t.identifier('__devFetchHandler'), [handlerArg, keyArg ?? t.stringLiteral(key), meta]),
                                            [t.spreadElement(t.identifier('args'))]
                                        ),
                                        t.callExpression(handlerArg, [t.spreadElement(t.identifier('args'))])
                                    )
                                )
                                ;(wrappedHandler as t.ArrowFunctionExpression & { __observatoryTransformed?: boolean }).__observatoryTransformed = true
                                needsFetchHandlerHelper = true

                                if (keyArg) {
                                    // useAsyncData(key, handler, opts?)
                                    const newCall = t.callExpression(t.identifier(originalName), [
                                        keyArg,
                                        wrappedHandler,
                                        optsArg ?? t.objectExpression([]),
                                    ]) as ObservableCallExpression
                                    newCall.__observatoryTransformed = true
                                    path.replaceWith(newCall)
                                } else {
                                    // useAsyncData(handler)
                                    const newCall = t.callExpression(t.identifier(originalName), [wrappedHandler]) as ObservableCallExpression
                                    newCall.__observatoryTransformed = true
                                    path.replaceWith(newCall)
                                }

                                modified = true
                            }
                        } else {
                            // useFetch(url, opts?) and async-data fallbacks
                            const newCall = t.callExpression(t.identifier('__devFetchCall'), [
                                t.identifier(originalName),
                                keyArg ?? t.stringLiteral(''),
                                optsArg ?? t.objectExpression([]),
                                meta,
                            ]) as ObservableCallExpression
                            newCall.__observatoryTransformed = true
                            needsFetchCallHelper = true
                            path.replaceWith(newCall)

                            modified = true
                        }
                    },
                })

                if (!modified) {
                    return null
                }

                // Inject the shim import at the top of the file, avoid duplicates
                const importNames = [
                    needsFetchCallHelper && !hasFetchCallImport ? '__devFetchCall' : '',
                    needsFetchHandlerHelper && !hasFetchHandlerImport ? '__devFetchHandler' : '',
                ].filter(Boolean)
                const importStatement = importNames.length
                    ? `import { ${importNames.join(', ')} } from 'nuxt-devtools-observatory/runtime/fetch-registry';\n`
                    : ''
                const output = generate(ast, { retainLines: true }, scriptCode)

                let finalCode: string

                if (isVue) {
                    finalCode = code.slice(0, scriptStart) + importStatement + output.code + code.slice(scriptStart + scriptCode.length)
                } else {
                    finalCode = importStatement + output.code
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
