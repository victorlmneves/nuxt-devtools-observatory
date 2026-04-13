import type { NuxtApp } from '#app'
import type { App, ComponentPublicInstance } from 'vue'
import { startSpan } from '../tracing/tracing'

const instrumentedApps = new WeakSet<App>()

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

export function setupComponentInstrumentation(nuxtApp: NuxtApp) {
    const app = nuxtApp.vueApp

    if (instrumentedApps.has(app)) {
        return
    }

    instrumentedApps.add(app)

    app.mixin({
        mounted(this: ComponentPublicInstance) {
            trackLifecycle(this, 'mounted')
        },

        updated(this: ComponentPublicInstance) {
            trackLifecycle(this, 'updated')
        },
    })
}
