/**
 * Typed RPC interfaces for the Observatory DevTools extension.
 *
 * ServerFunctions: functions registered via extendServerRpc() that the iframe
 *   client (or any birpc consumer) can call on the Node.js server.
 *
 * ClientFunctions: functions registered via extendClientRpc() inside the iframe
 *   that the server can invoke as push notifications.
 *
 * Data flows:
 *   - Host Nuxt app (browser) ──import.meta.hot.send──► Vite server ──broadcast──► iframe
 *   - Iframe ──birpc call──► Vite server ──import.meta.hot.send (ws.send)──► host Nuxt app
 */

export interface ObservatorySnapshot {
    fetch?: unknown[]
    provideInject?: { provides: unknown[]; injects: unknown[] }
    composables?: unknown[]
    renders?: unknown[]
    transitions?: unknown[]
    traces?: unknown[]
    features?: {
        fetchDashboard?: boolean
        provideInjectGraph?: boolean
        composableTracker?: boolean
        composableNavigationMode?: 'route' | 'session'
        fetchPageSize?: number
        renderHeatmap?: boolean
        transitionTracker?: boolean
        traceViewer?: boolean
    }
}

/**
 * Functions exposed by the Vite/Node.js server side.
 * Called by the iframe client.
 */
export interface ObservatoryServerFunctions {
    /** Returns the most recently received snapshot from the host Nuxt app. */
    getSnapshot(): Promise<ObservatorySnapshot | null>
    /** Asks the host app to push a fresh snapshot immediately. */
    requestSnapshot(): Promise<void>
    /** Tells the host app to clear composable entries (respects navigation mode). */
    clearComposables(): Promise<void>
    /** Tells the host app to switch the composable tracker navigation mode. */
    setComposableMode(mode: 'route' | 'session'): Promise<void>
    /** Tells the host app to edit a reactive value inside a composable. */
    editComposableValue(id: string, key: string, value: unknown): Promise<void>
}

/**
 * Functions exposed by the iframe client.
 * Called by the server via `rpc.broadcast.onSnapshot.asEvent(snapshot)`.
 */
export interface ObservatoryClientFunctions {
    /**
     * Pushed from the server whenever the host Nuxt app sends a fresh snapshot.
     * The iframe applies this to its reactive stores without polling.
     */
    onSnapshot(snapshot: ObservatorySnapshot): void
}

/**
 * Command sent from the server to the host Nuxt app via Vite's WebSocket
 * (`server.ws.send`), received by `import.meta.hot.on('observatory:command', ...)`.
 */
export type ObservatoryCommand =
    | { cmd: 'request-snapshot' }
    | { cmd: 'clear-composables' }
    | { cmd: 'set-mode'; mode: 'route' | 'session' }
    | { cmd: 'edit-composable'; id: string; key: string; value: unknown }
