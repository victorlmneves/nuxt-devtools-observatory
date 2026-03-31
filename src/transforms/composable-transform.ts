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

// Nuxt/Vue built-in composables that are auto-imported (no import statement in source)
// and should never be wrapped. For composables that DO have an explicit import statement,
// we skip them via binding analysis in the transform instead (see isImportedFromPackage).
const SKIP_LIST = new Set([
    // useFetch family — tracked by the fetch dashboard
    'useFetch',
    'useAsyncData',
    'useLazyFetch',
    'useLazyAsyncData',
    // Nuxt auto-imports
    'useCookie',
    'useRequestEvent',
    'useRequestHeaders',
    'useRequestURL',
    'useResponseHeader',
    'useNuxtApp',
    'useRuntimeConfig',
    'useRoute',
    'useRouter',
    'useNuxtData',
    'useError',
    'useState',
    'useAppConfig',
    // Nuxt head
    'useHead',
    'useSeoMeta',
    'useServerSeoMeta',
    'useHeadSafe',
    // Nuxt i18n (common plugin)
    'useI18n',
    'useLocalePath',
    'useLocaleRoute',
    // Vue built-ins
    'useSlots',
    'useAttrs',
    'useModel',
    'useTemplateRef',
    'useId',
    'useCssModule',
    'useCssVars',
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

                        // Skip composables that are explicitly imported from a package (node_modules).
                        // This catches third-party composables (e.g. VueUse, Pinia, any library)
                        // that aren't in SKIP_LIST without requiring us to enumerate every package.
                        // Auto-imported Nuxt/Vue composables have no import binding at all, so
                        // they are handled solely by SKIP_LIST above.
                        const binding = path.scope.getBinding(name)

                        if (binding?.path.isImportSpecifier() || binding?.path.isImportDefaultSpecifier()) {
                            const importDecl = binding.path.parentPath?.node as import('@babel/types').ImportDeclaration | undefined
                            const source = importDecl?.source?.value ?? ''

                            if (source && !source.startsWith('.') && !source.startsWith('/')) {
                                return
                            }
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
                        const fileName = id.split(/[\\/]/).pop() || id
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

                // Avoid duplicate imports — check output.code (the transformed result)
                // rather than scriptCode (the original source), because scriptCode never
                // contains __trackComposable and the guard would always be false, causing
                // the import to be injected on every Vite transform pass (SSR + client, HMR).
                const alreadyImported = output.code.includes('nuxt-devtools-observatory/runtime/composable-registry')
                const prefix = alreadyImported ? '' : importLine
                let finalCode: string

                if (isVue) {
                    finalCode = code.slice(0, scriptStart) + prefix + output.code + code.slice(scriptStart + scriptCode.length)
                } else {
                    finalCode = prefix + output.code
                }

                return { code: finalCode, map: output.map }
            } catch (err) {
                console.warn('[observatory] composable transform error:', err)

                return null
            }
        },
    }
}
