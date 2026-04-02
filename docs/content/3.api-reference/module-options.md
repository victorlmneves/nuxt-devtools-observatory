---
title: Module Options
description: Configuration for Observatory instrumentation and limits.
---

`ModuleOptions` is defined in `src/module.ts`.

## Feature toggles

- `fetchDashboard`
- `provideInjectGraph`
- `composableTracker`
- `renderHeatmap`
- `transitionTracker`

## Runtime behavior

- `instrumentServer`
- `composableNavigationMode` (`route` | `session`)
- `debugRpc`

## Render thresholds

- `heatmapThresholdCount`
- `heatmapThresholdTime`
- `heatmapHideInternals`

## Caps

- `maxFetchEntries`
- `maxPayloadBytes`
- `maxTransitions`
- `maxComposableHistory`
- `maxComposableEntries`
- `maxRenderTimeline`

## Guidance

Start with defaults, then tune caps only when memory or panel noise becomes a problem during long sessions.
