/**
 * Env and product defaults for Observatory module options.
 *
 * Nuxt merges `defaults` into user `observatory` config. Using `env === 'true'`
 * as a default makes every unset flag `false`, which then wins over the
 * documented “on in development” fallback (`false ?? true === false`).
 *
 * Shipped tracker tabs default to `true` unless the env var is an explicit off/on.
 * `piniaTracker` stays off until that tracker is merged.
 * `instrumentServer` is omitted from defaults so setup can fall back to SSR.
 */

export function readEnvFlag(name: string, fallback: boolean): boolean {
    const value = process.env[name]

    if (value === undefined || value === '') {
        return fallback
    }

    if (value === 'false' || value === '0') {
        return false
    }

    if (value === 'true' || value === '1') {
        return true
    }

    return fallback
}

export function readEnvNumber(name: string, fallback: number): number {
    const value = process.env[name]

    if (value === undefined || value === '') {
        return fallback
    }

    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : fallback
}

export function createModuleDefaults() {
    const composableNavigationMode: 'route' | 'session' =
        process.env['OBSERVATORY_COMPOSABLE_NAVIGATION_MODE'] === 'session' ? 'session' : 'route'

    return {
        fetchDashboard: readEnvFlag('OBSERVATORY_FETCH_DASHBOARD', true),
        provideInjectGraph: readEnvFlag('OBSERVATORY_PROVIDE_INJECT_GRAPH', true),
        composableTracker: readEnvFlag('OBSERVATORY_COMPOSABLE_TRACKER', true),
        piniaTracker: readEnvFlag('OBSERVATORY_PINIA_TRACKER', false),
        payloadInspector: readEnvFlag('OBSERVATORY_PAYLOAD_INSPECTOR', true),
        stateCookieTracker: readEnvFlag('OBSERVATORY_STATE_COOKIE_TRACKER', true),
        renderHeatmap: readEnvFlag('OBSERVATORY_RENDER_HEATMAP', true),
        transitionTracker: readEnvFlag('OBSERVATORY_TRANSITION_TRACKER', true),
        keepAliveTracker: readEnvFlag('OBSERVATORY_KEEPALIVE_TRACKER', true),
        traceViewer: readEnvFlag('OBSERVATORY_TRACE_VIEWER', true),
        heatmapThresholdCount: readEnvNumber('OBSERVATORY_HEATMAP_THRESHOLD_COUNT', 3),
        heatmapThresholdTime: readEnvNumber('OBSERVATORY_HEATMAP_THRESHOLD_TIME', 1600),
        maxFetchEntries: readEnvNumber('OBSERVATORY_MAX_FETCH_ENTRIES', 200),
        maxPayloadBytes: readEnvNumber('OBSERVATORY_MAX_PAYLOAD_BYTES', 10000),
        fetchPageSize: readEnvNumber('OBSERVATORY_FETCH_PAGE_SIZE', 20),
        maxTransitions: readEnvNumber('OBSERVATORY_MAX_TRANSITIONS', 500),
        maxComposableHistory: readEnvNumber('OBSERVATORY_MAX_COMPOSABLE_HISTORY', 50),
        maxComposableEntries: readEnvNumber('OBSERVATORY_MAX_COMPOSABLE_ENTRIES', 300),
        maxPiniaTimeline: readEnvNumber('OBSERVATORY_MAX_PINIA_TIMELINE', 100),
        maxStateCookieEntries: readEnvNumber('OBSERVATORY_MAX_STATE_COOKIE_ENTRIES', 200),
        maxKeepAliveEntries: readEnvNumber('OBSERVATORY_MAX_KEEPALIVE_ENTRIES', 300),
        maxRenderTimeline: readEnvNumber('OBSERVATORY_MAX_RENDER_TIMELINE', 100),
        composableNavigationMode,
        heatmapHideInternals: readEnvFlag('OBSERVATORY_HEATMAP_HIDE_INTERNALS', false),
        debugRpc: readEnvFlag('OBSERVATORY_DEBUG_RPC', false),
    }
}

/**
 * Resolve server instrumentation: user config, then env, then SSR on / SPA off.
 * @param {boolean | undefined} option Optional module config override for instrumentServer.
 * @param {boolean} ssrEnabled Whether Nuxt SSR is enabled for the current app.
 * @returns {boolean} Final instrumentServer flag after applying option/env/SSR fallback.
 */
export function resolveInstrumentServer(option: boolean | undefined, ssrEnabled: boolean): boolean {
    if (typeof option === 'boolean') {
        return option
    }

    return readEnvFlag('OBSERVATORY_INSTRUMENT_SERVER', ssrEnabled)
}
