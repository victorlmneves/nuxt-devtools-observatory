---
title: RPC Contracts
description: Snapshot and command bridge between host app and DevTools iframe.
---

RPC types are defined in `src/types/rpc.ts` and snapshot-related fields in `src/types/snapshot.ts`.

## Core concepts

- `ObservatorySnapshot`: aggregated payload sent to the client panel.
- `ServerFunctions`: host-side handlers (snapshot and command handling).
- `ClientFunctions`: iframe-side event receiver methods.

## Typical flow

1. Runtime registries update state as instrumented events happen.
2. Host plugin builds a fresh snapshot.
3. Snapshot is sent over the bridge to the Observatory client.
4. Client store updates panel views.

## Stability note

Treat snapshot fields as an internal-but-documented contract for this module version line.
When changing fields, update docs and tests in the same PR.

## Pinia contracts

- Snapshot field: `piniaStores` (array of `PiniaStoreEntry`).
- Each store includes `state`, `timeline`, `dependencies`, and `hydrationTimeline`.
- `timeline` contains both action and mutation events with `beforeState`, `afterState`, and `diff`.

## Pinia commands

- `clearPiniaStores`: clears tracker timelines and dependency edges for all stores.
- `editPiniaState(storeId, path, value)`: patches nested state paths in a store.
