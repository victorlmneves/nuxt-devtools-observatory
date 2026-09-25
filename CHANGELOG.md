## [0.6.1](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.6.0...v0.6.1) (2026-09-25)


### Bug Fixes

* add --ignore-scripts flag to npm installation for trusted publishing in Release workflow ([fe43d2d](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/fe43d2df1058a1e70c5866f8b495cdc087e7a394))
* install npm 11 in Release so trusted publishing can authenticate ([5a76895](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/5a768957b1c2d87324973b9e5d7824a28bcaf0da))
* update npm version to 12.1.0 for trusted publishing in Release workflow ([554eb52](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/554eb52939deaf7f366455634b6b8a67daf90c3a))

# [0.6.0](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.5.0...v0.6.0) (2026-09-25)


### Bug Fixes

* stop using corepack to set up npm in the Release workflow ([3abad27](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/3abad27aa041b0e878a3f98204f1a166b74d215e))


### Features

* add Payload Inspector for Nuxt payload keys ([c7a62f4](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/c7a62f4590ca4a5cf6dedbe7e2ae3279be755eea))
* enhance Payload Inspector with improved entry selection and search functionality ([c8b845c](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/c8b845c78a08289c526cc00c65e5ab41ffa36979))

# [0.5.0](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.4.0...v0.5.0) (2026-09-18)


### Bug Fixes

* parse JSX/TSX in Observatory AST transforms ([f0bbe15](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/f0bbe15acd85f8f057ad9941dc477d53ef18f99b))
* skip wrapping auto-imported VueUse composables ([57bc072](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/57bc0724ac9326924f07120d279e049f4e6af692))
* update `getStorage` function to prefer `window.localStorage` for better test compatibility ([978e8f7](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/978e8f7d51710d7e029a606bf8cfbb65686cb711))


### Features

* Add `getStorage` function and refactor `localStorage` access in `useVirtualizationFlags ([02e9287](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/02e9287ad0d92560471a12aa9af59e77a0459074))
* add error handling instrumentation and UI updates ([c545a8a](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/c545a8a6d7f3dabe578cb2c8843e9ac0e8d3ed2b))
* code format ([6b6ca30](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/6b6ca3042e4964b4273f932ed8f72825214e78ca))
* instrument TransitionGroup in the transition tracker ([d251691](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/d251691aeed76405a1daf46d068aa3e6b4018db7))
* **pinia-tracker:** enhance Pinia store registry with attachPinia functionality ([88a4621](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/88a4621a1ad33376425cfa578f3eb1e2bcea5bdc))
* record $fetch, $fetch.raw, and $fetch.create in the fetch dashboard ([eb8581e](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/eb8581e7840dd17dbd87ace588863762aec8b810))
* **RenderHeatmap:** add visual indication for hot components exceeding threshold ([e4d4280](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/e4d42802f0680a7a87f4e8510b6d267d78df865a))
* **RenderHeatmap:** enhance tree node depth styling and adjust layout for better visibility ([44142a6](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/44142a6478e81972c147a08e85226dab370c2c41))
* **RenderHeatmap:** implement dynamic tree node styling based on depth ([360e2cb](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/360e2cbc04ef37f7b2184be118c69ce86f434d2a))
* Update type assertions for $fetch in fetch.test.ts ([ab5afe8](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/ab5afe88507db398647f204076cebf5076a4be41))
* **virtualization:** enable virtualization flags by default and implement localStorage persistence ([11cae7e](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/11cae7e7a49f8b6315d4b06d857ec3a717d74631))

# [0.4.0](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.3.0...v0.4.0) (2026-09-15)


### Bug Fixes

* enhance runtime plugin handling by introducing Trace Viewer support ([825b415](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/825b415b0c5a614e276396ded4db96c67b60c366))
* **nitro:** isolate SSR observatory context per request ([f5af912](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/f5af912ce5da6a7d9ae96d98c0c21c31444c0fdd))
* update heatmap threshold time from 1600ms to 16ms across configuration files and documentation ([074e140](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/074e1403c1e5fe7e2f2dd168249c710aa6189c04))


### Features

* refactor composableNavigationMode assignment in createModuleDefaults ([9afcf43](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/9afcf43e2743e529aabcbe0d74a152ff92c02453))
* update environment variable access and improve test configurations ([af7d44c](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/af7d44c1e62d500d3d17a1a4dd78b5081159c587))
* update environment variable configuration and documentation for observatory features ([3784f57](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/3784f57384df1da9b5ccf86b98f37eb7b622619b))

# [0.3.0](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.2.3...v0.3.0) (2026-09-15)


### Features

* update ESLint configuration and CI workflows ([d6f63ea](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/d6f63ea69f4dc99b2674bb8d0ea7ad354801a810))

## [0.2.3](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.2.2...v0.2.3) (2026-09-15)


### Bug Fixes

* cap traces and avoid heartbeat snapshot stringify ([cf9a88a](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/cf9a88a125e7b16228002aefd9e581821e1d3e1c))

## [0.2.2](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.2.1...v0.2.2) (2026-09-12)


### Bug Fixes

* add spacing around docs site and article footers ([00ffea2](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/00ffea29b4677bd8532eeb4b6653661afaf14497))

## [0.2.1](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.2.0...v0.2.1) (2026-09-10)


### Bug Fixes

* restore Tailwind package imports in the docs CSS ([7fdf68d](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/7fdf68d6f492df345fdb4f734be55df2a96a125e))

# [0.2.0](https://github.com/victorlmneves/nuxt-devtools-observatory/compare/v0.1.34...v0.2.0) (2026-09-10)


### Features

* add commitlint and semantic-release configuration ([0c79de0](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/0c79de0a884cd466bda6ba098375b8609c0fd96a))
* update CI workflow permissions ([b64e58f](https://github.com/victorlmneves/nuxt-devtools-observatory/commit/b64e58f09d78c53db7c6dbf1326927c3f51af7ca))
