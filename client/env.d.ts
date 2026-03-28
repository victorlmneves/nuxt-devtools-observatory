/// <reference types="vite/client" />

declare interface ImportMetaEnv {
    readonly VITE_OBSERVATORY_HEATMAP_THRESHOLD_COUNT?: string
    readonly VITE_OBSERVATORY_HEATMAP_THRESHOLD_TIME?: string
}

declare interface ImportMeta {
    readonly env: ImportMetaEnv
}
