import type { ObservatoryTestAPI, InternalCounts } from '../../tests/verification/types/observatory.types'

// This file should be added to your runtime directory
// Only loaded in development mode

interface VueApp {
    _context?: {
        app?: {
            _component?: unknown
        }
    }
}

interface VueInstance {
    type?: {
        name?: string
        __name?: string
    }
    ctx?: {
        __observatoryMountCount?: number
    }
    subTree?: {
        children?: VueInstance[]
    }
}

declare global {
    interface Window {
        __NUXT__?: {
            vueApp?: VueApp
        }
        __OBSERVATORY_TEST_BRIDGE?: ObservatoryTestAPI
    }
}

function walkComponentTree(instance: VueInstance | undefined, counts: InternalCounts): void {
    if (!instance) {
        return
    }

    const componentName = instance.type?.name ?? instance.type?.__name ?? 'Anonymous'

    if (instance.ctx?.__observatoryMountCount) {
        const currentCount = counts.componentMounts[componentName] ?? 0
        counts.componentMounts[componentName] = currentCount + instance.ctx.__observatoryMountCount
    }

    if (instance.subTree?.children) {
        instance.subTree.children.forEach((child) => walkComponentTree(child, counts))
    }
}

export function injectTestBridge(): void {
    if (!import.meta.dev || typeof window === 'undefined') {
        return
    }

    const bridge: ObservatoryTestAPI = {
        async getTraces() {
            // Import dynamically to avoid circular dependencies
            const { traceStore } = await import('./tracing/traceStore')

            return Array.from(traceStore.entries())
        },

        async getHeatmapData() {
            const { renderRegistry } = await import('./composables/render-registry')

            return renderRegistry.getData()
        },

        async getComposableEntries() {
            const { composableRegistry } = await import('./composables/composable-registry')

            return composableRegistry.getEntries()
        },

        async getFetchEntries() {
            const { fetchRegistry } = await import('./composables/fetch-registry')

            return fetchRegistry.getEntries()
        },

        async getProvideInjectGraph() {
            const { provideInjectRegistry } = await import('./composables/provide-inject-registry')

            return provideInjectRegistry.getGraph()
        },

        async getTransitionEntries() {
            const { transitionRegistry } = await import('./composables/transition-registry')

            return transitionRegistry.getEntries()
        },

        async getInternalCounts(): Promise<InternalCounts> {
            const counts: InternalCounts = {
                componentMounts: {},
                renderOperations: {},
                fetchOperations: {},
            }

            const vueApp = window.__NUXT__?.vueApp

            if (!vueApp) {
                return counts
            }

            walkComponentTree(vueApp._context?.app?._component as VueInstance | undefined, counts)

            return counts
        },

        async clearAllData() {
            const { traceStore } = await import('./tracing/traceStore')
            const { renderRegistry } = await import('./composables/render-registry')
            const { composableRegistry } = await import('./composables/composable-registry')
            const { fetchRegistry } = await import('./composables/fetch-registry')

            traceStore.clear()
            renderRegistry.clear()
            composableRegistry.clear()
            fetchRegistry.clear()
        },

        async startRecording() {
            const { traceStore } = await import('./tracing/traceStore')
            traceStore.startRecording()
        },

        async stopRecording() {
            const { traceStore } = await import('./tracing/traceStore')
            traceStore.stopRecording()
        },

        async exportSnapshot() {
            const snapshot = {
                traces: await this.getTraces(),
                heatmap: await this.getHeatmapData(),
                composables: await this.getComposableEntries(),
                fetches: await this.getFetchEntries(),
                transitions: await this.getTransitionEntries(),
            }
            return JSON.stringify(snapshot, null, 2)
        },
    }

    window.__OBSERVATORY_TEST_BRIDGE = bridge
}
