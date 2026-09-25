---
title: Module Options
description: Configuration for Observatory instrumentation and limits.
---

`ModuleOptions` is defined in `src/module.ts`.

## Feature toggles

- `fetchDashboard`
- `provideInjectGraph`
- `composableTracker`
- `piniaTracker`
- `payloadInspector`
- `renderHeatmap`
- `transitionTracker`
- `traceViewer`

## Runtime behavior

- `instrumentServer` — required for SSR composable capture and Nitro server-route spans in Trace Viewer
- `composableNavigationMode` (`route` | `session`)
- `debugRpc`

## Render thresholds

- `heatmapThresholdCount`
- `heatmapThresholdTime`
- `heatmapHideInternals`

## Caps

- `maxFetchEntries`
- `fetchPageSize`
- `maxPayloadBytes`
- `maxTransitions`
- `maxComposableHistory`
- `maxComposableEntries`
- `maxRenderTimeline`
- `maxTraces` — also caps the in-memory Nitro/SSR request archive used by Trace Viewer
- `maxPiniaTimeline`

## Guidance

Start with defaults, then tune caps only when memory or panel noise becomes a problem during long sessions.
