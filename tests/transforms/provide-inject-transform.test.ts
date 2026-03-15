import { describe, it, expect } from 'vitest'
import { provideInjectPlugin } from '../../src/transforms/provide-inject-transform'

const plugin = provideInjectPlugin()

function transform(code: string, id = '/project/src/MyComponent.ts') {
    return (plugin.transform as (code: string, id: string) => { code: string } | null | undefined)(code, id)
}

describe('provideInjectPlugin', () => {
    describe('provide() transformation', () => {
        it('wraps provide(key, value) with __devProvide(key, value, meta)', () => {
            const result = transform(`provide('theme', themeRef)`)

            expect(result).not.toBeNull()
            expect(result!.code).toContain("__devProvide('theme', themeRef,")
        })

        it('injects the __devProvide and __devInject import', () => {
            const result = transform(`provide('theme', val)`)

            expect(result!.code).toContain(
                "import { __devProvide, __devInject } from 'nuxt-devtools-observatory/runtime/provide-inject-registry'"
            )
        })

        it('includes file and line in the meta object for provide', () => {
            const result = transform(`provide('theme', val)`, '/project/src/ThemeProvider.ts')

            expect(result!.code).toContain('"ThemeProvider.ts"')
            expect(result!.code).toMatch(/line:\s*\d+/)
        })
    })

    describe('inject() transformation', () => {
        it('wraps inject(key) with __devInject(key, undefined, meta)', () => {
            const result = transform(`const theme = inject('theme')`)

            expect(result!.code).toContain("__devInject('theme', undefined,")
        })

        it('wraps inject(key, defaultValue) preserving the default value', () => {
            const result = transform(`const theme = inject('theme', 'light')`)

            expect(result!.code).toContain("__devInject('theme', 'light',")
            // Must NOT insert an extra undefined
            expect(result!.code).not.toContain("__devInject('theme', 'light', undefined,")
        })

        it('includes file and line in the meta object for inject', () => {
            const result = transform(`inject('theme')`, '/project/src/Consumer.ts')

            expect(result!.code).toContain('"Consumer.ts"')
            expect(result!.code).toMatch(/line:\s*\d+/)
        })
    })

    describe('idempotency guard', () => {
        it('does not re-wrap a provide() call already inside __devProvide', () => {
            const code = `__devProvide(provide('theme', val), meta)`
            const result = transform(code)
            const finalCode = result?.code ?? code

            expect(finalCode).not.toContain('__devProvide(__devProvide')
        })

        it('does not re-wrap an inject() call already inside __devInject', () => {
            const code = `__devInject(inject('theme'), undefined, meta)`
            const result = transform(code)
            const finalCode = result?.code ?? code

            expect(finalCode).not.toContain('__devInject(__devInject')
        })
    })

    describe('fast-path bail', () => {
        it('returns falsy when the file contains neither provide( nor inject(', () => {
            const result = transform(`const x = doSomething()`)

            expect(result).toBeFalsy()
        })

        it('still transforms when only provide( is present', () => {
            const result = transform(`provide('key', value)`)

            expect(result).not.toBeNull()
        })

        it('still transforms when only inject( is present', () => {
            const result = transform(`inject('key')`)

            expect(result).not.toBeNull()
        })
    })

    describe('file filtering', () => {
        it('returns undefined for node_modules paths', () => {
            const result = transform(`provide('k', v)`, '/project/node_modules/lib/index.ts')

            expect(result).toBeUndefined()
        })

        it('skips own runtime file: provide-inject-registry', () => {
            const result = transform(`provide('k', v)`, '/project/src/runtime/provide-inject-registry.ts')

            expect(result).toBeUndefined()
        })

        it('returns undefined for non-ts/vue file extensions', () => {
            const result = transform(`provide('k', v)`, '/project/src/page.html')

            expect(result).toBeUndefined()
        })
    })

    describe('Vue SFC handling', () => {
        it('transforms provide/inject inside the <script setup> block of a .vue file', () => {
            const sfc = [
                '<template><div>{{ theme }}</div></template>',
                '<script setup>',
                `provide('theme', 'dark')`,
                `const theme = inject('theme')`,
                '</script>',
            ].join('\n')
            const result = transform(sfc, '/project/src/components/Theme.vue')

            expect(result!.code).toContain("__devProvide('theme',")
            expect(result!.code).toContain("__devInject('theme',")
        })

        it('preserves the <template> content unchanged', () => {
            const sfc = `<template><span>test</span></template>\n<script setup>\nprovide('k', v)\n</script>`
            const result = transform(sfc, '/project/src/T.vue')

            expect(result!.code).toContain('<template><span>test</span></template>')
        })

        it('returns null for a .vue file with no <script> block', () => {
            const sfc = `<template><div>Static</div></template>`
            const result = transform(sfc, '/project/src/Static.vue')

            expect(result).toBeFalsy()
        })
    })
})
