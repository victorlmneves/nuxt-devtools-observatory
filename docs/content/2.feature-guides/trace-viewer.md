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
- Server phase spans for SSR handling, API / server routes, middleware, and cached handlers (`instrumentServer` required)
- Vue / app / navigation errors attached to the active route trace
- Navigation abort spans when a route is superseded before `page:finish`

Document HTML traces are named `ssr:<path>`. Non-HTML Nitro requests (API routes, middleware-only responses) appear in the same Trace Viewer as `nitro:<METHOD> <path>`. Cached handlers add a `nitro:cached` span with `cache: hit` or `cache: miss` when Nitro exposes cache status. Named middleware spans (`nitro:middleware:<name>`) are recorded when the h3 handler stack can be wrapped; otherwise a single `nitro:middleware` span covers the request until the handler. The archive used for API traces is a bounded list (same cap as `maxTraces`) and is not sent over HMR snapshots.

## What to watch for

- Components with high re-render count and total render cost
- Positive cross-trace delta (render regression)
- Slow spans on the route critical path
- Expensive SSR phases before response is returned

## Quick workflow

1. Open a trace and review Overview for hotspots.
2. Use Flamegraph and Waterfall to inspect nesting and timing groups.
3. In Cross-Trace Render Comparison, sort by delta and enable `regressions only`.
