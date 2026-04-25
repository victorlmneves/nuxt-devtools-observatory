// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupPiniaStoreRegistry } from '@observatory/runtime/composables/pinia-store-registry'

const { getCurrentInstanceMock } = vi.hoisted(() => ({
    getCurrentInstanceMock: vi.fn(),
}))

vi.mock('vue', async () => {
    const vue = await vi.importActual<typeof import('vue')>('vue')

    return {
        ...vue,
        getCurrentInstance: getCurrentInstanceMock,
    }
})

type ActionCtx = {
    name: string
    args: unknown[]
    after: (cb: () => void) => void
    onError: (cb: (error: unknown) => void) => void
}

type MutationCtx = {
    storeId: string
    type: 'direct' | 'patch object' | 'patch function'
    payload?: unknown
}

class FakeStore {
    $id: string
    $state: Record<string, unknown>
    $options?: { persist?: unknown }

    private actionListeners: Array<(ctx: ActionCtx) => void> = []
    private subListeners: Array<(mutation: MutationCtx, state: Record<string, unknown>) => void> = []

    constructor(id: string, state: Record<string, unknown>, options?: { persist?: unknown }) {
        this.$id = id
        this.$state = structuredClone(state)
        this.$options = options
    }

    $onAction(cb: (ctx: ActionCtx) => void) {
        this.actionListeners.push(cb)

        return () => {
            this.actionListeners = this.actionListeners.filter((listener) => listener !== cb)
        }
    }

    $subscribe(cb: (mutation: MutationCtx, state: Record<string, unknown>) => void) {
        this.subListeners.push(cb)

        return () => {
            this.subListeners = this.subListeners.filter((listener) => listener !== cb)
        }
    }

    $patch(arg: ((state: Record<string, unknown>) => void) | Record<string, unknown>) {
        if (typeof arg === 'function') {
            arg(this.$state)
            this.emitMutation({ storeId: this.$id, type: 'patch function' })
            return
        }

        Object.assign(this.$state, arg)
        this.emitMutation({ storeId: this.$id, type: 'patch object', payload: arg })
    }

    runAction(name: string, args: unknown[], run: () => void) {
        const afters: Array<() => void> = []
        const onErrors: Array<(error: unknown) => void> = []

        for (const listener of this.actionListeners) {
            listener({
                name,
                args,
                after(cb) {
                    afters.push(cb)
                },
                onError(cb) {
                    onErrors.push(cb)
                },
            })
        }

        try {
            run()
            for (const done of afters) {
                done()
            }
        } catch (error) {
            for (const onError of onErrors) {
                onError(error)
            }

            throw error
        }
    }

    emitMutation(mutation: MutationCtx) {
        for (const listener of this.subListeners) {
            listener(mutation, structuredClone(this.$state))
        }
    }
}

class FakePinia {
    _s = new Map<string, FakeStore>()
    private plugins: Array<(ctx: { store: FakeStore }) => void> = []

    use(plugin: (ctx: { store: FakeStore }) => void) {
        this.plugins.push(plugin)

        for (const store of this._s.values()) {
            plugin({ store })
        }
    }

    addStore(store: FakeStore) {
        this._s.set(store.$id, store)

        for (const plugin of this.plugins) {
            plugin({ store })
        }
    }
}

beforeEach(() => {
    getCurrentInstanceMock.mockReset()
})

describe('setupPiniaStoreRegistry', () => {
    it('registers stores and records payload hydration source', () => {
        const pinia = new FakePinia()
        pinia.addStore(new FakeStore('cart', { items: [] }))

        const registry = setupPiniaStoreRegistry({
            pinia,
            nuxtPayload: { pinia: { cart: { items: [{ id: 1 }] } } },
        })

        const all = registry.getAll()

        expect(all).toHaveLength(1)
        expect(all[0].id).toBe('cart')
        expect(all[0].hydration?.source).toBe('nuxt-payload')
        expect(all[0].hydrationTimeline.length).toBeGreaterThan(0)
    })

    it('tracks action timeline with before/after state and diff', () => {
        const pinia = new FakePinia()
        const store = new FakeStore('counter', { count: 0 })
        pinia.addStore(store)

        const registry = setupPiniaStoreRegistry({ pinia })

        store.runAction('increment', [], () => {
            store.$state.count = 1
            store.emitMutation({ storeId: 'counter', type: 'direct' })
        })

        const entry = registry.getAll()[0]
        const action = entry.timeline.find((event) => event.kind === 'action' && event.name === 'increment')

        expect(action).toBeDefined()
        expect(action?.status).toBe('ok')
        expect(action?.beforeState).toEqual({ count: 0 })
        expect(action?.afterState).toEqual({ count: 1 })
        expect(action?.diff.some((item) => item.path === 'count')).toBe(true)
    })

    it('caps timeline entries to maxTimeline', () => {
        const pinia = new FakePinia()
        const store = new FakeStore('counter', { count: 0 })
        pinia.addStore(store)

        const registry = setupPiniaStoreRegistry({ pinia, maxTimeline: 3 })

        for (let i = 1; i <= 6; i++) {
            store.runAction('increment', [], () => {
                store.$state.count = i
                store.emitMutation({ storeId: 'counter', type: 'direct' })
            })
        }

        const entry = registry.getAll()[0]

        expect(entry.timeline.length).toBe(3)
    })

    it('edits nested state path through editState', () => {
        const pinia = new FakePinia()
        const store = new FakeStore('settings', {
            profile: { locale: 'en-US' },
        })
        pinia.addStore(store)

        const registry = setupPiniaStoreRegistry({ pinia })
        registry.editState('settings', 'profile.locale', 'pt-BR')

        const entry = registry.getAll()[0]

        expect((entry.state as { profile: { locale: string } }).profile.locale).toBe('pt-BR')
    })

    it('adds component and composable dependency edges from context + stack', () => {
        const pinia = new FakePinia()
        const store = new FakeStore('cart', { total: 0 })
        pinia.addStore(store)

        getCurrentInstanceMock.mockReturnValue({
            uid: 12,
            type: {
                __name: 'CheckoutPage',
                __file: '/playground/pages/checkout.vue',
            },
        })

        const registry = setupPiniaStoreRegistry({
            pinia,
            stackProvider: () => [
                'at useCartSummary (/playground/composables/useCartSummary.ts:14:8)',
                'at onCheckoutClick (/playground/pages/checkout.vue:28:3)',
            ],
        })

        store.runAction('applyCoupon', ['WELCOME'], () => {
            store.$state.total = 120
            store.emitMutation({ storeId: 'cart', type: 'direct' })
        })

        const entry = registry.getAll()[0]

        expect(entry.dependencies.some((dep) => dep.kind === 'component' && dep.name === 'CheckoutPage')).toBe(true)
        expect(entry.dependencies.some((dep) => dep.kind === 'composable' && dep.name === 'useCartSummary')).toBe(true)
    })

    it('attributes persistedstate hydration with storage source in timeline', () => {
        const pinia = new FakePinia()

        const localStoragePersist = {
            key: 'cart',
            storage: localStorage,
        }

        pinia.addStore(new FakeStore('cart', { items: [] }, { persist: localStoragePersist }))

        const registry = setupPiniaStoreRegistry({ pinia })
        const entry = registry.getAll()[0]

        const persistedHydration = entry.hydrationTimeline.find((event) => event.source === 'persistedstate')

        expect(persistedHydration).toBeDefined()
        expect(persistedHydration?.details).toContain('localStorage')
    })
})
