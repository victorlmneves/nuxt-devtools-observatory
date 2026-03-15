# nuxt-devtools-observatory

Vue/Nuxt DevTools extension providing four missing observability features:

- **useFetch Dashboard** — central view of all async data calls, cache keys, waterfall timeline
- **provide/inject Graph** — interactive tree showing the full injection topology with missing-provider detection
- **Composable Tracker** — live view of active composables, their reactive state, and leak detection
- **Render Heatmap** — component tree colour-coded by render frequency and duration

## Installation

```bash
pnpm add nuxt-devtools-observatory
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-devtools-observatory'],

  observatory: {
    fetchDashboard: true,
    provideInjectGraph: true,
    composableTracker: true,
    renderHeatmap: true,
    heatmapThreshold: 5,   // highlight components with 5+ renders
  },

  devtools: { enabled: true },
})
```

Open the Nuxt DevTools panel — four new tabs will appear.

The DevTools client SPA runs on a dedicated Vite development server (port **4949**).

## How it works

All instrumentation is **dev-only**. The module registers Vite transforms that wrap
`useFetch`, `provide/inject`, and `useX()` composable calls at the AST level before
compilation. In production (`import.meta.dev === false`) the transforms are skipped
entirely — zero runtime overhead.

### useFetch Dashboard

A Vite plugin wraps `useFetch` / `useAsyncData` calls with a thin shim that records:

- Key, URL, status, origin (SSR/CSR)
- Payload size and duration
- Start offset for waterfall rendering

A Nitro plugin captures server-side fetch timing independently and tunnels it to the
client over the HMR WebSocket.

### provide/inject Graph

A Vite plugin wraps `provide()` and `inject()` calls with annotated versions that
carry file and line metadata. At runtime, a `findProvider()` function walks
`instance.parent` chains to identify which ancestor provided each key.
Any `inject()` that resolves to `undefined` is flagged immediately.

### Composable Tracker

A Vite plugin detects all `useXxx()` calls matching Vue's naming convention and
wraps them with a tracking proxy that:

1. Temporarily replaces `window.setInterval`/`clearInterval` during setup to capture
   any intervals started inside the composable
2. Wraps `watch()` calls to track whether stop functions are called on unmount
3. Snapshots returned `ref` and `computed` values for the live state panel
4. Flags any watcher or interval still active after `onUnmounted` fires as a **leak**

### Render Heatmap

Uses Vue's built-in `renderTriggered` mixin hook and `app.config.performance = true`.
A `PerformanceObserver` reads Vue's native `vue-component-render-start/end` marks for
accurate duration measurement. Component bounding boxes are captured via `$el.getBoundingClientRect()`
for the DOM overlay mode.

## Opting out

Add a `/* @devtools-ignore */` comment before any call to exclude it from instrumentation:

```ts
/* @devtools-ignore */
const { data } = useFetch('/api/sensitive')

/* @devtools-ignore */
const result = useMyComposable()
```

## Development

```bash
# Install dependencies
pnpm install

# Run the playground
pnpm dev

# Build the module (client SPA + Nuxt module)
pnpm build
```

## Architecture

```
src/
├── module.ts                           ← Nuxt module entry — registers transforms, plugins, devtools tabs
├── transforms/
│   ├── fetch-transform.ts              ← AST wraps useFetch/useAsyncData
│   ├── provide-inject-transform.ts     ← AST wraps provide/inject
│   └── composable-transform.ts         ← AST wraps useX() composables
├── runtime/
│   ├── plugin.ts                       ← Client runtime bootstrap
│   └── composables/
│       ├── fetch-registry.ts           ← Fetch tracking store + __devFetch shim
│       ├── provide-inject-registry.ts  ← Injection tracking + __devProvide/__devInject
│       ├── composable-registry.ts      ← Composable tracking + __trackComposable + leak detection
│       └── render-registry.ts          ← Render performance data via PerformanceObserver
└── nitro/
    └── fetch-capture.ts                ← SSR-side fetch timing

client/
├── index.html
├── vite.config.ts                      ← Client SPA Vite config (built to client/dist/)
├── tsconfig.json
└── src/
    ├── App.vue                         ← Tab navigation shell
    ├── main.ts
    ├── style.css                       ← Design system
    ├── components/
    ├── stores/
    └── views/
        ├── FetchDashboard.vue          ← useFetch tab UI
        ├── ProvideInjectGraph.vue      ← provide/inject tab UI
        ├── ComposableTracker.vue       ← Composable tab UI
        └── RenderHeatmap.vue           ← Heatmap tab UI

playground/
├── app.vue                             ← Demo app exercising all four features
├── nuxt.config.ts
├── composables/
│   ├── useCounter.ts                   ← Clean composable (properly cleaned up)
│   └── useLeakyPoller.ts               ← Intentionally leaky (for demo)
├── components/
│   ├── ThemeConsumer.vue               ← Successfully injects 'theme'
│   ├── MissingProviderConsumer.vue     ← Injects 'cartContext' (no provider — red node)
│   ├── LeakyComponent.vue              ← Mounts useLeakyPoller
│   ├── HeavyList.vue                   ← Re-renders on every shuffle (heatmap demo)
│   └── PriceDisplay.vue                ← Leaf component with high render count
└── server/api/
    └── product.ts                      ← Mock API endpoint
```

## License

MIT
