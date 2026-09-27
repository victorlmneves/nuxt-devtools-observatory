// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupKeepAliveRegistry } from '@observatory/runtime/composables/keep-alive-registry'

type TObservatoryWindow = Window & { __observatory__?: { keepAlive?: ReturnType<typeof setupKeepAliveRegistry> } }

function getWindow() {
    return window as TObservatoryWindow
}

beforeEach(() => {
    delete getWindow().__observatory__
})

afterEach(() => {
    delete getWindow().__observatory__
})

describe('setupKeepAliveRegistry', () => {
    it('records KeepAlive activate/deactivate and exposes cache hits', () => {
        const registry = setupKeepAliveRegistry()

        registry.record({
            kind: 'keep-alive',
            phase: 'activated',
            name: 'PaneA',
            parentComponent: 'Demo',
            startTime: 10,
            fromCache: false,
            cacheMax: 2,
        })
        registry.record({
            kind: 'keep-alive',
            phase: 'deactivated',
            name: 'PaneA',
            parentComponent: 'Demo',
            startTime: 20,
            cacheMax: 2,
        })
        registry.record({
            kind: 'keep-alive',
            phase: 'activated',
            name: 'PaneA',
            parentComponent: 'Demo',
            startTime: 40,
            fromCache: true,
            cacheMax: 2,
        })

        const snapshot = registry.getSnapshot()

        expect(snapshot.events).toHaveLength(3)
        expect(snapshot.cache).toHaveLength(1)
        expect(snapshot.cache[0]).toMatchObject({ name: 'PaneA', status: 'active', hits: 2 })
        expect(snapshot.events[2].durationMs).toBe(20)
    })

    it('evicts the oldest cached pane when cacheMax is exceeded', () => {
        const registry = setupKeepAliveRegistry()

        for (const [name, at] of [
            ['PaneA', 1],
            ['PaneB', 2],
            ['PaneC', 3],
        ] as const) {
            registry.record({
                kind: 'keep-alive',
                phase: 'activated',
                name,
                parentComponent: 'Demo',
                startTime: at,
                cacheMax: 2,
            })
            registry.record({
                kind: 'keep-alive',
                phase: 'deactivated',
                name,
                parentComponent: 'Demo',
                startTime: at + 0.5,
                cacheMax: 2,
            })
        }

        const cache = Object.fromEntries(registry.getSnapshot().cache.map((entry) => [entry.name, entry.status]))

        expect(cache.PaneA).toBe('evicted')
        expect(cache.PaneB).toBe('cached')
        expect(cache.PaneC).toBe('cached')
    })

    it('tracks Suspense pending → fallback → resolved timing', () => {
        const registry = setupKeepAliveRegistry()

        registry.record({
            id: 'suspense-1',
            kind: 'suspense',
            phase: 'pending',
            name: 'Demo',
            parentComponent: 'Demo',
            startTime: 100,
            timeoutMs: 80,
        })
        registry.record({
            id: 'suspense-1',
            kind: 'suspense',
            phase: 'fallback',
            name: 'Demo',
            parentComponent: 'Demo',
            startTime: 100,
            fallbackMs: 80,
            timeoutMs: 80,
        })
        registry.record({
            id: 'suspense-1',
            kind: 'suspense',
            phase: 'resolved',
            name: 'Demo',
            parentComponent: 'Demo',
            startTime: 100,
            endTime: 700,
            fallbackMs: 80,
            timeoutMs: 80,
        })

        const snapshot = registry.getSnapshot()

        expect(snapshot.events).toHaveLength(1)
        expect(snapshot.events[0]).toMatchObject({
            phase: 'resolved',
            durationMs: 600,
            fallbackMs: 80,
        })
        expect(snapshot.cache).toHaveLength(0)
    })

    it('evicts the oldest events when over cap', () => {
        const registry = setupKeepAliveRegistry({ maxEntries: 2 })

        registry.record({ kind: 'keep-alive', phase: 'activated', name: 'A', parentComponent: 'Demo', startTime: 1 })
        registry.record({ kind: 'keep-alive', phase: 'activated', name: 'B', parentComponent: 'Demo', startTime: 2 })
        registry.record({ kind: 'keep-alive', phase: 'activated', name: 'C', parentComponent: 'Demo', startTime: 3 })

        expect(registry.getSnapshot().events.map((entry) => entry.name)).toEqual(['B', 'C'])
    })

    it('notifies listeners and clears snapshot state', () => {
        const registry = setupKeepAliveRegistry()
        let calls = 0
        const stop = registry.onChange(() => {
            calls += 1
        })

        registry.record({ kind: 'keep-alive', phase: 'activated', name: 'A', parentComponent: 'Demo', startTime: 1 })
        expect(calls).toBe(1)

        registry.clear()
        expect(calls).toBe(2)
        expect(registry.getSnapshot()).toEqual({ events: [], cache: [] })

        stop()
        registry.record({ kind: 'keep-alive', phase: 'activated', name: 'B', parentComponent: 'Demo', startTime: 2 })
        expect(calls).toBe(2)
    })
})
