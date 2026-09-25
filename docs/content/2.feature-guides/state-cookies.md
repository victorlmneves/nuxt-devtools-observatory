---
title: State / cookies
description: Inspect live useState and useCookie keys, value previews, and cookie option metadata.
---

The State / cookies tab lists every `useState` and `useCookie` call Observatory wraps in your app. Payload Inspector still shows serialized `payload.state` after SSR; this tab is the live ref, including later client writes.

## What it captures

- Key (or `(dynamic)` when the first argument is not a string literal)
- Kind: `useState` or `useCookie`
- Origin: `ssr` while Nuxt is hydrating, otherwise `csr`
- Truncated value preview (not a full dump of `document.cookie`)
- For cookies: `maxAge`, `path`, and `httpOnly` when those options were passed

HttpOnly cookies are not readable from client JS. Observatory only sees what `useCookie` returns in the instrumented call.

## Enable it

`stateCookieTracker` defaults to on. Disable with `stateCookieTracker: false` or `OBSERVATORY_STATE_COOKIE_TRACKER=false`. Cap memory with `maxStateCookieEntries` (default 200).

## Read the data

- Filter by `useState` / `useCookie`
- Search by key
- Select a row for the full (still truncated) preview
