---
title: RPC Contracts
description: Snapshot and command bridge between host app and DevTools iframe.
---

RPC types are defined in `src/types/rpc.ts` and snapshot-related fields in `src/types/snapshot.ts`.

## Core concepts

- `IObservatorySnapshot`: aggregated payload sent to the client panel.
- `IObservatoryServerFunctions`: host-side handlers (snapshot and command handling).
- `IObservatoryClientFunctions`: iframe-side event receiver methods.

## Typical flow

1. Runtime registries update state as instrumented events happen.
2. Host plugin builds a fresh snapshot.
3. Snapshot is sent over the bridge to the Observatory client.
4. Client store updates panel views.

## Stability note

Treat snapshot fields as an internal-but-documented contract for this module version line.
When changing fields, update docs and tests in the same PR.

## Payload inspector contracts

- Snapshot field: `payload` (`IPayloadInspectorSnapshot`).
- `keys` lists payload entries with `bucket`, `origin` (`ssr` | `csr`), `bytes`, and a truncated `preview`.
- Feature flag: `features.payloadInspector`.

## State / cookie contracts

- Snapshot field: `stateCookies` (array of `IStateCookieEntry`).
- Each entry has `kind` (`useState` | `useCookie`), `key`, `origin`, a truncated `preview`, and optional cookie option metadata.
- Feature flag: `features.stateCookieTracker`.

## Pinia contracts

- Snapshot field: `piniaStores` (array of `IPiniaStoreEntry`).
- Each store includes `state`, `timeline`, `dependencies`, and `hydrationTimeline`.
- `timeline` contains both action and mutation events with `beforeState`, `afterState`, and `diff`.

## KeepAlive / Suspense contracts

- Snapshot field: `keepAlive` (`IKeepAliveSnapshot`).
- `events` is an array of `IKeepAliveEntry` (`kind` `keep-alive` | `suspense`, `phase`, timings, optional cache metadata).
- `cache` is an array of `IKeepAliveCacheEntry` (`status` `active` | `cached` | `evicted`, `hits`).
- Feature flag: `features.keepAliveTracker`.

## Pinia commands

- `clearPiniaStores`: clears tracker timelines and dependency edges for all stores.
- `editPiniaState(storeId, path, value)`: patches nested state paths in a store.
