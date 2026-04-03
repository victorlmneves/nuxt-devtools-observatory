# Documentation Site

This folder contains the custom Nuxt documentation app for `nuxt-devtools-observatory`.

Stack:

- Nuxt app shell (`docs/app.vue`, `docs/layouts/**`, `docs/pages/**`)
- Nuxt Content collections (`docs/content.config.ts`)
- Nuxt UI components and layout primitives

## Local development

From repository root:

```bash
pnpm docs:dev
```

Or from this folder:

```bash
pnpm dev
```

## Build

```bash
pnpm docs:build
```

## Vercel deployment

Recommended setup:

1. Create a Vercel project from this repository.
2. Set **Root Directory** to `docs`.
3. Keep framework detection as Nuxt.
4. Use preview deployments for pull requests.

With root directory set to `docs`, Vercel will use this folder's `package.json` scripts.
