import type {
    ObservatoryTestAPI,
    TestWindow,
    TraceEntry,
    HeatmapData,
    ComposableEntry,
    FetchEntry,
    GraphData,
    TransitionEntry,
    InternalCounts,
} from '../types/observatory.types'

function getSafeWindow(): TestWindow {
    if (typeof window === 'undefined') {
        throw new Error('Window is not defined - this code must run in browser environment')
    }

    return window as TestWindow
}

export async function getTestBridge(): Promise<ObservatoryTestAPI> {
    const win = getSafeWindow()

    if (!win.__OBSERVATORY_TEST_BRIDGE) {
        throw new Error('Observatory test bridge not initialized. Make sure injectTestBridge() has been called.')
    }

    return win.__OBSERVATORY_TEST_BRIDGE
}

export async function waitForBridge(timeoutMs: number = 5000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
        const win = getSafeWindow()

        if (win.__OBSERVATORY_TEST_BRIDGE) {
            return
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 100))
    }

    throw new Error(`Observatory test bridge not initialized within ${timeoutMs}ms`)
}

type WritableTestWindowKey = '__lastMountStart' | '__heavyRenderStart' | '__editableComponentCounter'

export function setTestMetadata(key: WritableTestWindowKey, value: number): void {
    const win = getSafeWindow()
    win[key] = value
}

export function getTestMetadata(key: WritableTestWindowKey): number | undefined {
    const win = getSafeWindow()

    return win[key]
}

export type { ObservatoryTestAPI, TraceEntry, HeatmapData, ComposableEntry, FetchEntry, GraphData, TransitionEntry, InternalCounts }
