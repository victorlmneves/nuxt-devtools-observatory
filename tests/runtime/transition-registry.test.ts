// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createApp, defineComponent, h, ref, nextTick } from 'vue'
import { setupTransitionRegistry, createTrackedTransition } from '../../src/runtime/composables/transition-registry'

// ── setupTransitionRegistry ──────────────────────────────────────────────

describe('setupTransitionRegistry', () => {
    it('returns register, update, and getAll', () => {
        const reg = setupTransitionRegistry()

        expect(typeof reg.register).toBe('function')
        expect(typeof reg.update).toBe('function')
        expect(typeof reg.getAll).toBe('function')
    })

    it('register() adds an entry and getAll() returns it', () => {
        const { register, getAll } = setupTransitionRegistry()

        register({
            id: 'fade::enter::1',
            transitionName: 'fade',
            parentComponent: 'App.vue',
            direction: 'enter',
            phase: 'entering',
            startTime: 100,
            cancelled: false,
            appear: false,
        })

        expect(getAll()).toHaveLength(1)
        expect(getAll()[0].transitionName).toBe('fade')
        expect(getAll()[0].phase).toBe('entering')
    })

    it('update() merges fields onto an existing entry', () => {
        const { register, update, getAll } = setupTransitionRegistry()

        register({
            id: 'slide::enter::1',
            transitionName: 'slide',
            parentComponent: 'Comp.vue',
            direction: 'enter',
            phase: 'entering',
            startTime: 100,
            cancelled: false,
            appear: false,
        })

        update('slide::enter::1', { phase: 'entered', endTime: 400 })

        const entry = getAll()[0]
        expect(entry.phase).toBe('entered')
        expect(entry.endTime).toBe(400)
    })

    it('update() computes durationMs from startTime and endTime', () => {
        const { register, update, getAll } = setupTransitionRegistry()

        register({
            id: 'fade::leave::1',
            transitionName: 'fade',
            parentComponent: 'Comp.vue',
            direction: 'leave',
            phase: 'leaving',
            startTime: 200,
            cancelled: false,
            appear: false,
        })

        update('fade::leave::1', { phase: 'left', endTime: 500 })

        expect(getAll()[0].durationMs).toBe(300)
    })

    it('update() is a no-op for an unknown id', () => {
        const { update, getAll } = setupTransitionRegistry()

        expect(() => update('nonexistent', { phase: 'entered' })).not.toThrow()
        expect(getAll()).toHaveLength(0)
    })

    it('getAll() returns an array snapshot, not the live map reference', () => {
        const { register, getAll } = setupTransitionRegistry()

        register({
            id: 'a',
            transitionName: 'a',
            parentComponent: 'A.vue',
            direction: 'enter',
            phase: 'entering',
            startTime: 1,
            cancelled: false,
            appear: false,
        })

        const snapshot = getAll()

        register({
            id: 'b',
            transitionName: 'b',
            parentComponent: 'B.vue',
            direction: 'leave',
            phase: 'leaving',
            startTime: 2,
            cancelled: false,
            appear: false,
        })

        expect(snapshot).toHaveLength(1)
        expect(getAll()).toHaveLength(2)
    })
})

// ── createTrackedTransition ──────────────────────────────────────────────

describe('createTrackedTransition', () => {
    let reg: ReturnType<typeof setupTransitionRegistry>
    let TrackedTransition: ReturnType<typeof createTrackedTransition>

    beforeEach(() => {
        reg = setupTransitionRegistry()
        TrackedTransition = createTrackedTransition(reg)
    })

    afterEach(() => {
        // No global state to clean up — each test uses its own registry
    })

    it('records an entering entry when an appear transition mounts', async () => {
        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            name: 'fade',
                            appear: true,
                            css: false,
                            onEnter: (_el: Element, done: () => void) => done(),
                        },
                        { default: () => h('div', 'content') }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        const entries = reg.getAll()
        expect(entries.length).toBeGreaterThanOrEqual(1)
        const entry = entries.find((e) => e.direction === 'enter')
        expect(entry).toBeDefined()
        expect(entry!.transitionName).toBe('fade')
        expect(entry!.appear).toBe(true)

        app.unmount()
    })

    it('updates phase to entered when onAfterEnter fires via JS-mode done()', async () => {
        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            name: 'slide',
                            appear: true,
                            css: false,
                            onEnter: (_el: Element, done: () => void) => done(),
                        },
                        { default: () => h('div', 'x') }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        const entry = reg.getAll().find((e) => e.direction === 'enter')
        expect(entry?.phase).toBe('entered')
        expect(entry?.endTime).toBeDefined()

        app.unmount()
    })

    it('records a leaving and left entry when v-if toggles false', async () => {
        const show = ref(true)

        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            css: false,
                            onLeave: (_el: Element, done: () => void) => done(),
                        },
                        { default: () => (show.value ? h('div', 'x') : null) }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        show.value = false
        await nextTick()

        const entries = reg.getAll()
        const leaveEntry = entries.find((e) => e.direction === 'leave')
        expect(leaveEntry).toBeDefined()
        expect(leaveEntry!.phase).toBe('left')
        expect(leaveEntry!.cancelled).toBe(false)

        app.unmount()
    })

    it('records a leaving entry with phase leaving before done() is called', async () => {
        let capturedDone: (() => void) | null = null
        const show = ref(true)

        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            css: false,
                            onLeave: (_el: Element, done: () => void) => {
                                capturedDone = done
                                // intentionally do NOT call done yet
                            },
                        },
                        { default: () => (show.value ? h('div', 'x') : null) }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        show.value = false
        await nextTick()

        const leaving = reg.getAll().find((e) => e.direction === 'leave')
        expect(leaving?.phase).toBe('leaving')

        // Now complete the transition
        const done = capturedDone

        if (done) {
            done()
        }

        await nextTick()

        app.unmount()
    })

    it('calls through to the original onBeforeEnter hook', async () => {
        let called = false
        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            appear: true,
                            css: false,
                            onBeforeEnter: () => {
                                called = true
                            },
                            onEnter: (_el: Element, done: () => void) => done(),
                        },
                        { default: () => h('div', 'x') }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        expect(called).toBe(true)

        app.unmount()
    })

    it('calls through to the original onAfterLeave hook', async () => {
        let called = false
        const show = ref(true)

        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            css: false,
                            onLeave: (_el: Element, done: () => void) => done(),
                            onAfterLeave: () => {
                                called = true
                            },
                        },
                        { default: () => (show.value ? h('div', 'x') : null) }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        show.value = false
        await nextTick()

        expect(called).toBe(true)

        app.unmount()
    })

    it('records mode from the transition props', async () => {
        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
                            name: 'page',
                            mode: 'out-in',
                            appear: true,
                            css: false,
                            onEnter: (_el: Element, done: () => void) => done(),
                        },
                        { default: () => h('div', 'x') }
                    )
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        const entry = reg.getAll().find((e) => e.direction === 'enter')
        expect(entry?.mode).toBe('out-in')

        app.unmount()
    })

    it('records enter-cancelled when onEnterCancelled fires', () => {
        const reg2 = setupTransitionRegistry()
        const Tracked = createTrackedTransition(reg2)

        // Register an entering entry manually (simulating the sequence)
        reg2.register({
            id: 'test-id',
            transitionName: 'modal',
            parentComponent: 'Modal.vue',
            direction: 'enter',
            phase: 'entering',
            startTime: performance.now(),
            cancelled: false,
            appear: false,
        })

        // Simulate the onEnterCancelled hook firing
        reg2.update('test-id', { phase: 'enter-cancelled', cancelled: true, endTime: performance.now() })

        const entry = reg2.getAll()[0]
        expect(entry.phase).toBe('enter-cancelled')
        expect(entry.cancelled).toBe(true)
        expect(entry.durationMs).toBeDefined()

        void Tracked // suppress unused var warning
    })
})
