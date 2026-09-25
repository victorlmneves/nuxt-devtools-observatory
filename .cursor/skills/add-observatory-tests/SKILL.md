---
name: add-observatory-tests
description: Write Observatory unit or Playwright verification tests for registries, transforms, Nitro, or panel correctness. Use when adding tests, fixing a failing spec, or covering a new tracker.
---

# Add Observatory tests

Pick the smallest runner that can prove the change.

## Unit (preferred)

- Registry behavior → `tests/runtime/<name>.test.ts` with `// @vitest-environment happy-dom`
- Vite rewrite → `tests/transforms/<name>.test.ts`
- Nitro / SSR context → `tests/nitro/`

Pattern for a registry test:

1. Import `setupXRegistry` from `@observatory/runtime/composables/...`
2. Type `window` as `TObservatoryWindow` and delete `__observatory__` in hooks
3. Call public methods, assert `getSnapshot()`
4. Cover cap/eviction, origin (`ssr` / `csr`), and the transform helper if one exists (`__trackStateCookie`)

Env flags belong in `tests/runtime/env-options.test.ts`.

## Playwright verification

Use only when the bug is “the panel shows the wrong thing in a real app”.

- Spec: `tests/verification/<tracker>.spec.ts`
- Bridge: `getTestBridge` / `waitForBridge` from `tests/verification/helpers/observatory-bridge.ts`
- Types: `tests/verification/types/observatory.types.ts` (keep these in sync with snapshot shapes)
- Drive the playground page, then assert bridge data — not CSS pixels

Run `pnpm test` for unit tests. Run `pnpm verify` only for verification specs.
