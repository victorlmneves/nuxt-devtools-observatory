import { describe, it, expect } from 'vitest'
import { collectPayloadKeys, setupPayloadRegistry } from '@observatory/runtime/composables/payload-registry'

describe('collectPayloadKeys', () => {
    it('measures useNuxtData and useState buckets', () => {
        const keys = collectPayloadKeys({
            serverRendered: true,
            data: { products: [{ id: 1 }, { id: 2 }] },
            state: { theme: 'dark' },
        })

        expect(keys.some((entry) => entry.bucket === 'data' && entry.key === 'products')).toBe(true)
        expect(keys.some((entry) => entry.bucket === 'state' && entry.key === 'theme')).toBe(true)
        expect(keys.find((entry) => entry.key === 'products')?.bytes).toBeGreaterThan(0)
    })

    it('sorts keys by serialized size descending', () => {
        const keys = collectPayloadKeys({
            data: {
                tiny: 1,
                large: { items: Array.from({ length: 20 }, (_, i) => ({ i, label: 'x'.repeat(8) })) },
            },
        })

        expect(keys[0].key).toBe('large')
        expect(keys[0].bytes).toBeGreaterThan(keys[1].bytes)
    })
})

describe('setupPayloadRegistry', () => {
    it('marks keys present during hydration as ssr origin', () => {
        const payload = {
            serverRendered: true,
            data: { products: [1] },
        }
        let hydrating = true
        const registry = setupPayloadRegistry({
            getPayload: () => payload,
            isHydrating: () => hydrating,
        })

        expect(registry.getAll()[0].origin).toBe('ssr')
        expect(registry.getSnapshot().serverRendered).toBe(true)

        hydrating = false
        ;(payload.data as Record<string, unknown>).clientOnly = { ok: true }
        registry.capture()

        const origins = Object.fromEntries(registry.getAll().map((entry) => [entry.key, entry.origin]))

        expect(origins.products).toBe('ssr')
        expect(origins.clientOnly).toBe('csr')
    })

    it('treats SPA payloads without serverRendered as csr', () => {
        const registry = setupPayloadRegistry({
            getPayload: () => ({ data: { live: true } }),
            isHydrating: () => false,
        })

        expect(registry.getAll()[0].origin).toBe('csr')
        expect(registry.getSnapshot().serverRendered).toBe(false)
    })
})
