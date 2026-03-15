import { describe, it, expect } from 'vitest'
import { fetchInstrumentPlugin } from '../../src/transforms/fetch-transform'

const plugin = fetchInstrumentPlugin()

function transform(code: string, id = '/project/src/MyComponent.ts') {
    return (plugin.transform as (code: string, id: string) => { code: string } | null | undefined)(code, id)
}

describe('fetchInstrumentPlugin', () => {
    describe('core transformation', () => {
        it('wraps useFetch(url) with __devFetch(useFetch, url, {}, meta)', () => {
            const result = transform(`const { data } = useFetch('/api/users')`)

            expect(result).not.toBeNull()
            expect(result!.code).toContain('__devFetch(useFetch,')
            expect(result!.code).toContain("'/api/users'")
        })

        it('transforms all four target functions', () => {
            for (const fn of ['useFetch', 'useAsyncData', 'useLazyFetch', 'useLazyAsyncData']) {
                const result = transform(`${fn}('/api/test')`)

                expect(result).not.toBeNull()
                expect(result!.code).toContain(`__devFetch(${fn},`)
            }
        })

        it('injects the __devFetch import statement', () => {
            const result = transform(`useFetch('/api/test')`)

            expect(result!.code).toContain("import { __devFetch } from 'nuxt-devtools-observatory/runtime/fetch-registry'")
        })

        it('does not duplicate the import when __devFetch is already present in the source', () => {
            const code = `import { __devFetch } from 'nuxt-devtools-observatory/runtime/fetch-registry';\nuseFetch('/api/test')`
            const result = transform(code)
            const count = (result!.code.match(/import.*__devFetch/g) ?? []).length

            expect(count).toBe(1)
        })
    })

    describe('key derivation', () => {
        it('derives key from the URL string literal by stripping non-alphanumeric chars', () => {
            const result = transform(`useFetch('/api/users')`)

            expect(result!.code).toContain('"api-users"')
        })

        it('uses the explicit opts.key string literal when provided', () => {
            const result = transform(`useFetch('/api/users', { key: 'my-users' })`)

            expect(result!.code).toContain('"my-users"')
        })

        it('falls back to the function name when URL is not a string literal', () => {
            const result = transform(`useFetch(dynamicUrl)`)

            expect(result!.code).toContain('"useFetch"')
        })

        it('falls back to function name when the second arg is not an opts object', () => {
            // useAsyncData('key', fetcherFn) — opts is a function, not an ObjectExpression,
            // so neither opts.key nor URL key-derivation can apply; key = function name.
            const result = transform(`useAsyncData('/api/test', fetchFn)`)
            expect(result!.code).toContain('"useAsyncData"')
        })
    })

    describe('meta object', () => {
        it('includes the filename (without path) in the meta object', () => {
            const result = transform(`useFetch('/api/test')`, '/project/src/pages/ProductPage.ts')

            expect(result!.code).toContain('"ProductPage.ts"')
        })

        it('includes the originalFn name in meta', () => {
            const result = transform(`useLazyFetch('/api/test')`)

            expect(result!.code).toContain('"useLazyFetch"')
        })

        it('includes a line number in meta', () => {
            const result = transform(`useFetch('/api/test')`)

            // line: <number> should appear in the meta object
            expect(result!.code).toMatch(/line:\s*\d+/)
        })
    })

    describe('idempotency guard', () => {
        it('does not double-wrap a useFetch call that is already an arg inside __devFetch', () => {
            // Simulate an edge case where useFetch('/api') appears as a child call inside __devFetch
            const code = `__devFetch(useFetch('/api/test'), {}, meta)`
            const result = transform(code)
            // Transformation should return null (nothing modified) since the only
            // useFetch call is inside __devFetch's arguments and the parent guard fires
            const finalCode = result?.code ?? code

            expect(finalCode).not.toMatch(/__devFetch\(.*__devFetch/)
        })

        it('is idempotent — running the transform twice produces no double-wrapping', () => {
            const original = `const { data } = useFetch('/api/items')`
            const first = transform(original)

            expect(first).not.toBeNull()

            // Second pass on already-transformed code: useFetch appears as identifier arg, not callee
            const second = transform(first!.code)

            // No useFetch(...) call expression exists after the first pass, so nothing new to wrap
            expect(second?.code ?? first!.code).not.toMatch(/__devFetch\(.*__devFetch/)
        })
    })

    describe('file filtering', () => {
        it('returns undefined for node_modules paths', () => {
            const result = transform(`useFetch('/api/test')`, '/project/node_modules/some-lib/index.ts')

            expect(result).toBeUndefined()
        })

        it('returns undefined for files that do not contain any target function', () => {
            const result = transform(`const x = doSomething()`)

            expect(result).toBeFalsy()
        })

        it('skips own runtime file: fetch-registry', () => {
            const result = transform(`useFetch('/api')`, '/project/src/runtime/fetch-registry.ts')
            expect(result).toBeUndefined()
        })

        it('skips own runtime file: composable-registry', () => {
            const result = transform(`useFetch('/api')`, '/project/src/runtime/composable-registry.ts')

            expect(result).toBeUndefined()
        })

        it('returns undefined for non-ts/vue/js file extensions', () => {
            const result = transform(`useFetch('/api')`, '/project/src/page.html')

            expect(result).toBeUndefined()
        })
    })

    describe('Vue SFC handling', () => {
        it('extracts the <script setup> block and transforms calls inside it', () => {
            const sfc = [
                '<template><div>{{ data }}</div></template>',
                '<script setup>',
                `const { data } = useFetch('/api/items')`,
                '</script>',
            ].join('\n')
            const result = transform(sfc, '/project/src/pages/Index.vue')

            expect(result).not.toBeNull()
            expect(result!.code).toContain('__devFetch(useFetch,')
        })

        it('preserves the <template> block content unchanged', () => {
            const template = '<template><div class="my-div">{{ data }}</div></template>'
            const sfc = `${template}\n<script setup>\nconst { data } = useFetch('/api/items')\n</script>`
            const result = transform(sfc, '/project/src/pages/Index.vue')

            expect(result!.code).toContain('<template><div class="my-div">')
        })

        it('returns null for a .vue file with no <script> block', () => {
            const sfc = `<template><div>Hello</div></template>`
            const result = transform(sfc, '/project/src/MyComponent.vue')

            expect(result).toBeFalsy()
        })

        it('returns falsy for a .vue file whose script has no target functions', () => {
            const sfc = `<template></template>\n<script setup>\nconst x = 1\n</script>`
            const result = transform(sfc, '/project/src/Noop.vue')

            expect(result).toBeFalsy()
        })

        it('handles <script lang="ts"> attribute in the opening tag', () => {
            const sfc = `<template></template>\n<script lang="ts">\nconst { data } = useFetch('/api/test')\n</script>`
            const result = transform(sfc, '/project/src/Page.vue')

            expect(result).not.toBeNull()
            expect(result!.code).toContain('__devFetch(useFetch,')
        })
    })
})
