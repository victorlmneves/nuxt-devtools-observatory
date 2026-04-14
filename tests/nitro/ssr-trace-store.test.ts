import { describe, it, expect } from 'vitest'
import {
    createSsrRecord,
    addSsrFetchSpan,
    drainSsrRecord,
} from '@observatory/runtime/nitro/ssr-trace-store'

// Each test uses a unique requestId so module-level `pending` Map state does
// not bleed between tests even if a record is never drained.
let idCounter = 0
function uniqueId() {
    return `test-req-${++idCounter}`
}

describe('createSsrRecord', () => {
    it('returns a record with the correct name based on route', () => {
        const id = uniqueId()
        const record = createSsrRecord(id, '/dashboard', 'GET')

        expect(record.name).toBe('ssr:/dashboard')
    })

    it('returns a record with a non-empty traceId', () => {
        const id = uniqueId()
        const record = createSsrRecord(id, '/home', 'GET')

        expect(record.traceId).toBeTruthy()
        expect(typeof record.traceId).toBe('string')
    })

    it('pre-populates a single ssr:navigation span', () => {
        const id = uniqueId()
        const record = createSsrRecord(id, '/home', 'POST')

        expect(record.spans).toHaveLength(1)
        expect(record.spans[0].name).toBe('ssr:navigation')
        expect(record.spans[0].type).toBe('navigation')
        expect(record.spans[0].status).toBe('active')
        expect(record.spans[0].startTime).toBe(0)
    })

    it('stores route and method in the navigation span metadata', () => {
        const id = uniqueId()
        const record = createSsrRecord(id, '/products', 'GET')

        expect(record.spans[0].metadata).toMatchObject({
            origin: 'ssr',
            route: '/products',
            method: 'GET',
        })
    })

    it('makes the record retrievable by drainSsrRecord', () => {
        const id = uniqueId()
        createSsrRecord(id, '/test', 'GET')
        const drained = drainSsrRecord(id, 100)

        expect(drained).toBeDefined()
    })
})

describe('addSsrFetchSpan', () => {
    it('appends a fetch span to an existing record', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/data', method: 'GET', startMs: 10, endMs: 50 })

        const record = drainSsrRecord(id, 100)

        expect(record?.spans).toHaveLength(2)

        const fetchSpan = record?.spans[1]

        expect(fetchSpan?.type).toBe('fetch')
        expect(fetchSpan?.name).toBe('/api/data')
    })

    it('sets correct startTime, endTime, and durationMs on the span', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/users', method: 'POST', startMs: 20, endMs: 80 })

        const record = drainSsrRecord(id, 200)
        const span = record?.spans[1]

        expect(span?.startTime).toBe(20)
        expect(span?.endTime).toBe(80)
        expect(span?.durationMs).toBe(60)
    })

    it('sets status ok when error flag is not set', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/ok', method: 'GET', startMs: 0, endMs: 30 })

        const record = drainSsrRecord(id, 100)

        expect(record?.spans[1]?.status).toBe('ok')
    })

    it('sets status error when error flag is true', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/fail', method: 'GET', startMs: 0, endMs: 30, error: true })

        const record = drainSsrRecord(id, 100)

        expect(record?.spans[1]?.status).toBe('error')
    })

    it('stores statusCode in span metadata when provided', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/data', method: 'GET', startMs: 0, endMs: 20, statusCode: 201 })

        const record = drainSsrRecord(id, 100)

        expect(record?.spans[1]?.metadata?.statusCode).toBe(201)
    })

    it('is a no-op for an unknown requestId', () => {
        expect(() => {
            addSsrFetchSpan('unknown-request-id', { url: '/api/x', method: 'GET', startMs: 0, endMs: 10 })
        }).not.toThrow()
    })

    it('durationMs is 0 when endMs is before startMs', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/data', method: 'GET', startMs: 100, endMs: 50 })

        const record = drainSsrRecord(id, 200)

        expect(record?.spans[1]?.durationMs).toBe(0)
    })
})

describe('drainSsrRecord', () => {
    it('closes the navigation span with endTime equal to durationMs', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        const record = drainSsrRecord(id, 350)
        const navSpan = record?.spans[0]

        expect(navSpan?.endTime).toBe(350)
        expect(navSpan?.durationMs).toBe(350)
        expect(navSpan?.status).toBe('ok')
    })

    it('removes the record from the pending map — second call returns undefined', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        drainSsrRecord(id, 100)

        expect(drainSsrRecord(id, 100)).toBeUndefined()
    })

    it('returns undefined for an unknown requestId', () => {
        expect(drainSsrRecord('totally-unknown', 100)).toBeUndefined()
    })

    it('returns all previously added fetch spans alongside the navigation span', () => {
        const id = uniqueId()
        createSsrRecord(id, '/page', 'GET')
        addSsrFetchSpan(id, { url: '/api/a', method: 'GET', startMs: 5, endMs: 20 })
        addSsrFetchSpan(id, { url: '/api/b', method: 'POST', startMs: 25, endMs: 40 })
        const record = drainSsrRecord(id, 100)

        expect(record?.spans).toHaveLength(3)
    })
})
