import type { Plugin } from 'vite'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'

// CJS/ESM compat shims
const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse
const generate = (_generate as typeof _generate & { default?: typeof _generate }).default ?? _generate

// Extract <script> block from a Vue SFC, returning content and its position
function extractScriptBlock(code: string): { content: string; start: number; end: number } | null {
    const openTagRE = /<script(\s[^>]*)?>/i
    const openMatch = openTagRE.exec(code)

    if (!openMatch) {
        return null
    }

    const start = openMatch.index + openMatch[0].length
    const end = code.indexOf('</script>', start)

    if (end === -1) {
        return null
    }

    return { content: code.slice(start, end), start, end }
}

const FETCH_FNS = new Set(['useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData'])

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
                // Inject import at top if not present
                const hasImport = scriptCode.includes('__devFetch')

                traverse(ast, {
                    CallExpression(path: import('@babel/traverse').NodePath<t.CallExpression>) {
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
                            path.parent.callee.name === '__devFetch'
                        ) {
                            return
                        }

                        const originalName = callee.name
                        const args = path.node.arguments
                        const urlArg = args[0] ?? t.stringLiteral('')
                        const optsArg = args[1] ?? t.objectExpression([])

                        // Extract or generate a key
                        let key = originalName

                        if (t.isObjectExpression(optsArg)) {
                            const keyProp = optsArg.properties.find(
                                (p: t.ObjectMethod | t.ObjectProperty | t.SpreadElement) =>
                                    t.isObjectProperty(p) && t.isIdentifier(p.key) && (p.key as t.Identifier).name === 'key'
                            ) as t.ObjectProperty | undefined

                            if (keyProp && t.isStringLiteral(keyProp.value)) {
                                key = keyProp.value.value
                            } else {
                                // Derive key from URL if it's a string literal
                                if (t.isStringLiteral(urlArg)) {
                                    key = urlArg.value.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '')
                                }
                            }
                        }

                        const loc = path.node.loc
                        const meta = t.objectExpression([
                            t.objectProperty(t.identifier('key'), t.stringLiteral(key)),
                            t.objectProperty(t.identifier('file'), t.stringLiteral(id.split('/').pop() ?? id)),
                            t.objectProperty(t.identifier('line'), t.numericLiteral(loc?.start.line ?? 0)),
                            t.objectProperty(t.identifier('originalFn'), t.stringLiteral(originalName)),
                        ])

                        // Replace: useFetch(url, opts) → __devFetch(useFetch, url, opts, meta)
                        path.replaceWith(t.callExpression(t.identifier('__devFetch'), [t.identifier(originalName), urlArg, optsArg, meta]))

                        modified = true
                    },
                })

                if (!modified) {
                    return null
                }

                // Inject the shim import at the top of the file
                const importStatement = hasImport ? '' : `import { __devFetch } from 'nuxt-devtools-observatory/runtime/fetch-registry';\n`

                const output = generate(ast, { retainLines: true }, scriptCode)

                if (isVue) {
                    const newCode = code.slice(0, scriptStart) + importStatement + output.code + code.slice(scriptStart + scriptCode.length)

                    return { code: newCode }
                }

                return {
                    code: importStatement + output.code,
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
