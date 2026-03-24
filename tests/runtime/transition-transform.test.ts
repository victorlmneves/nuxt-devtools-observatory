import { describe, it, expect } from 'vitest'
import { transitionTrackerPlugin } from '../../src/transforms/transition-transform'

// Helper to call resolveId on the plugin
function makePlugin() {
    const plugin = transitionTrackerPlugin()
    // Bind a minimal Vite plugin context
    const ctx = {
        resolve: async (id: string) => ({ id: `/real/${id}` }),
    }
    const resolveId = (
        plugin.resolveId as (id: string, importer?: string) => Promise<string | null | undefined> | string | null | undefined
    ).bind(ctx)
    const load = (plugin.load as (id: string) => Promise<string | null | undefined> | string | null | undefined).bind(ctx)

    return { resolveId, load, plugin }
}

describe('transitionTrackerPlugin', () => {
    it('returns a plugin with the correct name and pre enforcement', () => {
        const { plugin } = makePlugin()

        expect(plugin.name).toBe('observatory:transition-tracker')
        expect(plugin.enforce).toBe('pre')
    })

    describe('resolveId', () => {
        it('returns undefined for non-vue imports', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('lodash', '/app/src/Page.vue')

            expect(result).toBeUndefined()
        })

        it('returns undefined when importer is undefined', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('vue', undefined)

            expect(result).toBeUndefined()
        })

        it('returns the virtual ID for vue imported from user code', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('vue', '/app/src/components/MyComp.vue')

            expect(result).toBe('\0obs:vue-proxy')
        })

        it('skips vue proxy itself (prevents circular redirect)', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('vue', '/app/src/\0obs:vue-proxy')

            // Should resolve to real vue, not the virtual ID
            expect(result).not.toBe('\0obs:vue-proxy')
        })

        it('skips node_modules importers', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('vue', '/app/node_modules/some-lib/index.js')

            expect(result).toBeUndefined()
        })

        it('skips src/runtime importers to avoid double-wrapping', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('vue', '/app/src/runtime/plugin.ts')

            expect(result).toBeUndefined()
        })

        it('skips dist/runtime importers', async () => {
            const { resolveId } = makePlugin()
            const result = await resolveId('vue', '/app/dist/runtime/composables/fetch-registry.js')

            expect(result).toBeUndefined()
        })
    })

    describe('load', () => {
        it('returns the proxy module for the virtual ID', () => {
            const { load } = makePlugin()
            const result = load('\0obs:vue-proxy')

            expect(result).toBeTruthy()
            expect(result).toContain("export * from 'vue'")
            expect(result).toContain('_ObservedTransition as Transition')
        })

        it('also responds to obs:vue-proxy without the null-byte prefix (vite-node compat)', () => {
            const { load } = makePlugin()
            const result = load('obs:vue-proxy')

            expect(result).toBeTruthy()
            expect(result).toContain("export * from 'vue'")
        })

        it('returns null for any other module id', () => {
            const { load } = makePlugin()

            expect(load('vue')).toBeNull()
            expect(load('/src/some-file.ts')).toBeNull()
        })

        it('proxy module contains all required transition lifecycle hooks', () => {
            const { load } = makePlugin()
            const proxy = load('\0obs:vue-proxy') as string

            expect(proxy).toContain('onBeforeEnter')
            expect(proxy).toContain('onAfterEnter')
            expect(proxy).toContain('onEnterCancelled')
            expect(proxy).toContain('onBeforeLeave')
            expect(proxy).toContain('onAfterLeave')
            expect(proxy).toContain('onLeaveCancelled')
        })

        it('proxy module registers with the transition registry via window.__observatory__', () => {
            const { load } = makePlugin()
            const proxy = load('\0obs:vue-proxy') as string

            expect(proxy).toContain('window.__observatory__')
            expect(proxy).toContain('window.__observatory__.transition')
        })

        it('proxy module handles missing registry gracefully (SSR / no observatory)', () => {
            const { load } = makePlugin()
            const proxy = load('\0obs:vue-proxy') as string

            // Falls back to real Transition when registry is absent
            expect(proxy).toContain('_ObsRealTransition')
            // The guard: if (!r) return _obsH(_ObsRealTransition, ...)
            expect(proxy).toContain('if (!r)')
        })
    })
})
