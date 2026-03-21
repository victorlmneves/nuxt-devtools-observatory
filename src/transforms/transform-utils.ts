export function extractScriptBlock(code: string): { content: string; start: number; end: number } | null {
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
