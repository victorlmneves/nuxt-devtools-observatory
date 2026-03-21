import { ref, type ComponentPublicInstance } from 'vue'

interface DevtoolsWindow extends Window {
    __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } }
}

export interface RenderEntry {
    uid: number
    name: string
    file: string
    element?: string
    renders: number
    navigationRenders: number
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    rect?: { x: number; y: number; width: number; height: number; top: number; left: number }
    parentUid?: number
}

/**
 * Sets up a render registry for the given Nuxt app.
 * @param {{ vueApp: import('vue').App }} nuxtApp - The Nuxt app object.
 * @param {object} nuxtApp.vueApp - The Vue app instance.
 * @returns {object} The render registry object.
 */
export function setupRenderRegistry(nuxtApp: { vueApp: import('vue').App }) {
    const entries = ref<Map<number, RenderEntry>>(new Map())
    const pendingTriggeredRenders = new Set<number>()
    const renderStartTimes = new Map<number, number>()
    let navigationWindowUntil = 0

    function ensureEntry(instance: ComponentPublicInstance) {
        const uid: number = instance.$.uid

        if (!entries.value.has(uid)) {
            entries.value.set(uid, makeEntry(uid, instance))
        }

        return entries.value.get(uid)!
    }

    function syncRect(entry: RenderEntry, instance: ComponentPublicInstance) {
        const rect: DOMRect | undefined = instance.$el?.getBoundingClientRect?.()
        entry.rect = rect
            ? {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  top: Math.round(rect.top),
                  left: Math.round(rect.left),
              }
            : undefined
    }

    function removeEntry(instance: ComponentPublicInstance) {
        const uid = instance.$.uid
        entries.value.delete(uid)
    }

    function isNavigationRender() {
        return typeof performance !== 'undefined' && performance.now() <= navigationWindowUntil
    }

    function startRenderTimer(uid: number) {
        if (typeof performance === 'undefined') {
            return
        }

        renderStartTimes.set(uid, performance.now())
    }

    function recordRenderDuration(entry: RenderEntry) {
        if (typeof performance === 'undefined') {
            return
        }

        const startedAt = renderStartTimes.get(entry.uid)

        if (startedAt === undefined) {
            return
        }

        renderStartTimes.delete(entry.uid)
        entry.totalMs += Math.max(performance.now() - startedAt, 0)
        entry.avgMs = Math.round((entry.totalMs / Math.max(entry.renders, 1)) * 10) / 10
    }

    function markNavigation() {
        if (typeof performance === 'undefined') {
            return
        }

        navigationWindowUntil = performance.now() + 800
    }

    function reset() {
        pendingTriggeredRenders.clear()
        renderStartTimes.clear()

        for (const entry of entries.value.values()) {
            entry.renders = 0
            entry.navigationRenders = 0
            entry.totalMs = 0
            entry.avgMs = 0
            entry.triggers = []
        }
    }

    // Hook Vue's global mixin for render tracking
    nuxtApp.vueApp.mixin({
        beforeMount(this: ComponentPublicInstance) {
            startRenderTimer(this.$.uid)
        },

        mounted(this: ComponentPublicInstance) {
            const entry = ensureEntry(this)
            entry.renders++

            if (isNavigationRender()) {
                entry.navigationRenders++
            }

            syncRect(entry, this)
            recordRenderDuration(entry)
            emit('render:update', { uid: entry.uid, renders: entry.renders })
        },

        beforeUpdate(this: ComponentPublicInstance) {
            startRenderTimer(this.$.uid)
        },

        renderTriggered(this: ComponentPublicInstance, { key, type }: { key: string; type: string }) {
            const entry = ensureEntry(this)
            entry.triggers.push({ key: String(key), type, timestamp: performance.now() })
            pendingTriggeredRenders.add(entry.uid)

            // Keep last 50 triggers per component
            if (entry.triggers.length > 50) {
                entry.triggers.shift()
            }
        },

        updated(this: ComponentPublicInstance) {
            const entry = ensureEntry(this)

            // Only count updates Vue explicitly marked as reactive render triggers.
            if (!pendingTriggeredRenders.has(entry.uid)) {
                return
            }

            pendingTriggeredRenders.delete(entry.uid)
            entry.renders++

            if (isNavigationRender()) {
                entry.navigationRenders++
            }

            syncRect(entry, this)
            recordRenderDuration(entry)
            emit('render:update', { uid: entry.uid, renders: entry.renders })
        },

        unmounted(this: ComponentPublicInstance) {
            pendingTriggeredRenders.delete(this.$.uid)
            renderStartTimes.delete(this.$.uid)
            removeEntry(this)
            emit('render:remove', { uid: this.$.uid })
        },
    })

    function sanitize(entry: RenderEntry): RenderEntry {
        return {
            uid: entry.uid,
            name: entry.name,
            file: entry.file,
            element: entry.element,
            renders: entry.renders,
            navigationRenders: entry.navigationRenders,
            totalMs: entry.totalMs,
            avgMs: entry.avgMs,
            triggers: entry.triggers,
            rect: entry.rect
                ? {
                      x: entry.rect.x,
                      y: entry.rect.y,
                      width: entry.rect.width,
                      height: entry.rect.height,
                      top: entry.rect.top,
                      left: entry.rect.left,
                  }
                : undefined,
            parentUid: entry.parentUid,
        }
    }
    function getAll(): RenderEntry[] {
        return [...entries.value.values()].map(sanitize)
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

    return { getAll, snapshot, markNavigation, reset }
}

/**
 * Creates a new RenderEntry object from a given component instance.
 * @param {number} uid - A unique identifier for the component.
 * @param {ComponentPublicInstance} instance - The component instance.
 * @returns {RenderEntry} A new RenderEntry object.
 */
function makeEntry(uid: number, instance: ComponentPublicInstance): RenderEntry {
    const type = instance.$.type as { __name?: string; __file?: string; name?: string }
    const parentType = instance.$parent?.$?.type as { __name?: string; __file?: string; name?: string } | undefined
    const element = describeElement(instance.$el)
    const ownLabel = resolveTypeLabel(type)
    const parentLabel = resolveTypeLabel(parentType)
    const file = type.__file ?? 'unknown'

    return {
        uid,
        name: ownLabel ?? inferAnonymousLabel(parentLabel, element) ?? `Component#${uid}`,
        file,
        element,
        renders: 0,
        navigationRenders: 0,
        totalMs: 0,
        avgMs: 0,
        triggers: [],
        parentUid: instance.$parent?.$.uid,
    }
}

function describeElement(el: unknown): string | undefined {
    if (!el || typeof el !== 'object') {
        return undefined
    }

    const element = el as { tagName?: string; id?: string; className?: string | { baseVal?: string } }
    const tag = element.tagName?.toLowerCase()

    if (!tag) {
        return undefined
    }

    const id = typeof element.id === 'string' && element.id ? `#${element.id}` : ''
    const rawClassName = typeof element.className === 'string' ? element.className : element.className?.baseVal
    const firstClass = rawClassName?.trim().split(/\s+/).find(Boolean)
    const classSuffix = firstClass ? `.${firstClass}` : ''

    return `${tag}${id}${classSuffix}`
}

function resolveTypeLabel(type: { __name?: string; __file?: string; name?: string } | undefined): string | undefined {
    if (!type) {
        return undefined
    }

    return (
        type.__name ??
        type.name ??
        type.__file
            ?.split('/')
            .pop()
            ?.replace(/\.vue$/i, '')
    )
}

function inferAnonymousLabel(parentLabel: string | undefined, element: string | undefined): string | undefined {
    if (parentLabel && element) {
        return `${parentLabel} ${element}`
    }

    if (parentLabel) {
        return `${parentLabel} child`
    }

    return element
}
