---
title: Pinia Tracker
description: Inspect store state, action and mutation timelines, dependency edges, and hydration attribution.
---

The Pinia Tracker helps you understand how each store changes over time and where those changes come from.

## What it captures

- Store state snapshots for each detected Pinia store.
- Action and mutation timeline events with before/after state and field-level diffs.
- Dependency edges showing which components and composables touch each store.
- Hydration attribution timeline (`nuxt-payload`, `persistedstate`, or `runtime`).

## Enable it

Set `piniaTracker: true` in module options (or `VITE_OBSERVATORY_PINIA_TRACKER=true` in playground env).

## Read the data

- `Stores` panel: detected stores and event counts.
- `Timeline` panel: chronological action/mutation events.
- `Inspector` panel: current store state, selected event diff, and before/after snapshots.

## Edit state

Use the `Edit state path` controls to patch a path such as `preferences.theme`.

Values accept JSON when valid (for example `"dark"`, `12`, `{ "enabled": true }`).
If JSON parsing fails, the raw string is used.

## Verification route

Use the playground route `/test/pinia-verification` with the test bridge API (`getPiniaStores`) for automated verification flows.
