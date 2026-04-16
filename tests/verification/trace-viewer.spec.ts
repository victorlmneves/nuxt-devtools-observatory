import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge, type ObservatoryTestAPI } from './helpers/observatory-bridge'
import type { SpanType } from './types/observatory.types'

test.describe('Trace Viewer Correctness', () => {
    let api: ObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/trace-verification')
        await waitForBridge()
        api = await getTestBridge()
        await api.clearAllData()
    })

    test('should measure component mount duration accurately', async () => {
        await page.click('[data-testid="mount-slow-component"]')
        await page.waitForSelector('[data-testid="slow-component-mounted"]')

        const actualDuration = await page.evaluate(() => {
            const win = window as unknown as { __lastMountStart?: number }
            const start = win.__lastMountStart

            if (!start) {
                throw new Error('__lastMountStart not set')
            }

            return performance.now() - start
        })

        const traces = await api.getTraces()
        const firstTrace = traces[0]
        expect(firstTrace).toBeDefined()

        const mountSpan = firstTrace?.spans.find((span) => span.type === 'component' && span.name === 'SlowComponent')

        expect(mountSpan).toBeDefined()

        if (mountSpan) {
            expect(Math.abs(mountSpan.duration - actualDuration)).toBeLessThan(5)
        }
    })

    test('should measure real render duration, not just hook time', async () => {
        await page.click('[data-testid="render-heavy-component"]')

        const paintTime = await page.evaluate(async () => {
            const start = performance.now()
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve()
                    })
                })
            })
            return performance.now() - start
        })

        const traces = await api.getTraces()
        const firstTrace = traces[0]
        expect(firstTrace).toBeDefined()

        const renderSpan = firstTrace?.spans.find((span) => span.type === 'render')
        expect(renderSpan).toBeDefined()

        if (renderSpan) {
            expect(renderSpan.duration).toBeGreaterThan(0)
            expect(Math.abs(renderSpan.duration - paintTime)).toBeLessThan(10)
        }
    })

    test('should maintain correct parent-child relationships in async flows', async () => {
        await page.click('[data-testid="nested-async-operations"]')
        await page.waitForTimeout(500)

        const traces = await api.getTraces()
        const firstTrace = traces[0]
        expect(firstTrace).toBeDefined()

        const fetchSpans = firstTrace?.spans.filter((span) => span.type === 'fetch') ?? []
        const mountSpan = firstTrace?.spans.find((span) => span.type === 'component')

        expect(fetchSpans.length).toBeGreaterThanOrEqual(2)
        expect(mountSpan).toBeDefined()

        if (mountSpan) {
            for (const fetchSpan of fetchSpans) {
                expect(fetchSpan.parentId).toBe(mountSpan.id)
            }
        }

        for (let i = 0; i < fetchSpans.length - 1; i++) {
            const currentSpan = fetchSpans[i]
            const nextSpan = fetchSpans[i + 1]

            if (currentSpan && nextSpan) {
                expect(currentSpan.endTime).toBeLessThanOrEqual(nextSpan.startTime)
            }
        }
    })

    test('should handle rapid navigation without mixing traces', async () => {
        const routeCount = 5

        for (let i = 0; i < routeCount; i++) {
            await page.click(`[data-testid="nav-to-route-${i}"]`)
            await page.waitForTimeout(50)
        }

        const traces = await api.getTraces()
        expect(traces.length).toBe(routeCount)

        for (let i = 0; i < traces.length - 1; i++) {
            const currentTrace = traces[i]
            const nextTrace = traces[i + 1]

            expect(currentTrace).toBeDefined()
            expect(nextTrace).toBeDefined()

            if (currentTrace && nextTrace) {
                expect(currentTrace.endTime).toBeLessThanOrEqual(nextTrace.startTime)
                expect(currentTrace.metadata['route']).not.toBe(nextTrace.metadata['route'])
            }
        }
    })

    test('should capture all 7 span types', async () => {
        const expectedTypes: SpanType[] = ['navigation', 'component', 'render', 'fetch', 'server', 'composable', 'transition']

        await page.click('[data-testid="trigger-all-spans"]')
        await page.waitForTimeout(500)

        const traces = await api.getTraces()
        const allSpans = traces.flatMap((trace) => trace.spans)
        const foundTypes = new Set(allSpans.map((span) => span.type))

        for (const expectedType of expectedTypes) {
            expect(foundTypes.has(expectedType)).toBe(true)
        }
    })

    test('should keep trace retrieval responsive with larger trace volumes', async () => {
        const routeCount = 20

        for (let i = 0; i < routeCount; i++) {
            await page.click(`[data-testid="nav-to-route-${i % 5}"]`)
            await page.waitForTimeout(20)
        }

        const startedAt = Date.now()
        const traces = await api.getTraces()
        const elapsedMs = Date.now() - startedAt

        // Guardrail threshold: aims to detect major regressions while staying stable in CI.
        expect(elapsedMs).toBeLessThan(2000)
        expect(traces.length).toBeGreaterThanOrEqual(routeCount)
    })
})
