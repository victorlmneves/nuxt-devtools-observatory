import type { IObservatoryTestAPI, ITestWindow } from '../types/observatory.types'

function getSafeWindow(): ITestWindow {
    if (typeof window === 'undefined') {
        throw new TypeError('Window is not defined - this code must run in browser environment')
    }

    return window as ITestWindow
}

export function getTestBridge(): IObservatoryTestAPI {
    const win = getSafeWindow()

    if (!win.__OBSERVATORY_TEST_BRIDGE) {
        throw new Error('Observatory test bridge not initialized. Make sure injectTestBridge() has been called.')
    }

    return win.__OBSERVATORY_TEST_BRIDGE
}

const BRIDGE_POLL_INTERVAL_MS = 100

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function pollForBridge(deadline: number, timeoutMs: number): Promise<void> {
    if (Date.now() >= deadline) {
        throw new Error(`Observatory test bridge not initialized within ${timeoutMs}ms`)
    }

    const win = getSafeWindow()

    if (win.__OBSERVATORY_TEST_BRIDGE) {
        return
    }

    await delay(BRIDGE_POLL_INTERVAL_MS)
    await pollForBridge(deadline, timeoutMs)
}

export function waitForBridge(timeoutMs: number = 5000): Promise<void> {
    return pollForBridge(Date.now() + timeoutMs, timeoutMs)
}

type TWritableTestWindowKey = '__lastMountStart' | '__heavyRenderStart' | '__editableComponentCounter'

export function setTestMetadata(key: TWritableTestWindowKey, value: number): void {
    const win = getSafeWindow()
    win[key] = value
}

export function getTestMetadata(key: TWritableTestWindowKey): number | undefined {
    const win = getSafeWindow()

    return win[key]
}
