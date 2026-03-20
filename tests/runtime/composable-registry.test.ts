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
