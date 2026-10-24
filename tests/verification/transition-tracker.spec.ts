import { test, expect, Page } from '@playwright/test'
import { getTestBridge, waitForBridge } from './helpers/observatory-bridge'
import type { IObservatoryTestAPI, ITransitionEntry, TTransitionPhase } from './types/observatory.types'

async function waitForTransitionPhase(readEntries: () => Promise<ITransitionEntry[]>, phase: TTransitionPhase): Promise<void> {
    await expect.poll(async () => {
        const entries = await readEntries()

        return entries.some((entry) => entry.phase === phase)
    }).toBe(true)
}

async function waitForCancelledTransition(readEntries: () => Promise<ITransitionEntry[]>): Promise<void> {
    await expect.poll(async () => {
        const entries = await readEntries()

        return entries.some((entry) => entry.cancelled)
    }).toBe(true)
}

test.describe('Transition Tracker Correctness', () => {
    let api: IObservatoryTestAPI
    let page: Page

    test.beforeEach(async ({ page: testPage }) => {
        page = testPage
        await page.goto('http://localhost:3000/test/transition-verification')
        await waitForBridge()
        api = getTestBridge()
        await api.clearAllData()
    })

    test('should capture all transition lifecycle phases', async () => {
        const expectedPhases: TTransitionPhase[] = ['entering', 'entered', 'leaving', 'left']

        // Trigger enter transition
        await page.click('[data-testid="show-transition"]')
        await expect(page.getByTestId('transition-visible')).toBeVisible()
        await waitForTransitionPhase(() => api.getTransitionEntries(), 'entered')

        // Trigger leave transition
        await page.click('[data-testid="hide-transition"]')
        await expect(page.getByTestId('transition-visible')).toBeHidden()
        await waitForTransitionPhase(() => api.getTransitionEntries(), 'left')

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        const phasesCaptured: TTransitionPhase[] = transitions.map((t: ITransitionEntry) => t.phase)

        for (const phase of expectedPhases) {
            expect(phasesCaptured).toContain(phase)
        }
    })

    test('should detect cancelled transitions', async () => {
        const toggleCount: number = 5

        for (let i = 0; i < toggleCount; i++) {
            await page.click('[data-testid="toggle-transition-rapid"]')
            await expect(page.getByTestId('toggle-transition-rapid')).toContainText(`Cancellations: ${(i + 1) * 5}`)
        }

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        const cancelledPhases: TTransitionPhase[] = ['enter-cancelled', 'leave-cancelled']
        const cancelledTransitions: ITransitionEntry[] = transitions.filter((t: ITransitionEntry) => cancelledPhases.includes(t.phase))

        expect(cancelledTransitions.length).toBeGreaterThan(0)
    })

    test('should measure transition duration accurately', async () => {
        const startTime: number = await page.evaluate(() => performance.now())

        await page.click('[data-testid="show-transition"]')
        await page.waitForSelector('[data-testid="transition-visible"]')

        const actualDuration: number = await page.evaluate((start: number) => {
            return performance.now() - start
        }, startTime)

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        const enterTransition: ITransitionEntry | undefined = transitions.find((t: ITransitionEntry) => t.phase === 'entered')

        expect(enterTransition).toBeDefined()

        if (enterTransition) {
            // CSS transitions have slight variance, allow 10ms tolerance
            expect(Math.abs(enterTransition.duration - actualDuration)).toBeLessThan(10)
        }
    })

    test('should handle transitions without CSS classes gracefully', async () => {
        // This should not throw errors
        await page.click('[data-testid="show-broken-transition"]')
        await expect(page.getByRole('heading', { name: 'Broken Transition' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Broken Transition' })).toBeHidden()

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        const brokenTransition: ITransitionEntry | undefined = transitions.find((t: ITransitionEntry) => t.name === 'BrokenTransition')

        expect(brokenTransition).toBeDefined()

        if (brokenTransition) {
            expect(brokenTransition.error).toBeDefined()
            expect(brokenTransition.error).toContain('CSS classes missing')
        }
    })

    test('should record parent component for each transition', async () => {
        await page.click('[data-testid="show-nested-transition"]')
        await expect(page.getByRole('heading', { name: 'Parent Transition' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Parent Transition' })).toBeHidden()

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        const nestedTransition: ITransitionEntry | undefined = transitions.find((t: ITransitionEntry) => t.name === 'NestedFade')

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
            await expect(page.getByTestId('transition-visible')).toBeVisible()
            await page.click('[data-testid="hide-transition"]')
            await expect(page.getByTestId('transition-visible')).toBeHidden()
        }

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        expect(transitions.length).toBeLessThanOrEqual(maxTransitions)
    })

    test('should mark cancelled transitions with cancelled flag', async () => {
        // Rapid toggle to cause cancellation
        await page.click('[data-testid="show-transition"]')
        await expect(page.getByTestId('transition-visible')).toBeVisible()
        await page.click('[data-testid="hide-transition"]')
        await waitForCancelledTransition(() => api.getTransitionEntries())

        const transitions: ITransitionEntry[] = await api.getTransitionEntries()
        const cancelledTransition: ITransitionEntry | undefined = transitions.find((t: ITransitionEntry) => t.cancelled === true)

        expect(cancelledTransition).toBeDefined()
    })
})
