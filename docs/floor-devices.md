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

## Getting scan data: four options

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

### 3. React Native

A real native app with React as the programming model. **The Honeywell
integration is well-trodden** — there are at least five community modules
wrapping the intent API (Volst's `react-native-honeywell-scanner` and duytq94's
fork being the most referenced), all doing essentially the same thing:
registering a `BroadcastReceiver` for Honeywell's scan intents and emitting
events to JS.

- Mature offline primitives (SQLite, background tasks), good long-list
  performance, no browser quirks.
- **But the "shared React codebase" is partly illusory.** React Native uses
  `View`/`Text`, not `div`/`span`. The desktop packing station and the handheld
  would share types, API client, validation and domain logic — but not
  components. That sharing is achievable from a monorepo package regardless of
  which option we pick, so it is not really an argument *for* RN.

### 4. Tauri v2 — the one that fits what we already do

Tauri v2 targets Android, hosts the React app in a system webview, and exposes
native capability through Rust plugins. **Nosdesk's mobile app is already Tauri
v2, with hand-written plugins (`tauri-plugin-push`, `tauri-plugin-secure-store`).**

- **Same React codebase as the packing station**, genuinely — it runs the web
  app, so components are shared rather than merely conceptually similar.
- **Rust end to end**, matching the backend and existing skills.
- Offline via Rust-side SQLite and filesystem, which is a better story than
  service workers and IndexedDB and comparable to RN.
- The Honeywell bridge would be **a Tauri plugin we write** rather than an npm
  install — but it is small: a `BroadcastReceiver` for the scan intent, forwarded
  to the web layer. The React Native modules above are open-source references for
  exactly which intents and extras to listen for. This is the third such plugin
  in the stack, not the first.

## Leaning

**Options 1 then 4.** Start on keyboard wedge because it costs nothing and proves
the workflows on real hardware, and move to Tauri when offline or scanner control
forces it. Both run the same React app, so this is a packaging change rather than
a rewrite — provided **scan input sits behind a small abstraction from day one**,
which is the one thing worth doing now.

React Native is a perfectly good answer and has the better off-the-shelf Honeywell
story. It loses here on fit rather than merit: it would mean a second UI codebase
and a JS-native stack sitting beside an otherwise Rust-and-web one, to solve a
problem Tauri already solves in this codebase. Revisit if Tauri's Android webview
turns out to be a problem on these specific devices — **[unverified: Honeywell
handhelds can run older Android and older WebView; worth checking the OS version
before committing, since it constrains options 1 and 4 equally.]**

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

Rough shape, assuming option 1 or 4:

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
5. Is there an MDM in place? If so, option 4 is cheaper than it looks; if not,
   option 1 is worth more than it looks.
6. What Android and WebView version do the handhelds run? Constrains options 1
   and 4 equally, and is the main thing that would push us to React Native.
