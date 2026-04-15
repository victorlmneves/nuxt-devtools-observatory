import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge, type ObservatoryTestAPI } from './helpers/observatory-bridge'
import type { GraphData, ProvideEntry, InjectEntry } from './types/observatory.types'

test.describe('Provide/Inject Graph Correctness', () => {
    let api: ObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/provide-inject-verification')
        await waitForBridge()
        api = await getTestBridge()
        await api.clearAllData()
    })

    test('should detect shadowed providers correctly', async () => {
        const graphData: GraphData = await api.getProvideInjectGraph()

        const shadowedProvides: ProvideEntry[] = graphData.provides.filter((provide: ProvideEntry) => provide.shadowed === true)
        const shadowedKeys: string[] = shadowedProvides.map((provide: ProvideEntry) => provide.key)

        expect(shadowedKeys).toContain('theme')

        // Verify UI shows shadow warning
        const shadowWarningVisible: boolean = await page
            .locator('[data-testid="shadow-warning-theme"]')
            .isVisible()
            .catch(() => false)
        expect(shadowWarningVisible).toBe(true)
    })

    test('should detect missing providers accurately', async () => {
        const graphData: GraphData = await api.getProvideInjectGraph()

        const missingInjections: InjectEntry[] = graphData.injects.filter((inject: InjectEntry) => inject.resolved === false)
        expect(missingInjections.length).toBeGreaterThan(0)

        const missingComponent = graphData.components.find(
            (component): boolean => component.name === 'MissingProviderConsumer' && component.status === 'missing-provider'
        )
        expect(missingComponent).toBeDefined()
    })

    test('should correctly identify provider scope (global/layout/component)', async () => {
        const graphData: GraphData = await api.getProvideInjectGraph()

        const scopeMap: Record<string, 'global' | 'layout' | 'component'> = {
            'app.config.globalProperties': 'global',
            'layout.vue': 'layout',
            'child-component': 'component',
        }

        for (const [providerName, expectedScope] of Object.entries(scopeMap)) {
            const provider: ProvideEntry | undefined = graphData.provides.find((p: ProvideEntry) => p.componentName === providerName)
            expect(provider).toBeDefined()

            if (provider) {
                expect(provider.scope).toBe(expectedScope)
            }
        }
    })

    test('should find provider by walking instance.parent chain', async () => {
        const graphData: GraphData = await api.getProvideInjectGraph()

        const deepInject: InjectEntry | undefined = graphData.injects.find((inject: InjectEntry) => inject.componentName === 'DeepConsumer')

        expect(deepInject).toBeDefined()
        if (deepInject) {
            expect(deepInject.resolved).toBe(true)
            expect(deepInject.providerChain).toBeDefined()
            expect(deepInject.providerChain?.length).toBe(3)
        }
    })

    test('should support value inspection for complex objects', async () => {
        const graphData: GraphData = await api.getProvideInjectGraph()

        const complexProvider: ProvideEntry | undefined = graphData.provides.find((provide: ProvideEntry) => provide.key === 'userProfile')

        expect(complexProvider).toBeDefined()

        if (complexProvider) {
            expect(complexProvider.value).toBeDefined()

            const valueRecord = complexProvider.value as Record<string, unknown>
            expect(valueRecord).toHaveProperty('name')
            expect(valueRecord).toHaveProperty('settings')
            expect(valueRecord).toHaveProperty('preferences')
        }

        // Update the value in component
        await page.click('[data-testid="update-user-profile"]')
        await page.waitForTimeout(100)

        // Verify graph updates with new value
        const updatedGraph: GraphData = await api.getProvideInjectGraph()
        const updatedProvider: ProvideEntry | undefined = updatedGraph.provides.find(
            (provide: ProvideEntry) => provide.key === 'userProfile'
        )

        expect(updatedProvider).toBeDefined()

        if (updatedProvider) {
            const updatedValue = updatedProvider.value as Record<string, unknown>
            expect(updatedValue.name).toBe('Updated Name')
        }
    })

    test('should show consumer list for each provided key', async () => {
        const graphData: GraphData = await api.getProvideInjectGraph()

        const themeProvider: ProvideEntry | undefined = graphData.provides.find((provide: ProvideEntry) => provide.key === 'theme')

        expect(themeProvider).toBeDefined()

        // Find all components that inject 'theme'
        const themeConsumers: InjectEntry[] = graphData.injects.filter(
            (inject: InjectEntry) => inject.key === 'theme' && inject.resolved === true
        )

        expect(themeConsumers.length).toBeGreaterThan(0)
    })
})
