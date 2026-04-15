import { h, defineComponent, getCurrentInstance, onUnmounted, Transition as VueTransition } from 'vue'
import type { Slots } from 'vue'
import { startSpan } from '../tracing/tracing'
import type { Span } from '../tracing/trace'
import { traceStore } from '../tracing/traceStore'

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
    const activeSpans = new Map<string, ReturnType<typeof startSpan>>()
    const entryState = new Map<string, Omit<TransitionEntry, 'durationMs'>>()

    // FIX #2: dirty flag + cached snapshot string.
    // Set to true whenever any mutation occurs. getSnapshot() rebuilds and
    // re-serializes only when dirty, returning the cached string otherwise.
    let dirty = true
    let cachedSnapshot = '[]'

    function markDirty() {
        dirty = true
    }

    function register(entry: TransitionEntry) {
        const spanHandle = startSpan({
            name: `transition:${entry.transitionName}`,
            type: 'transition',
            metadata: {
                id: entry.id,
                transitionName: entry.transitionName,
                parentComponent: entry.parentComponent,
                direction: entry.direction,
                phase: entry.phase,
                cancelled: entry.cancelled,
                appear: entry.appear,
                mode: entry.mode,
            },
            startTime: entry.startTime,
        })

        activeSpans.set(entry.id, spanHandle)
        entryState.set(entry.id, {
            id: entry.id,
            transitionName: entry.transitionName,
            parentComponent: entry.parentComponent,
            direction: entry.direction,
            phase: entry.phase,
            startTime: entry.startTime,
            endTime: entry.endTime,
            cancelled: entry.cancelled,
            appear: entry.appear,
            mode: entry.mode,
        })

        markDirty()
        emit('transition:register', entry)
    }

    function clear() {
        activeSpans.clear()
        entryState.clear()
        markDirty()
        emit('transition:clear', {})
    }

    function update(id: string, patch: Partial<TransitionEntry>) {
        const existing = entryState.get(id)

        if (!existing) {
            return
        }

        const updated: Omit<TransitionEntry, 'durationMs'> = { ...existing, ...patch }
        entryState.set(id, updated)

        const active = activeSpans.get(id)

        if (active) {
            active.span.metadata = {
                ...(active.span.metadata ?? {}),
                id: updated.id,
                transitionName: updated.transitionName,
                parentComponent: updated.parentComponent,
                direction: updated.direction,
                phase: updated.phase,
                cancelled: updated.cancelled,
                appear: updated.appear,
                mode: updated.mode,
            }

            if (patch.endTime !== undefined) {
                active.end({
                    endTime: patch.endTime,
                    status: patch.cancelled === true ? 'cancelled' : 'ok',
                    metadata: {
                        phase: updated.phase,
                        cancelled: updated.cancelled,
                    },
                })
                activeSpans.delete(id)
            }
        }

        markDirty()
        emit('transition:update', toTransitionEntry(updated, active?.span))
    }

    function toTransitionEntry(base: Omit<TransitionEntry, 'durationMs'>, span?: Span): TransitionEntry {
        const durationMs =
            span?.durationMs ?? (base.endTime !== undefined ? Math.round((base.endTime - base.startTime) * 10) / 10 : undefined)

        return {
            id: base.id,
            transitionName: base.transitionName,
            parentComponent: base.parentComponent,
            direction: base.direction,
            phase: base.phase,
            startTime: base.startTime,
            endTime: base.endTime,
            durationMs,
            cancelled: base.cancelled,
            appear: base.appear,
            mode: base.mode,
        }
    }

    function getAll(): TransitionEntry[] {
        const spans = traceStore
            .getAllTraces()
            .flatMap((trace) => trace.spans)
            .filter((span) => span.type === 'transition')
            .sort((a, b) => a.startTime - b.startTime)

        const entries = spans.map((span) => {
            const metadata = span.metadata ?? {}
            const id = typeof metadata.id === 'string' ? metadata.id : span.id
            const transitionName = typeof metadata.transitionName === 'string' ? metadata.transitionName : 'default'
            const parentComponent = typeof metadata.parentComponent === 'string' ? metadata.parentComponent : 'unknown'
            const direction = metadata.direction === 'leave' ? 'leave' : 'enter'
            const knownPhase = metadata.phase
            const phase: TransitionEntry['phase'] =
                knownPhase === 'entering' ||
                knownPhase === 'entered' ||
                knownPhase === 'leaving' ||
                knownPhase === 'left' ||
                knownPhase === 'enter-cancelled' ||
                knownPhase === 'leave-cancelled' ||
                knownPhase === 'interrupted'
                    ? knownPhase
                    : span.endTime
                      ? direction === 'enter'
                          ? 'entered'
                          : 'left'
                      : direction === 'enter'
                        ? 'entering'
                        : 'leaving'

            return {
                id,
                transitionName,
                parentComponent,
                direction,
                phase,
                startTime: span.startTime,
                endTime: span.endTime,
                durationMs: span.durationMs,
                cancelled: metadata.cancelled === true || span.status === 'cancelled',
                appear: metadata.appear === true,
                mode: typeof metadata.mode === 'string' ? metadata.mode : undefined,
            }
        })

        const overflow = entries.length - MAX_TRANSITIONS

        if (overflow > 0) {
            return entries.slice(overflow)
        }

        return entries
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
            cachedSnapshot = JSON.stringify(getAll()) ?? '[]'
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
