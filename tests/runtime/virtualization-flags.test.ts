import { afterEach, describe, expect, it, vi } from 'vitest'

const VIRTUALIZATION_STORAGE_KEY = 'observatory:virtualization'

function createMemoryStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial))

    return {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
            map.set(key, value)
        },
        removeItem: (key: string) => {
            map.delete(key)
        },
    }
}

function setWindowSearch(search: string, storage = createMemoryStorage()) {
    Object.defineProperty(globalThis, 'window', {
        value: {
            location: {
                search,
            },
            localStorage: storage,
        },
        configurable: true,
    })

    return storage
}

afterEach(() => {
    vi.resetModules()

    Object.defineProperty(globalThis, 'window', {
        value: undefined,
        configurable: true,
    })
})

describe('useVirtualizationFlags', () => {
    it('enables virtualization by default when no query params are provided', async () => {
        setWindowSearch('')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective } = useVirtualizationFlags()

        expect(flags.value.enabled).toBe(true)
        expect(flags.value.fetch).toBe(true)
        expect(flags.value.heatmap).toBe(true)
        expect(flags.value.traces).toBe(true)
        expect(flags.value.composables).toBe(true)
        expect(flags.value.transitions).toBe(true)

        expect(effective.value.enabled).toBe(true)
        expect(effective.value.fetch).toBe(true)
        expect(effective.value.heatmap).toBe(true)
        expect(effective.value.traces).toBe(true)
        expect(effective.value.composables).toBe(true)
        expect(effective.value.transitions).toBe(true)
    })

    it('applies global and per-screen query overrides', async () => {
        setWindowSearch('?virt=1&virtFetch=1&virtHeatmap=on&virtTraces=true&virtComposables=1&virtTransitions=1')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective } = useVirtualizationFlags()

        expect(flags.value.enabled).toBe(true)
        expect(flags.value.fetch).toBe(true)
        expect(flags.value.heatmap).toBe(true)
        expect(flags.value.traces).toBe(true)
        expect(flags.value.composables).toBe(true)
        expect(flags.value.transitions).toBe(true)

        expect(effective.value.enabled).toBe(true)
        expect(effective.value.fetch).toBe(true)
        expect(effective.value.heatmap).toBe(true)
        expect(effective.value.traces).toBe(true)
        expect(effective.value.composables).toBe(true)
        expect(effective.value.transitions).toBe(true)
    })

    it('keeps per-screen flags disabled in effective state when global is off', async () => {
        setWindowSearch('?virt=0&virtFetch=1&virtHeatmap=1&virtTraces=1')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective } = useVirtualizationFlags()

        expect(flags.value.fetch).toBe(true)
        expect(flags.value.heatmap).toBe(true)
        expect(flags.value.traces).toBe(true)

        expect(effective.value.enabled).toBe(false)
        expect(effective.value.fetch).toBe(false)
        expect(effective.value.heatmap).toBe(false)
        expect(effective.value.traces).toBe(false)
    })

    it('can disable a single screen while global virtualization stays on', async () => {
        setWindowSearch('?virtHeatmap=0')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { effective } = useVirtualizationFlags()

        expect(effective.value.enabled).toBe(true)
        expect(effective.value.heatmap).toBe(false)
        expect(effective.value.traces).toBe(true)
    })

    it('uses default flags when localStorage is missing', async () => {
        Object.defineProperty(globalThis, 'window', {
            value: {
                location: {
                    search: '',
                },
            },
            configurable: true,
        })

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective } = useVirtualizationFlags()

        expect(flags.value).toEqual({
            enabled: true,
            heatmap: true,
            traces: true,
            composables: true,
            fetch: true,
            transitions: true,
        })
        expect(effective.value.heatmap).toBe(true)
    })

    it('restores persisted flags from localStorage', async () => {
        setWindowSearch(
            '',
            createMemoryStorage({
                [VIRTUALIZATION_STORAGE_KEY]: JSON.stringify({
                    enabled: true,
                    heatmap: false,
                    traces: true,
                    composables: true,
                    fetch: true,
                    transitions: true,
                }),
            })
        )

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective } = useVirtualizationFlags()

        expect(flags.value.heatmap).toBe(false)
        expect(effective.value.heatmap).toBe(false)
        expect(effective.value.traces).toBe(true)
    })

    it('persists runtime toggles to localStorage', async () => {
        const storage = setWindowSearch('')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { setAllEnabled, setScreenEnabled } = useVirtualizationFlags()

        setScreenEnabled('heatmap', false)
        setAllEnabled(false)

        const stored = JSON.parse(storage.getItem(VIRTUALIZATION_STORAGE_KEY) ?? '{}') as { enabled: boolean; heatmap: boolean }

        expect(stored.enabled).toBe(false)
        expect(stored.heatmap).toBe(false)
    })

    it('supports runtime toggles from setters', async () => {
        setWindowSearch('?virt=1')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective, setAllEnabled, setScreenEnabled } = useVirtualizationFlags()

        setScreenEnabled('fetch', true)
        setScreenEnabled('heatmap', true)

        expect(flags.value.fetch).toBe(true)
        expect(flags.value.heatmap).toBe(true)
        expect(effective.value.fetch).toBe(true)
        expect(effective.value.heatmap).toBe(true)

        setAllEnabled(false)
        expect(effective.value.fetch).toBe(false)
        expect(effective.value.heatmap).toBe(false)

        setAllEnabled(true)
        expect(effective.value.fetch).toBe(true)
        expect(effective.value.heatmap).toBe(true)
    })
})
