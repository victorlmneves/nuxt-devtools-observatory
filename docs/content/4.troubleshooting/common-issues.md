---
title: Common Issues
description: Practical fixes for setup, data flow, and panel behavior.
---

## Tabs do not appear in DevTools

- Confirm module registration in `nuxt.config.ts`.
- Confirm `devtools.enabled` is true.
- Restart dev server after config changes.

## Duplicate or unexpected server-side signals

- For SPA-only projects, set `instrumentServer: false`.
- For SSR projects, keep `instrumentServer: true`.

## provide/inject shows missing providers

- Validate key names and symbols match provider/consumer code paths.
- Check if provider lives in a branch not mounted for the current route.

## Composable leak warnings

- Ensure timers are cleared in `onUnmounted`.
- Dispose watcher handles created manually.

## Render Heatmap is too noisy

- Increase `heatmapThresholdCount` and `heatmapThresholdTime`.
- Enable `heatmapHideInternals`.

## Bridge or snapshot debugging

- Set `debugRpc: true` to inspect bridge behavior while reproducing issue.
