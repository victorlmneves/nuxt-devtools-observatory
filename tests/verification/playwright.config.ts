import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env['CI'])

export default defineConfig({
    testDir: '.',
    fullyParallel: false,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    ...(isCI ? { workers: 1 } : {}),
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !isCI,
        timeout: 60_000,
    },
})
