import { describe, it, expect } from 'vitest'
import { composableTrackerPlugin } from '@observatory/transforms/composable-transform'

const SKIP_LIST = [
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
]

const plugin = composableTrackerPlugin()

function transform(code: string, id = '/project/src/MyComponent.ts') {
    return (plugin.transform as (code: string, id: string) => { code: string } | null | undefined)(code, id)
}

describe('composableTrackerPlugin', () => {
    describe('core transformation', () => {
        it('wraps useCounter() with __trackComposable("useCounter", () => useCounter(), meta)', () => {
            const result = transform(`const counter = useCounter()`)

            expect(result).not.toBeNull()
            expect(result!.code).toContain('__trackComposable(')
            expect(result!.code).toContain('"useCounter"')
            expect(result!.code).toContain('() => useCounter()')
        })

        it('forwards arguments: useCounter(a, b) becomes () => useCounter(a, b)', () => {
            const result = transform(`useCounter(initialValue, options)`)

            expect(result!.code).toContain('() => useCounter(initialValue, options)')
        })

        it('injects the __trackComposable import', () => {
            const result = transform(`useCounter()`)

            expect(result!.code).toContain("import { __trackComposable } from 'nuxt-devtools-observatory/runtime/composable-registry'")
        })

        it('injects the import only once even when multiple composables are present', () => {
            const result = transform(`useCounter()\nuseTimer()`)
            const count = (result!.code.match(/import.*__trackComposable/g) ?? []).length

            expect(count).toBe(1)
        })

        it('includes the filename and line in the meta object', () => {
            const result = transform(`useCounter()`, '/project/src/composables/useApp.ts')

            expect(result!.code).toContain('"useApp.ts"')
            expect(result!.code).toMatch(/line:\s*\d+/)
        })
    })

    describe('SKIP_LIST enforcement', () => {
        it.each(SKIP_LIST)('does not wrap %s (built-in Nuxt/Vue composable)', (fn) => {
            const result = transform(`${fn}('/api')`)

            // Either no modification (falsy result) or the code doesn't contain __trackComposable
            if (result?.code) {
                expect(result.code).not.toContain('__trackComposable')
            } else {
                expect(result).toBeFalsy()
            }
        })
    })

    describe('@devtools-ignore escape hatch', () => {
        it('skips a call preceded by // @devtools-ignore comment', () => {
            const code = `// @devtools-ignore\nuseCounter()`
            const result = transform(code)

            // The call should not be wrapped
            if (result?.code) {
                expect(result.code).not.toContain('__trackComposable')
            } else {
                // No modification at all — also acceptable
                expect(result).toBeFalsy()
            }
        })
    })

    describe('recursion guard', () => {
        it('does not double-wrap a composable already inside __trackComposable', () => {
            // This simulates already-transformed code where useCounter is nested
            const code = `__trackComposable('useCounter', () => useCounter(), { file: 'test.ts', line: 1 })`
            const result = transform(code)
            const finalCode = result?.code ?? code

            // The inner useCounter() must not be wrapped again
            expect(finalCode).not.toContain("__trackComposable('useCounter', () => __trackComposable")
        })

        it('is idempotent — a second transform pass does not add extra wrapping', () => {
            const original = `const counter = useCounter()`
            const first = transform(original)

            expect(first).not.toBeNull()

            const second = transform(first!.code)
            const finalCode = second?.code ?? first!.code
            // Should only have one level of __trackComposable wrapping
            const wrapCount = (finalCode.match(/__trackComposable/g) ?? []).length

            // Import line + one call site = 2 occurrences; double-wrap would be 3+
            expect(wrapCount).toBeLessThanOrEqual(2)
        })
    })

    describe('negative cases', () => {
        it('does not wrap identifiers without the use prefix', () => {
            const result = transform(`doSomething()`)

            expect(result).toBeFalsy()
        })

        it('does not wrap useLowercase (no uppercase after use)', () => {
            // 'uselowercase' does not match /\buse[A-Z]/
            const result = transform(`uselowercase()`)

            expect(result).toBeFalsy()
        })
    })

    describe('file filtering', () => {
        it('returns undefined for node_modules paths', () => {
            const result = transform(`useCounter()`, '/project/node_modules/lib/index.ts')

            expect(result).toBeUndefined()
        })

        it('skips own runtime file: composable-registry', () => {
            const result = transform(`useCounter()`, '/project/src/runtime/composable-registry.ts')

            expect(result).toBeUndefined()
        })

        it('returns undefined for non-ts/vue file extensions', () => {
            const result = transform(`useCounter()`, '/project/src/page.html')

            expect(result).toBeUndefined()
        })
    })

    describe('Vue SFC handling', () => {
        it('transforms composables inside the <script setup> block', () => {
            const sfc = [
                '<template><div>{{ count }}</div></template>',
                '<script setup>',
                'const { count } = useCounter()',
                '</script>',
            ].join('\n')
            const result = transform(sfc, '/project/src/pages/Index.vue')

            expect(result).not.toBeNull()
            expect(result!.code).toContain('__trackComposable(')
            expect(result!.code).toContain('"useCounter"')
        })

        it('preserves the <template> content unchanged', () => {
            const sfc = `<template><p>hello</p></template>\n<script setup>\nuseCounter()\n</script>`
            const result = transform(sfc, '/project/src/P.vue')

            expect(result!.code).toContain('<template><p>hello</p></template>')
        })

        it('returns null for a .vue file with no <script> block', () => {
            const sfc = `<template><div>Static</div></template>`
            const result = transform(sfc, '/project/src/Static.vue')

            expect(result).toBeFalsy()
        })
    })
})
