import { test, expect, type Page } from '@playwright/test'

/**
 * Playground page smoke tests.
 *
 * These tests boot the Nuxt playground (via webServer in playwright.config.ts),
 * navigate to each of the four main pages, and verify that:
 *   - No JS errors appear in the browser console
 *   - Key UI landmarks are rendered
 *   - Observable interactions work (add-to-cart, leaky-audit toggle, theme buttons, save badge)
 */

// ──────────────────────────────────────────────────────────────────────────────
// Helper: collect console errors during a test
// ──────────────────────────────────────────────────────────────────────────────
function collectConsoleErrors(page: Page) {
    const errors: string[] = []

    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    return errors
}

// ──────────────────────────────────────────────────────────────────────────────
// Home page
// ──────────────────────────────────────────────────────────────────────────────
test.describe('Home page (/)', () => {
    test('renders without console errors', async ({ page }) => {
        const errors = collectConsoleErrors(page)

        await page.goto('/')
        await page.waitForLoadState('networkidle')

        expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0)
    })

    test('shows Observatory navigation links', async ({ page }) => {
        await page.goto('/')
        await page.waitForLoadState('networkidle')

        await expect(page.getByRole('link', { name: 'Shop' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
    })
})

// ──────────────────────────────────────────────────────────────────────────────
// Shop page (/shop)
// ──────────────────────────────────────────────────────────────────────────────
test.describe('Shop page (/shop)', () => {
    test('renders without console errors', async ({ page }) => {
        const errors = collectConsoleErrors(page)

        await page.goto('/shop')
        await page.waitForLoadState('networkidle')

        expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0)
    })

    test('shows product list', async ({ page }) => {
        await page.goto('/shop')
        await page.waitForLoadState('networkidle')

        // Products are rendered as cards with an "Add to cart" button
        const addButtons = page.getByRole('button', { name: /add to cart/i })

        await expect(addButtons.first()).toBeVisible()
    })

    test('adds a product to cart and opens drawer', async ({ page }) => {
        await page.goto('/shop')
        await page.waitForLoadState('networkidle')

        // Click the first "Add to cart" button
        const firstAddBtn = page.getByRole('button', { name: /add to cart/i }).first()
        await firstAddBtn.click()

        // Cart count badge in the "open cart" button should show at least 1
        const cartBtn = page.getByRole('button', { name: /cart/i })

        await expect(cartBtn).toBeVisible()

        // Click the cart button to open the drawer
        await cartBtn.click()

        // The drawer should now be visible with at least one CartItem
        await expect(page.locator('.drawer')).toBeVisible()
    })
})

// ──────────────────────────────────────────────────────────────────────────────
// Dashboard page (/dashboard)
// ──────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard page (/dashboard)', () => {
    test('renders without console errors', async ({ page }) => {
        const errors = collectConsoleErrors(page)

        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')

        expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0)
    })

    test('shows analytics layout sub-header with theme override', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')

        // The analytics layout renders a bar with layout: 'analytics' + theme chip
        await expect(page.locator('.analytics-bar')).toBeVisible()
        await expect(page.locator('.analytics-bar')).toContainText('theme override')
    })

    test('shows Live Stats section with StatsCards', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')

        await expect(page.getByText('Live Stats')).toBeVisible()
        await expect(page.getByText('Active Users')).toBeVisible()
        await expect(page.getByText('Cart Total')).toBeVisible()
    })

    test('Product Filter section is visible', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')

        await expect(page.getByText('Product Filter')).toBeVisible()
        await expect(page.locator('.filter-input')).toBeVisible()
    })

    test('filter input triggers watcher-fire counter', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')

        // Initial watcher fire count is 0 (or very low from immediate watchers)
        const badge = page.locator('.filter-badge')

        await expect(badge).toBeVisible()

        // Type into the filter box — each keystroke fires a watcher
        await page.locator('.filter-input').fill('Widget')

        // Badge count should have increased
        const afterText = await badge.textContent()
        const count = parseInt(afterText?.replace(/\D/g, '') ?? '0', 10)

        expect(count).toBeGreaterThan(0)
    })

    test('mounts and unmounts LeakyCartMonitor via toggle button', async ({ page }) => {
        await page.goto('/dashboard')
        await page.waitForLoadState('networkidle')

        const toggleBtn = page.getByRole('button', { name: /mount leaky audit/i })

        await expect(toggleBtn).toBeVisible()

        // Mount it
        await toggleBtn.click()

        await expect(page.locator('.leaky-cart-monitor')).toBeVisible()

        // Unmount it
        await page.getByRole('button', { name: /unmount leaky audit/i }).click()

        await expect(page.locator('.leaky-cart-monitor')).not.toBeVisible()
    })
})

// ──────────────────────────────────────────────────────────────────────────────
// Settings page (/settings)
// ──────────────────────────────────────────────────────────────────────────────
test.describe('Settings page (/settings)', () => {
    test('renders without console errors', async ({ page }) => {
        const errors = collectConsoleErrors(page)

        await page.goto('/settings')
        await page.waitForLoadState('networkidle')

        expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0)
    })

    test('shows the Appearance section with theme buttons', async ({ page }) => {
        await page.goto('/settings')
        await page.waitForLoadState('networkidle')

        await expect(page.getByText('Appearance')).toBeVisible()
        await expect(page.getByRole('button', { name: 'light' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'dark' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'system' })).toBeVisible()
    })

    test('clicking a theme button shows the save badge', async ({ page }) => {
        await page.goto('/settings')
        await page.waitForLoadState('networkidle')

        // Click the 'dark' theme button
        await page.getByRole('button', { name: 'dark' }).click()

        // The save status badge should briefly appear
        await expect(page.locator('.status.saving, .status.saved')).toBeVisible()
    })
})
