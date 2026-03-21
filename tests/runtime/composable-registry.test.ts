// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, ref, watch } from 'vue'
import { setupComposableRegistry, __trackComposable } from '../../src/runtime/composables/composable-registry'

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
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'test.ts',
            line: 1,
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
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'T.ts',
            line: 1,
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
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'A.ts',
            line: 1,
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
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'B.ts',
            line: 1,
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

describe('setupComposableRegistry — clearPreviousRoute()', () => {
    it('removes cleanly unmounted entries from the specified route', () => {
        const reg = setupComposableRegistry()

        reg.register({
            id: 'useA::1::A.ts:1::0::a1',
            name: 'useA',
            componentFile: 'A.ts',
            componentUid: 1,
            status: 'unmounted',
            leak: false,
            refs: {},
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true },
            file: 'A.ts',
            line: 1,
            route: '/home',
        })

        reg.clearPreviousRoute('/home')

        expect(reg.getAll()).toHaveLength(0)
    })

    it('keeps leaked entries even after clearPreviousRoute for the same route', () => {
        const reg = setupComposableRegistry()

        reg.register({
            id: 'useLeaky::1::L.ts:1::0::l1',
            name: 'useLeaky',
            componentFile: 'L.ts',
            componentUid: 1,
            status: 'unmounted',
            leak: true,
            leakReason: '1 watcher still active',
            refs: {},
            watcherCount: 1,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: false, intervalsCleaned: true },
            file: 'L.ts',
            line: 1,
            route: '/home',
        })

        reg.clearPreviousRoute('/home')

        // Leaked entry must survive the clear
        expect(reg.getAll()).toHaveLength(1)
        expect(reg.getAll()[0].leak).toBe(true)
    })

    it('keeps still-mounted entries from other routes untouched', () => {
        const reg = setupComposableRegistry()

        reg.register({
            id: 'useOld::1::O.ts:1::0::o1',
            name: 'useOld',
            componentFile: 'O.ts',
            componentUid: 1,
            status: 'unmounted',
            leak: false,
            refs: {},
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true },
            file: 'O.ts',
            line: 1,
            route: '/old',
        })
        reg.register({
            id: 'useNew::2::N.ts:1::0::n1',
            name: 'useNew',
            componentFile: 'N.ts',
            componentUid: 2,
            status: 'mounted',
            leak: false,
            refs: {},
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'N.ts',
            line: 1,
            route: '/new',
        })

        reg.clearPreviousRoute('/old')

        const all = reg.getAll()
        expect(all).toHaveLength(1)
        expect(all[0].name).toBe('useNew')
    })

    it('does not remove still-mounted entries from the cleared route (layout components)', () => {
        const reg = setupComposableRegistry()

        // A layout composable that stays mounted across routes
        reg.register({
            id: 'useLayout::1::Layout.ts:1::0::la1',
            name: 'useLayout',
            componentFile: 'Layout.ts',
            componentUid: 1,
            status: 'mounted',
            leak: false,
            refs: {},
            watcherCount: 0,
            intervalCount: 0,
            lifecycle: { hasOnMounted: false, hasOnUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
            file: 'Layout.ts',
            line: 1,
            route: '/home',
        })

        reg.clearPreviousRoute('/home')

        // Still mounted — must not be removed
        expect(reg.getAll()).toHaveLength(1)
        expect(reg.getAll()[0].status).toBe('mounted')
    })
})

describe('__trackComposable — reactive() object tracking (priority 1)', () => {
    it('captures a reactive() object returned from a composable', () => {
        const { reactive } = require('vue')
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
        const { reactive, nextTick } = require('vue')
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
        const { nextTick } = require('vue')
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
        const { nextTick } = require('vue')
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
        const { nextTick } = require('vue')
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
