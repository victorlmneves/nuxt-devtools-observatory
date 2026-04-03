---
title: Render Heatmap
description: Identify render hotspots and inspect per-component render timelines.
---

![Render Heatmap](/screenshots/render-heatmap.png)

## What it tracks

- Render count and duration
- Mount vs update events
- Trigger keys (when available)
- Route association

## What to watch for

- Components crossing threshold count/time repeatedly
- Expensive updates on stable routes
- Noise from internals (toggle hide internals)

## Quick workflow

1. Set threshold values for your app scale.
2. Filter by route.
3. Inspect timeline of the hottest component and correlate trigger keys.
