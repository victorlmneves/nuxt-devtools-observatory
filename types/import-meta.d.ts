// Extend ImportMeta to include 'hot' for Vite HMR support
interface ImportMeta {
    readonly hot?: {
        accept: (deps?: string | string[], callback?: (mod: any) => void) => void
        dispose: (callback: () => void) => void
        // Add other HMR methods if needed
    }
}
