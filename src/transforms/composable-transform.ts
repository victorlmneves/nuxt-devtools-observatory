import type { Plugin } from 'vite'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'

const traverse = (_traverse as any).default ?? _traverse
const generate = (_generate as any).default ?? _generate

// Extract <script> block from a Vue SFC, returning content and its position
function extractScriptBlock(code: string): { content: string; start: number; end: number } | null {
    const openTagRE = /<script(\s[^>]*)?>/i
    const openMatch = openTagRE.exec(code)
    if (!openMatch) return null
    const start = openMatch.index + openMatch[0].length
    const end = code.indexOf('</script>', start)
    if (end === -1) return null
    return { content: code.slice(start, end), start, end }
}

// Matches useXxx() — Vue composable naming convention
const COMPOSABLE_RE = /\buse[A-Z]/

// Built-in Vue composables to skip (they have their own tracking)
const SKIP_LIST = new Set([
    'useFetch',
    'useAsyncData',
    'useLazyFetch',
    'useLazyAsyncData',
    'useState',
    'useRoute',
    'useRouter',
    'useNuxtApp',
    'useRuntimeConfig',
    'useHead',
    'useSeoMeta',
    'useServerSeoMeta',
    'useNuxtData',
    'useError',
    'useRequestHeaders',
])

export function composableTrackerPlugin(): Plugin {
    return {
        name: 'vite-plugin-observatory-composables',
        enforce: 'pre',

        transform(code, id) {
            const isVue = id.endsWith('.vue')
            if (!isVue && !id.endsWith('.ts')) return

            // Skip the observatory's own runtime files to prevent infinite recursion
            if (
                id.includes('node_modules') ||
                id.includes('composable-registry') ||
                id.includes('provide-inject-registry') ||
                id.includes('fetch-registry')
            )
                return

            // For Vue SFCs, extract only the <script> block to avoid parsing <template>
            let scriptCode = code
            let scriptStart = 0
            if (isVue) {
                const block = extractScriptBlock(code)
                if (!block) return null
                scriptCode = block.content
                scriptStart = block.start
            }

            if (!COMPOSABLE_RE.test(scriptCode)) return

            try {
                const ast = parse(scriptCode, {
                    sourceType: 'module',
                    plugins: ['typescript'],
                })

                let modified = false

                traverse(ast, {
                    CallExpression(path: any) {
                        const callee = path.node.callee
                        if (!t.isIdentifier(callee)) return

                        const name = callee.name
                        if (!COMPOSABLE_RE.test(name)) return
                        if (SKIP_LIST.has(name)) return

                        // Skip if the call is already inside __trackComposable
                        let parent = path.parentPath
                        let isWrapped = false
                        while (parent) {
                            if (
                                t.isCallExpression(parent.node) &&
                                t.isIdentifier(parent.node.callee) &&
                                parent.node.callee.name === '__trackComposable'
                            ) {
                                isWrapped = true
                                break
                            }
                            parent = parent.parentPath
                        }
                        if (isWrapped) return

                        // Check for @devtools-ignore comment
                        const comments = (path.node.leadingComments ?? []).concat(path.parentPath?.node?.leadingComments ?? [])
                        const ignored = comments.some((c: any) => c.value.includes('@devtools-ignore'))
                        if (ignored) return

                        const args = path.node.arguments
                        const loc = path.node.loc
                        const meta = t.objectExpression([
                            t.objectProperty(t.identifier('file'), t.stringLiteral(id.split('/').pop() ?? id)),
                            t.objectProperty(t.identifier('line'), t.numericLiteral(loc?.start.line ?? 0)),
                        ])

                        // useCounter(args) → __trackComposable('useCounter', () => useCounter(args), meta)
                        path.replaceWith(
                            t.callExpression(t.identifier('__trackComposable'), [
                                t.stringLiteral(name),
                                t.arrowFunctionExpression([], t.callExpression(t.identifier(name), args)),
                                meta,
                            ])
                        )

                        modified = true
                    },
                })

                if (!modified) return null

                const importLine = `import { __trackComposable } from 'nuxt-devtools-observatory/runtime/composable-registry';\n`
                const output = generate(ast, { retainLines: true }, scriptCode)
                if (isVue) {
                    const newCode = code.slice(0, scriptStart) + importLine + output.code + code.slice(scriptStart + scriptCode.length)
                    return { code: newCode }
                }
                return { code: importLine + output.code, map: output.map }
            } catch (e) {
                console.warn('[observatory] composable transform error:', e)
                return null
            }
        },
    }
}
