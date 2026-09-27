/**
 * Per-request SSR / Nitro trace collector.
 *
 * Each incoming request gets its own record keyed by a unique requestId
 * (stored on H3 `event.context`). Spans are accumulated during the request
 * lifecycle. Document HTML requests inject a snapshot via `render:html`;
 * every request is archived when `drainSsrRecord` runs so API routes still
 * reach the Trace Viewer.
 */

export interface ISsrSpan {
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

export interface ISsrTraceRecord {
    traceId: string
    name: string
    spans: ISsrSpan[]
}

interface IPendingSsrRecord extends ISsrTraceRecord {
    method: string
    route: string
    isDocument: boolean
}

const pending = new Map<string, IPendingSsrRecord>()
const archive: ISsrTraceRecord[] = []

const DEFAULT_ARCHIVE_CAP = 50
let archiveCap = DEFAULT_ARCHIVE_CAP

let _counter = 0

function newId(prefix: string): string {
    _counter = (_counter + 1) % 999_999

    return `${prefix}_ssr_${Date.now()}_${_counter}`
}

function cloneSpan(span: ISsrSpan): ISsrSpan {
    return {
        id: span.id,
        name: span.name,
        type: span.type,
        startTime: span.startTime,
        endTime: span.endTime,
        durationMs: span.durationMs,
        status: span.status,
        metadata: span.metadata ? { ...span.metadata } : undefined,
    }
}

function toPublicRecord(record: IPendingSsrRecord): ISsrTraceRecord {
    return {
        traceId: record.traceId,
        name: record.name,
        spans: record.spans.map(cloneSpan),
    }
}

function finalizeRecordName(record: IPendingSsrRecord): void {
    if (record.isDocument) {
        record.name = `ssr:${record.route}`

        return
    }

    record.name = `nitro:${record.method} ${record.route}`
}

function closeNavigationSpan(record: IPendingSsrRecord, durationMs: number): void {
    const navSpan = record.spans[0]

    if (!navSpan) {
        return
    }

    navSpan.endTime = durationMs
    navSpan.durationMs = durationMs

    if (navSpan.status === 'active') {
        navSpan.status = 'ok'
    }
}

function pushArchive(record: ISsrTraceRecord): void {
    archive.push(record)

    while (archive.length > archiveCap) {
        archive.shift()
    }
}

/**
 * Cap the completed-request archive. Reuses the same bound as client
 * `maxTraces` (default 50). Oldest records are dropped first.
 * @param {number} max - Maximum archived records to retain.
 */
export function setSsrArchiveCap(max: number): void {
    archiveCap = Math.max(1, max)

    while (archive.length > archiveCap) {
        archive.shift()
    }
}

/**
 * Return clones of archived Nitro/SSR records (no request bodies, cookies, or headers).
 * @returns {ISsrTraceRecord[]} Archived records, oldest first.
 */
export function getArchivedSsrRecords(): ISsrTraceRecord[] {
    return archive.map((record) => ({
        traceId: record.traceId,
        name: record.name,
        spans: record.spans.map(cloneSpan),
    }))
}

/**
 * Drop all archived records. Used by unit tests.
 */
export function clearSsrArchive(): void {
    archive.length = 0
}

/**
 * Open a new per-request SSR record. A `navigation` span covering the full
 * request is pre-populated; its end time is filled in when `drainSsrRecord`
 * is called.
 * @param {string} requestId - Unique identifier for the HTTP request, stored in `event.context`.
 * @param {string} route - Request pathname (e.g. `/dashboard`).
 * @param {string} method - HTTP method in upper-case (e.g. `GET`).
 * @returns {ISsrTraceRecord} The newly created `ISsrTraceRecord` keyed by `requestId`.
 */
export function createSsrRecord(requestId: string, route: string, method: string): ISsrTraceRecord {
    const record: IPendingSsrRecord = {
        traceId: newId('trace'),
        name: `ssr:${route}`,
        method,
        route,
        isDocument: false,
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
 * Mark the pending record as a document HTML response so its trace keeps the
 * `ssr:<path>` name instead of `nitro:<method> <path>`.
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 */
export function markSsrRecordDocument(requestId: string): void {
    const record = pending.get(requestId)

    if (!record) {
        return
    }

    record.isDocument = true
}

/**
 * Mark the navigation span as `error` (Nitro `error` hook).
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 */
export function markSsrRecordError(requestId: string): void {
    const record = pending.get(requestId)

    if (!record) {
        return
    }

    const navSpan = record.spans[0]

    if (navSpan) {
        navSpan.status = 'error'
    }
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
 * Clone the pending record with the navigation span closed, without removing
 * it from the pending map. Used to inject HTML JSON before `afterResponse`
 * drains and archives the full record.
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 * @param {number} durationMs - Duration used to close the navigation span in the snapshot.
 * @returns {ISsrTraceRecord | undefined} A cloned record, or `undefined` if unknown.
 */
export function snapshotSsrRecord(requestId: string, durationMs: number): ISsrTraceRecord | undefined {
    const record = pending.get(requestId)

    if (!record) {
        return undefined
    }

    closeNavigationSpan(record, durationMs)
    finalizeRecordName(record)

    return toPublicRecord(record)
}

/**
 * Finalize and remove the record for `requestId`. The pre-populated
 * navigation span is closed with `durationMs`. A clone is archived (capped).
 * Returns `undefined` if the requestId is unknown.
 * @param {string} requestId - The request identifier returned by `createSsrRecord`.
 * @param {number} durationMs - Total SSR request duration in milliseconds, used to close the navigation span.
 * @returns {ISsrTraceRecord | undefined} The completed `ISsrTraceRecord`, or `undefined` if no record exists for `requestId`.
 */
export function drainSsrRecord(requestId: string, durationMs: number): ISsrTraceRecord | undefined {
    const record = pending.get(requestId)

    pending.delete(requestId)

    if (!record) {
        return undefined
    }

    closeNavigationSpan(record, durationMs)
    finalizeRecordName(record)

    const publicRecord = toPublicRecord(record)
    pushArchive(publicRecord)

    return publicRecord
}
