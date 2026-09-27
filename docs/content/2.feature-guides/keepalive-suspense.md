---
title: KeepAlive / Suspense
description: Inspect KeepAlive activation and cache, plus Suspense pending and fallback timing.
---

The KeepAlive tab records `<KeepAlive>` activate / deactivate / eviction and `<Suspense>` pending / fallback / resolve events from the host app.

## What it captures

- KeepAlive child name and key
- Activation from first mount (`fromCache: false`) versus a cache hit
- Deactivate into cache, current cache size, and `max`
- Eviction when `max` is exceeded
- Suspense `pending` → `fallback` → `resolved` (or `interrupted` if unmounted early)
- `fallbackMs` (time until fallback) and `durationMs` (pending until resolve)

SSR does not emit these events (`window` is missing, so the Vue proxy uses the real components).

## Enable it

`keepAliveTracker` defaults to on. Disable with `keepAliveTracker: false` or `OBSERVATORY_KEEPALIVE_TRACKER=false`. Cap the event list with `maxKeepAliveEntries` (default 300).

## Read the data

- Filter by KeepAlive or Suspense
- Search by name, phase, or parent
- Select a row for cache contents, hits, timeout, and include / exclude

## Verification route

Use the playground route `/test/keepalive-verification` to switch cached panes (`max=2`) and remount a slow Suspense boundary.
