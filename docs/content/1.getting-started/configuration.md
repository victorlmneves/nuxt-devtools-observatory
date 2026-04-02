---
title: Configuration
description: Module flags, performance limits, and debug controls.
---

Configure under `observatory` in your app `nuxt.config.ts`.

```ts
export default defineNuxtConfig({
    observatory: {
        instrumentServer: true,
        fetchDashboard: true,
        provideInjectGraph: true,
        composableTracker: true,
        renderHeatmap: true,
        transitionTracker: true,
        composableNavigationMode: 'route',
        heatmapThresholdCount: 5,
        heatmapThresholdTime: 1600,
        heatmapHideInternals: true,
        debugRpc: false,
        maxFetchEntries: 200,
        maxPayloadBytes: 10000,
        maxTransitions: 500,
        maxComposableHistory: 50,
        maxComposableEntries: 300,
        maxRenderTimeline: 100,
    },
})
```

## Configuration notes

- `route` composable navigation mode clears on page navigation.
- `session` mode keeps history across navigations for investigation sessions.
- `debugRpc` helps diagnose host/iframe bridge issues.
- Caps reduce memory growth during long dev sessions.

## Environment variables

Most options can also be set through environment variables (see `.env.example`).
Nuxt config values take precedence over `.env` values.
