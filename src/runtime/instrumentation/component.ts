import type { NuxtApp } from '#app'
import type { App, ComponentPublicInstance } from 'vue'
import { startSpan } from '../tracing/tracing'

const instrumentedApps = new WeakSet<App>()

// Stores the performance.now() timestamp recorded in beforeMount/beforeUpdate
// so the corresponding mounted/updated hook can compute the real render duration.
const renderStartTimes = new WeakMap<ComponentPublicInstance, number>()

function getComponentFile(instance: ComponentPublicInstance) {
    return (instance.$.type as { __file?: string }).__file
}

function getComponentName(instance: ComponentPublicInstance) {
    const type = instance.$.type as { __name?: string; name?: string; __file?: string }

    if (type.__name && type.__name.length > 0) {
        return type.__name
    }

    if (type.name && type.name.length > 0) {
        return type.name
    }

    if (type.__file) {
        const fileName = type.__file.split('/').pop() ?? type.__file

        return fileName.replace(/\.[^.]+$/, '')
    }

    return 'AnonymousComponent'
}

function shouldTrack(instance: ComponentPublicInstance) {
    const file = getComponentFile(instance)

    if (!file) {
        return false
    }

    return !file.includes('node_modules')
}

function trackLifecycle(instance: ComponentPublicInstance, lifecycle: 'mounted' | 'updated') {
    if (!shouldTrack(instance)) {
        return
    }

    const componentName = getComponentName(instance)
    const file = getComponentFile(instance)
    const uid = instance.$.uid
    const route = typeof window !== 'undefined' ? window.location.pathname : '/'

    const span = startSpan({
        name: `component:${lifecycle}`,
        type: 'component',
        metadata: {
            lifecycle,
            componentName,
            uid,
            file,
            route,
            status: 'ok',
        },
    })

    span.end({
        status: 'ok',
        metadata: {
            lifecycle,
            componentName,
            uid,
            file,
            route,
            status: 'ok',
        },
    })
}

function trackRender(instance: ComponentPublicInstance, phase: 'mount' | 'update', startTime: number, endTime: number) {
    if (!shouldTrack(instance)) {
        return
    }

    const componentName = getComponentName(instance)
    const file = getComponentFile(instance)
    const uid = instance.$.uid
    const route = typeof window !== 'undefined' ? window.location.pathname : '/'

    const span = startSpan({
        name: 'component:render',
        type: 'render',
        startTime,
        metadata: {
            lifecycle: `render:${phase}`,
            componentName,
            uid,
            file,
            route,
        },
    })

    span.end({
        endTime,
        status: 'ok',
        metadata: {
            lifecycle: `render:${phase}`,
            componentName,
            uid,
            file,
            route,
        },
    })
}

export function setupComponentInstrumentation(nuxtApp: NuxtApp) {
    const app = nuxtApp.vueApp

    if (instrumentedApps.has(app)) {
        return
    }

    instrumentedApps.add(app)

    app.mixin({
        beforeMount(this: ComponentPublicInstance) {
            if (shouldTrack(this)) {
                renderStartTimes.set(this, performance.now())
            }
        },

        mounted(this: ComponentPublicInstance) {
            const startTime = renderStartTimes.get(this)
            renderStartTimes.delete(this)

            if (startTime !== undefined) {
                trackRender(this, 'mount', startTime, performance.now())
            }

            trackLifecycle(this, 'mounted')
        },

        beforeUpdate(this: ComponentPublicInstance) {
            if (shouldTrack(this)) {
                renderStartTimes.set(this, performance.now())
            }
        },

        updated(this: ComponentPublicInstance) {
            const startTime = renderStartTimes.get(this)
            renderStartTimes.delete(this)

            if (startTime !== undefined) {
                trackRender(this, 'update', startTime, performance.now())
            }

            trackLifecycle(this, 'updated')
        },
    })
}
