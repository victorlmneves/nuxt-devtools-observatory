---
title: Transition Tracker
description: Track transition phases, durations, and cancellations in real time.
---

![Transition Tracker](/screenshots/transition-tracker.png)

## What it tracks

- Transition name and direction
- Lifecycle phase
- Measured duration
- Parent component context
- Cancelled events

## What to watch for

- Frequent enter/leave cancellation
- Unexpectedly long durations
- Missing phase completion events

## Quick workflow

1. Trigger route or state transitions.
2. Confirm expected phase order.
3. Inspect cancellations to diagnose interrupted UI flows.
