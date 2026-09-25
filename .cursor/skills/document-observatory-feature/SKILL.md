---
name: document-observatory-feature
description: Write or update Observatory feature guides and RPC/module-option contracts. Use when adding a tracker tab, changing a snapshot field, documenting a feature flag, or editing docs/content or README feature sections.
---

# Document an Observatory feature

Docs live in the Nuxt Content app under `docs/content/`. Keep the guide, RPC contract, module options, and README in the same change as the code.

Use `docs/content/2.feature-guides/state-cookies.md` and the **State / cookie contracts** section in `docs/content/3.api-reference/rpc-contracts.md` as the template.

## Checklist

```
- [ ] Feature guide: docs/content/2.feature-guides/<kebab-name>.md
- [ ] Link on docs/content/2.feature-guides/index.md
- [ ] Snapshot / command section in docs/content/3.api-reference/rpc-contracts.md
- [ ] Flag, cap, and env on docs/content/3.api-reference/module-options.md
- [ ] One-line README feature bullet (and a `###` section if the tab is user-facing)
- [ ] Screenshot only if the panel UI exists (`docs/public/screenshots/` or `docs/screenshots/`)
```

## Feature guide

File: `docs/content/2.feature-guides/<kebab-name>.md`

```markdown
---
title: State / cookies
description: Inspect live useState and useCookie keys, value previews, and cookie option metadata.
---

The State / cookies tab lists every `useState` and `useCookie` call Observatory wraps in your app.

## What it captures

- Key, kind, origin, truncated preview

## Enable it

`stateCookieTracker` defaults to on. Disable with `stateCookieTracker: false` or `OBSERVATORY_STATE_COOKIE_TRACKER=false`. Cap memory with `maxStateCookieEntries` (default 200).

## Read the data

- Filter, search, select a row
```

Required sections: **What it captures** (or **What it tracks**), **Enable it**, **Read the data**.
Add **Verification route** only when a playground `/test/<name>-verification` page exists.

Route slug is the file name: `state-cookies.md` → `/feature-guides/state-cookies`.

## RPC contracts

Edit `docs/content/3.api-reference/rpc-contracts.md`. Do not invent a second contract page.

Add a section that names:

- Snapshot field (`stateCookies`)
- Entry type (`IStateCookieEntry`) — use `I*` / `T*` names from `src/types/snapshot.ts`
- Feature flag (`features.stateCookieTracker`)
- Commands (`clearPiniaStores`, `editPiniaState`) only when `IObservatoryServerFunctions` gained methods

Keep the **Stability note**. Changing a snapshot field is an internal-but-documented contract change: update this file in the same PR as `src/types/rpc.ts` and `src/types/snapshot.ts`.

## Module options

`docs/content/3.api-reference/module-options.md` lists flags and caps only (no prose essays). Add:

- Feature toggle (`stateCookieTracker`)
- Cap (`maxStateCookieEntries`) under **Caps**
- Env names belong in **Enable it** on the feature guide, not as a second options table

## README

- Add one bullet under the top feature list
- Add a short `###` section next to the other trackers if the tab is user-facing
- Do not duplicate the full RPC field list in README

## Style

- Describe what the user sees and how to turn it on. Do not paste registry implementation.
- Say when data is truncated or missing (HttpOnly cookies, `maxPayloadBytes`, dynamic keys).
- Use the real option / snapshot / type names — no `StateCookieEntry` if the type is `IStateCookieEntry`.
