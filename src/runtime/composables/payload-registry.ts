import type { TPayloadBucket, IPayloadInspectorSnapshot, IPayloadKeyEntry } from '../../types/snapshot'

const MAX_PREVIEW_BYTES = 2_000

function byteLength(value: unknown): number {
    if (value === undefined) {
        return 0
    }

    try {
        return JSON.stringify(value)?.length ?? 0
    } catch {
        return 0
    }
}

function previewOf(value: unknown): unknown {
    if (value === undefined || value === null) {
        return value
    }

    try {
        const str = JSON.stringify(value)

        if (str.length <= MAX_PREVIEW_BYTES) {
            return JSON.parse(str)
        }

        return str.slice(0, MAX_PREVIEW_BYTES) + '… (truncated)'
    } catch {
        return '[unserializable]'
    }
}

function walkRecord(record: unknown, bucket: TPayloadBucket): IPayloadKeyEntry[] {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return []
    }

    return Object.entries(record as Record<string, unknown>).map(([key, value]) => ({
        id: `${bucket}:${key}`,
        bucket,
        key,
        bytes: byteLength(value),
        origin: 'csr' as const,
        preview: previewOf(value),
    }))
}

export function collectPayloadKeys(payload: unknown): IPayloadKeyEntry[] {
    if (!payload || typeof payload !== 'object') {
        return []
    }

    const root = payload as Record<string, unknown>
    const keys: IPayloadKeyEntry[] = [
        ...walkRecord(root.data, 'data'),
        ...walkRecord(root.state, 'state'),
        ...walkRecord(root.pinia, 'pinia'),
        ...walkRecord(root._errors, 'error'),
    ]

    const skip = new Set(['data', 'state', 'pinia', '_errors', 'serverRendered', 'prerenderedAt'])

    for (const [key, value] of Object.entries(root)) {
        if (skip.has(key) || typeof value === 'function') {
            continue
        }

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            keys.push(
                ...walkRecord(value, 'other').map((entry) => ({ ...entry, key: `${key}.${entry.key}`, id: `other:${key}.${entry.key}` }))
            )
            continue
        }

        keys.push({
            id: `other:${key}`,
            bucket: 'other',
            key,
            bytes: byteLength(value),
            origin: 'csr',
            preview: previewOf(value),
        })
    }

    return keys.sort((a, b) => b.bytes - a.bytes)
}

export function setupPayloadRegistry(options: { getPayload: () => unknown; isHydrating?: () => boolean }) {
    let latest: IPayloadInspectorSnapshot = {
        capturedAt: 0,
        isHydrating: false,
        serverRendered: false,
        keyCount: 0,
        totalBytes: 0,
        keys: [],
    }
    const ssrKeyIds = new Set<string>()
    let hydrationCaptured = false

    function capture(): IPayloadInspectorSnapshot {
        const payload = options.getPayload()
        const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
        const serverRendered = root.serverRendered === true
        const isHydrating = options.isHydrating?.() === true
        const keys = collectPayloadKeys(payload)

        if (!hydrationCaptured) {
            if (isHydrating || serverRendered) {
                for (const entry of keys) {
                    ssrKeyIds.add(entry.id)
                }
            }

            hydrationCaptured = true
        }

        const annotated = keys.map((entry) => ({
            ...entry,
            origin: ssrKeyIds.has(entry.id) ? ('ssr' as const) : ('csr' as const),
        }))

        latest = {
            capturedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
            isHydrating,
            serverRendered,
            keyCount: annotated.length,
            totalBytes: annotated.reduce((sum, entry) => sum + entry.bytes, 0),
            keys: annotated,
        }

        return latest
    }

    function getSnapshot(): IPayloadInspectorSnapshot {
        return latest
    }

    function getAll(): IPayloadKeyEntry[] {
        return latest.keys
    }

    capture()

    return { capture, getSnapshot, getAll }
}
