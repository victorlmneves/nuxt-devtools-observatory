import { describe, it, expect } from 'vitest'
import { stateCookieTrackerPlugin } from '@observatory/transforms/state-cookie-transform'

const plugin = stateCookieTrackerPlugin()

function transform(code: string, id = '/project/src/MyComponent.ts') {
    return (plugin.transform as (code: string, id: string) => { code: string } | null | undefined)(code, id)
}

describe('stateCookieTrackerPlugin', () => {
    it('wraps useState with __trackStateCookie', () => {
        const result = transform(`const count = useState('count', () => 0)`)

        expect(result).not.toBeNull()
        expect(result!.code).toContain('__trackStateCookie(useState')
        expect(result!.code).toContain('kind: "useState"')
        expect(result!.code).toContain("'count'")
    })

    it('wraps useCookie with __trackStateCookie', () => {
        const result = transform(`const token = useCookie('token', { maxAge: 60 })`)

        expect(result).not.toBeNull()
        expect(result!.code).toContain('__trackStateCookie(useCookie')
        expect(result!.code).toContain('kind: "useCookie"')
    })

    it('does not inject an import — auto-imports come from the module', () => {
        const result = transform(`useState('x')`)

        expect(result!.code).not.toContain("from 'nuxt-devtools-observatory/runtime/state-cookie-registry'")
    })

    it('leaves unrelated composables untouched', () => {
        expect(transform(`useFetch('/api/x')`)).toBeFalsy()
    })
})
