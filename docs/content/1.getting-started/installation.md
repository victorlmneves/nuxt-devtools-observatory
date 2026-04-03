---
title: Installation
description: Add the module and verify the Observatory tabs.
---

## 1) Install

```bash
pnpm add nuxt-devtools-observatory
```

## 2) Register in Nuxt config

```ts
export default defineNuxtConfig({
    modules: ['nuxt-devtools-observatory'],
    observatory: {
        instrumentServer: true,
    },
    devtools: { enabled: true },
})
```

## 3) Run your app

```bash
pnpm dev
```

Open Nuxt DevTools and confirm the Observatory tabs appear.

## 4) Validate first signal

Trigger one `useFetch` call in your app. You should see a new entry in the useFetch Dashboard timeline.

## SSR or SPA?

- SSR apps: keep `instrumentServer: true`.
- SPA-only apps: set `instrumentServer: false` to avoid duplicate server/client registration behavior.
