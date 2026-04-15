import type { ComponentPublicInstance } from 'vue'
import { useRuntimeConfig } from '#app'
import type { Span } from '../tracing/trace'
import { traceStore } from '../tracing/traceStore'

interface DevtoolsWindow extends Window {
    __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } }
}

export interface RenderEvent {
    /** 'mount' for initial mount, 'update' for reactive re-renders */
    kind: 'mount' | 'update'
    /** performance.now() timestamp */
    t: number
    /** Duration in ms */
    durationMs: number
    /** Reactive dep key that triggered this update, if known */
    triggerKey?: string
    /** Route path this render happened on */
    route: string
}

export interface RenderEntry {
    uid: number
    name: string
    file: string
    element?: string
    /** Total times this instance mounted (usually 1, >1 means it was unmounted+remounted) */
    mountCount: number
    /** Re-renders triggered by reactive state changes (excludes initial mount) */
    rerenders: number
    /** Subset of rerenders that happened within 800ms of a navigation */
    totalMs: number
    avgMs: number
    triggers: Array<{ key: string; type: string; timestamp: number }>
    /** Per-render timeline, capped at MAX_TIMELINE events (newest last) */
    timeline: RenderEvent[]
    rect?: { x: number; y: number; width: number; height: number; top: number; left: number }
    parentUid?: number
    /** True if this component survived at least one reset() — indicates a layout/persistent component */
    isPersistent: boolean
    /** True if the first mount of this component happened during SSR hydration */
    isHydrationMount: boolean
    /** Route path this component was first seen on */
    route: string
}

/**
 * Sets up a render registry for tracking render-related metrics (e.g. rerenders, render time, etc.)
 * The registry is exposed over the WebSocket channel, and can be accessed from the browser's devtools.
 * @param {object} nuxtApp - The Nuxt app instance.
 * @param {import('vue').App} nuxtApp.vueApp - The Vue app instance used to register lifecycle hooks.
 * @param {object} [options] - Optional configuration object.
 * @param {function(): boolean} [options.isHydrating] - Function to determine if the current render is during SSR hydration.
 * @returns {object} An object containing the render registry's API methods: `getAll()`, `getSnapshot()`, `snapshot()`, `reset()`, and `setRoute()`.
 */
export function setupRenderRegistry(nuxtApp: { vueApp: import('vue').App }, options: { isHydrating?: () => boolean } = {}) {
    const entries = new Map<number, RenderEntry>()
    let currentRoute = '/'
    const config = useRuntimeConfig().public.observatory as { heatmapHideInternals?: boolean; maxRenderTimeline?: number }
    const MAX_TIMELINE = config.maxRenderTimeline ?? 100
    const HIDE_INTERNALS = config.heatmapHideInternals ?? false
    let dirty = true
    let cachedSnapshot = '[]'
    let resetTimestamp = 0
    const liveElements = new Map<number, Element | undefined>()

    function markDirty() {
        dirty = true
    }

    function setRoute(path: string) {
        currentRoute = path
    }

    function isInternalInstance(instance: ComponentPublicInstance): boolean {
        const file = (instance.$.type as { __file?: string }).__file

        return !file || file.includes('node_modules')
    }

    function nearestTrackedAncestorUid(instance: ComponentPublicInstance): number | undefined {
        let cursor = instance.$parent

        while (cursor) {
            if (!isInternalInstance(cursor)) {
                return cursor.$.uid
            }

            cursor = cursor.$parent
        }

        return undefined
    }

    function ensureEntry(instance: ComponentPublicInstance) {
        const uid: number = instance.$.uid

        if (!entries.has(uid)) {
            if (HIDE_INTERNALS && isInternalInstance(instance)) {
                return null
            }

            const parentUid = HIDE_INTERNALS ? nearestTrackedAncestorUid(instance) : instance.$parent?.$.uid
            entries.set(uid, makeEntry(uid, instance, currentRoute, parentUid))
            markDirty()
        }

        return entries.get(uid)!
    }

    function refreshEntryRect(uid: number) {
        const entry = entries.get(uid)

        if (!entry) {
            return
        }

        const el = liveElements.get(uid)

        if (!el?.getBoundingClientRect) {
            return
        }

        const rect = el.getBoundingClientRect()
        entry.rect = {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
        }
    }

    function reset() {
        resetTimestamp = performance.now()

        for (const entry of entries.values()) {
            entry.isPersistent = true
            entry.rerenders = 0
            entry.totalMs = 0
            entry.avgMs = 0
            entry.triggers = []
            entry.timeline = []
        }

        markDirty()
    }

    function aggregateFromComponentSpans() {
        const componentSpans = traceStore
            .getAllTraces()
            .flatMap((trace) => trace.spans)
            .filter((span) => span.type === 'render' || span.type === 'component')

        const allSpansByUid = new Map<number, Span[]>()
        const postResetSpansByUid = new Map<number, Span[]>()

        for (const span of componentSpans) {
            const uidValue = span.metadata?.uid
            const uid = typeof uidValue === 'number' ? uidValue : Number(uidValue)

            if (!Number.isFinite(uid)) {
                continue
            }

            const allList = allSpansByUid.get(uid) ?? []
            allList.push(span)
            allSpansByUid.set(uid, allList)

            if (span.startTime >= resetTimestamp) {
                const postList = postResetSpansByUid.get(uid) ?? []
                postList.push(span)
                postResetSpansByUid.set(uid, postList)
            }
        }

        for (const [uid, entry] of entries.entries()) {
            const allSpans = (allSpansByUid.get(uid) ?? []).sort((a, b) => a.startTime - b.startTime)
            const postResetSpans = (postResetSpansByUid.get(uid) ?? []).sort((a, b) => a.startTime - b.startTime)

            const timeline: RenderEvent[] = postResetSpans.slice(-MAX_TIMELINE).map((span) => {
                const isMountLifecycle = span.metadata?.lifecycle === 'render:mount' || span.metadata?.lifecycle === 'mounted'
                const lifecycle = isMountLifecycle ? 'mount' : 'update'
                const routeValue = span.metadata?.route
                const route = typeof routeValue === 'string' && routeValue.length > 0 ? routeValue : entry.route

                return {
                    kind: lifecycle,
                    t: span.startTime,
                    durationMs: Math.round((span.durationMs ?? 0) * 10) / 10,
                    route,
                }
            })

            const isMountSpan = (span: Span) => span.metadata?.lifecycle === 'render:mount' || span.metadata?.lifecycle === 'mounted'
            const mountCount = allSpans.filter(isMountSpan).length
            const rerenders = postResetSpans.filter((span) => !isMountSpan(span)).length
            const totalMs = postResetSpans.reduce((sum, span) => sum + (span.durationMs ?? 0), 0)
            const eventsCount = Math.max(postResetSpans.length, 1)

            entry.mountCount = mountCount
            entry.rerenders = rerenders
            entry.totalMs = Math.round(totalMs * 10) / 10
            entry.avgMs = Math.round((totalMs / eventsCount) * 10) / 10
            entry.timeline = timeline
            entry.triggers = []
            refreshEntryRect(uid)
        }
    }

    nuxtApp.vueApp.mixin({
        mounted(this: ComponentPublicInstance) {
            const entry = ensureEntry(this)

            if (!entry) {
                return
            }

            const isHydration = options.isHydrating?.() ?? false

            if (isHydration && entry.mountCount === 0) {
                entry.isHydrationMount = true
            }

            liveElements.set(entry.uid, this.$el as Element)
            refreshEntryRect(entry.uid)

            markDirty()
            emit('render:update', { uid: entry.uid, renders: entry.rerenders })
        },

        updated(this: ComponentPublicInstance) {
            const entry = ensureEntry(this)

            if (!entry) {
                return
            }

            liveElements.set(entry.uid, this.$el as Element)
            refreshEntryRect(entry.uid)
            emit('render:update', { uid: entry.uid, renders: entry.rerenders })
            markDirty()
        },

        unmounted(this: ComponentPublicInstance) {
            const uid = this.$.uid
            liveElements.delete(uid)
            entries.delete(uid)
            markDirty()
            emit('render:remove', { uid })
        },
    })

    function sanitize(entry: RenderEntry): RenderEntry {
        return {
            uid: entry.uid,
            name: entry.name,
            file: entry.file,
            element: entry.element,
            mountCount: entry.mountCount,
            rerenders: entry.rerenders,
            totalMs: entry.totalMs,
            avgMs: entry.avgMs,
            triggers: entry.triggers,
            timeline: entry.timeline,
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
            isPersistent: entry.isPersistent,
            isHydrationMount: entry.isHydrationMount,
            route: entry.route,
        }
    }

    function getAll(): RenderEntry[] {
        aggregateFromComponentSpans()

        return [...entries.values()].map(sanitize)
    }

    /**
     * Returns a cached pre-serialized JSON string of all render entries.
     * Rebuilds and re-serializes only when the registry has been mutated since the
     * last call (dirty flag). On a clean registry the cached string is returned
     * immediately — O(1) instead of O(n × timeline length) on every 500ms poll tick.
     * Also flushes any pending getBoundingClientRect() calls before serializing,
     * identical to getAll(), so rect values are always current.
     * @returns {string} A JSON string representing all render entries.
     */
    function getSnapshot(): string {
        if (!dirty) {
            return cachedSnapshot
        }

        aggregateFromComponentSpans()

        try {
            cachedSnapshot = JSON.stringify([...entries.values()].map(sanitize)) ?? '[]'
        } catch {
            cachedSnapshot = '[]'
        }

        dirty = false

        return cachedSnapshot
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

    return { getAll, getSnapshot, snapshot, reset, setRoute }
}

/**
 * Creates a new RenderEntry object from a given component instance.
 * @param {number} uid - A unique identifier for the component.
 * @param {ComponentPublicInstance} instance - The component instance.
 * @param {string} route - The current route path.
 * @param {number} [parentUid] - The unique identifier of the parent component, if any.
 * @returns {RenderEntry} A new RenderEntry object.
 */
function makeEntry(uid: number, instance: ComponentPublicInstance, route: string, parentUid?: number): RenderEntry {
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
        mountCount: 0,
        rerenders: 0,
        totalMs: 0,
        avgMs: 0,
        triggers: [],
        timeline: [],
        parentUid,
        isPersistent: false,
        isHydrationMount: false,
        route,
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
