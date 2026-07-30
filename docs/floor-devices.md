# Floor devices and the handheld app

Companion to [warehouse-data-model.md](./warehouse-data-model.md) and
[order-fulfilment-process.md](./order-fulfilment-process.md). Working document.

## What we have

**Honeywell Android handhelds**, with full freedom over what runs on them
(confirmed 2026-07-30). Today they run a WMS app that syncs picking into
NetSuite. **[unverified: whether that is NetSuite's own SCM mobile app, a
SuiteApp, or something third-party. Worth knowing, because it tells us what we
would be displacing and whether anything else depends on it.]**

This is a bigger unlock than it first appears, for two reasons.

**It makes the device a first-class part of the design rather than a fixed
constraint.** Capture at goods receipt — feed 1 in the data model doc, the one
that needs new operator behaviour — has an obvious home.

**It puts the picking path in reach.** The data model doc flagged inventory as
the one place where two sources of truth is genuinely dangerous, and suggested
mirroring NetSuite read-only "until the scanner path moves to us". If we own the
device, that is a decision we can make rather than wait for. It does not become
urgent, but it stops being blocked.

## Getting scan data: three options

Honeywell Android devices expose the scanner two ways, which gives three
realistic architectures.

### 1. Keyboard wedge into a web app

Honeywell's "Wedge as Keys" mode delivers scans as **keystrokes**. Any app with
a focused input receives them, including a browser. Recent Honeywell firmware
**defaults to keyboard output** on some devices, so this may already be how the
current app works.

- **Zero integration.** A React PWA gets scanning for free.
- **One codebase** shared with the packing station, which matches the React
  frontend decision already taken.
- **No install or MDM pipeline** — it is a URL.
- **But:** no control over scanner configuration (which symbologies are enabled,
  aim/trigger behaviour, decode feedback), and **focus management becomes
  load-bearing** — a scan goes wherever the caret happens to be. On a busy screen
  that is a real source of bugs.

### 2. Native app using the Data Collection Intent API

Honeywell's Intent API lets an app claim the scanner, configure it, receive
barcode events, and release it. Full control, including enabling only the
symbologies we actually use, which cuts misreads.

- **But:** a second codebase, a second set of skills, and an install/update
  pipeline. Hard to justify against a React frontend decision unless offline or
  scanner control forces it.

### 3. Thin native shell around the web app

A wrapper (Capacitor or similar) hosting the React app, using the Intent API
natively and handing scans to the web layer through a small bridge.

- Keeps one UI codebase, gains real scanner control and better offline and
  hardware access.
- Costs a build and distribution pipeline, and MDM for updates.

**Leaning:** start at option 1, because it is free and proves the workflows, but
**design the scan input behind a small abstraction from day one** so moving to
option 3 is a swap rather than a rewrite. Do not commit to native until
something concrete forces it. The two things most likely to force it are below.

## The two things that decide this

### Offline

Warehouses have dead spots. **A picking app that fails on a wifi dropout is worse
than paper**, because paper degrades gracefully and a spinner does not. This is
the single biggest constraint on the handheld app and it should be designed for
from the start, not retrofitted.

A PWA can do it — IndexedDB plus a sync queue — but "offline-capable" is a real
feature with real complexity: conflict handling, queue replay, and making the
operator's mental model of "did that save?" honest. It also interacts directly
with the inventory source-of-truth question: an offline queue means our stock
figures and NetSuite's diverge for as long as the queue is unflushed.

**Needs deciding explicitly**, per workflow. Receiving and packing are mostly
stationary and near infrastructure. Picking moves through the racking and is the
most exposed.

### Scales

Capture at receipt needs a weight, which means a scale that reports
electronically rather than an operator reading a display and typing a number
(which is a measurement *and* a transcription error).

- **Bluetooth scale** paired to the handheld. Web Bluetooth works in Chrome on
  Android, so option 1 may still reach it — **[unverified for the specific scale
  hardware; many industrial scales are serial or proprietary]**.
- **Fixed networked weigh station** at goods-in, posting to the backend directly,
  with the handheld only identifying the SKU. Probably more robust, and receiving
  is stationary anyway.

Open question 4 in the data model doc — whether a weigh/cube station exists today
— decides how much of this is new equipment versus new software.

## What runs where

Rough shape, assuming option 1 or 3:

| Surface | Device | Notes |
|---|---|---|
| Packing station | Desktop browser | Zebra label printing via the existing Browser Print path |
| Goods receipt / capture | Honeywell handheld | Scan SKU, capture dims and weight, first contact with a new SKU |
| Picking | Honeywell handheld | Most exposed to dead spots; needs offline |
| Put-away / stock take | Honeywell handheld | Later, with the location model |
| Admin (presets, items, layout) | Desktop browser | Reference data editing, not floor work |

One React codebase, responsive, with handheld-specific views — rather than a
separate mobile product.

## Open questions

1. What is the current picking app, exactly? Determines what displacing it costs
   and whether anything else depends on its NetSuite sync.
2. Is the scanner currently in keyboard wedge or intent mode? If wedge, option 1
   is proven on this hardware already.
3. Which workflows genuinely need offline, and how bad is wifi coverage in the
   racking? This is worth measuring rather than assuming, in both directions.
4. What scale hardware exists, and does it have a Bluetooth or network interface?
5. Is there an MDM in place? If so, option 3 is cheaper than it looks; if not,
   option 1 is worth more than it looks.
