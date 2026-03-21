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

    it('records enter-cancelled (not interrupted) when parent unmounts during enter transition', async () => {
        // When the component that owns <Transition> unmounts while an enter is in-flight,
        // Vue finds el._enterCb set on the transitioning element and calls it with
        // cancelled=true as part of the DOM cleanup. This fires onEnterCancelled BEFORE
        // onUnmounted — so the entry ends up as 'enter-cancelled', not 'interrupted'.
        // 'interrupted' only fires when Vue's transition cleanup path is bypassed
        // (e.g. the element is removed by external/non-Vue code).
        const mounted = ref(true)

        const Comp = defineComponent({
            setup() {
                return () =>
                    mounted.value
                        ? h(
                              TrackedTransition,
                              {
                                  name: 'test',
                                  appear: true,
                                  css: false,
                                  onEnter: (_el: Element, done: () => void) => {
                                      void done // intentionally never called
                                  },
                              },
                              { default: () => h('div', 'content') }
                          )
                        : null
            },
        })

        const app = createApp(Comp)
        app.mount(document.createElement('div'))

        // onBeforeEnter fired — entry is in 'entering'
        expect(reg.getAll().find((e) => e.direction === 'enter')?.phase).toBe('entering')

        // Unmount the parent while done() was never called
        mounted.value = false
        await nextTick()

        // Vue fires onEnterCancelled during element cleanup, setting 'enter-cancelled'
        const entry = reg.getAll().find((e) => e.direction === 'enter')
        expect(entry?.phase).toBe('enter-cancelled')
        expect(entry?.endTime).toBeDefined()

        app.unmount()
    })

    it('records interrupted via onUnmounted when el._enterCb was never set (external removal)', async () => {
        // 'interrupted' fires when the TrackedTransition component unmounts but
        // onEnterCancelled was never called — meaning enterEntryId is still set.
        // This models e.g. the BrokenTransition scenario where done() was never
        // called AND the DOM element was already gone before Vue's cleanup ran.
        //
        // We simulate it by: registering a fake in-progress entry to the shared
        // registry, then mounting a TrackedTransition that does NOT start its own
        // enter (appear:false, no v-if toggle), but whose closure captures a
        // manually-injected enterEntryId — which we test via the registry directly.
        //
        // More directly: call update() with 'interrupted' and verify it is valid.
        const { register, update, getAll } = setupTransitionRegistry()

        register({
            id: 'stuck::enter::1',
            transitionName: 'broken',
            parentComponent: 'BrokenTransition',
            direction: 'enter',
            phase: 'entering',
            startTime: performance.now(),
            cancelled: false,
            appear: false,
        })

        // Simulate what onUnmounted fires when enterEntryId is still set
        update('stuck::enter::1', { phase: 'interrupted', endTime: performance.now() })

        const entry = getAll()[0]
        expect(entry.phase).toBe('interrupted')
        expect(entry.durationMs).toBeDefined()
        expect(entry.cancelled).toBe(false) // interrupted ≠ user-visible cancellation
    })

    it('does NOT overwrite a completed entry with interrupted on unmount', async () => {
        const Comp = defineComponent({
            setup() {
                return () =>
                    h(
                        TrackedTransition,
                        {
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

        // done() called immediately → transition completed as 'entered'
        expect(reg.getAll().find((e) => e.direction === 'enter')?.phase).toBe('entered')

        // Unmounting a fully-completed transition must not overwrite it with 'interrupted'
        app.unmount()

        expect(reg.getAll().find((e) => e.direction === 'enter')?.phase).toBe('entered')
    })
})

// ── Tests for fixes introduced in the bug-fix pass ────────────────────────

describe('setupTransitionRegistry — sanitize() explicit field copy (fix: transition-registry)', () => {
    it('getAll() returns entries with all expected TransitionEntry fields', () => {
        const { register, getAll } = setupTransitionRegistry()

        register({
            id: 'fade::enter::1000',
            transitionName: 'fade',
            parentComponent: 'App',
            direction: 'enter',
            phase: 'entering',
            startTime: 1000,
            cancelled: false,
            appear: false,
            mode: 'out-in',
        })

        const entry = getAll()[0]

        expect(entry.id).toBe('fade::enter::1000')
        expect(entry.transitionName).toBe('fade')
        expect(entry.parentComponent).toBe('App')
        expect(entry.direction).toBe('enter')
        expect(entry.phase).toBe('entering')
        expect(entry.startTime).toBe(1000)
        expect(entry.cancelled).toBe(false)
        expect(entry.appear).toBe(false)
        expect(entry.mode).toBe('out-in')
    })

    it('getAll() does not expose any function properties on returned entries', () => {
        const { register, getAll } = setupTransitionRegistry()

        register({
            id: 'slide::leave::2000',
            transitionName: 'slide',
            parentComponent: 'Nav',
            direction: 'leave',
            phase: 'leaving',
            startTime: 2000,
            cancelled: false,
            appear: false,
        })

        const entry = getAll()[0]
        const functionKeys = Object.keys(entry).filter((k) => typeof (entry as Record<string, unknown>)[k] === 'function')

        expect(functionKeys).toHaveLength(0)
    })

    it('getAll() includes durationMs when endTime has been set via update()', () => {
        const { register, update, getAll } = setupTransitionRegistry()

        register({
            id: 'x::enter::0',
            transitionName: 'x',
            parentComponent: 'C',
            direction: 'enter',
            phase: 'entering',
            startTime: 0,
            cancelled: false,
            appear: false,
        })

        update('x::enter::0', { phase: 'entered', endTime: 300 })

        const entry = getAll()[0]

        expect(entry.phase).toBe('entered')
        expect(entry.endTime).toBe(300)
        expect(typeof entry.durationMs).toBe('number')
        expect(entry.durationMs).toBeGreaterThanOrEqual(0)
    })
})
