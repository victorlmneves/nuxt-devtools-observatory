import { describe, expect, it } from 'vitest'
import { useVirtualizationConfig, VIRTUALIZATION_DEFAULTS } from '@observatory-client/composables/useVirtualizationConfig'

describe('useVirtualizationConfig', () => {
    it('exposes default preset values', () => {
        const { preset } = useVirtualizationConfig()

        expect(preset.value.rowHeight).toBe(VIRTUALIZATION_DEFAULTS.rowHeight)
        expect(preset.value.overscan).toBe(VIRTUALIZATION_DEFAULTS.overscan)
    })

    it('clamps row height to a minimum of 20', () => {
        const { rowHeight, preset } = useVirtualizationConfig({ rowHeight: 8 })

        expect(preset.value.rowHeight).toBe(20)

        rowHeight.value = 18
        expect(preset.value.rowHeight).toBe(20)

        rowHeight.value = 42
        expect(preset.value.rowHeight).toBe(42)
    })

    it('clamps overscan to valid integer range', () => {
        const { overscan, preset } = useVirtualizationConfig({ overscan: 100 })

        expect(preset.value.overscan).toBe(40)

        overscan.value = 0
        expect(preset.value.overscan).toBe(2)

        overscan.value = 7.8
        expect(preset.value.overscan).toBe(8)
    })

    it('falls back to default overscan for non-finite values', () => {
        const { overscan, preset } = useVirtualizationConfig({ overscan: Number.NaN })

        expect(preset.value.overscan).toBe(VIRTUALIZATION_DEFAULTS.overscan)

        overscan.value = Number.POSITIVE_INFINITY
        expect(preset.value.overscan).toBe(VIRTUALIZATION_DEFAULTS.overscan)
    })
})
