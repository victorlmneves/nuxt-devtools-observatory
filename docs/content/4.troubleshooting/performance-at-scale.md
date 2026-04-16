---
title: Performance At Scale
description: Notes and guardrails for high-volume Observatory workloads.
---

Use this page when validating Observatory behavior on larger projects or sustained sessions.

## What Is Already Covered

The initial scalability rollout has been completed:

- Virtualized rendering for heavy observer screens behind rollout flags.
- Multiple optimization passes to reduce repeated list scans and per-row recomputation.
- Verification guardrails to catch large regressions early.

## Rollout Flags

Query flags can be used to scope or force virtualization behavior:

- `virt`
- `virtFetch`
- `virtHeatmap`
- `virtTraces`
- `virtComposables`
- `virtTransitions`

Example:

```text
http://localhost:3000/__observatory/?virt=1&virtHeatmap=1&virtTraces=1
```

## Benchmark Notes

The repository focuses on stable regression detection over absolute micro-benchmarks.

- Guardrail checks use generous thresholds (around `2000ms` for bridge-read smoke checks)
  to avoid CI flakiness while still catching major slowdowns.
- Baseline quality commands:
    - `pnpm format`
    - `pnpm test`
    - `pnpm test:e2e`
- For deeper analysis, profile in-browser while exercising heavy playground routes:
    - `/test/heatmap-verification`
    - `/test/trace-verification`

## Recommended Limits

When data volume grows aggressively, tune these settings in `nuxt.config.ts`:

- `maxFetchEntries`
- `maxTransitions`
- `maxComposableEntries`
- `maxComposableHistory`
- `maxRenderTimeline`

Reducing these limits lowers memory pressure and keeps observer views responsive.

## Practical Validation Flow

1. Start the playground and open the target heavy route.
2. Run interaction bursts (rapid navigation, repeated updates, heavy list rendering).
3. Confirm observer panels stay interactive.
4. Run format, unit tests, and e2e tests before merge.
