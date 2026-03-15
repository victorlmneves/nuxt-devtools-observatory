// Nuxt augments ImportMeta with these boolean flags at build time.
// This declaration makes them available to TypeScript in the src/ tree.
interface ImportMeta {
    readonly dev: boolean
    readonly client: boolean
    readonly server: boolean
}
