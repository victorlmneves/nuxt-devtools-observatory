// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setupFetchRegistry, __devFetch } from '../../src/runtime/composables/fetch-registry'

type ObservatoryWindow = Window & { __observatory__?: { fetch?: ReturnType<typeof setupFetchRegistry> } }

function getWindow() {
    return window as ObservatoryWindow
}

beforeEach(() => {
    delete getWindow().__observatory__
})

afterEach(() => {
    delete getWindow().__observatory__
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
        expect(entries.value.size).toBe(1)
    })
})

describe('__devFetch', () => {
    it('registers a pending entry immediately when called', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        const mockFn = vi.fn<(url: string, opts: Record<string, unknown>) => Promise<unknown>>().mockResolvedValue({})
        __devFetch(mockFn, '/api/users', {}, { key: 'users', file: 'Page.ts', line: 1 })

        const entries = registry.getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].status).toBe('pending')
        expect(entries[0].url).toBe('/api/users')
        expect(entries[0].key).toBe('users')
        expect(entries[0].origin).toBe('csr')
    })

    it('passes through to originalFn when __observatory__ is not set', () => {
        const mockFn = vi.fn().mockResolvedValue('result') as (url: string, opts: Record<string, unknown>) => Promise<unknown>
        const result = __devFetch(mockFn, '/api/test', {}, { key: 'test', file: 'F.ts', line: 1 })

        expect(mockFn).toHaveBeenCalledWith('/api/test', expect.any(Object))
        expect(result).toBeDefined()
    })

    it('injects onResponse hook that updates entry to ok with timing', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}
        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return Promise.resolve({})
        })

        __devFetch(
            mockFn as (url: string, opts: Record<string, unknown>) => Promise<unknown>,
            '/api/users',
            {},
            { key: 'users', file: 'P.ts', line: 1 }
        )

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

    it('sets cached: true when the x-nuxt-cache response header is HIT', () => {
        const registry = setupFetchRegistry()
        getWindow().__observatory__ = { fetch: registry }

        let capturedOpts: Record<string, unknown> = {}
        const mockFn = vi.fn().mockImplementation((_url, opts) => {
            capturedOpts = opts as Record<string, unknown>

            return Promise.resolve({})
        })

        __devFetch(
            mockFn as (url: string, opts: Record<string, unknown>) => Promise<unknown>,
            '/api/product',
            {},
            { key: 'product', file: 'P.ts', line: 5 }
        )

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

            return Promise.reject(new Error('500'))
        })

        __devFetch(
            mockFn as (url: string, opts: Record<string, unknown>) => Promise<unknown>,
            '/api/broken',
            {},
            { key: 'broken', file: 'P.ts', line: 2 }
        )

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

            return Promise.resolve({})
        })

        __devFetch(
            mockFn as (url: string, opts: Record<string, unknown>) => Promise<unknown>,
            '/api/users',
            { onResponse: originalOnResponse },
            { key: 'users', file: 'P.ts', line: 1 }
        )

        const ctx = { response: { ok: true, headers: { get: () => null } } }
        ;(capturedOpts.onResponse as (ctx: unknown) => void)(ctx)

        expect(originalOnResponse).toHaveBeenCalledWith(ctx)
    })
})
