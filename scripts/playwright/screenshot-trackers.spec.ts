import { test } from '@playwright/test'

const BASE_URL = 'http://localhost:4949' // Adjust if your dev server runs elsewhere

const trackers = [
    {
        name: 'fetch-dashboard',
        path: '/#/fetch-dashboard',
        screenshot: 'docs/screenshots/fetch-dashboard.png',
    },
    {
        name: 'provide-inject-graph',
        path: '/#/provide-inject-graph',
        screenshot: 'docs/screenshots/provide-inject-graph.png',
    },
    {
        name: 'composable-tracker',
        path: '/#/composable-tracker',
        screenshot: 'docs/screenshots/composable-tracker.png',
    },
    {
        name: 'pinia-tracker',
        path: '/#/pinia-tracker',
        screenshot: 'docs/screenshots/pinia-tracker.png',
    },
    {
        name: 'render-heatmap',
        path: '/#/render-heatmap',
        screenshot: 'docs/screenshots/render-heatmap.png',
    },
    {
        name: 'transition-tracker',
        path: '/#/transition-tracker',
        screenshot: 'docs/screenshots/transition-tracker.png',
    },
]

test.describe('Tracker Screenshots', () => {
    for (const tracker of trackers) {
        test(`Capture screenshot for ${tracker.name}`, async ({ page }) => {
            console.log(`Navigating to: ${BASE_URL}${tracker.path}`)
            await page.goto(`${BASE_URL}${tracker.path}`)
            // Wait for the main panel to load (adjust selector as needed)
            await page.waitForTimeout(1000)
            console.log(`Saving screenshot to: ${tracker.screenshot}`)
            await page.screenshot({ path: tracker.screenshot, fullPage: true })
        })
    }
})
