import { afterEach, describe, expect, it } from 'vitest'
import { createModuleDefaults, readEnvFlag, readEnvNumber, resolveInstrumentServer } from '../../src/env-options'

const FLAG_KEYS = [
    'OBSERVATORY_FETCH_DASHBOARD',
    'OBSERVATORY_PROVIDE_INJECT_GRAPH',
    'OBSERVATORY_COMPOSABLE_TRACKER',
    'OBSERVATORY_PINIA_TRACKER',
    'OBSERVATORY_PAYLOAD_INSPECTOR',
    'OBSERVATORY_STATE_COOKIE_TRACKER',
    'OBSERVATORY_RENDER_HEATMAP',
    'OBSERVATORY_TRANSITION_TRACKER',
    'OBSERVATORY_TRACE_VIEWER',
    'OBSERVATORY_HEATMAP_HIDE_INTERNALS',
    'OBSERVATORY_DEBUG_RPC',
    'OBSERVATORY_INSTRUMENT_SERVER',
    'OBSERVATORY_COMPOSABLE_NAVIGATION_MODE',
    'OBSERVATORY_HEATMAP_THRESHOLD_COUNT',
] as const

afterEach(() => {
    for (const key of FLAG_KEYS) {
        delete process.env[key]
    }
})

describe('readEnvFlag', () => {
    it('uses the product fallback when the env var is unset', () => {
        delete process.env.OBSERVATORY_FETCH_DASHBOARD

        expect(readEnvFlag('OBSERVATORY_FETCH_DASHBOARD', true)).toBe(true)
        expect(readEnvFlag('OBSERVATORY_DEBUG_RPC', false)).toBe(false)
    })

    it('treats true and 1 as on, false and 0 as off', () => {
        process.env.OBSERVATORY_FETCH_DASHBOARD = 'true'
        expect(readEnvFlag('OBSERVATORY_FETCH_DASHBOARD', false)).toBe(true)

        process.env.OBSERVATORY_FETCH_DASHBOARD = '1'
        expect(readEnvFlag('OBSERVATORY_FETCH_DASHBOARD', false)).toBe(true)

        process.env.OBSERVATORY_FETCH_DASHBOARD = 'false'
        expect(readEnvFlag('OBSERVATORY_FETCH_DASHBOARD', true)).toBe(false)

        process.env.OBSERVATORY_FETCH_DASHBOARD = '0'
        expect(readEnvFlag('OBSERVATORY_FETCH_DASHBOARD', true)).toBe(false)
    })
})

describe('readEnvNumber', () => {
    it('falls back for missing or non-numeric values', () => {
        expect(readEnvNumber('OBSERVATORY_HEATMAP_THRESHOLD_COUNT', 3)).toBe(3)

        process.env.OBSERVATORY_HEATMAP_THRESHOLD_COUNT = 'not-a-number'
        expect(readEnvNumber('OBSERVATORY_HEATMAP_THRESHOLD_COUNT', 3)).toBe(3)
    })
})

describe('createModuleDefaults', () => {
    it('enables tracker tabs when env is unset', () => {
        const defaults = createModuleDefaults()

        expect(defaults.fetchDashboard).toBe(true)
        expect(defaults.provideInjectGraph).toBe(true)
        expect(defaults.composableTracker).toBe(true)
        expect(defaults.piniaTracker).toBe(false)
        expect(defaults.payloadInspector).toBe(true)
        expect(defaults.stateCookieTracker).toBe(true)
        expect(defaults.renderHeatmap).toBe(true)
        expect(defaults.transitionTracker).toBe(true)
        expect(defaults.traceViewer).toBe(true)
        expect(defaults.maxStateCookieEntries).toBe(200)
        expect(defaults.debugRpc).toBe(false)
        expect(defaults.heatmapHideInternals).toBe(false)
    })

    it('does not include instrumentServer so SSR/SPA can decide later', () => {
        expect(createModuleDefaults()).not.toHaveProperty('instrumentServer')
    })

    it('honours explicit env disables', () => {
        process.env.OBSERVATORY_FETCH_DASHBOARD = 'false'
        process.env.OBSERVATORY_PINIA_TRACKER = 'true'

        const defaults = createModuleDefaults()

        expect(defaults.fetchDashboard).toBe(false)
        expect(defaults.piniaTracker).toBe(true)
        expect(defaults.traceViewer).toBe(true)
    })
})

describe('resolveInstrumentServer', () => {
    it('prefers an explicit nuxt.config value', () => {
        process.env.OBSERVATORY_INSTRUMENT_SERVER = 'true'

        expect(resolveInstrumentServer(false, true)).toBe(false)
        expect(resolveInstrumentServer(true, false)).toBe(true)
    })

    it('defaults to SSR on and SPA off when unset', () => {
        expect(resolveInstrumentServer(undefined, true)).toBe(true)
        expect(resolveInstrumentServer(undefined, false)).toBe(false)
    })

    it('uses env when the option is omitted', () => {
        process.env.OBSERVATORY_INSTRUMENT_SERVER = 'false'

        expect(resolveInstrumentServer(undefined, true)).toBe(false)
    })
})
