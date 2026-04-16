---
title: useFetch Dashboard
description: Inspect request timing, origin, status, and payload size.
---

![useFetch Dashboard](/screenshots/fetch-dashboard.png)

## What it tracks

- Request key and URL
- SSR or CSR origin
- Status and duration
- Payload size
- Waterfall timeline position

## Paging and virtualization

- Rows are appended with infinite scroll.
- `fetchPageSize` controls rows loaded per scroll step (default `20`).
- Visible rows are virtualized to keep DOM size stable while scrolling.

## What to watch for

- Duplicate fetches across navigation
- Slow outliers in duration
- Payloads near your `maxPayloadBytes` cap

## Quick workflow

1. Load a page with multiple async requests.
2. Sort by duration and inspect the slowest calls.
3. Correlate cache keys with your composables/pages.
