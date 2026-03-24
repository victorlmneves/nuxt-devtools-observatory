import { describe, it, expect } from 'vitest'
import { extractScriptBlock } from '../../src/transforms/transform-utils'

describe('extractScriptBlock', () => {
    it('extracts content from a plain <script> block', () => {
        const sfc = `<template><div>hi</div></template>\n<script>\nconst x = 1\n</script>`
        const result = extractScriptBlock(sfc)

        expect(result).not.toBeNull()
        expect(result!.content).toContain('const x = 1')
    })

    it('extracts content from a <script setup> block', () => {
        const sfc = `<template><div>hi</div></template>\n<script setup>\nconst x = 1\n</script>`
        const result = extractScriptBlock(sfc)

        expect(result).not.toBeNull()
        expect(result!.content).toContain('const x = 1')
    })

    it('prefers <script setup> over <script> when both are present', () => {
        // Both blocks exist — instrumentation must target <script setup>
        // since that is where composition-API calls live.
        const sfc = [
            '<template><div>hi</div></template>',
            '<script>',
            'export default { name: "MyComp" }',
            '</script>',
            '<script setup>',
            'const setupCode = true',
            '</script>',
        ].join('\n')
        const result = extractScriptBlock(sfc)

        expect(result).not.toBeNull()
        expect(result!.content).toContain('setupCode')
        expect(result!.content).not.toContain('MyComp')
    })

    it('is not confused by a <script> tag inside the <template> block', () => {
        // The old regex matched the first <script> anywhere — including inside
        // template string bindings — and would extract garbage content.
        const sfc = [
            '<template>',
            "  <div v-html='<script>alert(1)</script>'></div>",
            '</template>',
            '<script setup>',
            'const realCode = 42',
            '</script>',
        ].join('\n')
        const result = extractScriptBlock(sfc)

        expect(result).not.toBeNull()
        expect(result!.content).toContain('realCode')
        expect(result!.content).not.toContain('alert')
    })

    it('handles a </script> substring inside a JS string literal via escaping', () => {
        // A literal `</script>` inside a <script> block is invalid HTML — both the
        // old regex and @vue/compiler-sfc truncate the block at that point, because
        // the HTML parser (and the SFC parser) cannot distinguish it from the real
        // closing tag. The correct fix in user code is to escape it as `<\/script>`.
        // This test documents that the escaped form works correctly.
        const sfc = [
            '<template><div>hi</div></template>',
            '<script setup>',
            "const s = '<\\/script>'",
            'const afterLiteral = true',
            '</script>',
        ].join('\n')
        const result = extractScriptBlock(sfc)

        expect(result).not.toBeNull()
        expect(result!.content).toContain('afterLiteral')
    })

    it('returns null when there is no script block', () => {
        const sfc = `<template><div>hello</div></template>`

        expect(extractScriptBlock(sfc)).toBeNull()
    })

    it('returns the correct start offset so callers can splice the SFC string', () => {
        const prefix = '<template><div>hi</div></template>\n<script setup>'
        const scriptContent = "\nconst x = useFetch('/api')\n"
        const sfc = prefix + scriptContent + '</script>'
        const result = extractScriptBlock(sfc)

        expect(result).not.toBeNull()
        // content includes the newline immediately after the opening tag —
        // start + content reconstructs the exact slice of the SFC string.
        expect(result!.content).toBe(scriptContent)
        expect(sfc.slice(result!.start, result!.end)).toBe(scriptContent)
    })
})
