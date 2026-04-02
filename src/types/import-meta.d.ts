// Nuxt augments ImportMeta with these boolean flags at build time.
// This declaration makes them available to TypeScript in the src/ tree.
interface ImportMetaHot {
    accept: (deps?: string | string[], callback?: (mod: unknown) => void) => void
    dispose: (callback: () => void) => void
    on: (event: string, callback: (payload: unknown) => void) => void
    off: (event: string, callback?: (payload: unknown) => void) => void
    send: (event: string, data?: unknown) => void
}

interface ImportMeta {
    readonly dev: boolean
    readonly client: boolean
    readonly server: boolean
    readonly hot?: ImportMetaHot
    readonly env?: Record<string, string | undefined>
}
