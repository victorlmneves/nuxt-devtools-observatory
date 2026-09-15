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

export const VIRTUALIZATION_STORAGE_KEY = 'observatory:virtualization'

const defaultFlags: VirtualizationFlags = {
    enabled: true,
    heatmap: true,
    traces: true,
    composables: true,
    fetch: true,
    transitions: true,
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

function isFlagRecord(value: unknown): value is Partial<VirtualizationFlags> {
    return Boolean(value) && typeof value === 'object'
}

function readFromStorage(): VirtualizationFlags {
    if (typeof window === 'undefined' || !window.localStorage) {
        return { ...defaultFlags }
    }

    try {
        const raw = window.localStorage.getItem(VIRTUALIZATION_STORAGE_KEY)

        if (!raw) {
            return { ...defaultFlags }
        }

        const parsed: unknown = JSON.parse(raw)

        if (!isFlagRecord(parsed)) {
            return { ...defaultFlags }
        }

        return {
            enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaultFlags.enabled,
            heatmap: typeof parsed.heatmap === 'boolean' ? parsed.heatmap : defaultFlags.heatmap,
            traces: typeof parsed.traces === 'boolean' ? parsed.traces : defaultFlags.traces,
            composables: typeof parsed.composables === 'boolean' ? parsed.composables : defaultFlags.composables,
            fetch: typeof parsed.fetch === 'boolean' ? parsed.fetch : defaultFlags.fetch,
            transitions: typeof parsed.transitions === 'boolean' ? parsed.transitions : defaultFlags.transitions,
        }
    } catch {
        return { ...defaultFlags }
    }
}

function persist(next: VirtualizationFlags) {
    if (typeof window === 'undefined' || !window.localStorage) {
        return
    }

    try {
        window.localStorage.setItem(VIRTUALIZATION_STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Ignore quota / private-mode failures.
    }
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
    flags.value = applyQueryOverrides(stored)
}

function setAllEnabled(value: boolean) {
    const next = {
        ...flags.value,
        enabled: value,
    }

    flags.value = next
    persist(next)
}

function setScreenEnabled(screen: VirtualizationScreen, value: boolean) {
    const next = {
        ...flags.value,
        [screen]: value,
    }

    flags.value = next
    persist(next)
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
