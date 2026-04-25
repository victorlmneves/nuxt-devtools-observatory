import { test, expect, Page } from '@playwright/test'
import type { PiniaStoreEntry } from './types/observatory.types'

test.describe('Pinia Tracker Correctness', () => {
    let page: Page

    async function waitForBridgeReady(targetPage: Page): Promise<void> {
        await targetPage.waitForFunction(() => {
            return typeof (window as { __OBSERVATORY_TEST_BRIDGE?: unknown }).__OBSERVATORY_TEST_BRIDGE !== 'undefined'
        })
    }

    async function clearBridgeData(targetPage: Page): Promise<void> {
        await targetPage.evaluate(async () => {
            const bridge = (window as { __OBSERVATORY_TEST_BRIDGE?: { clearAllData: () => Promise<void> } }).__OBSERVATORY_TEST_BRIDGE

            if (!bridge) {
                throw new Error('Observatory bridge is not available')
            }

            await bridge.clearAllData()
        })
    }

    async function getPiniaStores(targetPage: Page): Promise<PiniaStoreEntry[]> {
        return targetPage.evaluate(async () => {
            const bridge = (window as { __OBSERVATORY_TEST_BRIDGE?: { getPiniaStores: () => Promise<PiniaStoreEntry[]> } })
                .__OBSERVATORY_TEST_BRIDGE

            if (!bridge) {
                throw new Error('Observatory bridge is not available')
            }

            return bridge.getPiniaStores()
        })
    }

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/pinia-verification')
        await waitForBridgeReady(page)
        await clearBridgeData(page)
    })

    test('exposes tracked pinia stores through the bridge snapshot', async () => {
        await page.click('[data-testid="pinia-add-item"]')
        await page.waitForTimeout(250)

        const stores: PiniaStoreEntry[] = await getPiniaStores(page)
        const userStore = stores.find((store) => store.id === 'user')
        const cartStore = stores.find((store) => store.id === 'cart')

        expect(stores.length).toBeGreaterThan(0)
        expect(userStore).toBeDefined()
        expect(cartStore).toBeDefined()

        if (cartStore) {
            const state = cartStore.state as { items?: unknown[] }

            expect(Array.isArray(state.items)).toBe(true)
        }
    })

    test('captures component and composable dependency edges', async () => {
        await page.click('[data-testid="pinia-add-item"]')
        await page.waitForTimeout(150)

        const stores: PiniaStoreEntry[] = await getPiniaStores(page)
        const cartStore = stores.find((store) => store.id === 'cart')

        expect(cartStore).toBeDefined()

        if (cartStore) {
            expect(cartStore.dependencies.some((dep) => dep.kind === 'component')).toBe(true)
            expect(cartStore.dependencies.some((dep) => dep.kind === 'composable' && dep.name === 'useCart')).toBe(true)
        }
    })

    test('records hydration attribution timeline for store initialization', async () => {
        await page.click('[data-testid="pinia-add-item"]')
        await page.waitForTimeout(200)

        const stores: PiniaStoreEntry[] = await getPiniaStores(page)
        const cartStore = stores.find((store) => store.id === 'cart')

        expect(cartStore).toBeDefined()

        if (cartStore) {
            expect(cartStore.hydrationTimeline.length).toBeGreaterThan(0)
            expect(['nuxt-payload', 'persistedstate', 'runtime', 'unknown']).toContain(cartStore.hydrationTimeline[0]?.source)
        }
    })
})
