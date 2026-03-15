import type { Plugin } from 'vite'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'

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

export function provideInjectPlugin(): Plugin {
    return {
        name: 'vite-plugin-observatory-provide-inject',
        enforce: 'pre',

        transform(code, id) {
            const isVue = id.endsWith('.vue')

            if (!isVue && !id.endsWith('.ts')) {
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

            if (!scriptCode.includes('provide(') && !scriptCode.includes('inject(')) {
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

                        if (name !== 'provide' && name !== 'inject') {
                            return
                        }

                        // Skip if already wrapped
                        if (
                            path.parent &&
                            t.isCallExpression(path.parent) &&
                            t.isIdentifier(path.parent.callee) &&
                            (path.parent.callee.name === '__devProvide' || path.parent.callee.name === '__devInject')
                        ) {
                            return
                        }

                        const args = path.node.arguments
                        const loc = path.node.loc
                        const meta = t.objectExpression([
                            t.objectProperty(t.identifier('file'), t.stringLiteral(id.split('/').pop() ?? id)),
                            t.objectProperty(t.identifier('line'), t.numericLiteral(loc?.start.line ?? 0)),
                        ])

                        if (name === 'provide') {
                            // provide(key, value) → __devProvide(key, value, meta)
                            path.replaceWith(t.callExpression(t.identifier('__devProvide'), [...args, meta]))
                        } else {
                            // inject(key) / inject(key, default) → __devInject(key, default, meta)
                            const injectArgs = args.length >= 2 ? args : [...args, t.identifier('undefined')]
                            path.replaceWith(t.callExpression(t.identifier('__devInject'), [...injectArgs, meta]))
                        }

                        modified = true
                    },
                })

                if (!modified) {
                    return null
                }

                const importLine = `import { __devProvide, __devInject } from 'nuxt-devtools-observatory/runtime/provide-inject-registry';\n`
                const output = generate(ast, { retainLines: true }, scriptCode)

                if (isVue) {
                    const newCode = code.slice(0, scriptStart) + importLine + output.code + code.slice(scriptStart + scriptCode.length)

                    return { code: newCode }
                }

                return { code: importLine + output.code, map: output.map }
            } catch (err) {
                console.warn('[observatory] provide/inject transform error:', err)

                return null
            }
        },
    }
}
