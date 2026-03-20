// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createApp, type ComponentPublicInstance } from 'vue'
import { setupRenderRegistry } from '../../src/runtime/composables/render-registry'

function makeNuxtApp(app: ReturnType<typeof createApp>) {
    return { vueApp: app }
}

/**
 * Build a minimal fake ComponentPublicInstance sufficient for mixin hooks.
 * @param {number} uid - The component uid
 * @param {string} [name] - The component display name. Defaults to `TestComp`
 * @param {string} [file] - The component source file. Defaults to `Test.vue`
 * @returns {ComponentPublicInstance} A fake component public instance
 */
function fakeCPI(uid: number, name = 'TestComp', file = 'Test.vue'): ComponentPublicInstance {
    return {
        $: {
            uid,
            type: { __name: name, __file: file },
        },
        $el: {
            getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 50, top: 0, left: 0 }),
        },
        $parent: null,
    } as unknown as ComponentPublicInstance
}

describe('setupRenderRegistry', () => {
    it('returns getAll and snapshot functions', () => {
        const app = createApp({})
        const { getAll, snapshot } = setupRenderRegistry(makeNuxtApp(app), 1)

        expect(typeof getAll).toBe('function')
        expect(typeof snapshot).toBe('function')
    })

    it('snapshot() is an alias for getAll()', () => {
        const app = createApp({})
        const { getAll, snapshot } = setupRenderRegistry(makeNuxtApp(app), 1)

        expect(getAll()).toEqual(snapshot())
    })

    it('returns an empty list when no components have rendered', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), 1)

        expect(getAll()).toEqual([])
    })

    it('installs a global mixin on the vueApp', () => {
        const app = createApp({})
        const mixinsBefore = (app as unknown as { _context: { mixins: unknown[] } })._context.mixins.length

        setupRenderRegistry(makeNuxtApp(app), 1)

        const mixinsAfter = (app as unknown as { _context: { mixins: unknown[] } })._context.mixins.length

        expect(mixinsAfter).toBe(mixinsBefore + 1)
    })

    it('increments the renders counter when the updated hook fires', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), 1)

        // Get the mixin we just installed and call its `updated` hook directly
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(42)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entries = getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].uid).toBe(42)
        expect(entries[0].renders).toBe(2)
    })

    it('getAll() filters out entries whose renders count is below the threshold', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), 3)

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instA = fakeCPI(1, 'CompA')
        const instB = fakeCPI(2, 'CompB')

        // CompA fires updated twice — below threshold of 3
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instA)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instA)

        // CompB fires updated three times — meets threshold
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)

        const visible = getAll()

        expect(visible).toHaveLength(1)
        expect(visible[0].uid).toBe(2)
    })

    it('accumulates renderTriggered trigger entries with key and type', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), 1)

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(10)

        // Fire renderTriggered before updated so the entry exists
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'count',
            type: 'set',
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.triggers).toHaveLength(1)
        expect(entry.triggers[0].key).toBe('count')
        expect(entry.triggers[0].type).toBe('set')
    })

    it('keeps at most 50 trigger entries per component', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), 1)

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(20)

        // Fire 60 renderTriggered events
        for (let i = 0; i < 60; i++) {
            ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
                key: `k${i}`,
                type: 'set',
            })
        }
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        expect(getAll()[0].triggers).toHaveLength(50)
    })

    it('sets the component name from instance.$.type.__name', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), 1)

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(5, 'ProductCard', 'ProductCard.vue')
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.name).toBe('ProductCard')
        expect(entry.file).toBe('ProductCard.vue')
    })
})
