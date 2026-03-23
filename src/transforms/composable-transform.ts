import type { Plugin } from 'vite'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'
import { extractScriptBlock } from './transform-utils'

const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse
const generate = (_generate as typeof _generate & { default?: typeof _generate }).default ?? _generate

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

            if (!COMPOSABLE_RE.test(scriptCode)) {
                return
            }

            try {
                const ast = parse(scriptCode, {
                    sourceType: 'module',
                    plugins: ['typescript'],
                })

                let modified = false

                traverse(ast, {
                    CallExpression(path: import('@babel/traverse').NodePath<t.CallExpression>) {
                        const callee = path.node.callee

                        if (!t.isIdentifier(callee)) {
                            return
                        }

                        const name = callee.name

                        if (!COMPOSABLE_RE.test(name)) {
                            return
                        }

                        if (SKIP_LIST.has(name)) {
                            return
                        }

                        // Skip if the call is already inside __trackComposable
                        let parent: import('@babel/traverse').NodePath | null = path.parentPath
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

                            parent = parent.parentPath ?? null
                        }

                        if (isWrapped) {
                            return
                        }

                        // Check for @devtools-ignore comment
                        const comments = (path.node.leadingComments ?? []).concat(path.parentPath?.node?.leadingComments ?? [])
                        const ignored = comments.some((c: t.Comment) => c.value.includes('@devtools-ignore'))

                        if (ignored) {
                            return
                        }

                        const args = path.node.arguments
                        const loc = path.node.loc
                        // Only use the filename, not the full path, for the meta object
                        const fileName = id.split(/[\\/]/).pop() || id;
                        const meta = t.objectExpression([
                            t.objectProperty(t.identifier('file'), t.stringLiteral(fileName)),
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

                if (!modified) {
                    return null
                }

                const importLine = `import { __trackComposable } from 'nuxt-devtools-observatory/runtime/composable-registry';\n`
                const output = generate(ast, { retainLines: true }, scriptCode)

                // Avoid duplicate imports
                let finalCode: string

                if (isVue) {
                    finalCode =
                        code.slice(0, scriptStart) +
                        (scriptCode.includes('__trackComposable') ? '' : importLine) +
                        output.code +
                        code.slice(scriptStart + scriptCode.length)
                } else {
                    finalCode = (scriptCode.includes('__trackComposable') ? '' : importLine) + output.code
                }

                return { code: finalCode, map: output.map }
            } catch (err) {
                console.warn('[observatory] composable transform error:', err)

                return null
            }
        },
    }
}
