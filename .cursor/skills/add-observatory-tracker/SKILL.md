---
name: add-observatory-tracker
description: Add a new Observatory DevTools tracker (registry, snapshot field, feature flag, and iframe tab). Use when creating a panel, registry, snapshot key, or Vite transform for a new host-app signal.
---

# Add an Observatory tracker

Use the State / cookies stack as the template: `state-cookie-registry.ts`, `state-cookie-transform.ts`, `StateCookieTracker.vue`.

## Checklist

Copy this and tick items as you go:

```
- [ ] Snapshot type in src/types/snapshot.ts (`I*` entry, `T*` unions)
- [ ] Field + feature flag on IObservatorySnapshot in src/types/rpc.ts
- [ ] Registry in src/runtime/composables/ with getSnapshot() + bumpSnapshotRevision()
- [ ] Optional Vite transform in src/transforms/ + addVitePlugin / addImports in src/module.ts
- [ ] IModuleOptions flag + cap, env default in src/env-options.ts (`OBSERVATORY_*`)
- [ ] Register in src/runtime/plugin.ts and add trackerDefs / SNAPSHOT_KEY_ALIASES / features
- [ ] Seed latestSnapshot + features in src/module.ts
- [ ] applySnapshot + export ref in client/src/stores/observatory.ts
- [ ] View in client/src/views/ + tab in client/src/App.vue
- [ ] Runtime (and transform) tests
- [ ] Docs via the `document-observatory-feature` skill (guide + RPC + options + README)
- [ ] Playground page that exercises the signal
```

## Rules

- Capture only in the host runtime. The iframe reads the snapshot.
- Registry `getSnapshot()` must return JSON-safe, truncated previews — not live Vue refs.
- Feature flags default on unless there is a reason to ship off (`piniaTracker` is the off example).
- Keep names aligned: option `stateCookieTracker`, registry key `stateCookie`, snapshot field `stateCookies`, env `OBSERVATORY_STATE_COOKIE_TRACKER`.
- Interfaces `I*`, type aliases `T*`. See `.cursor/rules/type-naming.mdc`.

## After the code

Run `pnpm typecheck` and `pnpm test`. If the panel is user-visible, exercise it in the playground DevTools tab.
