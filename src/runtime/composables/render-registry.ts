import { ref, type ComponentPublicInstance } from 'vue'

interface DevtoolsWindow extends Window {
    __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } }
}

export interface RenderEntry {
    uid: number
    name: string
    file: string
    renders: number
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    rect?: { x: number; y: number; width: number; height: number; top: number; left: number }
    children: number[]
    parentUid?: number
}

/**
 * Sets up a render registry for the given Nuxt app.
 * @param {{ vueApp: import('vue').App }} nuxtApp - The Nuxt app object.
 * @param {object} nuxtApp.vueApp - The Vue app instance.
 * @param {number} threshold - The minimum number of renders required for a component to be tracked.
 * @returns {object} The render registry object.
 */
export function setupRenderRegistry(nuxtApp: { vueApp: import('vue').App }, threshold: number) {
    const entries = ref<Map<number, RenderEntry>>(new Map())

    // Hook Vue's global mixin for render tracking
    nuxtApp.vueApp.mixin({
        renderTriggered(this: ComponentPublicInstance, { key, type }: { key: string; type: string }) {
            const uid: number = this.$.uid

            if (!entries.value.has(uid)) {
                entries.value.set(uid, makeEntry(uid, this))
            }

            const entry = entries.value.get(uid)!
            entry.triggers.push({ key: String(key), type, timestamp: performance.now() })

            // Keep last 50 triggers per component
            if (entry.triggers.length > 50) {
                entry.triggers.shift()
            }
        },

        updated(this: ComponentPublicInstance) {
            const uid: number = this.$.uid

            if (!entries.value.has(uid)) {
                entries.value.set(uid, makeEntry(uid, this))
            }

            const entry = entries.value.get(uid)!
            entry.renders++
            const r: DOMRect | undefined = this.$el?.getBoundingClientRect?.()
            entry.rect = r
                ? {
                      x: Math.round(r.x),
                      y: Math.round(r.y),
                      width: Math.round(r.width),
                      height: Math.round(r.height),
                      top: Math.round(r.top),
                      left: Math.round(r.left),
                  }
                : undefined
            emit('render:update', { uid, renders: entry.renders })
        },
    })

    // PerformanceObserver reads Vue's built-in render marks (requires app.config.performance = true)
    if (import.meta.client && typeof PerformanceObserver !== 'undefined') {
        const observer = new PerformanceObserver((list) => {
            for (const perf of list.getEntries()) {
                if (!perf.name.includes('vue-component-render')) {
                    continue
                }

                const uidMatch = perf.name.match(/uid:(\d+)/)

                if (!uidMatch) {
                    continue
                }

                const uid = Number(uidMatch[1])
                const entry = entries.value.get(uid)

                if (entry) {
                    entry.totalMs += perf.duration
                    entry.avgMs = Math.round((entry.totalMs / entry.renders) * 10) / 10
                }
            }
        })
        try {
            observer.observe({ entryTypes: ['measure'] })
        } catch {
            /* not supported */
        }
    }

    function getAll(): RenderEntry[] {
        return [...entries.value.values()].filter((e) => e.renders >= threshold)
    }

    function snapshot(): RenderEntry[] {
        return getAll()
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as DevtoolsWindow).__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { getAll, snapshot }
}

/**
 * Creates a new RenderEntry object from a given component instance.
 * @param {number} uid - A unique identifier for the component.
 * @param {ComponentPublicInstance} instance - The component instance.
 * @returns {RenderEntry} A new RenderEntry object.
 */
function makeEntry(uid: number, instance: ComponentPublicInstance): RenderEntry {
    return {
        uid,
        name:
            (instance.$.type as { __name?: string; __file?: string }).__name ??
            (instance.$.type as { __file?: string }).__file?.split('/').pop() ??
            `Component#${uid}`,
        file: (instance.$.type as { __file?: string }).__file ?? 'unknown',
        renders: 0,
        totalMs: 0,
        avgMs: 0,
        triggers: [],
        children: [],
        parentUid: instance.$parent?.$.uid,
    }
}
