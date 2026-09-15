declare module '#app' {
    import type { App } from 'vue'

    export interface NuxtApp {
        $fetch: ((request: unknown, options?: Record<string, unknown>) => Promise<unknown>) & Record<string, unknown>
        vueApp: App
        payload: Record<string, unknown>
        isHydrating?: boolean
        hook: (name: string, fn: (...args: unknown[]) => void) => void
        $pinia?: unknown
    }

    export function defineNuxtPlugin(setup: () => void): unknown
    export function useNuxtApp(): NuxtApp
    export function useRuntimeConfig(): { public: { observatory: Record<string, unknown> } }
    export function useRouter(): {
        currentRoute: { value: { path?: string; name?: unknown } }
        beforeEach: (guard: (to: { path?: string; name?: unknown }, from: { path?: string; name?: unknown }) => unknown) => void
        afterEach: (hook: (to: { path?: string; name?: unknown }) => unknown) => void
    }
}

declare module 'h3' {
    export interface H3Event {
        context: Record<string, unknown>
        node?: { req?: { method?: string } }
    }

    export function getRequestURL(event: H3Event): { pathname: string }
    export function setResponseHeader(event: H3Event, name: string, value: string): void
}

declare module '@vue/compiler-sfc' {
    export function parse(
        source: string,
        options?: { ignoreEmpty?: boolean }
    ): {
        descriptor: {
            scriptSetup: SfcScriptBlock | null
            script: SfcScriptBlock | null
        }
    }

    export interface SfcScriptBlock {
        content: string
        lang?: string
        loc: {
            start: { offset: number }
            end: { offset: number }
        }
    }
}
