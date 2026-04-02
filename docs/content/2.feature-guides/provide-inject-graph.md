---
title: provide/inject Graph
description: Visualize providers, consumers, shadowing, and missing injections.
---

![provide/inject Graph](/screenshots/provide-inject-graph.png)

## What it tracks

- Provider and consumer nodes
- Key-level scope labels
- Missing provider warnings
- Shadowed keys

## What to watch for

- Red nodes: unresolved injection
- Shadowed keys: confusing override chains
- Unexpected provider scope (layout vs component)

## Quick workflow

1. Filter by one injected key.
2. Open the selected provider in editor.
3. Validate intended scope and avoid accidental shadowing.
