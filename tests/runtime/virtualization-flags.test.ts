import { afterEach, describe, expect, it, vi } from 'vitest'

function setWindowSearch(search: string) {
    Object.defineProperty(globalThis, 'window', {
        value: {
            location: {
                search,
            },
        },
        configurable: true,
    })
}

afterEach(() => {
    vi.resetModules()

    Object.defineProperty(globalThis, 'window', {
        value: undefined,
        configurable: true,
    })
})

describe('useVirtualizationFlags', () => {
    it('uses disabled defaults when no query params are provided', async () => {
        setWindowSearch('')

        const { useVirtualizationFlags } = await import('@observatory-client/composables/useVirtualizationFlags')
        const { flags, effective } = useVirtualizationFlags()

        expect(flags.value.enabled).toBe(false)
        expect(flags.value.fetch).toBe(false)
        expect(flags.value.heatmap).toBe(false)
        expect(flags.value.traces).toBe(false)
        expect(flags.value.composables).toBe(false)
        expect(flags.value.transitions).toBe(false)

        expect(effective.value.enabled).toBe(false)
        expect(effective.value.fetch).toBe(false)
        expect(effective.value.heatmap).toBe(false)
        expect(effective.value.traces).toBe(false)
        expect(effective.value.composables).toBe(false)
        expect(effective.value.transitions).toBe(false)
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
