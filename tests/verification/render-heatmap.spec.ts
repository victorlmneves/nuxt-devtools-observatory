import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge, type ObservatoryTestAPI } from './helpers/observatory-bridge'

test.describe('Render Heatmap Correctness', () => {
    let api: ObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/heatmap-verification')
        await waitForBridge()
        api = await getTestBridge()
    })

    test('should not increment mount count for persistent components on navigation', async () => {
        interface ExtendedElement extends HTMLElement {
            __observatoryMountCount?: number
        }

        const getMountCount = async (): Promise<number> => {
            return await page.evaluate(() => {
                const element = document.querySelector('[data-testid="persistent-layout"]') as ExtendedElement | null

                return element?.__observatoryMountCount ?? 0
            })
        }

        const initialCount = await getMountCount()

        const navigationCount = 10
        for (let i = 0; i < navigationCount; i++) {
            await page.click('[data-testid="nav-to-other-route"]')
            await page.waitForTimeout(100)
            await page.goBack()
            await page.waitForTimeout(100)
        }

        const finalCount = await getMountCount()
        expect(finalCount - initialCount).toBe(1)
    })

    test('should accurately attribute renders to correct routes', async () => {
        await page.click('[data-testid="nav-to-route-a"]')
        await page.click('[data-testid="trigger-render"]')

        await page.click('[data-testid="nav-to-route-b"]')
        await page.click('[data-testid="trigger-render"]')

        await page.click('[data-testid="nav-to-route-a"]')
        await page.click('[data-testid="trigger-render"]')

        const heatmapData = await api.getHeatmapData()
        const componentData = heatmapData.components['TestComponent']

        expect(componentData).toBeDefined()

        if (!componentData) {
            throw new Error('Expected TestComponent to exist in heatmap data')
        }

        expect(componentData.totalRenders).toBe(3)
        expect(componentData.byRoute['/route-a']?.renders).toBe(2)
        expect(componentData.byRoute['/route-b']?.renders).toBe(1)
    })

    test('should cap timeline events at configured limit', async () => {
        const updateCount = 150

        for (let i = 0; i < updateCount; i++) {
            await page.click('[data-testid="force-update"]')
        }

        const heatmapData = await api.getHeatmapData()
        const componentData = heatmapData.components['FastUpdateComponent']

        expect(componentData).toBeDefined()

        if (!componentData) {
            throw new Error('Expected FastUpdateComponent to exist in heatmap data')
        }

        expect(componentData.timeline.length).toBeLessThanOrEqual(100)

        // Verify events are in chronological order
        const timestamps = componentData.timeline.map((event) => event.timestamp)
        for (let i = 0; i < timestamps.length - 1; i++) {
            const current = timestamps[i]
            const next = timestamps[i + 1]

            if (current !== undefined && next !== undefined) {
                expect(current).toBeLessThan(next)
            }
        }
    })

    test('should measure render duration accurately during heavy updates', async () => {
        await page.click('[data-testid="render-heavy-list"]')
        await page.waitForSelector('[data-testid="heavy-list-rendered"]')

        const actualDuration = await page.evaluate(() => {
            const start = (window as unknown as { __heavyRenderStart?: number }).__heavyRenderStart

            if (!start) {
                throw new Error('__heavyRenderStart not set')
            }

            return performance.now() - start
        })

        const heatmapData = await api.getHeatmapData()
        const componentData = heatmapData.components['HeavyList']

        expect(componentData).toBeDefined()

        if (!componentData) {
            throw new Error('Expected HeavyList to exist in heatmap data')
        }

        const lastEvent = componentData.timeline[componentData.timeline.length - 1]
        expect(lastEvent).toBeDefined()

        if (lastEvent) {
            const tolerance = actualDuration * 0.1
            expect(Math.abs(lastEvent.duration - actualDuration)).toBeLessThan(tolerance)
        }
    })

    test('should exclude node_modules components when hideInternals is true', async () => {
        await page.goto('http://localhost:3000/test/heatmap-verification?hideInternals=true')
        await waitForBridge()

        const heatmapData = await api.getHeatmapData()
        const componentNames = Object.keys(heatmapData.components)

        const hasNodeModulesComponent = componentNames.some((name) => name.includes('node_modules') || name.includes('@vue'))

        expect(hasNodeModulesComponent).toBe(false)
    })

    test('should remain responsive after large update bursts', async () => {
        const updateCount = 120

        for (let i = 0; i < updateCount; i++) {
            await page.click('[data-testid="force-update"]')
        }

        const startedAt = Date.now()
        const heatmapData = await api.getHeatmapData()
        const elapsedMs = Date.now() - startedAt

        // Guardrail threshold: generous enough to avoid flakiness, strict enough to catch regressions.
        expect(elapsedMs).toBeLessThan(2000)
        expect(Object.keys(heatmapData.components).length).toBeGreaterThan(0)
    })
})
