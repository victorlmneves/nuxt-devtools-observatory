import { describe, it, expect } from 'vitest'
import { babelPluginsForScript, parseObservatoryScript, resolveScriptLang } from '@observatory/transforms/parse-script'

describe('resolveScriptLang', () => {
    it('prefers the SFC lang attribute over the filename', () => {
        expect(resolveScriptLang('tsx', 'Page.vue')).toBe('tsx')
        expect(resolveScriptLang('jsx', 'Page.vue')).toBe('jsx')
        expect(resolveScriptLang('ts', 'Page.vue')).toBe('ts')
    })

    it('infers tsx/jsx from the file extension', () => {
        expect(resolveScriptLang(null, 'Widget.tsx')).toBe('tsx')
        expect(resolveScriptLang(null, 'Widget.jsx')).toBe('jsx')
        expect(resolveScriptLang(null, 'util.ts')).toBe('ts')
        expect(resolveScriptLang(null, 'util.js')).toBe('js')
    })
})

describe('babelPluginsForScript', () => {
    it('parses TSX with the typescript isTSX plugin rather than a separate jsx plugin', () => {
        expect(babelPluginsForScript('tsx')).toEqual(['jsx', 'typescript'])
        expect(babelPluginsForScript('jsx')).toEqual(['jsx'])
        expect(babelPluginsForScript('ts')).toEqual(['typescript'])
        expect(babelPluginsForScript('js')).toEqual([])
    })
})

describe('parseObservatoryScript', () => {
    it('parses JSX in a lang=tsx Vue script block', () => {
        const code = `const el = <div className="n">{useFetch('/api')}</div>\n`

        expect(() => parseObservatoryScript(code, 'tsx', 'Page.vue')).not.toThrow()
    })

    it('parses a standalone .tsx module', () => {
        const code = `export const n = () => <span>{1}</span>\n`

        expect(() => parseObservatoryScript(code, null, 'Icon.tsx')).not.toThrow()
    })
})
