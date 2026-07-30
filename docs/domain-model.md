# Domain model

Companion to [warehouse-data-model.md](./warehouse-data-model.md) (which covers
*what data we need and where it comes from*). This covers *how it is shaped*.

Working document. Table sketches are indicative — enough to argue with, not a
migration.

## Design principles

These are the rules we hold ourselves to. They exist because the failure mode is
known: NetSuite is capable and awful, and it got that way one reasonable
compromise at a time.

**1. Few primitives, composed.** The target is a small set of orthogonal
concepts that combine, not a concept per business noun. If a new feature needs a
new table, that is a signal worth examining — most should be new *queries*.

**2. Facts are append-only; state is a projection.** Two things actually happen
in a warehouse: stock moves, and things get measured. Both are observations, both
are recorded forever, and current state is derived from them. This gives audit,
reconciliation and history for free rather than as three later projects.

**3. No JSON for anything we query.** JSONB is permitted for exactly one thing:
opaque third-party payloads retained for audit (a raw MachShip response, a
webhook body). If we would ever filter, join, sort or aggregate on it, it is a
column or a table. "We'll make it flexible with JSON" is the first step toward
the mess we are replacing.

**4. No entity-attribute-value, no custom-field framework.** Adding a column is
cheap and migrations are routine. A generic attribute system is how you get a
schema that cannot be read and queries that cannot be optimised.

**5. Canonical units, integers.** Lengths in **millimetres**, mass in **grams**,
money in **minor units**, all as integers. Conversion happens at the edges.
Floating-point dimensions and money are a permanent source of drift and
off-by-a-cent bugs. (The label maker already resolves everything to millimetres —
same convention.)

**6. Queries are designed with the schema.** The quality bar is one screen,
sub-second. That means for each screen we know its query. If a screen needs a
dozen joins, the model is wrong — we find that out now, on paper, not after the
N+1 shows up in production.

**7. Deliberate omission is a feature.** Every capability we do not build is
complexity we do not carry. See "What we are deliberately not building".

## The spine: two fact tables

Everything else hangs off these.

### `stock_movement` — every change in where stock is

```
stock_movement
  id
  occurred_at
  item_id
  quantity                -- signed, in the item's base unit
  from_location_id        -- null = entered the system (receipt)
  to_location_id          -- null = left the system (despatch, write-off)
  lot_id                  -- nullable
  reason                  -- enum: receipt, putaway, pick, pack, despatch,
                          --       adjustment, stocktake, transfer, return
  reference_type          -- what caused it (fulfilment, receipt, adjustment...)
  reference_id
  actor_id
```

**Stock on hand is the sum of these.** We keep a materialised `stock` table
(item × location × lot → quantity) updated in the same transaction as the
movement, because summing history on every read does not stay fast. The
invariant is that `stock` is always rebuildable from `stock_movement`, and a
periodic job asserts it. That is the reconciliation story, and it exists from
day one rather than being bolted on when the numbers first disagree.

Nothing writes to `stock` directly. Ever. That single rule is what keeps
inventory explicable.

### `measurement` — every physical observation

```
measurement
  id
  observed_at
  subject_type            -- enum: item, package_type, package
  subject_id
  metric                  -- enum: length, width, height, weight, cube
  value                   -- integer, canonical unit
  source                  -- enum: measured, supplier, derived, carrier_actual,
                          --       operator_correction, estimated
  confidence              -- enum or small int
  actor_id
  note
```

This is the "dimensional data is a living asset" model made concrete. The four
feeds from the data model doc are just `source` values. Nothing is overwritten —
a new observation supersedes an old one, and the history explains itself.

Current dimensions are a projection: the most recent, highest-confidence
measurement per (subject, metric). Materialised the same way as `stock`, for the
same reason.

**Why this matters:** when a carrier re-weighs a consignment and bills us for the
difference, that is a `measurement` with `source = carrier_actual`. Comparing it
to our prediction is then a query, not an integration project — and it both
finds bad records and quantifies what they cost.

## Catalogue

```
item
  id, code, description, base_unit, active
  dangerous_goods_class, un_number, packing_group   -- nullable
  temperature_class, stackable, max_stack_height_mm
  this_way_up

item_packing_config           -- how an item is presented for shipping
  id, item_id
  units_per_inner
  inners_per_carton
  cartons_per_layer           -- the classic Ti
  layers_per_pallet           -- the classic Hi
  package_type_id             -- what it ships as
  effective_from
```

Dimensions live in `measurement`, not here. That is deliberate: an item's weight
is an observation with a provenance, not an attribute someone typed once.

`item_packing_config` is versioned by `effective_from` so a consignment shipped
last year can still explain its own dimensions.

## Packaging

```
package_type                  -- the preset catalogue
  id, name                    -- 'PALLET', 'SKID', 'small box', or an item code
  carrier_package_code        -- 'PAL' etc.
  dimensions_fixed            -- boolean: a box's are, a pallet's height is not
  tare_weight_g
  effective_from
```

Default dimensions are `measurement` rows with `subject_type = package_type`.
Same provenance model, one mechanism.

## Space

```
site
  id, name, timezone

location
  id, site_id, code
  aisle, bay, level, position        -- parsed, not just a code string
  x_mm, y_mm, z_mm                   -- for the map and the router
  length_mm, width_mm, height_mm
  kind                               -- pick_face, bulk, staging, dock, overflow
  max_weight_g
  reachable_by                       -- equipment class

location_edge                        -- the traversable graph
  from_location_id, to_location_id, distance_mm, bidirectional
```

Coordinates and the graph are needed only by the map and the route optimiser.
They are nullable and can stay empty until the survey happens — which is what
stops the survey blocking fulfilment work.

## Fulfilment

This is where NetSuite spreads one flow across four record types and loses the
package count entirely. The chain here is **order → fulfilment → package →
consignment**, with one join table that NetSuite has no equivalent of.

```
order
  id, customer_id, confirmation_number, contact_id, site_id, placed_at, status

order_line
  id, order_id, item_id, quantity_ordered

fulfilment                     -- a commitment to ship part of an order
  id, order_id, site_id, status
  picked_by_id, packed_by_id, picked_at, packed_at

fulfilment_line
  id, fulfilment_id, order_line_id, quantity

package                        -- a physical parcel. First-class.
  id, fulfilment_id, package_type_id
  length_mm, width_mm, height_mm, gross_weight_g
  dimensions_source            -- computed | confirmed | corrected
  barcode
  sequence                     -- 1 of 3, 2 of 3

package_content                -- WHAT IS IN THE BOX
  id, package_id, fulfilment_line_id, quantity
```

**`package_content` is the capability NetSuite does not have.** Because packages
are real rows rather than a count typed into MachShip at the last moment, and
because contents join back to fulfilment lines, we can answer:

- what is physically in this carton (packing list, per package)
- which package a damaged or missing item was in (carrier claim)
- what actually arrived when a delivery is partial
- whether a package's declared weight matches its contents (before the carrier
  tells us, expensively)

That last one is a query against `measurement` and `package_content`. In NetSuite
it is not answerable at all.

Note that `package` carries denormalised dimensions rather than reading them from
`measurement`. That is intentional: a shipped package's dimensions are a
historical fact about that consignment and must never change when a preset is
later corrected. `dimensions_source` records whether they were computed from
packing config, confirmed by an operator, or corrected — which is also feed 2.

## Freight

The D1 decision — MachShip now, Swift and Direct direct later — is a schema
question, and this shape makes the migration a data change rather than a rewrite.

```
carrier                        -- Swift, Direct, and the rest
  id, name, code

freight_provider               -- HOW we reach a carrier
  id, name, kind               -- machship | direct_api
  
carrier_service
  id, carrier_id, name, code

consignment
  id, fulfilment_id
  carrier_id                   -- who is carrying it
  freight_provider_id          -- who we booked it through
  carrier_service_id
  provider_consignment_id      -- MachShip's id, or the carrier's
  carrier_consignment_number
  despatch_at, eta
  price_minor, currency
  status

consignment_package            -- packages on this consignment
  consignment_id, package_id

provider_exchange              -- raw request/response, audit only
  id, consignment_id, direction, payload jsonb, occurred_at
```

**Separating `carrier` from `freight_provider` is the whole trick.** Swift is a
carrier today reached via MachShip; tomorrow it is the same carrier reached
directly. Consignment history stays coherent across the switch, and "what did
Swift cost us this quarter" is one query that spans both eras.

`provider_exchange.payload` is the *only* JSONB in the model, and it is
write-only audit — never queried structurally (principle 3).

### Carrier rules, without a rules engine

Swift needs 07:00 next-business-day despatch and a caller value of `Foodcare`.
Direct needs two labels when palletised. The temptation is a config blob or a
rules engine. For a handful of carriers, both are bloat.

```
carrier_profile
  carrier_id
  default_despatch_time, default_despatch_day_offset
  caller_value
  labels_per_pallet, labels_per_carton
  requires_manifest
  requires_dg_declaration
```

Explicit columns. When a carrier needs something genuinely new, add a column.
If this table ever reaches thirty columns of one-carrier-only flags, *then*
reconsider — but design for the five carriers we have, not the fifty we imagine.

## What emerges

The point of principle 1. These are features we do not build so much as query:

| Capability | Falls out of |
|---|---|
| Stock history, traceability, audit | `stock_movement` existing at all |
| Reconciliation against NetSuite | `stock` rebuildable from movements |
| WMS dimension autofill | `item_packing_config` + `measurement` |
| Packing calculator | the same two, used to decide rather than describe |
| Freight cost validation | `measurement(carrier_actual)` vs our prediction |
| Per-package packing lists | `package_content` |
| Carrier damage claims | `package_content` + `consignment_package` |
| 3D map occupancy | `location` coords + `stock` |
| Pick routing | `location` coords + `location_edge` + `stock` |
| Dimensional data quality reporting | `measurement.source` + `confidence` |
| "What did Swift cost us" across the MachShip/direct switch | `carrier` vs `freight_provider` |

Eleven capabilities, roughly fifteen tables, no rules engine and no custom-field
framework.

## Query discipline

Principle 6, made specific — this is the answer to "no bandaid N+1s".

**Know the screen's query before building the screen.** The packing station is
the test case: scan a confirmation number, and one round trip should return the
order, its fulfilment, its lines, the items, their packing configs, current
dimension projections, and the available package presets. That is a handful of
joins against indexed foreign keys, and it should be written and explained before
any UI exists.

**Batch, never loop.** With Diesel that means `belonging_to` plus `grouped_by`
for children, not a query inside a `for`. Worth an explicit review rule: any
database call inside a loop is a defect unless argued for.

**Projections are tables, not views over views.** `stock` and current dimensions
are materialised and maintained transactionally. Stacked views are where query
plans go to die.

**Indexes designed with the query.** At minimum: `stock_movement(item_id,
occurred_at)`, `stock(item_id, location_id)`, `measurement(subject_type,
subject_id, metric, observed_at desc)`, `package_content(package_id)`,
`consignment(carrier_id, despatch_at)`.

## What we are deliberately not building

Principle 7. Named so they are decisions rather than oversights:

- **A custom-field framework.** Add columns.
- **A workflow/rules engine.** `carrier_profile` columns until proven insufficient.
- **A generic document model.** Orders, fulfilments and consignments are
  different things and benefit from being different tables.
- **Multi-currency**, until a second currency exists. `currency` is recorded;
  nothing converts.
- **A full double-entry inventory ledger.** `stock_movement` is a movement log,
  not accounting. NetSuite remains the financial system for now.
- **Serial-number tracking**, unless it turns out to be required. Lot/batch is
  modelled because food likely needs it; serials are a much heavier commitment.

## Decisions

Taken 2026-07-30 in response to [competitor-analysis.md](./competitor-analysis.md).

### D4 — Inventory status joins the `stock` key

Accepted as flagged. `inventory_status(id, name, is_available_for_allocation)`;
`status_id` in the `stock` key; `from_status_id`/`to_status_id` on
`stock_movement` mirroring the location pair. Everything defaults to `available`.

Also fixes a live correctness bug: `reason = 'return'` currently restocks
straight into pickable inventory with no inspection state.

### D5 — The ledger is a CRDT. There is no offline mode.

**Decision.** Real-time synchronisation, with the movement ledger given
**operation-CRDT semantics** so that a dropout degrades gracefully instead of
triggering a separate offline code path. We do **not** build an offline-first
handheld app with a queue-and-replay design.

**The reframe.** The scanner is observing physical reality; the database is a
model of it. **When they disagree the scanner is usually right.** A scan is
therefore not a request to be validated against system state — it is a
*delta asserted at the place and time the physical event happened*.

**`stock_movement` with `client_event_id` already is the right CRDT.** An
append-only set of uniquely-identified signed deltas, projecting to a counter,
is an op-based PN-Counter: commutative, associative, idempotent. Order of arrival
does not matter and replay is a no-op. So gap 6 is not an idempotency bandaid
bolted onto a ledger — **it is the column that makes the ledger convergent.**
That reframing is why it is non-negotiable rather than nice-to-have.

Columns: `client_event_id` (unique), `device_id`, `recorded_at` (server clock,
distinct from `occurred_at` device clock).

**Yjs/`yrs` is the wrong tool for stock, and we should not force it.** Nosdesk
uses Yjs for collaborative documents, which is what Yjs is excellent at. But
`Y.Map` fields are last-writer-wins registers: if two pickers concurrently pick
the last unit, LWW **silently discards one pick**. That is the exact failure the
ledger exists to prevent. Document CRDTs are for shared mutable state; a warehouse
ledger is accumulated immutable facts. Different primitive, deliberately.

What *is* reusable from Nosdesk is the layer underneath: the WebSocket sync
transport, presence, reconnection and backpressure handling in `backend/src/sync`
and `handlers/collaboration.rs`. That is transport, and it is CRDT-type-agnostic.

**Convergence is not invariant preservation.** This is the honest limitation and
it must be designed for, not discovered. A CRDT guarantees all replicas agree; it
cannot guarantee `stock.quantity >= 0`, because enforcing that requires
coordination and coordination is what we are giving up. Two pickers taking the
last unit will converge on **-1**.

**We allow it.** Negative stock is not corruption — it is a *discovered
discrepancy*, and it is information: someone physically picked stock the model did
not know about, so the model was wrong. Negative balances surface as exceptions
for resolution rather than being rejected at write time. Rejecting the write would
mean discarding a true observation about the physical world to protect a database
invariant, which is precisely backwards.

**Counts are assertions, not deltas** — a stocktake says "there are 47 here",
which is an absolute claim about state, a different CRDT class (a register, not a
counter). Mixing assertions with deltas naively is where this design breaks: any
movement landing mid-count silently corrupts a computed adjustment.

**Resolved by D8**: a count does not adjust anything. It is recorded as an
observation, and the variance against the ledger becomes a *finding* that a human
resolves. The adjusting movement is then written by the resolution, carrying a
reason. See D8.

### D6 — `package` becomes a container

Accepted as flagged. `fulfilment_id` nullable; add `location_id`,
`parent_package_id`, `is_mobile`, `sscc`; `package_type` gains `reusable`,
`max_payload_g`, `max_cube_mm3`. Nesting constrained to depth 2 (pallet → carton)
so `package_content` queries stay non-recursive.

One primitive serves shipped parcels, pallets of cartons, picking totes, putaway
LPNs and put-wall cells — principle 1 arguing for building it once, properly.

### D7 — Warehouse tasks are not Nosdesk tickets, but exceptions are

**Decision.** `move_task` is its own table in this system. We do **not** model
warehouse work as Nosdesk tickets. But **Nosdesk is the escalation target**: when
a task fails — short pick, damage found, location empty, count mismatch — that
becomes a ticket, with the task as its origin.

**Why not conflate.** They differ on every axis that matters:

| | Warehouse task | Nosdesk ticket |
|---|---|---|
| Origin | Machine-generated | Human-authored |
| Volume | Thousands/day | Tens/day |
| Lifetime | Seconds to minutes | Hours to days |
| Completion | Defined condition | Negotiated |
| Shape | (item, from, to, qty) | Conversation |

Forcing one table to be both means a ticket schema carrying warehouse columns and
a warehouse hot path carrying comment threads. That is the accreted-complexity
failure this project exists to avoid.

**Why the seam is genuinely valuable.** Exceptions are exactly the warehouse
events that *do* need conversation, assignment, history and SLA — which is what
Nosdesk already is. A short pick that becomes a ticket, routed to the right
person, with the pick task linked, is better than anything in the competitor set.
None of them have a real exception-management surface; they have status codes.

**What we share.** The platform, not the entity: Rust/Actix/Diesel/Postgres, auth,
the sync transport (D5), and the plugin SDK. Whether that means a shared workspace
or a service boundary is open — see question 14.

### D8 — Discrepancy is a designed output, not a failure mode

**Decision.** The system does not try to prevent physical reality from diverging
from the model. It **surfaces divergence with enough context to investigate**,
while the warehouse keeps running. Discrepancy is a first-class entity with an
owner, evidence and a resolution — not an error state, not a silent correction.

**The reasoning.** D5 framed negative stock as an unfortunate consequence of
choosing convergence over coordination. That framing was too defensive. In a
system that records **what was actually done**, a discrepancy is not a flaw in
the design — it is the most valuable thing the system produces. A mismatch means
something physical happened that nobody recorded: stock damaged and not reported,
stock never delivered, a mis-pick, a mislabelled pallet. Every competitor treats
these as adjustments to be reconciled away. Making them *findings to be
investigated* is a capability none of them offer.

**Three consequences.**

**1. The work event is the invariant.** What stock was taken, from where, by
whom, for which order is created by the person doing the work and is **never
rewritten**. Reconciliation does not edit or delete movements. A correction is a
*new* movement carrying `reverses_movement_id` and a reason. If a balance goes
negative we do not undo the pick — the pick happened; the model was wrong.

**2. Accountability is a schema requirement, not a nice-to-have.** Investigation
needs to reach a person, so every movement and every scan carries an individual
`actor_id`, plus `device_id`, `occurred_at` (device) and `recorded_at` (server).

This makes the current practice a data-quality defect to fix rather than mirror:
NetSuite's `Picked By: Casual Melbourne` is a **crew**, not a person, and against
a crew-level actor every accountability and labour column is decorative. Owning
the pick path (per floor-devices.md) is what makes individual attribution
possible, so it is a prerequisite for this decision paying off.

**3. Counts create findings, not adjustments.** A stocktake asserts "this much
exists here". Comparing it to the ledger produces a **variance**, and a variance
has candidate explanations worth surfacing — damaged and unreported, not yet
delivered, mis-picked, put away in the wrong bin. Auto-adjusting throws that
information away at the exact moment it is most recoverable.

```
stock_count            -- the assertion, preserved forever
  id, location_id, item_id, lot_id, status_id
  counted_quantity, counted_at, actor_id, device_id, blind

discrepancy            -- the finding
  id, kind              -- negative_balance | count_variance | short_pick
                        -- | damage | unexpected_stock | receipt_variance
  item_id, location_id, lot_id, status_id
  expected_quantity, observed_quantity, variance
  detected_at, detected_by_id
  source_type, source_id            -- the count, movement or task that raised it
  state                 -- open | investigating | resolved | accepted
  resolution_reason_id, resolved_at, resolved_by_id
  resolving_movement_id             -- the adjustment, if one was needed
  ticket_id                         -- escalation, per D7
```

The ledger stays pure: the count never writes to it. The resolution does, with an
explanation attached and a link back to the finding that caused it.

**Why this is the payoff of the whole design.** The append-only spine means a
finding can be investigated against the exact state at the moment it was
observed. `measurement` already does this for dimensions; `discrepancy` does it
for quantities. And D7 gives it somewhere to go — a discrepancy escalates to a
Nosdesk ticket with the originating movement, actor, device and timestamp
attached, so a warehouse manager can follow it up without stopping the floor.

**Non-blocking by default.** A discrepancy never halts operations. Negative
balances are allowed, picks against them succeed, and the finding is raised
asynchronously. That is what lets the warehouse proceed as intended while the
investigation happens separately.

## Open questions

1. **Lot/batch and expiry** — modelled provisionally as `lot_id`. If FEFO is a
   real requirement it needs to reach into picking logic and the route optimiser,
   which is a bigger commitment than one nullable column. Needs confirming.
2. **Does a fulfilment ever span multiple orders?** Modelled as not. If
   consolidated shipping is real, `fulfilment.order_id` becomes a join table and
   that is much easier to decide now than later.
3. **Does a consignment ever span multiple fulfilments?** Modelled as not
   (`consignment.fulfilment_id`), which contradicts question 2's direction — one
   of these should probably move. Worth settling deliberately.
4. **Is `order` ours, or a mirror of NetSuite's?** During coexistence it is a
   mirror. The field list above is deliberately thin so that the mirror is cheap
   and the eventual ownership is not painful.
5. **Item base units.** `base_unit` assumes each item has one sensible base.
   Anything sold by weight or length breaks that assumption. *(Likely answered by
   the `entered_quantity`/`entered_unit` change — see the competitor analysis.)*

Raised by D5–D7:

13. ~~Does the count-as-assertion approach hold?~~ Resolved by D8: counts do not
    adjust, they create findings. Remaining detail — a variance is computed
    against ledger state *at `counted_at`*, so a movement arriving late but
    dated before the count should re-open a resolved finding. Needs a rule.
14. **Nosdesk: shared workspace, or service boundary?** Sharing the platform
    could mean one Cargo workspace with shared crates, or two services with an
    API between them. Affects deployment, migrations and blast radius (D7).
15. **What is the reconciliation UI for negative stock?** D5 accepts negative
    balances as discovered discrepancies rather than errors. That is only
    defensible if there is a real surface where they get resolved — otherwise it
    is just tolerated corruption with a nicer name.
16. **Does anything here genuinely need a document CRDT?** D5 rules Yjs out for
    stock. If nothing else needs it, the Nosdesk reuse is transport only, which
    simplifies question 14 considerably.

Raised by D8:

17. **How does a movement reference its cause?** `reference_type`/`reference_id`
    is a polymorphic FK — no referential integrity, no cascade, and the database
    cannot check it. The causes are a known, small set (`fulfilment_line`,
    `goods_receipt_line`, `discrepancy`, `move_task`), so nullable typed FKs with
    a CHECK that exactly one is set would be honest where the polymorphic version
    is convenient. D8 makes this sharper: investigation follows these links, and
    they should not be able to dangle.
18. **Does `actor_id` on a movement mean who did it, or who is accountable?**
    Usually the same. Not for a supervisor override, a system-generated
    adjustment, or work done on a shared login. D8 depends on this being
    unambiguous.
19. **What is the tolerance policy?** Not every variance deserves a human. A
    one-unit variance on a 10,000-unit line is noise; the same variance on a
    controlled item is not. Without a threshold, D8 produces a queue nobody
    reads, which is the same as not having it.
