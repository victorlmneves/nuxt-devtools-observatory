---
title: Composable Tracker
description: Track composable lifecycles, reactive values, and leak signals.
---

![Composable Tracker](/screenshots/composable-tracker.png)

## What it tracks

- Composable instances and source file
- Reactive snapshot values
- Change history
- Active watchers and intervals
- Leak status after unmount

## What to watch for

- Instances stuck after route change
- Watchers/intervals not cleaned on unmount
- Shared state keys marked as global

## Quick workflow

1. Switch to `session` mode for multi-page investigation.
2. Filter to `leaks only`.
3. Open source and confirm cleanup in `onUnmounted`.
