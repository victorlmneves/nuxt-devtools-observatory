import { ref, h, defineComponent, getCurrentInstance, onUnmounted, Transition as VueTransition } from 'vue'
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

export function setupTransitionRegistry() {
    const entries = ref<Map<string, TransitionEntry>>(new Map())

    function register(entry: TransitionEntry) {
        entries.value.set(entry.id, entry)
        emit('transition:register', entry)
    }

    function update(id: string, patch: Partial<TransitionEntry>) {
        const existing = entries.value.get(id)

        if (!existing) {
            return
        }

        const updated: TransitionEntry = { ...existing, ...patch }

        if (patch.endTime !== undefined) {
            updated.durationMs = Math.round((patch.endTime - existing.startTime) * 10) / 10
        }

        entries.value.set(id, updated)
        emit('transition:update', updated)
    }

    function sanitize(entry: TransitionEntry): TransitionEntry {
        const clone = { ...entry }

        // Remove any function properties
        for (const key in clone) {
            if (typeof clone[key] === 'function') {
                delete clone[key]
            }
        }

        return clone
    }

    function getAll(): TransitionEntry[] {
        return [...entries.value.values()].map(sanitize)
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } })
            .__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { register, update, getAll }
}

// ── Tracked <Transition> wrapper ─────────────────────────────────────────
type ElementHook = ((el: Element) => void) | undefined

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
                        const id = `${transitionName}::enter::${now}`
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
                        const id = `${transitionName}::leave::${now}`
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
