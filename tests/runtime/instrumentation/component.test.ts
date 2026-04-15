// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupComponentInstrumentation } from '@observatory/runtime/instrumentation/component'
import { traceStore } from '@observatory/runtime/tracing/traceStore'
import type { NuxtApp } from '#app'
import type { ComponentPublicInstance } from 'vue'

const TRACE_CONTEXT_KEY = '__observatory_trace_context__'

// Build a minimal fake ComponentPublicInstance sufficient for the instrumentation hooks.
function fakeInstance(
    opts: {
        __name?: string
        name?: string
        __file?: string
        uid?: number
    } = {}
): ComponentPublicInstance {
    return {
        $: {
            type: {
                __name: opts.__name,
                name: opts.name,
                __file: opts.__file,
            },
            uid: opts.uid ?? 1,
        },
    } as unknown as ComponentPublicInstance
}

// Build a minimal NuxtApp stub and capture the installed mixin.
function makeMockApp() {
    let installedMixin: Record<string, (this: ComponentPublicInstance) => void> = {}
    const vueApp = {
        // Each invocation captures the mixin so tests can call hooks manually.
        mixin: vi.fn((m: Record<string, (this: ComponentPublicInstance) => void>) => {
            installedMixin = m
        }),
    }
    const nuxtApp = { vueApp } as unknown as NuxtApp

    return { nuxtApp, vueApp, getMixin: () => installedMixin }
}

function getSpans() {
    return traceStore.getAllTraces().flatMap((t) => t.spans)
}

beforeEach(() => {
    traceStore.clear()
    delete (globalThis as Record<string, unknown>)[TRACE_CONTEXT_KEY]
})

describe('setupComponentInstrumentation', () => {
    describe('mixin installation guard', () => {
        it('installs the mixin exactly once for the same app instance', () => {
            const { nuxtApp, vueApp } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            setupComponentInstrumentation(nuxtApp)

            expect(vueApp.mixin).toHaveBeenCalledTimes(1)
        })

        it('installs the mixin independently for different app instances', () => {
            const { nuxtApp: app1, vueApp: vueApp1 } = makeMockApp()
            const { nuxtApp: app2, vueApp: vueApp2 } = makeMockApp()
            setupComponentInstrumentation(app1)
            setupComponentInstrumentation(app2)

            expect(vueApp1.mixin).toHaveBeenCalledTimes(1)
            expect(vueApp2.mixin).toHaveBeenCalledTimes(1)
        })
    })

    describe('getComponentName resolution (tested via span metadata)', () => {
        it('uses __name when available', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'NamedComp', __file: '/src/NamedComp.vue' })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            const span = getSpans().find((s) => s.name === 'component:render')

            expect(span?.metadata?.componentName).toBe('NamedComp')
        })

        it('falls back to name when __name is absent', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ name: 'FallbackComp', __file: '/src/Fallback.vue' })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            const span = getSpans().find((s) => s.name === 'component:render')

            expect(span?.metadata?.componentName).toBe('FallbackComp')
        })

        it('derives name from __file stem when neither __name nor name are set', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __file: '/src/components/MyWidget.vue' })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            const span = getSpans().find((s) => s.name === 'component:render')

            expect(span?.metadata?.componentName).toBe('MyWidget')
        })

        it('uses empty string as name when __file ends with a path separator', () => {
            // getComponentName returns '' when the __file stem is empty (e.g. '/src/').
            // The AnonymousComponent fallback is only reachable when __file is falsy,
            // which is mutually exclusive with shouldTrack returning true — so it
            // cannot be exercised via span metadata.
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __file: '/src/' })
            ;(instance.$.type as Record<string, unknown>).__name = undefined
            ;(instance.$.type as Record<string, unknown>).name = undefined
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            const span = getSpans().find((s) => s.name === 'component:render')

            expect(span?.metadata?.componentName).toBe('')
        })
    })

    describe('shouldTrack filtering', () => {
        it('does not emit spans for components without a __file', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'Headless' }) // no __file
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            expect(getSpans()).toHaveLength(0)
        })

        it('does not emit spans for node_modules components', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __file: '/node_modules/some-lib/Button.vue' })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            expect(getSpans()).toHaveLength(0)
        })

        it('emits spans for project components with a valid __file', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'MyComp', __file: '/src/MyComp.vue' })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            expect(getSpans().length).toBeGreaterThan(0)
        })
    })

    describe('mount lifecycle hooks', () => {
        it('emits a component:render span on mount', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'App', __file: '/src/App.vue', uid: 5 })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            const renderSpan = getSpans().find((s) => s.name === 'component:render')

            expect(renderSpan).toBeDefined()
            expect(renderSpan?.metadata?.lifecycle).toBe('render:mount')
            expect(renderSpan?.metadata?.uid).toBe(5)
            expect(renderSpan?.status).toBe('ok')
        })

        it('emits a component:mounted span on mount', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'App', __file: '/src/App.vue' })
            const mixin = getMixin()

            mixin.beforeMount?.call(instance)
            mixin.mounted?.call(instance)

            const lifecycleSpan = getSpans().find((s) => s.name === 'component:mounted')

            expect(lifecycleSpan).toBeDefined()
            expect(lifecycleSpan?.metadata?.lifecycle).toBe('mounted')
            expect(lifecycleSpan?.status).toBe('ok')
        })

        it('does not emit a render span when mounted is called without a prior beforeMount', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'Late', __file: '/src/Late.vue' })
            const mixin = getMixin()

            // skip beforeMount → no renderStartTime
            mixin.mounted?.call(instance)

            const renderSpan = getSpans().find((s) => s.name === 'component:render')

            expect(renderSpan).toBeUndefined()
        })
    })

    describe('update lifecycle hooks', () => {
        it('emits component:render with render:update lifecycle on update', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'Counter', __file: '/src/Counter.vue' })
            const mixin = getMixin()

            mixin.beforeUpdate?.call(instance)
            mixin.updated?.call(instance)

            const renderSpan = getSpans().find((s) => s.metadata?.lifecycle === 'render:update')

            expect(renderSpan).toBeDefined()
            expect(renderSpan?.status).toBe('ok')
        })

        it('emits component:updated span on update', () => {
            const { nuxtApp, getMixin } = makeMockApp()
            setupComponentInstrumentation(nuxtApp)
            const instance = fakeInstance({ __name: 'Counter', __file: '/src/Counter.vue' })
            const mixin = getMixin()

            mixin.beforeUpdate?.call(instance)
            mixin.updated?.call(instance)

            const lifecycleSpan = getSpans().find((s) => s.name === 'component:updated')

            expect(lifecycleSpan).toBeDefined()
            expect(lifecycleSpan?.metadata?.lifecycle).toBe('updated')
        })
    })
})
