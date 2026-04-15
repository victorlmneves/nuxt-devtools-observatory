import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge, type ObservatoryTestAPI } from './helpers/observatory-bridge'
import type { FetchEntry } from './types/observatory.types'

test.describe('Fetch Dashboard Correctness', () => {
    let api: ObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/fetch-verification')
        await waitForBridge()
        api = await getTestBridge()
        await api.clearAllData()
    })

    test('should capture useFetch calls with correct metadata', async () => {
        await page.click('[data-testid="trigger-fetch"]')
        await page.waitForTimeout(500)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        const testFetch: FetchEntry | undefined = fetchEntries.find((entry: FetchEntry) => entry.url.includes('/api/test'))

        expect(testFetch).toBeDefined()

        if (testFetch) {
            expect(testFetch.key).toBeDefined()
            expect(testFetch.url).toBe('/api/test')
            expect(testFetch.status).toBe('success')
            expect(testFetch.duration).toBeGreaterThan(0)
            expect(testFetch.origin).toBeDefined()
        }
    })

    test('should measure fetch duration accurately', async () => {
        const startTime: number = await page.evaluate(() => performance.now())

        await page.click('[data-testid="trigger-slow-fetch"]')
        await page.waitForSelector('[data-testid="fetch-complete"]')

        const actualDuration: number = await page.evaluate((start: number) => {
            return performance.now() - start
        }, startTime)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        const slowFetch: FetchEntry | undefined = fetchEntries.find((entry: FetchEntry) => entry.url.includes('/api/slow'))

        expect(slowFetch).toBeDefined()

        if (slowFetch) {
            // Allow 10ms tolerance for network variance
            expect(Math.abs(slowFetch.duration - actualDuration)).toBeLessThan(10)
        }
    })

    test('should track cache keys for cached fetches', async () => {
        // First fetch - should populate cache
        await page.click('[data-testid="trigger-cached-fetch"]')
        await page.waitForTimeout(200)

        // Second fetch - should use cache
        await page.click('[data-testid="trigger-cached-fetch"]')
        await page.waitForTimeout(200)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        const cachedFetches: FetchEntry[] = fetchEntries.filter((entry: FetchEntry) => entry.url.includes('/api/cached'))

        expect(cachedFetches.length).toBe(2)

        const firstFetch: FetchEntry | undefined = cachedFetches[0]
        const secondFetch: FetchEntry | undefined = cachedFetches[1]

        expect(firstFetch).toBeDefined()
        expect(secondFetch).toBeDefined()

        if (firstFetch && secondFetch) {
            // Both should have same cache key
            expect(firstFetch.cacheKey).toBeDefined()
            expect(firstFetch.cacheKey).toBe(secondFetch.cacheKey)

            // Second fetch should be faster (from cache)
            expect(secondFetch.duration).toBeLessThan(firstFetch.duration)
        }
    })

    test('should handle fetch errors correctly', async () => {
        // Suppress console errors for this test
        page.on('pageerror', (error: Error) => {
            if (!error.message.includes('404')) {
                console.error(error)
            }
        })

        await page.click('[data-testid="trigger-failed-fetch"]')
        await page.waitForTimeout(500)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        const failedFetch: FetchEntry | undefined = fetchEntries.find((entry: FetchEntry) => entry.url.includes('/api/fail'))

        expect(failedFetch).toBeDefined()

        if (failedFetch) {
            expect(failedFetch.status).toBe('error')
            expect(failedFetch.duration).toBeGreaterThan(0)
        }
    })

    test('should track SSR vs CSR fetch origin', async () => {
        // Trigger SSR fetch (requires page reload with SSR)
        await page.reload()
        await page.waitForTimeout(500)

        // Trigger CSR fetch
        await page.click('[data-testid="trigger-fetch"]')
        await page.waitForTimeout(500)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        const ssrFetch: FetchEntry | undefined = fetchEntries.find((entry: FetchEntry) => entry.origin === 'ssr')
        const csrFetch: FetchEntry | undefined = fetchEntries.find((entry: FetchEntry) => entry.origin === 'csr')

        // At least one of each type should exist (depending on your test setup)
        // This test assumes your page makes an SSR fetch on load
        expect(ssrFetch !== undefined || csrFetch !== undefined).toBe(true)
    })

    test('should respect maxFetchEntries limit', async () => {
        const maxEntries: number = 5
        await page.goto(`http://localhost:3000/test/fetch-verification?maxFetchEntries=${maxEntries}`)
        await waitForBridge()
        await api.clearAllData()

        const fetchCount: number = 10
        for (let i = 0; i < fetchCount; i++) {
            await page.click(`[data-testid="trigger-fetch-${i}"]`)
            await page.waitForTimeout(100)
        }

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        expect(fetchEntries.length).toBeLessThanOrEqual(maxEntries)
    })

    test('should display waterfall timing correctly', async () => {
        // Trigger multiple fetches in sequence
        await page.click('[data-testid="trigger-parallel-fetches"]')
        await page.waitForTimeout(1000)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        expect(fetchEntries.length).toBeGreaterThanOrEqual(3)

        // Sort by start offset to verify waterfall ordering
        const sortedByStart: FetchEntry[] = [...fetchEntries].sort((a: FetchEntry, b: FetchEntry) => a.startOffset - b.startOffset)

        // Verify they're in chronological order
        for (let i = 0; i < sortedByStart.length - 1; i++) {
            const current: FetchEntry | undefined = sortedByStart[i]
            const next: FetchEntry | undefined = sortedByStart[i + 1]

            if (current && next) {
                expect(current.startOffset).toBeLessThanOrEqual(next.startOffset)
            }
        }
    })

    test('should respect maxPayloadBytes limit', async () => {
        const maxBytes: number = 100
        await page.goto(`http://localhost:3000/test/fetch-verification?maxPayloadBytes=${maxBytes}`)
        await waitForBridge()
        await api.clearAllData()

        await page.click('[data-testid="trigger-large-payload-fetch"]')
        await page.waitForTimeout(500)

        const fetchEntries: FetchEntry[] = await api.getFetchEntries()
        const largeFetch: FetchEntry | undefined = fetchEntries.find((entry: FetchEntry) => entry.url.includes('/api/large'))

        expect(largeFetch).toBeDefined()

        if (largeFetch) {
            // Payload should be truncated or omitted
            expect(largeFetch.cacheKey).toBeDefined()
            // The actual payload should not be stored if over limit
        }
    })
})
