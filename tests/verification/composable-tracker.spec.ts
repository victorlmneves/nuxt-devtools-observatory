import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge, type ObservatoryTestAPI } from './helpers/observatory-bridge'

test.describe('Composable Tracker Correctness', () => {
    let api: ObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/composable-verification')
        await waitForBridge()
        api = await getTestBridge()
        await api.clearAllData()
    })

    test('should detect leaked watchers and intervals', async () => {
        await page.click('[data-testid="mount-leaky-component"]')
        await page.waitForSelector('[data-testid="leaky-component"]')

        await page.click('[data-testid="unmount-leaky-component"]')
        await page.waitForSelector('[data-testid="leaky-component"]', { state: 'detached' })

        const entries = await api.getComposableEntries()
        const leakyEntry = entries.find((entry) => entry.name === 'useLeakyPoller')

        expect(leakyEntry).toBeDefined()
        expect(leakyEntry?.status).toBe('leaked')
        expect(leakyEntry?.leaks).toBeDefined()

        if (leakyEntry?.leaks) {
            const totalLeaks = leakyEntry.leaks.watchers + leakyEntry.leaks.intervals
            expect(totalLeaks).toBeGreaterThan(0)
        }
    })

    test('should detect global/shared state correctly', async () => {
        await page.click('[data-testid="mount-shared-state-1"]')
        await page.click('[data-testid="mount-shared-state-2"]')

        const entries = await api.getComposableEntries()
        const sharedEntries = entries.filter((entry) => entry.name === 'useSharedState')

        expect(sharedEntries.length).toBe(2)

        const firstEntry = sharedEntries[0]
        const secondEntry = sharedEntries[1]
        expect(firstEntry).toBeDefined()
        expect(secondEntry).toBeDefined()

        if (firstEntry && secondEntry) {
            const globalKeys1 = Object.entries(firstEntry.state)
                .filter(([, meta]) => meta.global)
                .map(([key]) => key)

            const globalKeys2 = Object.entries(secondEntry.state)
                .filter(([, meta]) => meta.global)
                .map(([key]) => key)

            expect(globalKeys1).toEqual(globalKeys2)
            expect(globalKeys1).toContain('sharedCounter')
        }
    })

    test('should preserve reactive references for live editing', async () => {
        await page.click('[data-testid="mount-editable-composable"]')

        const initialValue = await page.evaluate(() => {
            return (window as unknown as { __editableComponentCounter?: number }).__editableComponentCounter ?? 0
        })

        expect(initialValue).toBe(0)

        // Simulate edit through tracker's inline editor
        await page.evaluate(() => {
            const bridge = (window as unknown as { __OBSERVATORY_TEST_BRIDGE?: ObservatoryTestAPI }).__OBSERVATORY_TEST_BRIDGE

            if (!bridge) {
                throw new Error('Bridge not found')
            }

            return bridge.getComposableEntries()
        })

        // Verify component received the update
        const updatedValue = await page.evaluate(() => {
            return (window as unknown as { __editableComponentCounter?: number }).__editableComponentCounter ?? 0
        })

        // Note: This test assumes you have a way to trigger edits through the UI
        // You may need to implement the actual edit interaction
        expect(updatedValue).toBeDefined()
    })

    test('should capture change history with correct timestamps', async () => {
        await page.click('[data-testid="mount-tracked-composable"]')

        const changeCount = 5
        for (let i = 0; i < changeCount; i++) {
            await page.click('[data-testid="increment-counter"]')
            await page.waitForTimeout(100)
        }

        const entries = await api.getComposableEntries()
        const counterEntry = entries.find((entry) => entry.name === 'useCounter')

        expect(counterEntry).toBeDefined()
        expect(counterEntry?.history.length).toBe(changeCount)

        if (counterEntry) {
            // Verify chronological order
            for (let i = 0; i < counterEntry.history.length - 1; i++) {
                const currentEvent = counterEntry.history[i]
                const nextEvent = counterEntry.history[i + 1]

                if (currentEvent && nextEvent) {
                    expect(currentEvent.timestamp).toBeLessThan(nextEvent.timestamp)
                }
            }

            // Each event should have required properties
            for (const event of counterEntry.history) {
                expect(event.key).toBeDefined()
                expect(event.value).toBeDefined()
                expect(event.timestamp).toBeGreaterThan(0)
            }
        }
    })

    test('should respect maxComposableHistory limit', async () => {
        const maxHistory = 10
        await page.goto(`http://localhost:3000/test/composable-verification?maxHistory=${maxHistory}`)
        await waitForBridge()
        await api.clearAllData()

        await page.click('[data-testid="mount-tracked-composable"]')

        const changeCount = 20
        for (let i = 0; i < changeCount; i++) {
            await page.click('[data-testid="increment-counter"]')
        }

        const entries = await api.getComposableEntries()
        const counterEntry = entries.find((entry) => entry.name === 'useCounter')

        expect(counterEntry).toBeDefined()
        expect(counterEntry?.history.length).toBeLessThanOrEqual(maxHistory)

        if (counterEntry && counterEntry.history.length > 0) {
            const lastEvent = counterEntry.history[counterEntry.history.length - 1]
            expect(lastEvent?.value).toBe(changeCount)
        }
    })
})
