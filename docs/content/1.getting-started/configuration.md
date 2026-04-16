---
title: Configuration
description: Module flags, performance limits, and debug controls.
---

Configure under `observatory` in your app `nuxt.config.ts`.

```ts
export default defineNuxtConfig({
    observatory: {
        instrumentServer: true, // Instrument the server for SSR/Nitro fetch and composable tracking. Enable this when using SSR so server-side composable calls are captured. Disable for SPA projects to avoid double-registration caused by the transform running on both builds.
        fetchDashboard: true, // Enable useFetch dashboard
        provideInjectGraph: true, // Enable provide/inject graph
        composableTracker: true, // Enable composable tracker
        renderHeatmap: true, // Enable render heatmap
        transitionTracker: true, // Enable transition tracker
        traceViewer: true, // Enable trace viewer
        composableNavigationMode: 'route', // 'route' clears entries on navigation (default), 'session' persists across navigation
        heatmapThresholdCount: 5, // Highlight components with 5+ renders
        heatmapThresholdTime: 1600, // Highlight components with render time above this (ms)
        heatmapHideInternals: true, // Hide node_modules and internal components in the render heatmap
        debugRpc: false, // Enable RPC handshake debug logs (useful for troubleshooting)
        maxFetchEntries: 200, // Max fetch entries to keep in memory
        fetchPageSize: 20, // Rows loaded per infinite-scroll step in the useFetch Dashboard
        maxPayloadBytes: 10000, // Max payload size (bytes) per fetch entry
        maxTransitions: 500, // Max transition entries to keep in memory
        maxComposableHistory: 50, // Max composable history events per entry
        maxComposableEntries: 300, // Max composable entries to keep in memory
        maxRenderTimeline: 100, // Max render timeline events per entry
    },
})
```

## Configuration notes

- `route` composable navigation mode clears on page navigation.
- `session` mode keeps history across navigations for investigation sessions.
- `debugRpc` helps diagnose host/iframe bridge issues.
- Caps reduce memory growth during long dev sessions.
- `fetchPageSize` controls how many useFetch rows are appended per scroll step.

## Environment variables

Most options can also be set through environment variables (see `.env.example`).
Nuxt config values take precedence over `.env` values.
