import type { Plugin } from 'vite'
import _traverse from '@babel/traverse'
import _generate from '@babel/generator'
import * as t from '@babel/types'
import { parseObservatoryScript } from './parse-script'
import { resolveTransformTarget } from './transform-utils'

const traverse = (_traverse as typeof _traverse & { default?: typeof _traverse }).default ?? _traverse
const generate = (_generate as typeof _generate & { default?: typeof _generate }).default ?? _generate

const STATE_FNS = new Set(['useState', 'useCookie'])

type TObservableCallExpression = t.CallExpression & { __observatoryTransformed?: boolean }

export function stateCookieTrackerPlugin(): Plugin {
    return {
        name: 'vite-plugin-observatory-state-cookie',
        enforce: 'pre',

        transform(code, id) {
            if (id.includes('node_modules') || id.includes('state-cookie-registry')) {
                return
            }

            const target = resolveTransformTarget(code, id)

            if (!target) {
                return
            }

            const { scriptCode, scriptStart, isVue, filename, lang } = target

            if (![...STATE_FNS].some((fn) => scriptCode.includes(fn))) {
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

                        if (!t.isIdentifier(callee) || !STATE_FNS.has(callee.name)) {
                            return
                        }

                        if (
                            path.parent &&
                            t.isCallExpression(path.parent) &&
                            t.isIdentifier(path.parent.callee) &&
                            path.parent.callee.name === '__trackStateCookie'
                        ) {
                            return
                        }

                        const kind = callee.name === 'useCookie' ? 'useCookie' : 'useState'
                        const loc = path.node.loc
                        const meta = t.objectExpression([
                            t.objectProperty(t.identifier('kind'), t.stringLiteral(kind)),
                            t.objectProperty(t.identifier('file'), t.stringLiteral(id.split('/').pop() ?? id)),
                            t.objectProperty(t.identifier('line'), t.numericLiteral(loc?.start.line ?? 0)),
                        ])

                        const wrappedArgs = path.node.arguments.filter(
                            (arg): arg is t.Expression | t.SpreadElement => arg.type !== 'ArgumentPlaceholder'
                        )
                        const newCall = t.callExpression(t.identifier('__trackStateCookie'), [
                            t.identifier(callee.name),
                            t.arrayExpression(wrappedArgs),
                            meta,
                        ]) as TObservableCallExpression

                        newCall.__observatoryTransformed = true
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

                return {
                    code: finalCode,
                    map: output.map,
                }
            } catch (err) {
                console.warn('[observatory] state/cookie transform error:', err)

                return null
            }
        },
    }
}
