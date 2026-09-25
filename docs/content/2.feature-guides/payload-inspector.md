---
title: Payload Inspector
description: Inspect Nuxt payload keys, serialized size, and SSR versus CSR hydration origin.
---

The Payload Inspector shows what landed in `nuxtApp.payload` after SSR and what was added later on the client.

## What it captures

- Keys from `payload.data` (`useAsyncData` / `useFetch` / `useNuxtData`)
- Keys from `payload.state` (`useState` serialized snapshot — live refs are in [State / cookies](/feature-guides/state-cookies))
- Pinia payload state and `_errors` when present
- Serialized byte size per key (JSON length)
- Origin: `ssr` for keys present during hydration / `serverRendered`, `csr` for keys added afterward

## Enable it

Set `payloadInspector: true` in module options (or `VITE_OBSERVATORY_PAYLOAD_INSPECTOR=true` in playground env).

## Read the data

- Stats: key count, total serialized bytes, whether the payload was `serverRendered`, and whether capture happened while hydrating.
- Table: key, bucket, origin, size, truncated preview.
- Inspector: selected key preview (truncated at 2KB).
