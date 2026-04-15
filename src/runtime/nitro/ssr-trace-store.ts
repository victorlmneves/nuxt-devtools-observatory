/**
 * Per-request SSR trace collector.
 *
 * Each incoming SSR page request gets its own record keyed by a unique
 * requestId (stored on H3 `event.context`). Spans are accumulated during the
 * request lifecycle and drained once the HTML is rendered (via the
 * `render:html` Nitro hook), so they can be injected into the page as inline
 * JSON for the client plugin to pick up.
 */

export interface SsrSpan {
    id: string
    name: string
    type: string
    /** Milliseconds relative to request start (0 = request began). */
    startTime: number
    endTime?: number
    durationMs?: number
    status: 'ok' | 'error' | 'active'
    metadata?: Record<string, unknown>
}

export interface SsrTraceRecord {
    traceId: string
    name: string
    spans: SsrSpan[]
}

const pending = new Map<string, SsrTraceRecord>()

let _counter = 0

function newId(prefix: string): string {
    _counter = (_counter + 1) % 999_999

    return `${prefix}_ssr_${Date.now()}_${_counter}`
}

/**
 * Open a new per-request SSR record. A `navigation` span covering the full
 * request is pre-populated; its end time is filled in when `drainSsrRecord`
 * is called.
 * @param {string} requestId - Unique identifier for the HTTP request, stored in `event.context`.
 * @param {string} route - Request pathname (e.g. `/dashboard`).
 * @param {string} method - HTTP method in upper-case (e.g. `GET`).
 * @returns {SsrTraceRecord} The newly created `SsrTraceRecord` keyed by `requestId`.
 */
export function createSsrRecord(requestId: string, route: string, method: string): SsrTraceRecord {
    const record: SsrTraceRecord = {
        traceId: newId('trace'),
        name: `ssr:${route}`,
        spans: [
            {
                id: newId('span'),
                name: 'ssr:navigation',
                type: 'navigation',
                startTime: 0,
                status: 'active',
                metadata: {
                    origin: 'ssr',
                    route,
                    method,
                },
            },
        ],
    }

    pending.set(requestId, record)

    return record
}

/**
 * Append an SSR-side fetch span. `startMs` / `endMs` are milliseconds
 * relative to request start (same origin as `createSsrRecord`).
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 * @param {object} opts - Span options.
 * @param {string} opts.url - The request URL or path that was fetched.
 * @param {string} opts.method - HTTP method in upper-case (e.g. `GET`).
 * @param {number} opts.startMs - Span start, in ms relative to the request start time.
 * @param {number} opts.endMs - Span end, in ms relative to the request start time.
 * @param {number} [opts.statusCode] - Optional HTTP response status code.
 * @param {boolean} [opts.error] - Set to `true` to mark the span status as `error`.
 */
export function addSsrFetchSpan(
    requestId: string,
    opts: {
        url: string
        method: string
        startMs: number
        endMs: number
        statusCode?: number
        error?: boolean
    }
): void {
    const record = pending.get(requestId)

    if (!record) {
        return
    }

    const durationMs = Math.max(opts.endMs - opts.startMs, 0)

    record.spans.push({
        id: newId('span'),
        name: opts.url,
        type: 'fetch',
        startTime: opts.startMs,
        endTime: opts.endMs,
        durationMs,
        status: opts.error ? 'error' : 'ok',
        metadata: {
            origin: 'ssr',
            url: opts.url,
            method: opts.method,
            statusCode: opts.statusCode,
        },
    })
}

/**
 * Append a generic SSR phase span (e.g. `render:html`, `afterResponse`) to
 * an existing request record.
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 * @param {object} opts - Span options.
 * @param {string} opts.name - Human-readable span name.
 * @param {string} [opts.type] - Span type. Defaults to `server`.
 * @param {number} opts.startMs - Span start, in ms relative to request start.
 * @param {number} opts.endMs - Span end, in ms relative to request start.
 * @param {boolean} [opts.error] - Set to `true` to mark the span status as `error`.
 * @param {Record<string, unknown>} [opts.metadata] - Additional metadata fields.
 */
export function addSsrPhaseSpan(
    requestId: string,
    opts: {
        name: string
        type?: string
        startMs: number
        endMs: number
        error?: boolean
        metadata?: Record<string, unknown>
    }
): void {
    const record = pending.get(requestId)

    if (!record) {
        return
    }

    const durationMs = Math.max(opts.endMs - opts.startMs, 0)

    record.spans.push({
        id: newId('span'),
        name: opts.name,
        type: opts.type ?? 'server',
        startTime: opts.startMs,
        endTime: opts.endMs,
        durationMs,
        status: opts.error ? 'error' : 'ok',
        metadata: {
            origin: 'ssr',
            ...(opts.metadata ?? {}),
        },
    })
}

/**
 * Finalize and remove the record for `requestId`. The pre-populated
 * navigation span is closed with `durationMs`. Returns `undefined` if the
 * requestId is unknown (e.g. non-page requests that never called
 * `createSsrRecord`).
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 * @param {number} durationMs - Total SSR request duration in milliseconds, used to close the navigation span.
 * @returns {SsrTraceRecord | undefined} The completed `SsrTraceRecord`, or `undefined` if no record exists for `requestId`.
 */
export function drainSsrRecord(requestId: string, durationMs: number): SsrTraceRecord | undefined {
    const record = pending.get(requestId)

    pending.delete(requestId)

    if (!record) {
        return undefined
    }

    const navSpan = record.spans[0]

    if (navSpan) {
        navSpan.endTime = durationMs
        navSpan.durationMs = durationMs
        navSpan.status = 'ok'
    }

    return record
}
