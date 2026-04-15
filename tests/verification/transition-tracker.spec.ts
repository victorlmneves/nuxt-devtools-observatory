import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge, type ObservatoryTestAPI } from './helpers/observatory-bridge'
import type { TransitionEntry, TransitionPhase } from './types/observatory.types'

test.describe('Transition Tracker Correctness', () => {
    let api: ObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/transition-verification')
        await waitForBridge()
        api = await getTestBridge()
        await api.clearAllData()
    })

    test('should capture all transition lifecycle phases', async () => {
        const expectedPhases: TransitionPhase[] = ['entering', 'entered', 'leaving', 'left']

        // Trigger enter transition
        await page.click('[data-testid="show-transition"]')
        await page.waitForTimeout(300)

        // Trigger leave transition
        await page.click('[data-testid="hide-transition"]')
        await page.waitForTimeout(300)

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        const phasesCaptured: TransitionPhase[] = transitions.map((t: TransitionEntry) => t.phase)

        for (const phase of expectedPhases) {
            expect(phasesCaptured).toContain(phase)
        }
    })

    test('should detect cancelled transitions', async () => {
        const toggleCount: number = 5

        for (let i = 0; i < toggleCount; i++) {
            await page.click('[data-testid="toggle-transition-rapid"]')
            await page.waitForTimeout(50)
        }

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        const cancelledPhases: TransitionPhase[] = ['enter-cancelled', 'leave-cancelled']
        const cancelledTransitions: TransitionEntry[] = transitions.filter((t: TransitionEntry) => cancelledPhases.includes(t.phase))

        expect(cancelledTransitions.length).toBeGreaterThan(0)
    })

    test('should measure transition duration accurately', async () => {
        const startTime: number = await page.evaluate(() => performance.now())

        await page.click('[data-testid="show-transition"]')
        await page.waitForSelector('[data-testid="transition-visible"]')

        const actualDuration: number = await page.evaluate((start: number) => {
            return performance.now() - start
        }, startTime)

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        const enterTransition: TransitionEntry | undefined = transitions.find((t: TransitionEntry) => t.phase === 'entered')

        expect(enterTransition).toBeDefined()

        if (enterTransition) {
            // CSS transitions have slight variance, allow 10ms tolerance
            expect(Math.abs(enterTransition.duration - actualDuration)).toBeLessThan(10)
        }
    })

    test('should handle transitions without CSS classes gracefully', async () => {
        // This should not throw errors
        await page.click('[data-testid="show-broken-transition"]')
        await page.waitForTimeout(300)

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        const brokenTransition: TransitionEntry | undefined = transitions.find((t: TransitionEntry) => t.name === 'BrokenTransition')

        expect(brokenTransition).toBeDefined()

        if (brokenTransition) {
            expect(brokenTransition.error).toBeDefined()
            expect(brokenTransition.error).toContain('CSS classes missing')
        }
    })

    test('should record parent component for each transition', async () => {
        await page.click('[data-testid="show-nested-transition"]')
        await page.waitForTimeout(300)

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        const nestedTransition: TransitionEntry | undefined = transitions.find((t: TransitionEntry) => t.name === 'NestedFade')

        expect(nestedTransition).toBeDefined()

        if (nestedTransition) {
            expect(nestedTransition.parentComponent).toBeDefined()
            expect(nestedTransition.parentComponent).not.toBe('')
        }
    })

    test('should respect maxTransitions configuration limit', async () => {
        const maxTransitions: number = 10
        await page.goto(`http://localhost:3000/test/transition-verification?maxTransitions=${maxTransitions}`)
        await waitForBridge()
        await api.clearAllData()

        const transitionCount: number = 20
        for (let i = 0; i < transitionCount; i++) {
            await page.click('[data-testid="show-transition"]')
            await page.waitForTimeout(50)
            await page.click('[data-testid="hide-transition"]')
            await page.waitForTimeout(50)
        }

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        expect(transitions.length).toBeLessThanOrEqual(maxTransitions)
    })

    test('should mark cancelled transitions with cancelled flag', async () => {
        // Rapid toggle to cause cancellation
        await page.click('[data-testid="show-transition"]')
        await page.waitForTimeout(50) // Halfway through transition
        await page.click('[data-testid="hide-transition"]')
        await page.waitForTimeout(100)

        const transitions: TransitionEntry[] = await api.getTransitionEntries()
        const cancelledTransition: TransitionEntry | undefined = transitions.find((t: TransitionEntry) => t.cancelled === true)

        expect(cancelledTransition).toBeDefined()
    })
})
