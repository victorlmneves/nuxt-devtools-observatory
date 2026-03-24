/**
 * Extracts the script block from a Vue SFC string.
 *
 * Uses `@vue/compiler-sfc` rather than a hand-rolled regex so that:
 *  - `<script setup>` is preferred over `<script>` when both are present —
 *    composition-API instrumentation always belongs in the setup block.
 *  - `<script>` tags that appear inside `<template>` string literals are
 *    never mistakenly matched.
 *  - A `</script>` substring inside a JS string literal in the script body
 *    does not truncate the extracted content early.
 *
 * Falls back gracefully to `null` (skip transform) on any parse error so
 * a malformed SFC never causes a hard build failure.
 *
 * Note: parse errors (e.g. `</script>` inside a JS string literal, or a
 * `<script>` tag inside a `v-html` attribute) do not prevent extraction —
 * `@vue/compiler-sfc` still locates the script blocks correctly in those
 * cases. We only return `null` if no usable block was found at all.
 */
export function extractScriptBlock(code: string): { content: string; start: number; end: number } | null {
    try {
        // Dynamic require resolved at build time — @vue/compiler-sfc is a
        // transitive dependency of `nuxt` and is always present in the dev graph.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { parse } = require('@vue/compiler-sfc') as typeof import('@vue/compiler-sfc')

        // We intentionally do NOT bail on parse errors. @vue/compiler-sfc reports
        // errors for things like `</script>` inside a JS string literal or a
        // `<script>` tag in a v-html attribute — but it still correctly locates the
        // real script blocks in both cases. Bailing would skip valid transforms.
        const { descriptor } = parse(code, { ignoreEmpty: false })

        // Prefer <script setup> — it is where all composition-API calls live.
        // Fall back to the classic <script> block for Options API files that
        // still use useFetch / provide / inject at the top level.
        const block = descriptor.scriptSetup ?? descriptor.script ?? null

        if (!block) {
            return null
        }

        // loc.start.offset / loc.end.offset are byte offsets into the original
        // SFC string. content is the slice between them (including any leading
        // newline after the opening tag). Callers use start + content.length to
        // splice the transformed code back into the full SFC string.
        const start = block.loc.start.offset
        const end = block.loc.end.offset

        return { content: block.content, start, end }
    } catch {
        // If @vue/compiler-sfc is somehow unavailable, skip the transform rather
        // than crashing the dev server.
        return null
    }
}
