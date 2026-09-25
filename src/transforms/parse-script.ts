import { parse, type ParserPlugin } from '@babel/parser'

export type TObservatoryScriptLang = 'js' | 'ts' | 'jsx' | 'tsx'

export function resolveScriptLang(blockLang: string | null | undefined, filename: string): TObservatoryScriptLang {
    const raw = (blockLang ?? '').trim().toLowerCase()

    if (raw === 'tsx' || raw === 'jsx' || raw === 'ts' || raw === 'js') {
        return raw
    }

    if (raw === 'javascript') {
        return 'js'
    }

    if (raw === 'typescript') {
        return 'ts'
    }

    const file = filename.toLowerCase()

    if (file.endsWith('.tsx') || file.endsWith('.mtsx') || file.endsWith('.ctsx')) {
        return 'tsx'
    }

    if (file.endsWith('.jsx') || file.endsWith('.mjsx') || file.endsWith('.cjsx')) {
        return 'jsx'
    }

    if (/\.[cm]?ts$/.test(file)) {
        return 'ts'
    }

    return 'js'
}

export function babelPluginsForScript(lang: TObservatoryScriptLang): ParserPlugin[] {
    if (lang === 'tsx') {
        return ['jsx', 'typescript']
    }

    if (lang === 'jsx') {
        return ['jsx']
    }

    if (lang === 'ts') {
        return ['typescript']
    }

    return []
}

export function parseObservatoryScript(code: string, blockLang: string | null | undefined, filename: string) {
    const lang = resolveScriptLang(blockLang, filename)

    return parse(code, {
        sourceType: 'module',
        plugins: babelPluginsForScript(lang),
    })
}
