// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupFetchRegistry, __devFetchCall, __devFetchHandler } from '@observatory/runtime/composables/fetch-registry'

type DevFetchCallFn = Parameters<typeof __devFetchCall>[0]
type DevFetchOptions = Parameters<typeof __devFetchCall>[2]

// __devFetchCall uses getCurrentInstance() to decide whether to take the main
// instrumentation path (inside component setup) or the parallel-fetch fallback.
// In vitest there is no Vue component context, so we always return a fake instance
// to exercise the real instrumentation code paths.
vi.mock('vue', async () => {
    const vue = await vi.importActual<typeof import('vue')>('vue')

    return { ...vue, getCurrentInstance: vi.fn(() => ({})) }
})

type ObservatoryWindow = Window & { __observatory__?: { fetch?: ReturnType<typeof setupFetchRegistry> } }

function getWindow() {
    return window as ObservatoryWindow
}

beforeEach(() => {
    delete getWindow().__observatory__
    delete (getWindow() as Window & { __NUXT__?: unknown }).__NUXT__
})

afterEach(() => {
    delete getWindow().__observatory__
    delete (getWindow() as Window & { __NUXT__?: unknown }).__NUXT__
    vi.restoreAllMocks()
})

describe('setupFetchRegistry', () => {
    it('returns register, update, getAll, clear, and entries', () => {
        const registry = setupFetchRegistry()

        expect(typeof registry.register).toBe('function')
        expect(typeof registry.update).toBe('function')
        expect(typeof registry.getAll).toBe('function')
        expect(typeof registry.clear).toBe('function')
        expect(registry.entries).toBeDefined()
    })

    it('register() adds an entry and getAll() returns it', () => {
        const { register, getAll } = setupFetchRegistry()

        register({
            id: 'test-1',
            key: 'users',
            url: '/api/users',
            status: 'pending',
            origin: 'csr',
            startTime: 0,
            cached: false,
        })
        const all = getAll()

        expect(all).toHaveLength(1)
        expect(all[0].id).toBe('test-1')
        expect(all[0].status).toBe('pending')
    })

    it('update() merges fields onto an existing entry', () => {
        const { register, update, getAll } = setupFetchRegistry()

        register({ id: 'test-1', key: 'users', url: '/api/users', status: 'pending', origin: 'csr', startTime: 0, cached: false })
        update('test-1', { status: 'ok', ms: 42, cached: false })

        expect(getAll()[0].status).toBe('ok')
        expect(getAll()[0].ms).toBe(42)
    })

    it('update() is a no-op for an unknown id', () => {
        const { update, getAll } = setupFetchRegistry()

        expect(() => update('unknown-id', { status: 'ok' })).not.toThrow()
        expect(getAll()).toHaveLength(0)
    })

    it('clear() empties all entries', () => {
        const { register, clear, getAll } = setupFetchRegistry()

        register({ id: 'a', key: 'a', url: '/a', status: 'ok', origin: 'csr', startTime: 0, cached: false })
        register({ id: 'b', key: 'b', url: '/b', status: 'ok', origin: 'csr', startTime: 0, cached: false })
        clear()

        expect(getAll()).toHaveLength(0)
    })

    it('getAll() returns an array snapshot, not the live map', () => {
        const { register, getAll } = setupFetchRegistry()

        register({ id: 'a', key: 'a', url: '/a', status: 'ok', origin: 'csr', startTime: 0, cached: false })

        const snapshot = getAll()

        register({ id: 'b', key: 'b', url: '/b', status: 'ok', origin: 'csr', startTime: 0, cached: false })

        // snapshot captured before second register should still have only 1 entry
        expect(snapshot).toHaveLength(1)
    })

    it('entries is readonly — direct reassignment is silently rejected', () => {
        const { register, entries } = setupFetchRegistry()
        register({ id: 'a', key: 'a', url: '/a', status: 'ok', origin: 'csr', startTime: 0, cached: false })

        try {
            // @ts-expect-error — Vue readonly proxy rejects mutations (warns in dev, does not throw)
            entries.value = new Map()
        } catch {
            // may throw in some environments
        }

        // The internal map still has the one registered entry
        // entries is a Vue readonly proxy of a Map — access via .size directly, not .value
        expect(entries.size).toBe(1)
    })
})

describe('__devFetchCall', () => {
    it('registers a pending entry immediately when called', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        const mockFn = vi.fn<DevFetchCallFn>().mockReturnValue({})
        __devFetchCall(mockFn, '/api/users', {}, { key: 'users', file: 'Page.ts', line: 1 })

        const entries = registry.getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].status).toBe('pending')
        expect(entries[0].url).toBe('/api/users')
        expect(entries[0].key).toBe('users')
        expect(entries[0].origin).toBe('csr')
    })

    it('passes through to originalFn when __observatory__ is not set', () => {
        const mockFn = vi.fn<DevFetchCallFn>().mockReturnValue({ status: { value: 'success' }, data: { value: 'result' } })
        const result = __devFetchCall(mockFn, '/api/test', {}, { key: 'test', file: 'F.ts', line: 1 })

        expect(mockFn).toHaveBeenCalledWith('/api/test', expect.any(Object))
        expect(result).toBeDefined()
    })

    it('injects onResponse hook that updates entry to ok with timing', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}
        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return {}
        })

        __devFetchCall(mockFn as DevFetchCallFn, '/api/users', {}, { key: 'users', file: 'P.ts', line: 1 })

        const mockResponse = {
            ok: true,
            headers: { get: (h: string) => (h === 'content-length' ? '1024' : null) },
        }
        ;(capturedOpts.onResponse as (ctx: unknown) => void)({ response: mockResponse })

        const entry = registry.getAll()[0]

        expect(entry.status).toBe('ok')
        expect(entry.ms).toBeGreaterThanOrEqual(0)
        expect(entry.size).toBe(1024)
        expect(entry.cached).toBe(false)
    })

    it('captures the response payload when ofetch exposes response._data', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}

        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return {}
        })

        __devFetchCall(mockFn as DevFetchCallFn, '/api/users', {}, { key: 'users', file: 'P.ts', line: 1 })
        ;(capturedOpts.onResponse as (ctx: unknown) => void)({
            response: {
                ok: true,
                _data: { user: 'ada' },
                headers: { get: () => null },
            },
        })

        expect(registry.getAll()[0].payload).toEqual({ user: 'ada' })
    })

    it('marks payload-backed entries as cached SSR entries immediately', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }
        // Simulate Nuxt SSR hydration: useFetch returns a reactive AsyncData object
        // synchronously with status.value === 'success'. Must use mockReturnValue (not
        // mockResolvedValue) because result.status.value is inspected synchronously.
        const mockFn = vi.fn().mockReturnValue({ status: { value: 'success' }, data: { value: [{ id: 1 }] } })
        __devFetchCall(mockFn, '/api/users', {}, { key: 'users', file: 'Page.ts', line: 1 })

        const [entry] = registry.getAll()

        expect(entry.status).toBe('cached')
        expect(entry.origin).toBe('ssr')
        expect(entry.cached).toBe(true)
        expect(entry.payload).toEqual([{ id: 1 }])
    })

    it('sets cached: true when the x-nuxt-cache response header is HIT', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}

        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return {}
        })

        __devFetchCall(mockFn as DevFetchCallFn, '/api/product', {}, { key: 'product', file: 'P.ts', line: 5 })

        const mockResponse = {
            ok: true,
            headers: { get: (h: string) => (h === 'x-nuxt-cache' ? 'HIT' : null) },
        }
        ;(capturedOpts.onResponse as (ctx: unknown) => void)({ response: mockResponse })

        expect(registry.getAll()[0].cached).toBe(true)
    })

    it('injects onResponseError hook that updates entry status to error', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}

        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return {}
        })

        __devFetchCall(mockFn as DevFetchCallFn, '/api/broken', {}, { key: 'broken', file: 'P.ts', line: 2 })

        const mockResponse = { ok: false, headers: { get: () => null } }
        ;(capturedOpts.onResponseError as (ctx: unknown) => void)({ response: mockResponse })

        expect(registry.getAll()[0].status).toBe('error')
        expect(registry.getAll()[0].ms).toBeGreaterThanOrEqual(0)
    })

    it('chains pre-existing onResponse hook from original opts', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        const originalOnResponse = vi.fn()

        let capturedOpts: Record<string, unknown> = {}

        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return {}
        })

        __devFetchCall(mockFn as DevFetchCallFn, '/api/users', { onResponse: originalOnResponse }, { key: 'users', file: 'P.ts', line: 1 })

        const ctx = { response: { ok: true, headers: { get: () => null } } }
        ;(capturedOpts.onResponse as (ctx: unknown) => void)(ctx)

        expect(originalOnResponse).toHaveBeenCalledWith(ctx)
    })
})

describe('__devFetchHandler', () => {
    it('wraps an async-data handler and records the resolved payload', async () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }
        const wrapped = __devFetchHandler(() => ({ ok: true }), 'users', { key: 'users', file: 'Page.ts', line: 3 })

        await expect(wrapped()).resolves.toEqual({ ok: true })

        const [entry] = registry.getAll()

        expect(entry.key).toBe('users')
        expect(entry.status).toBe('ok')
        expect(entry.payload).toEqual({ ok: true })
    })

    it('passes through without registry in client dev mode', async () => {
        const handler = vi.fn().mockResolvedValue('value')
        const wrapped = __devFetchHandler(handler, 'users', { key: 'users', file: 'Page.ts', line: 3 })

        await expect(wrapped('arg')).resolves.toBe('value')
        expect(handler).toHaveBeenCalledWith('arg')
    })
})

// ── Tests for fixes introduced in the bug-fix pass ────────────────────────

describe('__devFetchCall — Ref/computed URL resolution (fix #17)', () => {
    it('resolves a Vue ref URL to its .value string', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        const mockFn = vi.fn().mockResolvedValue({})
        const refUrl = { value: '/api/from-ref' } // simulate Ref<string>

        __devFetchCall(mockFn as never, refUrl as unknown as string, {}, { key: 'ref-url', file: 'Page.ts', line: 1 })

        expect(registry.getAll()[0].url).toBe('/api/from-ref')
    })

    it('resolves a getter function URL to its return value', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        const mockFn = vi.fn().mockResolvedValue({})
        const getter = () => '/api/from-getter'

        __devFetchCall(mockFn as never, getter as unknown as string, {}, { key: 'getter-url', file: 'Page.ts', line: 1 })

        expect(registry.getAll()[0].url).toBe('/api/from-getter')
    })

    it('falls back to String() for an unrecognised url shape instead of [object Object]', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        const mockFn = vi.fn().mockResolvedValue({})
        // An object with no .value property and no call signature
        const weirdUrl = { toString: () => '/api/weird' }

        __devFetchCall(mockFn as never, weirdUrl as unknown as string, {}, { key: 'weird-url', file: 'Page.ts', line: 1 })

        // Should not be '[object Object]'
        expect(registry.getAll()[0].url).not.toBe('[object Object]')
    })
})

describe('__devFetchCall — SSR cached entries still attach hooks (fix #4)', () => {
    it('attaches onResponse to SSR-cached entries so re-fetches update the registry payload', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}

        // Simulate Nuxt SSR hydration returning synchronously (useReturnValue, not mockResolvedValue).
        const mockFn = vi.fn().mockImplementation((_url: unknown, opts: Record<string, unknown>) => {
            capturedOpts = opts

            return { status: { value: 'success' }, data: { value: [{ id: 1 }] } }
        })

        __devFetchCall(mockFn as never, '/api/users', {}, { key: 'users', file: 'Page.ts', line: 1 })

        // onResponse must be present even for SSR-cached entries
        expect(typeof capturedOpts.onResponse).toBe('function')

        // Simulate a subsequent client-side fetch completing with fresh data
        ;(capturedOpts.onResponse as (ctx: unknown) => void)({
            response: { ok: true, headers: { get: () => null }, _data: [{ id: 2 }] },
        })

        const all = registry.getAll()

        // The original SSR entry is preserved unchanged
        expect(all[0].status).toBe('cached')
        expect(all[0].payload).toEqual([{ id: 1 }])
        // Re-fetch data appears as a new row (refresh entry)
        expect(all[1].payload).toEqual([{ id: 2 }])
    })

    it('SSR-cached entries expose the original SSR payload before any re-fetch', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        // Simulate Nuxt SSR hydration returning synchronously.
        const mockFn = vi.fn().mockReturnValue({ status: { value: 'success' }, data: { value: [{ id: 1 }] } })
        __devFetchCall(mockFn as never, '/api/users', {}, { key: 'users', file: 'Page.ts', line: 1 })

        const entry = registry.getAll()[0]

        expect(entry.status).toBe('cached')
        expect(entry.payload).toEqual([{ id: 1 }])
    })
})

describe('__devFetchHandler — error path coverage', () => {
    it('updates entry to error status when the handler rejects', async () => {
        const reg = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: reg }

        const handler = __devFetchHandler(
            async () => {
                throw new Error('network failure')
            },
            'fail-1',
            { key: 'fail-1', file: 'test.ts', line: 1 }
        )

        await expect(handler()).rejects.toThrow('network failure')

        const entry = reg.getAll()[0]

        expect(entry.status).toBe('error')
        expect(entry.ms).toBeGreaterThanOrEqual(0)
    })
})

describe('__devFetchCall — pre-existing onResponseError hook is chained', () => {
    it('calls user-provided onResponseError before the registry hook', async () => {
        const reg = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: reg }

        const calls: string[] = []
        const userHook = () => {
            calls.push('user')
        }

        let capturedOpts: DevFetchOptions = {}

        const originalFn: DevFetchCallFn = (_url, opts) => {
            capturedOpts = opts

            return {}
        }

        __devFetchCall(originalFn, '/api/test', { onResponseError: userHook }, { key: 'k', file: 'f.ts', line: 1 })

        // Invoke the chained hook
        const response = { response: {} as unknown as Response } as Parameters<NonNullable<DevFetchOptions['onResponseError']>>[0]

        if (typeof capturedOpts.onResponseError === 'function') {
            capturedOpts.onResponseError(response)
        }

        expect(calls).toContain('user')
    })
})

describe('__devFetchCall — getter URL resolution (line 171)', () => {
    it('resolves a function URL by calling it', () => {
        const reg = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: reg }

        // Pass a function as the URL — resolveUrl calls it to get the string
        const urlFn = () => '/api/from-fn'

        __devFetchCall((() => ({ ok: true })) as DevFetchCallFn, urlFn as unknown as string, {}, { key: 'k', file: 'f.ts', line: 1 })

        expect(reg.getAll()[0].url).toBe('/api/from-fn')
    })

    it('falls back to String(fn) when the URL function throws', () => {
        const reg = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: reg }

        // A function that throws — resolveUrl catches and falls back to String(raw)
        const throwingFn = () => {
            throw new Error('bad url getter')
        }

        __devFetchCall((() => ({ ok: true })) as DevFetchCallFn, throwingFn as unknown as string, {}, { key: 'k', file: 'f.ts', line: 1 })

        // Should not throw; entry registered with String(throwingFn) as fallback URL
        expect(reg.getAll()[0]).toBeDefined()
        expect(typeof reg.getAll()[0].url).toBe('string')
    })
})
