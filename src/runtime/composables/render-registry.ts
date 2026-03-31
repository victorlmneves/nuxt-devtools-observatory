import type { ComponentPublicInstance } from 'vue'

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
    // FIX #1: plain Map — no Vue reactivity overhead on every .get()/.set()/.has()
    const entries = new Map<number, RenderEntry>()
    const pendingTriggeredRenders = new Set<number>()
    const renderStartTimes = new Map<number, number>()
    // Current route, updated by the plugin on every navigation
    let currentRoute = '/'
    // Allow configuration via .env or Nuxt runtime config
    const hasEnv = typeof import.meta.env !== 'undefined' && import.meta.env !== undefined
    const MAX_TIMELINE =
        hasEnv && import.meta.env?.VITE_OBSERVATORY_MAX_RENDER_TIMELINE ? Number(import.meta.env.VITE_OBSERVATORY_MAX_RENDER_TIMELINE) : 100
    const HIDE_INTERNALS =
        hasEnv && import.meta.env?.VITE_OBSERVATORY_HEATMAP_HIDE_INTERNALS !== undefined
            ? import.meta.env.VITE_OBSERVATORY_HEATMAP_HIDE_INTERNALS === 'true'
            : false

    // FIX #2: dirty flag + cached snapshot string.
    // Set to true whenever any mutation occurs. getSnapshot() rebuilds and
    // re-serializes only when dirty, returning the cached string otherwise.
    let dirty = true
    let cachedSnapshot = '[]'

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

    // UIDs whose rect needs to be refreshed on the next getAll() call.
    // getBoundingClientRect() forces a layout reflow — we defer it out of the
    // hot mixin path and batch it lazily when a snapshot is actually requested.
    const dirtyRects = new Set<number>()

    function markRectDirty(uid: number) {
        dirtyRects.add(uid)
        markDirty()
    }

    function flushDirtyRects() {
        if (dirtyRects.size === 0) {
            return
        }

        for (const uid of dirtyRects) {
            const entry = entries.get(uid)

            if (!entry) {
                dirtyRects.delete(uid)
                continue
            }

            // Instance reference is not stored — re-read from the Vue internals.
            // app.config.globalProperties.$nuxt gives access, but the simplest
            // approach is to store the $el reference directly on the entry when
            // the component mounts, and drop it on unmount.
            const el = _liveElements.get(uid)

            if (!el) {
                dirtyRects.delete(uid)
                continue
            }

            const rect: DOMRect | undefined = el.getBoundingClientRect?.()
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

            dirtyRects.delete(uid)
        }
    }

    // Holds the live $el reference for each mounted component uid.
    // Populated in mounted(), cleared in unmounted().
    // Typed as any to avoid importing Element which isn't always available (SSR).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _liveElements = new Map<number, any>()

    function removeEntry(instance: ComponentPublicInstance) {
        const uid = instance.$.uid
        entries.delete(uid)
        markDirty()
    }

    function startRenderTimer(uid: number) {
        if (typeof performance === 'undefined') {
            return
        }

        renderStartTimes.set(uid, performance.now())
    }

    function recordRenderDuration(entry: RenderEntry, kind: 'mount' | 'update') {
        if (typeof performance === 'undefined') {
            return
        }

        const startedAt = renderStartTimes.get(entry.uid)

        if (startedAt === undefined) {
            return
        }

        renderStartTimes.delete(entry.uid)
        const durationMs = Math.max(performance.now() - startedAt, 0)
        entry.totalMs += durationMs
        // avgMs covers both initial mounts and re-renders since both take real time.
        // Use rerenders + mountCount as the denominator; guard against 0 with max(,1).
        const totalEvents = (entry.rerenders ?? 0) + Math.max(entry.mountCount, 1)
        entry.avgMs = Math.round((entry.totalMs / totalEvents) * 10) / 10

        // Append to per-component timeline
        const lastTrigger = entry.triggers.length > 0 ? entry.triggers[entry.triggers.length - 1] : undefined
        const event: RenderEvent = {
            kind,
            t: startedAt,
            durationMs: Math.round(durationMs * 10) / 10,
            triggerKey: kind === 'update' && lastTrigger ? `${lastTrigger.type}: ${lastTrigger.key}` : undefined,
            route: currentRoute,
        }

        entry.timeline.push(event)

        if (entry.timeline.length > MAX_TIMELINE) {
            entry.timeline.shift()
        }

        markDirty()
    }

    function reset() {
        pendingTriggeredRenders.clear()
        renderStartTimes.clear()
        dirtyRects.clear()

        for (const entry of entries.values()) {
            // Mark every component that survives this reset as persistent now,
            // rather than snapshotting all UIDs into a new Set and checking later.
            // This avoids allocating a full Set<number> on every navigation.
            entry.isPersistent = true
            entry.rerenders = 0
            entry.totalMs = 0
            entry.avgMs = 0
            entry.triggers = []
            entry.timeline = []
            // mountCount intentionally NOT reset — it reflects how many times this
            // component mounted during the current page's lifetime. Resetting it
            // would make the second mount appear to be a first mount and bypass
            // the re-mount → rerender counting logic.
        }

        markDirty()
    }

    // Hook Vue's global mixin for render tracking
    nuxtApp.vueApp.mixin({
        beforeMount(this: ComponentPublicInstance) {
            startRenderTimer(this.$.uid)
        },

        mounted(this: ComponentPublicInstance) {
            const entry = ensureEntry(this)

            if (!entry) {
                return
            }

            entry.mountCount++

            // isPersistent is set directly in reset() for any component that
            // survives a navigation — no uid snapshot needed here.

            // Initial mount is NOT a re-render — don't count it.
            // Only count if the component re-mounts on the same page (v-if toggle etc.)
            const isHydration = options.isHydrating?.() ?? false

            if (isHydration && entry.mountCount === 1) {
                entry.isHydrationMount = true
            } else if (entry.mountCount > 1) {
                entry.rerenders++
            }

            _liveElements.set(entry.uid, this.$el)
            markRectDirty(entry.uid)

            // Persistent components re-mounting after navigation are NOT new renders —
            // they kept their DOM. Only record the timeline event for genuine first mounts
            // and explicit re-mounts (v-if etc.), not navigation-triggered re-attachments.
            if (!entry.isPersistent || entry.mountCount === 1) {
                recordRenderDuration(entry, 'mount')
            } else {
                // Still clear the start time so it doesn't bleed into the next event
                renderStartTimes.delete(entry.uid)
            }

            markDirty()
            emit('render:update', { uid: entry.uid, renders: entry.rerenders })
        },

        beforeUpdate(this: ComponentPublicInstance) {
            startRenderTimer(this.$.uid)
        },

        renderTriggered(this: ComponentPublicInstance, { key, type }: { key: string; type: string }) {
            const entry = ensureEntry(this)

            if (!entry) {
                return
            }

            entry.triggers.push({ key: String(key), type, timestamp: performance.now() })
            pendingTriggeredRenders.add(entry.uid)

            // Keep last 50 triggers per component
            if (entry.triggers.length > 50) {
                entry.triggers.shift()
            }

            markDirty()
        },

        updated(this: ComponentPublicInstance) {
            const entry = ensureEntry(this)

            if (!entry) {
                return
            }

            // Count every reactive update as a re-render.
            // renderTriggered (above) already captured which deps triggered it.
            // We clear the pending flag regardless — it was only needed when
            // updated() also had to filter out initial mounts (no longer the case).
            pendingTriggeredRenders.delete(entry.uid)
            entry.rerenders++

            markRectDirty(entry.uid)
            recordRenderDuration(entry, 'update')
            emit('render:update', { uid: entry.uid, renders: entry.rerenders })
        },

        unmounted(this: ComponentPublicInstance) {
            const uid = this.$.uid
            pendingTriggeredRenders.delete(uid)
            renderStartTimes.delete(uid)
            dirtyRects.delete(uid)
            _liveElements.delete(uid)
            removeEntry(this)
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
        // Flush any pending getBoundingClientRect() calls now — batched here so
        // they never run in the hot mixin path during normal rendering.
        flushDirtyRects()

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

        // Flush pending rect reads before serializing — same guarantee as getAll()
        flushDirtyRects()

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
