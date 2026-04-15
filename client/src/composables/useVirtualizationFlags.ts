import { computed, ref } from 'vue'

type VirtualizationScreen = 'heatmap' | 'traces' | 'composables' | 'fetch' | 'transitions'

type VirtualizationFlags = {
    enabled: boolean
    heatmap: boolean
    traces: boolean
    composables: boolean
    fetch: boolean
    transitions: boolean
}

const defaultFlags: VirtualizationFlags = {
    enabled: false,
    heatmap: false,
    traces: false,
    composables: false,
    fetch: false,
    transitions: false,
}

const flags = ref<VirtualizationFlags>({ ...defaultFlags })

let initialized = false

function parseBooleanParam(value: string | null): boolean | null {
    if (value == null) {
        return null
    }

    if (value === '1' || value === 'true' || value === 'on') {
        return true
    }

    if (value === '0' || value === 'false' || value === 'off') {
        return false
    }

    return null
}

function readFromStorage(): VirtualizationFlags {
    return { ...defaultFlags }
}

function applyQueryOverrides(current: VirtualizationFlags): VirtualizationFlags {
    if (typeof window === 'undefined') {
        return current
    }

    const params = new URLSearchParams(window.location.search)
    const globalParam = parseBooleanParam(params.get('virt'))

    const next = { ...current }

    if (globalParam != null) {
        next.enabled = globalParam
    }

    const perScreen: Array<[VirtualizationScreen, string]> = [
        ['heatmap', 'virtHeatmap'],
        ['traces', 'virtTraces'],
        ['composables', 'virtComposables'],
        ['fetch', 'virtFetch'],
        ['transitions', 'virtTransitions'],
    ]

    for (const [key, paramName] of perScreen) {
        const override = parseBooleanParam(params.get(paramName))

        if (override != null) {
            next[key] = override
        }
    }

    return next
}

function init() {
    if (initialized) {
        return
    }

    initialized = true
    const stored = readFromStorage()
    const merged = applyQueryOverrides(stored)
    flags.value = merged
}

function setAllEnabled(value: boolean) {
    const next = {
        ...flags.value,
        enabled: value,
    }

    flags.value = next
}

function setScreenEnabled(screen: VirtualizationScreen, value: boolean) {
    const next = {
        ...flags.value,
        [screen]: value,
    }

    flags.value = next
}

export function useVirtualizationFlags() {
    init()

    const effective = computed(() => ({
        enabled: flags.value.enabled,
        heatmap: flags.value.enabled && flags.value.heatmap,
        traces: flags.value.enabled && flags.value.traces,
        composables: flags.value.enabled && flags.value.composables,
        fetch: flags.value.enabled && flags.value.fetch,
        transitions: flags.value.enabled && flags.value.transitions,
    }))

    return {
        flags,
        effective,
        setAllEnabled,
        setScreenEnabled,
    }
}

export type { VirtualizationFlags, VirtualizationScreen }
