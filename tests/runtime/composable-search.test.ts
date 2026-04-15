import { describe, it, expect } from 'vitest'
import { matchesComposableEntryQuery } from '@observatory-client/composables/composable-search'
import type { ComposableEntry } from '@observatory/types/snapshot'

function makeEntry(overrides?: Partial<ComposableEntry>): ComposableEntry {
    return {
        id: 'entry-1',
        name: 'usePreferences',
        componentFile: '/app/components/PrefsPanel.vue',
        componentUid: 1,
        status: 'mounted',
        leak: false,
        refs: {},
        history: [],
        sharedKeys: [],
        watcherCount: 0,
        intervalCount: 0,
        lifecycle: {
            hasOnMounted: true,
            hasOnUnmounted: true,
            watchersCleaned: true,
            intervalsCleaned: true,
        },
        file: '/app/composables/usePreferences.ts',
        line: 1,
        route: '/settings',
        ...overrides,
    }
}

describe('matchesComposableEntryQuery', () => {
    it('matches nested reactive object keys', () => {
        const entry = makeEntry({
            refs: {
                preferences: {
                    type: 'reactive',
                    value: {
                        ui: {
                            theme: {
                                accentColor: 'teal',
                            },
                        },
                    },
                },
            },
        })

        expect(matchesComposableEntryQuery(entry, 'accentcolor')).toBe(true)
    })

    it('matches nested reactive object values', () => {
        const entry = makeEntry({
            refs: {
                cart: {
                    type: 'reactive',
                    value: {
                        items: [
                            { sku: 'SKU-1', title: 'Notebook' },
                            { sku: 'SKU-2', title: 'Mechanical Keyboard' },
                        ],
                    },
                },
            },
        })

        expect(matchesComposableEntryQuery(entry, 'mechanical keyboard')).toBe(true)
    })

    it('matches nested array values', () => {
        const entry = makeEntry({
            refs: {
                dashboard: {
                    type: 'reactive',
                    value: {
                        widgets: [{ name: 'Revenue' }, { name: 'Latency' }],
                    },
                },
            },
        })

        expect(matchesComposableEntryQuery(entry, 'latency')).toBe(true)
    })

    it('handles cyclic objects without throwing', () => {
        const cyclic: Record<string, unknown> = { label: 'root' }
        cyclic.self = cyclic

        const entry = makeEntry({
            refs: {
                graph: {
                    type: 'reactive',
                    value: cyclic,
                },
            },
        })

        expect(() => matchesComposableEntryQuery(entry, 'root')).not.toThrow()
        expect(matchesComposableEntryQuery(entry, 'root')).toBe(true)
    })

    it('returns false for non-matching query', () => {
        const entry = makeEntry({
            refs: {
                state: {
                    type: 'reactive',
                    value: {
                        filter: {
                            status: 'active',
                        },
                    },
                },
            },
        })

        expect(matchesComposableEntryQuery(entry, 'does-not-exist')).toBe(false)
    })
})
