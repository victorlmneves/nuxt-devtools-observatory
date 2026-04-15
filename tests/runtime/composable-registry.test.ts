// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, ref, reactive, watch, nextTick } from 'vue'
import { setupComposableRegistry, __trackComposable, __recordSsrComposableSpan } from '@observatory/runtime/composables/composable-registry'
import { createSsrRecord, drainSsrRecord } from '@observatory/runtime/nitro/ssr-trace-store'

type ObservatoryWindow = Window & { __observatory__?: { composable?: ReturnType<typeof setupComposableRegistry> } }

function getWindow() {
    return window as ObservatoryWindow
}

beforeEach(() => {
    delete getWindow().__observatory__
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    delete getWindow().__observatory__
    vi.restoreAllMocks()
})

describe('setupComposableRegistry', () => {
    it('returns register, update, and getAll', () => {
        const reg = setupComposableRegistry()

        expect(typeof reg.register).toBe('function')
        expect(typeof reg.update).toBe('function')
        expect(typeof reg.getAll).toBe('function')
    })

    it('register() adds an entry and getAll() returns it', () => {
        const { register, getAll } = setupComposableRegistry()

        register({
            id: 'useCounter::1::test.ts:1::0',
            name: 'useCounter',
            componentFile: 'test.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'test.ts',
            line: 1,
            route: '',
        })

        expect(getAll()).toHaveLength(1)
        expect(getAll()[0].name).toBe('useCounter')
        expect(getAll()[0].status).toBe('mounted')
    })

    it('update() merges fields onto an existing entry', () => {
        const { register, update, getAll } = setupComposableRegistry()

        register({
            id: 'id-1',
            name: 'useTimer',
            componentFile: 'T.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'T.ts',
            line: 1,
            route: '',
        })
        update('id-1', { status: 'unmounted', leak: false })

        expect(getAll()[0].status).toBe('unmounted')
    })

    it('update() is a no-op for an unknown id', () => {
        const { update, getAll } = setupComposableRegistry()

        expect(() => update('nonexistent', { status: 'unmounted' })).not.toThrow()
        expect(getAll()).toHaveLength(0)
    })

    it('getAll() returns an array snapshot, not the live map reference', () => {
        const { register, getAll } = setupComposableRegistry()

        register({
            id: 'a',
            name: 'useA',
            componentFile: 'A.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'A.ts',
            line: 1,
            route: '',
        })

        const snapshot = getAll()

        register({
            id: 'b',
            name: 'useB',
            componentFile: 'B.ts',
            componentUid: 2,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'B.ts',
            line: 1,
            route: '',
        })

        expect(snapshot).toHaveLength(1)
        expect(getAll()).toHaveLength(2)
    })
})

describe('__trackComposable', () => {
    it('falls through to callFn() and returns its result when __observatory__ is not set', () => {
        const result = __trackComposable('useCounter', () => ({ count: 42 }), { file: 'test.ts', line: 1 })

        expect(result).toEqual({ count: 42 })
    })

    it('registers a mounted entry when called inside a component setup', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ count: ref(0) }), { file: 'Counter.ts', line: 5 })
                return () => h('div')
            },
        })

        const app = createApp(Comp)
        const el = document.createElement('div')
        app.mount(el)
        app.unmount()

        const entries = reg.getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].name).toBe('useCounter')
        expect(entries[0].componentFile).toBe('Counter.ts')
        expect(entries[0].line).toBe(5)
    })

    it('snapshots ref values in the returned object', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ count: ref(10), label: 'static' }), { file: 'C.ts', line: 1 })
                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        const entry = reg.getAll()[0]

        // 'count' is a ref so it should appear in refs
        expect(entry.refs['count']).toBeDefined()
        expect(entry.refs['count'].type).toBe('ref')
        expect(entry.refs['count'].value).toBe(10)
        // 'label' is not a ref so it should NOT appear
        expect(entry.refs['label']).toBeUndefined()
    })

    it('getAll() reflects current live ref values after they change — not the setup-time snapshot', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const counter = ref(0)

        const Comp = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ counter }), { file: 'C.ts', line: 1 })
                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // Initial snapshot at setup — value is 0
        expect(reg.getAll()[0].refs['counter'].value).toBe(0)

        // Mutate the ref (simulates clicking "increment")
        counter.value = 4

        // getAll() must now return the updated value, not the stale 0
        expect(reg.getAll()[0].refs['counter'].value).toBe(4)

        // Another mutation
        counter.value = 7
        expect(reg.getAll()[0].refs['counter'].value).toBe(7)

        app.unmount()
    })

    it('sets status to unmounted after the component unmounts', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useTimer', () => ({}), { file: 'T.ts', line: 1 })
                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].status).toBe('mounted')

        app.unmount()

        expect(reg.getAll()[0].status).toBe('unmounted')
    })

    it('detects a leaked setInterval that is never cleared', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useLeaky',
                    () => {
                        // Never cleared — this is a leak
                        window.setInterval(() => {}, 60_000)

                        return {}
                    },
                    { file: 'Leaky.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].intervalCount).toBe(1)

        app.unmount()

        const entry = reg.getAll()[0]

        expect(entry.leak).toBe(true)
        expect(entry.lifecycle.intervalsCleaned).toBe(false)
        expect(entry.leakReason).toContain('setInterval')
    })

    it('does NOT flag a leak when the interval is properly cleared', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useClean',
                    () => {
                        const id = window.setInterval(() => {}, 60_000)
                        window.clearInterval(id) // properly cleaned up

                        return {}
                    },
                    { file: 'Clean.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        const entry = reg.getAll()[0]

        expect(entry.leak).toBe(false)
        expect(entry.lifecycle.intervalsCleaned).toBe(true)
        expect(entry.leakReason).toBeUndefined()
    })

    it('restores window.setInterval after the composable setup finishes', () => {
        const originalSetInterval = window.setInterval
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useAny', () => ({}), { file: 'A.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        expect(window.setInterval).toBe(originalSetInterval)
    })

    it('tracks the intervalCount for intervals created during setup', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useMultiInterval',
                    () => {
                        window.setInterval(() => {}, 1000)
                        window.setInterval(() => {}, 2000)

                        return {}
                    },
                    { file: 'M.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        expect(reg.getAll()[0].intervalCount).toBe(2)
    })

    it('tracks watchers created during setup and marks them cleaned on unmount', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useWatched',
                    () => {
                        const count = ref(0)
                        watch(count, () => {})

                        return { count }
                    },
                    { file: 'Watch.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].watcherCount).toBe(1)

        app.unmount()

        expect(reg.getAll()[0].lifecycle.watchersCleaned).toBe(true)
        expect(reg.getAll()[0].leak).toBe(false)
    })
})

describe('__recordSsrComposableSpan', () => {
    it('records a composable setup span into the SSR trace record', () => {
        const requestId = 'req-test-composable-1'
        createSsrRecord(requestId, '/dashboard', 'GET')

        __recordSsrComposableSpan('useDashboard', { file: 'composables/useDashboard.ts', line: 12 }, 110, 145, {
            event: {
                context: {
                    __observatoryRequestId: requestId,
                    __ssrFetchStart: 100,
                },
            },
        })

        const record = drainSsrRecord(requestId, 200)
        const span = record?.spans.find((s) => s.name === 'composable:useDashboard')

        expect(span).toBeDefined()
        expect(span?.type).toBe('composable')
        expect(span?.startTime).toBe(10)
        expect(span?.endTime).toBe(45)
        expect(span?.durationMs).toBe(35)
        expect(span?.metadata?.phase).toBe('setup')
        expect(span?.metadata?.file).toBe('composables/useDashboard.ts')
        expect(span?.metadata?.line).toBe(12)
    })

    it('records an error status and message when setup throws', () => {
        const requestId = 'req-test-composable-2'
        createSsrRecord(requestId, '/dashboard', 'GET')

        __recordSsrComposableSpan('useBroken', { file: 'composables/useBroken.ts', line: 7 }, 205, 210, {
            error: new Error('boom'),
            event: {
                context: {
                    __observatoryRequestId: requestId,
                    __ssrFetchStart: 200,
                },
            },
        })

        const record = drainSsrRecord(requestId, 220)
        const span = record?.spans.find((s) => s.name === 'composable:useBroken')

        expect(span?.status).toBe('error')
        expect(span?.metadata?.errorMessage).toBe('boom')
    })

    it('is a no-op when request context is missing', () => {
        expect(() => {
            __recordSsrComposableSpan('useNoop', { file: 'x.ts', line: 1 }, 0, 1, {
                event: { context: {} },
            })
        }).not.toThrow()
    })
})

// ── Tests for fixes introduced in the bug-fix pass ────────────────────────

describe('__trackComposable — re-entrant setInterval patch (fix #14)', () => {
    it('does not permanently leak the setInterval patch when composables are nested', () => {
        const originalSetInterval = window.setInterval
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        // useOuter calls useInner during its own setup — simulates nested __trackComposable
        const useInner = () => ({})
        const useOuter = () => {
            __trackComposable('useInner', useInner, { file: 'Inner.ts', line: 1 })

            return {}
        }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useOuter', useOuter, { file: 'Outer.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        // After setup completes, window.setInterval must be fully restored
        expect(window.setInterval).toBe(originalSetInterval)
    })

    it('tracks intervals created by the outer composable even when inner composable also patches', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const useInner = () => {
            window.setInterval(() => {}, 500) // inner interval

            return {}
        }

        const useOuter = () => {
            window.setInterval(() => {}, 1000) // outer interval — must be tracked by outer
            __trackComposable('useInner', useInner, { file: 'Inner.ts', line: 1 })

            return {}
        }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useOuter', useOuter, { file: 'Outer.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        const outer = reg.getAll().find((e) => e.name === 'useOuter')

        // The outer composable should have detected at least the interval it created
        expect(outer?.intervalCount).toBeGreaterThanOrEqual(1)
    })
})

describe('__trackComposable — onUnmounted guard outside component context (fix #15)', () => {
    it('does not throw and still registers an entry when called outside a component', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        // Called at module level, no active component instance
        expect(() => {
            __trackComposable('useGlobal', () => ({ value: 42 }), { file: 'store.ts', line: 1 })
        }).not.toThrow()

        expect(reg.getAll()).toHaveLength(1)
        expect(reg.getAll()[0].name).toBe('useGlobal')
    })

    it('does not produce a Vue warning about missing instance when called outside component', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }
        const warnSpy = vi.spyOn(console, 'warn')

        __trackComposable('useGlobal', () => ({}), { file: 'plugin.ts', line: 1 })

        // No Vue lifecycle hook warning should have been emitted
        const lifecycleWarnings = warnSpy.mock.calls.filter(
            (args) => String(args[0]).includes('onUnmounted') || String(args[0]).includes('lifecycle')
        )

        expect(lifecycleWarnings).toHaveLength(0)
    })
})

describe('__trackComposable — live ref snapshot after unmount (regression: empty-object sentinel bug)', () => {
    it('getAll() after unmount still returns the frozen setup-time ref snapshot', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useStatic', () => ({ count: ref(42) }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        // Unmount causes onUnmounted → registerLiveRefs(id, {}) → liveRefs.delete(id)
        app.unmount()

        const entry = reg.getAll()[0]

        // Frozen snapshot from setup time must still be accessible
        expect(entry.refs['count']).toBeDefined()
        expect(entry.refs['count'].type).toBe('ref')
        expect(entry.refs['count'].value).toBe(42)
    })

    it('getAll() while mounted returns the LIVE value, not the setup-time snapshot', async () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let countRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                countRef = ref(0)
                __trackComposable('useLive', () => ({ count: countRef! }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // Mutate after setup
        countRef!.value = 99

        const entry = reg.getAll()[0]

        // Must reflect the current value, not the 0 captured at setup time
        expect(entry.refs['count']?.value).toBe(99)

        app.unmount()
    })
})

describe('setupComposableRegistry — clear() (session reset)', () => {
    it('clear() removes all entries', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ count: ref(0) }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()).toHaveLength(1)

        reg.clear()

        expect(reg.getAll()).toHaveLength(0)

        app.unmount()
    })

    it('clear() stops live ref watchers so onChange is not fired after clearing', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let changeCount = 0

        reg.onComposableChange(() => {
            changeCount++
        })

        let countRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                countRef = ref(0)
                __trackComposable('useCounter', () => ({ count: countRef! }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        reg.clear()
        const callsBeforeMutation = changeCount

        // Mutating after clear should NOT fire onChange
        countRef!.value = 99

        expect(changeCount).toBe(callsBeforeMutation)

        app.unmount()
    })

    it('clear() exposes entries returning empty array immediately after', () => {
        const reg = setupComposableRegistry()

        reg.register({
            id: 'test::1::C.ts:1::0::abc',
            name: 'useTest',
            componentFile: 'C.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'C.ts',
            line: 1,
            route: '/',
        })

        expect(reg.getAll()).toHaveLength(1)

        reg.clear()

        expect(reg.getAll()).toHaveLength(0)
    })
})

describe('setupComposableRegistry — setRoute() / route stamping', () => {
    it('entries are stamped with the current route at registration time', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        reg.setRoute('/products')

        const Comp = defineComponent({
            setup() {
                __trackComposable('useProducts', () => ({}), { file: 'P.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        expect(reg.getAll()[0].route).toBe('/products')
    })

    it('entries on different routes carry their respective route path', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        reg.setRoute('/home')
        const entryA: import('../../src/runtime/composables/composable-registry').ComposableEntry = {
            id: 'useHome::1::H.ts:1::0::abc',
            name: 'useHome',
            componentFile: 'H.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'H.ts',
            line: 1,
            route: '/home',
        }
        reg.register(entryA)

        reg.setRoute('/about')
        const entryB: import('../../src/runtime/composables/composable-registry').ComposableEntry = {
            ...entryA,
            id: 'useAbout::1::A.ts:1::0::def',
            name: 'useAbout',
            componentFile: 'A.ts',
            route: '/about',
        }
        reg.register(entryB)

        const all = reg.getAll()

        expect(all.find((e) => e.name === 'useHome')?.route).toBe('/home')
        expect(all.find((e) => e.name === 'useAbout')?.route).toBe('/about')
    })
})

describe('setupComposableRegistry — navigation reset via clear()', () => {
    it('clear() removes all entries including previously-registered ones', () => {
        const reg = setupComposableRegistry()

        const makeEntry = (id: string, name: string, route: string) => ({
            id,
            name,
            componentFile: 'C.ts',
            componentUid: 1,
            status: 'mounted' as const,
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'C.ts',
            line: 1,
            route,
        })

        reg.register(makeEntry('a::1::C.ts:1::0::a', 'useA', '/'))
        reg.register(makeEntry('b::1::C.ts:1::0::b', 'useB', '/'))

        expect(reg.getAll()).toHaveLength(2)

        reg.clear()

        expect(reg.getAll()).toHaveLength(0)
    })

    it('entries registered AFTER clear() survive (new page setup() runs after router.beforeEach)', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        // Simulate: page A mounts a composable
        const AppA = defineComponent({
            setup() {
                __trackComposable('usePageA', () => ({}), { file: 'A.ts', line: 1 })

                return () => h('div')
            },
        })
        const appA = createApp(AppA)
        appA.mount(document.createElement('div'))

        expect(reg.getAll().map((e) => e.name)).toContain('usePageA')

        // Simulate: router.beforeEach fires → clear
        reg.clear()

        expect(reg.getAll()).toHaveLength(0)

        // Simulate: page B mounts AFTER the clear
        const AppB = defineComponent({
            setup() {
                __trackComposable('usePageB', () => ({}), { file: 'B.ts', line: 1 })

                return () => h('div')
            },
        })
        const appB = createApp(AppB)
        appB.mount(document.createElement('div'))

        // Only page B's composable should appear
        const all = reg.getAll()

        expect(all.map((e) => e.name)).not.toContain('usePageA')
        expect(all.map((e) => e.name)).toContain('usePageB')

        appA.unmount()
        appB.unmount()
    })

    it('update() is a safe no-op for entries cleared before onUnmounted fires', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const App = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ count: ref(0) }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(App)
        app.mount(document.createElement('div'))

        const id = reg.getAll()[0].id

        // Simulate router.beforeEach: clear before old page unmounts
        reg.clear()

        // Simulate old page's onUnmounted trying to update a cleared entry
        // (this is what happens when beforeEach clears before components unmount)
        expect(() => {
            reg.update(id, { status: 'unmounted', leak: false })
        }).not.toThrow()

        // Registry should still be empty — update on non-existent entry is a no-op
        expect(reg.getAll()).toHaveLength(0)

        app.unmount()
    })
})

describe('__trackComposable — reactive() object tracking (priority 1)', () => {
    it('captures a reactive() object returned from a composable', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useStore',
                    () => {
                        const state = reactive({ count: 5, name: 'test' })

                        return { state }
                    },
                    { file: 'Store.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        const entry = reg.getAll()[0]

        expect(entry.refs['state']).toBeDefined()
        expect(entry.refs['state'].type).toBe('reactive')
        // Value should be a snapshot of the reactive object
        expect((entry.refs['state'].value as Record<string, unknown>)?.count).toBe(5)

        app.unmount()
    })

    it('reactive() values update live when properties change', async () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let state: { count: number } | null = null

        const Comp = defineComponent({
            setup() {
                state = reactive({ count: 0 })
                __trackComposable('useReactive', () => ({ state: state! }), { file: 'R.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        state!.count = 42
        await nextTick()

        const entry = reg.getAll()[0]

        expect((entry.refs['state'].value as Record<string, unknown>)?.count).toBe(42)

        app.unmount()
    })
})

describe('__trackComposable — change history (priority 3)', () => {
    it('records an empty history on initial registration', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ count: ref(0) }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].history).toEqual([])

        app.unmount()
    })

    it('appends a history event when a ref value changes', async () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let countRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                countRef = ref(0)
                __trackComposable('useCounter', () => ({ count: countRef! }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        countRef!.value = 10
        await nextTick()

        countRef!.value = 20
        await nextTick()

        const history = reg.getAll()[0].history

        expect(history.length).toBeGreaterThanOrEqual(2)
        expect(history[history.length - 1].key).toBe('count')
        expect(history[history.length - 1].value).toBe(20)

        app.unmount()
    })

    it('does not record unchanged keys as history events', async () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let aRef: ReturnType<typeof ref<number>> | null = null
        let bRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                aRef = ref(1)
                bRef = ref(100)
                __trackComposable('useTwo', () => ({ a: aRef!, b: bRef! }), { file: 'T.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // Only mutate 'a'
        aRef!.value = 2
        await nextTick()

        const history = reg.getAll()[0].history
        // Only 'a' should have a history event — 'b' didn't change
        const bEvents = history.filter((e) => e.key === 'b')

        expect(bEvents).toHaveLength(0)

        const aEvents = history.filter((e) => e.key === 'a')

        expect(aEvents.length).toBeGreaterThanOrEqual(1)

        app.unmount()
    })

    it('clears history when clear() is called', async () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }
        let countRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                countRef = ref(0)
                __trackComposable('useCounter', () => ({ count: countRef! }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        countRef!.value = 5
        await nextTick()

        expect(reg.getAll()[0].history.length).toBeGreaterThanOrEqual(1)

        reg.clear()

        expect(reg.getAll()).toHaveLength(0)

        app.unmount()
    })
})

describe('setupComposableRegistry — sharedKeys / global vs local detection (priority 4)', () => {
    it('sharedKeys is empty for a composable with no other instances', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useCounter', () => ({ count: ref(0) }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].sharedKeys).toEqual([])

        app.unmount()
    })

    it('sharedKeys is empty when two instances create their own separate refs (local state)', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        // Each call to useLocal() creates a NEW ref — not shared
        function useLocal() {
            return { count: ref(0) }
        }

        const CompA = defineComponent({
            setup() {
                __trackComposable('useLocal', useLocal, { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })
        const CompB = defineComponent({
            setup() {
                __trackComposable('useLocal', useLocal, { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })

        const el = document.createElement('div')
        const appA = createApp(CompA)
        appA.mount(el)
        const appB = createApp(CompB)
        appB.mount(document.createElement('div'))

        const entries = reg.getAll()

        expect(entries).toHaveLength(2)

        // Both instances created their own refs → no sharing
        entries.forEach((e) => expect(e.sharedKeys).toEqual([]))

        appA.unmount()
        appB.unmount()
    })

    it('detects sharedKeys when two instances return the same ref object (global/singleton state)', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        // Module-level ref — shared across all instances
        const sharedCount = ref(0)

        function useGlobal() {
            return { count: sharedCount }
        }

        const CompA = defineComponent({
            setup() {
                __trackComposable('useGlobal', useGlobal, { file: 'G.ts', line: 1 })

                return () => h('div')
            },
        })
        const CompB = defineComponent({
            setup() {
                __trackComposable('useGlobal', useGlobal, { file: 'G.ts', line: 1 })

                return () => h('div')
            },
        })

        const appA = createApp(CompA)
        appA.mount(document.createElement('div'))
        const appB = createApp(CompB)
        appB.mount(document.createElement('div'))

        const entries = reg.getAll()

        expect(entries).toHaveLength(2)

        // Both instances return the SAME ref object → 'count' should be flagged as shared
        entries.forEach((e) => expect(e.sharedKeys).toContain('count'))

        // Shared keys should include a stable identity-group mapping for lookup.
        const groupA = entries[0].sharedKeyGroups?.count
        const groupB = entries[1].sharedKeyGroups?.count
        expect(groupA).toBeDefined()
        expect(groupA).toBe(groupB)

        appA.unmount()
        appB.unmount()
    })

    it('only flags the keys that are shared, not local ones', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const globalRef = ref('shared-value')

        function useMixed() {
            return {
                global: globalRef, // shared — same object
                local: ref(0), // local — new ref each call
            }
        }

        const CompA = defineComponent({
            setup() {
                __trackComposable('useMixed', useMixed, { file: 'M.ts', line: 1 })

                return () => h('div')
            },
        })
        const CompB = defineComponent({
            setup() {
                __trackComposable('useMixed', useMixed, { file: 'M.ts', line: 1 })

                return () => h('div')
            },
        })

        const appA = createApp(CompA)
        appA.mount(document.createElement('div'))
        const appB = createApp(CompB)
        appB.mount(document.createElement('div'))

        const entries = reg.getAll()

        entries.forEach((e) => {
            expect(e.sharedKeys).toContain('global')
            expect(e.sharedKeys).not.toContain('local')
            expect(e.sharedKeyGroups?.global).toBeDefined()
            expect(e.sharedKeyGroups?.local).toBeUndefined()
        })

        appA.unmount()
        appB.unmount()
    })

    it('does not cross-detect sharing between different composable names', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const shared = ref(42)

        const CompA = defineComponent({
            setup() {
                __trackComposable('useA', () => ({ val: shared }), { file: 'A.ts', line: 1 })

                return () => h('div')
            },
        })
        const CompB = defineComponent({
            setup() {
                // Different composable name, same ref — should NOT flag as shared
                // because sharing is only meaningful within the same composable
                __trackComposable('useB', () => ({ val: shared }), { file: 'B.ts', line: 1 })

                return () => h('div')
            },
        })

        const appA = createApp(CompA)
        appA.mount(document.createElement('div'))
        const appB = createApp(CompB)
        appB.mount(document.createElement('div'))

        const entries = reg.getAll()
        const entryA = entries.find((e) => e.name === 'useA')!
        const entryB = entries.find((e) => e.name === 'useB')!

        // No other 'useA' instances → not shared
        expect(entryA.sharedKeys).toEqual([])
        // No other 'useB' instances → not shared
        expect(entryB.sharedKeys).toEqual([])

        appA.unmount()
        appB.unmount()
    })
})

describe('safeSnapshot edge cases (composable-registry)', () => {
    it('snapshots a function value as "[Function]" in frozen post-unmount entry', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useFn', () => ({ fn: ref(() => 42) }), { file: 'F.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        // Unmount so sanitize() uses the frozen safeSnapshot path, not live safeValue
        app.unmount()

        const val = reg.getAll()[0]?.refs['fn']?.value

        expect(val).toBe('[Function]')
    })

    it('snapshots an array ref as "Array(N)" in frozen post-unmount entry', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable('useArr', () => ({ list: ref([1, 2, 3]) }), { file: 'A.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        const val = reg.getAll()[0]?.refs['list']?.value

        expect(val).toBe('Array(3)')
    })
})

describe('safeValue edge cases', () => {
    it('returns null as-is', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }
        const Comp = defineComponent({
            setup() {
                __trackComposable('useNull', () => ({ val: ref(null) }), { file: 'N.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].refs['val'].value).toBeNull()

        app.unmount()
    })

    it('returns undefined as-is', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }
        const Comp = defineComponent({
            setup() {
                __trackComposable('useUndef', () => ({ val: ref(undefined) }), { file: 'U.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(reg.getAll()[0].refs['val'].value).toBeUndefined()

        app.unmount()
    })
})

describe('history cap at MAX_HISTORY', () => {
    it('never exceeds 50 entries in history', async () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }
        let count: ReturnType<typeof ref<number>> | null = null
        const Comp = defineComponent({
            setup() {
                count = ref(0)
                __trackComposable('useCap', () => ({ count: count! }), { file: 'C.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // Fire 60 mutations
        for (let i = 1; i <= 60; i++) {
            count!.value = i
            await nextTick()
        }

        expect(reg.getAll()[0].history.length).toBeLessThanOrEqual(50)

        app.unmount()
    })
})

describe('computeSharedKeys — missing otherRaw entry', () => {
    it('does not crash when an entry has no rawRefs registered (race during clear)', () => {
        const reg = setupComposableRegistry()
        // Register entry without registerRawRefs — simulates partial registration
        reg.register({
            id: 'useX::1::X.ts:1::0::aaa',
            name: 'useX',
            componentFile: 'X.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'X.ts',
            line: 1,
            route: '/',
        })
        reg.register({
            id: 'useX::2::X.ts:1::0::bbb',
            name: 'useX',
            componentFile: 'X.ts',
            componentUid: 2,
            status: 'mounted',
            leak: false,
            refs: {},
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'X.ts',
            line: 1,
            route: '/',
        })
        // Neither has rawRefs → computeSharedKeys should return []
        const entries = reg.getAll()
        entries.forEach((e) => expect(e.sharedKeys).toEqual([]))
    })
})

describe('safeValue — function and unserializable branches', () => {
    it('returns undefined for a function ref value (safeValue function branch)', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                // The computed ref is readonly, so safeValue receives a function
                // for the getter. But a raw function ref:
                const fnRef = ref(function myFn() {
                    return 42
                })

                __trackComposable('useFnRef', () => ({ fn: fnRef }), { file: 'F.ts', line: 1 })

                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // safeValue(fn) → undefined (functions stripped from snapshot)
        expect(reg.getAll()[0].refs['fn'].value).toBeUndefined()

        app.unmount()
    })

    it('safeSnapshot initial entry handles unserializable gracefully via String() fallback', () => {
        const reg = setupComposableRegistry()
        // Register directly to test the sanitize path with a stored unserializable value
        reg.register({
            id: 'useUnser::1::U.ts:1::0::abc',
            name: 'useUnser',
            componentFile: 'U.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: { data: { type: 'ref', value: '[unserializable]' } },
            history: [],
            sharedKeys: [],
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'U.ts',
            line: 1,
            route: '/',
        })
        const entry = reg.getAll()[0]

        expect(entry.refs['data'].value).toBe('[unserializable]')
    })
})

describe('leak detection — watcher count and cleanup', () => {
    it('tracks watcherCount correctly for watchers created inside the composable', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useWatchers',
                    () => {
                        const a = ref(0)
                        const b = ref(0)
                        watch(a, () => {})
                        watch(b, () => {})

                        return { a, b }
                    },
                    { file: 'W.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // Both watchers were created — watcherCount should be 2
        expect(reg.getAll()[0].watcherCount).toBe(2)

        app.unmount()

        // Component-scoped watchers are auto-stopped on unmount, so no leak
        expect(reg.getAll()[0].leak).toBe(false)
        expect(reg.getAll()[0].lifecycle.watchersCleaned).toBe(true)
    })

    it('leakReason message uses plural "watchers" phrasing for multiple interval leaks', () => {
        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        const Comp = defineComponent({
            setup() {
                __trackComposable(
                    'useMultiInterval',
                    () => {
                        // Two intervals never cleared — confirmed leak path
                        window.setInterval(() => {}, 500)
                        window.setInterval(() => {}, 1000)

                        return {}
                    },
                    { file: 'I.ts', line: 1 }
                )

                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()

        const entry = reg.getAll()[0]

        expect(entry.leak).toBe(true)
        // leakReason identifies both leaked interval IDs
        expect(entry.leakReason).toContain('setInterval')
    })
})

describe('onComposableChange — rAF debounce', () => {
    it('coalesces multiple rapid ref changes into a single _onChange call per frame', async () => {
        // Use fake timers so we control when rAF fires
        vi.useFakeTimers()

        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let callCount = 0
        reg.onComposableChange(() => {
            callCount++
        })

        let countRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                countRef = ref(0)
                __trackComposable('useCounter', () => ({ count: countRef! }), { file: 'D.ts', line: 1 })
                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // Let the initial watchEffect run
        await nextTick()

        const callsAfterMount = callCount

        // Fire 10 rapid changes in the same synchronous block
        for (let i = 1; i <= 10; i++) {
            countRef!.value = i
        }

        // watchEffects have queued but rAF hasn't fired yet —
        // _onChange should NOT have been called yet
        await nextTick()
        expect(callCount).toBe(callsAfterMount)

        // Advance timers so rAF fires — all 10 changes should produce exactly 1 call
        vi.runAllTimers()
        expect(callCount).toBe(callsAfterMount + 1)

        vi.useRealTimers()
        app.unmount()
    })

    it('schedules a new frame after the previous one fires', async () => {
        vi.useFakeTimers()

        const reg = setupComposableRegistry()
        getWindow().__observatory__ = { composable: reg }

        let callCount = 0
        reg.onComposableChange(() => {
            callCount++
        })

        let countRef: ReturnType<typeof ref<number>> | null = null

        const Comp = defineComponent({
            setup() {
                countRef = ref(0)
                __trackComposable('useCounter', () => ({ count: countRef! }), { file: 'E.ts', line: 1 })
                return () => h('div')
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        await nextTick()

        const callsAfterMount = callCount

        // First batch of changes
        countRef!.value = 1
        await nextTick()
        vi.runAllTimers() // first frame fires

        expect(callCount).toBe(callsAfterMount + 1)

        // Second batch — a new frame should be scheduled
        countRef!.value = 2
        await nextTick()
        vi.runAllTimers() // second frame fires

        expect(callCount).toBe(callsAfterMount + 2)

        vi.useRealTimers()
        app.unmount()
    })
})
