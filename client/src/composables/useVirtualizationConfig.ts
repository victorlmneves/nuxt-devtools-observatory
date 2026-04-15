import { computed, ref } from 'vue'

const DEFAULT_ROW_HEIGHT = 34
const DEFAULT_OVERSCAN = 10
const MIN_OVERSCAN = 2
const MAX_OVERSCAN = 40

function clampOverscan(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_OVERSCAN
    }

    return Math.max(MIN_OVERSCAN, Math.min(MAX_OVERSCAN, Math.round(value)))
}

export type VirtualizationPreset = {
    rowHeight: number
    overscan: number
}

export function useVirtualizationConfig(initial?: Partial<VirtualizationPreset>) {
    const rowHeight = ref(initial?.rowHeight ?? DEFAULT_ROW_HEIGHT)
    const overscan = ref(clampOverscan(initial?.overscan ?? DEFAULT_OVERSCAN))

    const preset = computed<VirtualizationPreset>(() => ({
        rowHeight: Math.max(20, rowHeight.value),
        overscan: clampOverscan(overscan.value),
    }))

    return {
        rowHeight,
        overscan,
        preset,
    }
}

export const VIRTUALIZATION_DEFAULTS = {
    rowHeight: DEFAULT_ROW_HEIGHT,
    overscan: DEFAULT_OVERSCAN,
} as const
