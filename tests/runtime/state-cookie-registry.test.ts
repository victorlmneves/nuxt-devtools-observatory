// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { setupStateCookieRegistry, __trackStateCookie } from '@observatory/runtime/composables/state-cookie-registry'

type TObservatoryWindow = Window & {
    __observatory__?: { stateCookie?: ReturnType<typeof setupStateCookieRegistry> }
}

function getWindow() {
    return window as TObservatoryWindow
}

beforeEach(() => {
    delete getWindow().__observatory__
})

afterEach(() => {
    delete getWindow().__observatory__
})

describe('setupStateCookieRegistry', () => {
    it('upserts an entry retrievable from getSnapshot', () => {
        const registry = setupStateCookieRegistry()
        registry.upsert({
            id: 'useState:count',
            kind: 'useState',
            key: 'count',
            origin: 'csr',
            preview: 1,
            updatedAt: 10,
        })

        expect(registry.getSnapshot()).toHaveLength(1)
        expect(registry.getSnapshot()[0].preview).toBe(1)
    })

    it('evicts the oldest entry when over cap', () => {
        const registry = setupStateCookieRegistry({ maxEntries: 2 })
        registry.upsert({ id: 'useState:a', kind: 'useState', key: 'a', origin: 'csr', updatedAt: 1 })
        registry.upsert({ id: 'useState:b', kind: 'useState', key: 'b', origin: 'csr', updatedAt: 2 })
        registry.upsert({ id: 'useState:c', kind: 'useState', key: 'c', origin: 'csr', updatedAt: 3 })

        const keys = registry.getSnapshot().map((entry) => entry.key)
        expect(keys).toEqual(['b', 'c'])
    })
})

describe('__trackStateCookie', () => {
    it('is a pass-through when no registry is installed', () => {
        const value = __trackStateCookie(() => 7, [], { kind: 'useState' })

        expect(value).toBe(7)
    })

    it('records useState keys and updates when the ref changes', () => {
        const registry = setupStateCookieRegistry()
        getWindow().__observatory__ = { stateCookie: registry }

        const count = __trackStateCookie((_key: unknown, init: unknown) => ref(init), ['count', 0], {
            kind: 'useState',
            file: 'App.vue',
            line: 4,
        })

        expect(registry.getSnapshot()[0]).toMatchObject({
            kind: 'useState',
            key: 'count',
            preview: 0,
        })

        count.value = 3
        expect(registry.getSnapshot()[0].preview).toBe(3)
    })

    it('records cookie option metadata without treating a missing key as empty', () => {
        const registry = setupStateCookieRegistry()
        getWindow().__observatory__ = { stateCookie: registry }

        __trackStateCookie(() => ref('abc'), ['session', { maxAge: 120, path: '/', httpOnly: false }], {
            kind: 'useCookie',
        })

        const entry = registry.getSnapshot()[0]
        expect(entry.key).toBe('session')
        expect(entry.cookie).toEqual({ maxAge: 120, path: '/', httpOnly: false })
        expect(entry.preview).toBe('abc')
    })
})
