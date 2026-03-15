import { ref } from 'vue'
import type { NuxtApp } from '#app'

export interface RenderEntry {
    uid: number
    name: string
    file: string
    renders: number
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    rect?: DOMRect
    children: number[]
    parentUid?: number
}

export function setupRenderRegistry(nuxtApp: NuxtApp, _threshold: number) {
    const entries = ref<Map<number, RenderEntry>>(new Map())

    // Hook Vue's global mixin for render tracking
    nuxtApp.vueApp.mixin({
        renderTriggered(this: any, { key, type }: { key: string; type: string }) {
            const uid: number = this.$.uid
            if (!entries.value.has(uid)) {
                entries.value.set(uid, makeEntry(uid, this))
            }
            const entry = entries.value.get(uid)!
            entry.triggers.push({ key: String(key), type, timestamp: performance.now() })
            // Keep last 50 triggers per component
            if (entry.triggers.length > 50) entry.triggers.shift()
        },

        updated(this: any) {
            const uid: number = this.$.uid
            if (!entries.value.has(uid)) {
                entries.value.set(uid, makeEntry(uid, this))
            }
            const entry = entries.value.get(uid)!
            entry.renders++
            entry.rect = this.$el?.getBoundingClientRect?.() ?? undefined
            emit('render:update', { uid, renders: entry.renders })
        },
    })

    // PerformanceObserver reads Vue's built-in render marks (requires app.config.performance = true)
    if (import.meta.client && typeof PerformanceObserver !== 'undefined') {
        const observer = new PerformanceObserver((list) => {
            for (const perf of list.getEntries()) {
                if (!perf.name.includes('vue-component-render')) continue
                const uidMatch = perf.name.match(/uid:(\d+)/)
                if (!uidMatch) continue
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
        return [...entries.value.values()].map((e) => ({
            ...e,
            rect: e.rect
                ? {
                      x: Math.round(e.rect.x),
                      y: Math.round(e.rect.y),
                      width: Math.round(e.rect.width),
                      height: Math.round(e.rect.height),
                      top: Math.round(e.rect.top),
                      left: Math.round(e.rect.left),
                  }
                : undefined,
        }))
    }

    function snapshot(): RenderEntry[] {
        return getAll()
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) return
        const channel = (window as any).__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { getAll, snapshot }
}

function makeEntry(uid: number, instance: any): RenderEntry {
    return {
        uid,
        name: instance.type?.__name ?? instance.type?.__file?.split('/').pop() ?? `Component#${uid}`,
        file: instance.type?.__file ?? 'unknown',
        renders: 0,
        totalMs: 0,
        avgMs: 0,
        triggers: [],
        children: [],
        parentUid: instance.parent?.uid,
    }
}
