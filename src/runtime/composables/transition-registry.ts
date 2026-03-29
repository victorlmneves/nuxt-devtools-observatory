import { h, defineComponent, getCurrentInstance, onUnmounted, Transition as VueTransition } from 'vue'
import type { Slots } from 'vue'

export interface TransitionEntry {
    id: string
    transitionName: string
    parentComponent: string
    direction: 'enter' | 'leave'
    phase: 'entering' | 'entered' | 'leaving' | 'left' | 'enter-cancelled' | 'leave-cancelled' | 'interrupted'
    startTime: number
    endTime?: number
    durationMs?: number
    cancelled: boolean
    appear: boolean
    mode?: string
}

// Allow configuration via .env or Nuxt runtime config
const MAX_TRANSITIONS =
    typeof process !== 'undefined' && process.env.OBSERVATORY_MAX_TRANSITIONS ? Number(process.env.OBSERVATORY_MAX_TRANSITIONS) : 500

export function setupTransitionRegistry() {
    // FIX #1: plain Map — no Vue reactivity overhead on every .get()/.set()/.has()
    const entries = new Map<string, TransitionEntry>()

    // FIX #2: dirty flag + cached snapshot string.
    // Set to true whenever any mutation occurs. getSnapshot() rebuilds and
    // re-serializes only when dirty, returning the cached string otherwise.
    let dirty = true
    let cachedSnapshot = '[]'

    function markDirty() {
        dirty = true
    }

    function register(entry: TransitionEntry) {
        // Evict the oldest entry when the cap is reached to prevent unbounded growth
        if (entries.size >= MAX_TRANSITIONS) {
            const oldestKey = entries.keys().next().value
            if (oldestKey !== undefined) {
                entries.delete(oldestKey)
            }
        }

        entries.set(entry.id, entry)
        markDirty()
        emit('transition:register', entry)
    }

    function clear() {
        entries.clear()
        markDirty()
        emit('transition:clear', {})
    }

    function update(id: string, patch: Partial<TransitionEntry>) {
        const existing = entries.get(id)

        if (!existing) {
            return
        }

        const updated: TransitionEntry = { ...existing, ...patch }

        if (patch.endTime !== undefined) {
            updated.durationMs = Math.round((patch.endTime - existing.startTime) * 10) / 10
        }

        entries.set(id, updated)
        markDirty()
        emit('transition:update', updated)
    }

    function sanitize(entry: TransitionEntry): TransitionEntry {
        // Build the serialisable snapshot by copying only the known scalar fields
        // rather than using for..in + delete, which iterates the prototype chain
        // and would break if the TransitionEntry type ever gains function properties.
        return {
            id: entry.id,
            transitionName: entry.transitionName,
            parentComponent: entry.parentComponent,
            direction: entry.direction,
            phase: entry.phase,
            startTime: entry.startTime,
            endTime: entry.endTime,
            durationMs: entry.durationMs,
            cancelled: entry.cancelled,
            appear: entry.appear,
            mode: entry.mode,
        }
    }

    function getAll(): TransitionEntry[] {
        return [...entries.values()].map(sanitize)
    }

    /**
     * Returns a cached pre-serialized JSON string of all transition entries.
     * Rebuilds and re-serializes only when the registry has been mutated since the
     * last call (dirty flag). On a clean registry the cached string is returned
     * immediately — O(1) instead of O(n) on every 500ms poll tick.
     * @returns {object} The transition registry with `register`, `update`, `getAll`, `getSnapshot`, and `clear` methods.
     */
    function getSnapshot(): string {
        if (!dirty) {
            return cachedSnapshot
        }

        try {
            cachedSnapshot = JSON.stringify([...entries.values()].map(sanitize)) ?? '[]'
        } catch {
            cachedSnapshot = '[]'
        }

        dirty = false

        return cachedSnapshot
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } })
            .__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll, getSnapshot, clear }
}

// ── Tracked <Transition> wrapper ─────────────────────────────────────────
type ElementHook = ((el: Element) => void) | undefined

// Monotonically increasing counter used to make transition IDs unique even
// when multiple transitions fire within the same performance.now() millisecond.
let _transitionSeq = 0

function mergeHook(original: ElementHook, ours: (el: Element) => void): (el: Element) => void {
    return (el: Element) => {
        ours(el)
        original?.(el)
    }
}

export function createTrackedTransition(registry: ReturnType<typeof setupTransitionRegistry>) {
    return defineComponent({
        name: 'Transition',
        inheritAttrs: false,
        setup(_, { attrs, slots }: { attrs: Record<string, unknown>; slots: Slots }) {
            const instance = getCurrentInstance()
            const parent = instance?.parent
            const parentComponent =
                (parent?.type as { __name?: string; name?: string })?.__name ?? (parent?.type as { name?: string })?.name ?? 'unknown'

            let enterEntryId: string | null = null
            let leaveEntryId: string | null = null

            onUnmounted(() => {
                if (enterEntryId) {
                    registry.update(enterEntryId, { phase: 'interrupted', endTime: performance.now() })
                    enterEntryId = null
                }

                if (leaveEntryId) {
                    registry.update(leaveEntryId, { phase: 'interrupted', endTime: performance.now() })
                    leaveEntryId = null
                }
            })

            return () => {
                const transitionName = String(attrs.name ?? 'default')
                const isAppear = Boolean(attrs.appear)
                const mode = typeof attrs.mode === 'string' ? attrs.mode : undefined

                const hookedAttrs = {
                    ...attrs,

                    onBeforeEnter: mergeHook(attrs.onBeforeEnter as ElementHook, () => {
                        const now = performance.now()
                        const id = `${transitionName}::enter::${now}::${++_transitionSeq}`
                        enterEntryId = id
                        registry.register({
                            id,
                            transitionName,
                            parentComponent,
                            direction: 'enter',
                            phase: 'entering',
                            startTime: now,
                            cancelled: false,
                            appear: isAppear,
                            mode,
                        })
                    }),

                    onAfterEnter: mergeHook(attrs.onAfterEnter as ElementHook, () => {
                        if (enterEntryId) {
                            registry.update(enterEntryId, { phase: 'entered', endTime: performance.now() })
                            enterEntryId = null
                        }
                    }),

                    onEnterCancelled: mergeHook(attrs.onEnterCancelled as ElementHook, () => {
                        if (enterEntryId) {
                            registry.update(enterEntryId, { phase: 'enter-cancelled', cancelled: true, endTime: performance.now() })
                            enterEntryId = null
                        }
                    }),

                    onBeforeLeave: mergeHook(attrs.onBeforeLeave as ElementHook, () => {
                        const now = performance.now()
                        const id = `${transitionName}::leave::${now}::${++_transitionSeq}`
                        leaveEntryId = id
                        registry.register({
                            id,
                            transitionName,
                            parentComponent,
                            direction: 'leave',
                            phase: 'leaving',
                            startTime: now,
                            cancelled: false,
                            appear: false,
                            mode,
                        })
                    }),

                    onAfterLeave: mergeHook(attrs.onAfterLeave as ElementHook, () => {
                        if (leaveEntryId) {
                            registry.update(leaveEntryId, { phase: 'left', endTime: performance.now() })
                            leaveEntryId = null
                        }
                    }),

                    onLeaveCancelled: mergeHook(attrs.onLeaveCancelled as ElementHook, () => {
                        if (leaveEntryId) {
                            registry.update(leaveEntryId, { phase: 'leave-cancelled', cancelled: true, endTime: performance.now() })
                            leaveEntryId = null
                        }
                    }),
                }

                return h(VueTransition, hookedAttrs, slots)
            }
        },
    })
}
