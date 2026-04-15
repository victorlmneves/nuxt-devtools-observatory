---
title: Trace Viewer
description: Track per-route spans and compare render regressions across traces.
---

![Trace Viewer](/screenshots/trace-viewer.png)

## What it tracks

- Route navigation and total visit duration
- Component lifecycle and render spans
- Fetch timing and SSR/CSR origin
- Transition phase spans
- Composable setup spans (client and SSR)
- Server phase spans for SSR handling

## What to watch for

- Components with high re-render count and total render cost
- Positive cross-trace delta (render regression)
- Slow spans on the route critical path
- Expensive SSR phases before response is returned

## Quick workflow

1. Open a trace and review Overview for hotspots.
2. Use Flamegraph and Waterfall to inspect nesting and timing groups.
3. In Cross-Trace Render Comparison, sort by delta and enable `regressions only`.
