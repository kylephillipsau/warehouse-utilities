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

**2. Facts, intentions and findings are three different kinds of thing.**
*(Restated 2026-07-30 — see D12. The original claimed only two things happen in a
warehouse: stock moves and things get measured. That was wrong, and the
competitor analysis was right to break it.)*

- **Facts** are what happened. Append-only, immutable, never edited. They project
  to current state. `stock_movement`, `measurement`, `stock_count`,
  `activity_event`.
- **Intentions** are what we plan. Mutable, cancellable, and reconciled against
  facts as reality arrives. `stock_allocation`, `move_task`, `purchase_order`.
- **Findings** are where the two disagree. `discrepancy` (D8).

The rules differ by category, and keeping them apart is what stops an intention
being quietly recorded as a fact. Facts give us audit, reconciliation and history
for free. Intentions are allowed to be wrong — that is what makes them plans
rather than lies. Findings are the most valuable output of the system.

**Assertions are a fourth provenance value** *(D21)* — a statement of record
exchanged with another party, stored exactly as exchanged, which neither side may
unilaterally revise.

**There is a second, orthogonal axis: role** *(lifted in with D25)*.

| Axis | Values | Decides |
|---|---|---|
| **Provenance** | fact \| intention \| assertion \| finding | mutability, who may author, what may project from it |
| **Role** | reference \| projection \| policy \| grouping | how it is read, indexed, rebuilt, and who may write it |

Every table registers exactly one value on each axis. This is what stops the
category list growing: `goods_receipt` is a **grouping**, `stock` is a
**projection**, `allocation_policy` is **policy** — none of them is a new kind of
thing, and each kept looking like one only because the role axis was missing.

**The provenance axis is not declared closed — it has an admission test.** The
count has gone two, three, four, and each time completeness was asserted rather
than argued. Four is defensible (what we observed, what we plan, what someone else
stated, where those disagree) but it is not proved, and findings sit awkwardly:
ours and mutable, like intentions. So, as with every other limit here:

> A fifth provenance value is admitted only if it changes **who may write the row,
> whether the row may be revised, and what may project from it** — all three. If
> it changes none of those, it is a role value or a `kind` column. If it changes
> only one, argue it explicitly rather than adding a category.

That is the test the role axis passes and `goods_receipt` fails.

**3. Nothing we query is opaque, and the model contains no `jsonb` column.**
*(Restated with D21.)* Payloads that crossed a party boundary are retained
verbatim for audit and are never queried structurally — but they are retained as
**`bytea`**, not JSONB, with `content_type` saying what they are. EDIFACT is
bytes; a photographed docket is bytes; JSON is bytes. Anything queryable is
promoted to a column.

The point of the type change is that it converts a judgement into an assertion:
**CI checks the schema contains no `jsonb` column at all**, rather than a reviewer
deciding per column whether this one is "really" opaque. "We'll make it flexible
with JSON" is the first step toward the mess we are replacing, and an enumerated
exception list erodes by exception.

**4. No entity-attribute-value, and no untyped attribute soup — but a tenant may
declare a typed scheme that compiles to real columns.** *(Amended by D26.)* The
original wording refused custom fields because "adding a column is cheap and
migrations are routine". That sentence has a hidden subject: cheap **for us**, and
D18 made the subject non-universal. The refusal was never really about columns; it
was about deferring *type* decisions to runtime. So the boundary is **what a
column may be**, not who may add one: real types, real CHECKs, real foreign keys,
real indexes, declared up front and compiled to DDL. A generic attribute system,
a spare-column sidecar, or JSON-with-a-schema remains refused.

The original reasoning, which still holds for us: adding a column is
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

```

*(`provider_exchange` was replaced by `party_message` in D21 — one table for every
payload that crossed a party boundary, inbound or outbound, stored as `bytea`.
`consignment.status`, `.eta` and `.price_minor` became projections of the in-force
carrier advice at the same time.)*

**Separating `carrier` from `freight_provider` is the whole trick.** Swift is a
carrier today reached via MachShip; tomorrow it is the same carrier reached
directly. Consignment history stays coherent across the switch, and "what did
Swift cost us this quarter" is one query that spans both eras.

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

### D9 — Discrepancies are caught at the point of capture, and the operator defines signal

**Decision.** Detect variance **at the moment of recording**, while the observer
is standing at the location and can look again. A fixed global tolerance is not
the mechanism; the operator decides what is signal.

**Why point-of-capture changes the value of the data.** The ledger already knows,
cheaply, whether a location has had any movement since it was last counted. So
when someone records a quantity for a location that **has not moved and has had
nothing picked from it**, and the number disagrees, that is knowable instantly —
and the person who can resolve it is right there.

Prompting then — *"this location has not moved since the last count of 50, and
you have entered 47. Are you sure?"* — produces one of two outcomes, and both are
better than silence:

- They look again and correct it. The bad data never enters the system.
- They confirm. **That is now a much stronger signal than an unexplained
  variance found in a batch reconciliation days later**, because a human was
  challenged with the contradiction, at the location, and stood by the number.

So confirmation-against-challenge is recorded as its own fact, not collapsed into
an ordinary count:

```
stock_count
  ...
  challenged            -- did we contradict them at capture time
  challenge_context     -- what we told them (expected qty, last movement at)
  confirmed             -- did they stand by it after being challenged
```

A confirmed-against-challenge variance should sort to the top of any
investigation queue. An unchallenged one is unremarkable by comparison. This is
the `measurement.confidence` idea applied to quantities: **how an observation was
obtained changes what it is worth.**

**Tolerance is the operator's call.** A one-unit variance on a 10,000-unit line
may be noise to one operator and a red flag to another, and only the data can
tell them which. So we do not hard-code thresholds — we give managers the means
to set, tune and change them, and we surface the distribution so those choices
are informed rather than guessed. The engineering requirement is to make signal
*attainable*, not to decide it.

**Corollary for fulfilment.** Discrepancies raised against the work actually
happening — a short pick, a location empty during a pick — are more directly
actionable than variances surfaced by an unrelated stocktake later. They should
be first-class in the same way, not a lesser kind.

### D10 — Movements reference their cause with typed FKs, not a polymorphic pair

**Decision.** Replace `reference_type`/`reference_id` on `stock_movement` with
nullable typed foreign keys plus a CHECK that exactly one is set:

```
stock_movement
  fulfilment_line_id      -- a pick
  goods_receipt_line_id   -- a receipt
  discrepancy_id          -- an adjustment from a finding (D8)
  move_task_id            -- an internal transfer
  CHECK (num_nonnulls(fulfilment_line_id, goods_receipt_line_id,
                      discrepancy_id, move_task_id) = 1)
```

**The reasoning, since this one is not obvious.**

A polymorphic pair is genuinely more convenient in one respect: adding a new cause
never needs a migration. Against that, four costs — and the last two are decisive
*for this model specifically*, rather than being general database advice.

1. **No referential integrity.** The database cannot check a polymorphic
   reference, so links can dangle. D8 makes investigation *follow* these links,
   which turns a dangling reference from untidy into a dead end during exactly
   the task the system exists to support.
2. **No query-planner statistics**, and a `WHERE reference_type = …` on every
   join. Minor, but it compounds on the hot path.
3. **It silently defeats principle 6.** The stated N+1 defence is Diesel's
   `belonging_to` + `grouped_by` batch loading. **That cannot be expressed over a
   polymorphic reference** — there is no association to declare, so loading
   movements for a set of fulfilment lines becomes either raw SQL or a loop. The
   convenient choice quietly removes the mechanism we said would prevent the
   problem you explicitly do not want.
4. **Partial indexes get awkward.** With typed columns,
   `CREATE INDEX … WHERE fulfilment_line_id IS NOT NULL` is natural and small.

**What it costs.** A migration when a genuinely new cause appears, and a wider
CHECK. The cause set is small and closed — pick, receipt, adjustment, transfer —
and grows roughly never. Four nullable `bigint`s is ~32 bytes a row.

**The same argument applies to `measurement`.** `subject_type`/`subject_id` is
the identical pattern over (item, package_type, package). For consistency it
should go the same way — see question 20, since there is a real counter-argument
that `measurement` is append-only reference data on a cold path, where the
batch-loading concern does not bite.

### D11 — Attribution separates the operator, the workers, and the accountable

**Decision.** Three distinct things, never collapsed into one `actor_id`:

```
stock_movement
  recorded_by_id     -- the authenticated session. NEVER null, NEVER editable.
  device_id
  work_session_id    -- nullable: the crew this work belonged to
  authorised_by_id   -- nullable: a supervisor standing behind an override

work_session          -- declared at sign-on, not inferred
  id, site_id, kind, started_at, ended_at

work_session_member   -- append-only; joins and leaves are timestamped
  work_session_id, person_id, role, joined_at, left_at
```

**The problem this solves.** In the simple case the person doing the work and the
person recording it are the same, and one field would do. But shared and
collaborative work is normal — someone managing counts across containers, a team
on a large task without a scanner each — and that is an accountability question
before it is an engineering one. The requirement is to let those situations be
**expressed declaratively**, without letting anyone's accountability be
misrepresented.

**How misrepresentation is prevented.** `recorded_by_id` comes from the
authenticated session, is never client-supplied, and is never editable. That is
the non-repudiable floor: whatever else is claimed, we always know which person,
on which device, recorded this. Everything else is a *claim made by that
operator* and is stored as such.

Crew membership is **declared at sign-on and append-only**, with `joined_at` and
`left_at`. So "who was on this team when that movement happened" is answerable
from history, and nobody can be retroactively added to a past window without it
being visible as a later row.

**Why a session rather than participants per movement.** At warehouse volumes a
participant row per movement is heavy and mostly repeated. A session is declared
once, is cheap to join, and expresses the real-world unit — a crew working
together for a shift or a task.

**`authorised_by_id` is deliberately separate.** A supervisor correcting a
casual's recorded work should be visible *as* a supervisor override, not by
overwriting who did the original work. The original stands (D8: the work event is
the invariant); the authorisation sits beside it.

### D12 — Allocation is an intention, and it is advisory

**Decision.** Add `stock_allocation` as an **intention** (principle 2), not a
lock. It expresses "we mean these units for this demand". It does **not** gate
picking, and it is allowed to be wrong.

**Why advisory, when every competitor enforces.** D5 traded coordination for
convergence, and allocation-as-enforcement is coordination. More importantly, an
enforcing allocation contradicts the founding observation: *the scanner is more
authoritative than the database*. If the plan says pick lot A from bin 12 and the
picker finds lot B, an enforcing system rejects the scan and stops the floor. Ours
accepts it — the pick is a fact — and raises a finding that the plan was wrong.

This is not a weaker allocation. It is allocation that cannot lie about physical
reality, and it makes every plan-versus-actual divergence *visible* rather than
suppressed at the point where the truth was available.

**How this resolves the principle 2 tension.** The analysis said allocation
cannot be a movement (nothing moved) and cannot live on `stock` without voiding
the rebuildable invariant. Both true — because allocation is not a fact at all.
It is a different category. `stock` therefore becomes a projection of **two
sources**, each column named for its own:

```
stock
  item_id, location_id, lot_id, status_id     -- the key (status per D4)
  quantity            -- projection of stock_movement   (facts)
  allocated_quantity  -- projection of stock_allocation  (intentions)
  available_quantity  -- generated: quantity - allocated_quantity
```

The invariant is **widened, not broken**: each column is rebuildable from its own
source, and the existing reconciliation job asserts both. Availability stays a
single indexed read rather than an aggregate on the hot path.

```
stock_allocation
  id
  fulfilment_line_id                          -- the demand
  item_id, location_id, lot_id, status_id     -- the supply cell
  quantity
  state          -- allocated | picking | fulfilled | short | released
  allocated_at, released_at
  allocated_by_id                             -- person, or null for the allocator
  move_task_id                                -- nullable, the work carrying it out
```

**Backorder is not an entity — it emerges.** Demand that could not be allocated
is `fulfilment_line.quantity - SUM(allocated)`, greater than zero. No backorder
table, no backorder status to keep in sync, and partial backorder falls out for
free. This is principle 1 doing its job.

**No soft/hard split.** Most WMS have order-level soft allocation and then
cell-level hard allocation. We allocate to a cell directly. Available-to-promise
still works — it sums `available_quantity`, which does not care how specific the
allocations were — and skipping the split removes a state, a transition, and a
class of stuck-in-between bugs. The usual argument for soft allocation is that
committing to a cell early is risky if stock moves; under D5 a moved cell simply
means the plan was wrong, which we already handle.

**FEFO lives here.** Rotation is an allocation decision, which is why it had
nowhere to go before. `item.rotation_type` (fifo | fefo | lifo | none) selects
which cells the allocator prefers. This is the real answer to open question 5.

**Short picks are already handled.** D8 did the work: the allocation goes to
`short`, a `discrepancy` of kind `short_pick` is raised with the picker, device
and location attached, and the unfulfilled quantity returns to the pool — where
it is either re-allocated or shows up as backorder by the same arithmetic. No
special machinery.

**Over-allocation is allowed**, consistently with D5. `available_quantity` may go
negative. That is a finding, not a rejected write.

### D13 — The model holds the inputs; the policy belongs to a manager

**Decision.** The allocator does **not** encode a rotation policy. The model holds
the facts that make *any* policy computable, the allocator is a scoring function
over those facts, and the weights and thresholds are **configuration a manager
owns**. We ship defaults, not hard-coded behaviour.

**Why this way round.** A flexible model with a policy applied on top can always
become strict. A strict model built around one policy cannot be made flexible
without surgery. Baking FEFO into the allocator would mean travel-awareness could
not be added later without reopening the core of the system — so the asymmetry
decides it, independently of which policy is currently right.

And the policy genuinely varies by product and by situation. Grabbing the next
best thing from another bay at ground level is often correct. The same
substitution is a different decision when the alternative needs a forklift to
bring stock down — which may mean waiting for equipment, a second person, or a
safety consideration. **The software should not make that trade on a manager's
behalf.** It should make the trade *visible* and let them set the rule.

This is D9's principle applied to planning rather than to findings: the
engineering job is to make the information attainable, not to decide what it
means.

**Access cost becomes first-class.** Distance alone does not capture the
difference the example describes, because the cost is a step change in *method*,
not a longer walk:

```
equipment_class
  id, name                       -- ground, ladder, order_picker, reach_truck, forklift
  relative_cost                  -- a ground pick is 1; a forklift retrieval is not
  requires_second_person
  is_shared_resource             -- can this become a queue

location
  ...
  reachable_by                   -- FK to equipment_class (already present)
```

Height is already derivable from `location.level` and `z_mm`, so the continuous
part of the cost is computable. `equipment_class` supplies the discontinuity.

**The policy surface, kept small.** Scalar configuration, scoped — the same shape
as `carrier_profile`, deliberately not a rules engine:

```
allocation_policy
  id, scope_kind                 -- site | item_class | item
  scope_id
  weight_rotation, weight_travel, weight_access
  rotation_tolerance_days        -- "oldest first, but treat within N days as equal"
  max_equipment_class_id         -- beyond this, prefer an alternative or ask
```

`rotation_tolerance_days` is the field that does most of the work: it turns strict
FEFO into "take the oldest, unless a much cheaper pick is within tolerance", which
is what most operations actually mean.

**Ranked candidates, not a single answer.** Scoring produces an ordered list, so
the allocator commits the top candidate but the `move_task` can carry alternates.
A picker who finds the bin empty gets the next option immediately instead of a
dead stop — and, per D8, the empty bin is still recorded as a finding. This
capability falls out of ranking rather than being built.

**What keeps this from becoming a rules engine.** The competitor analysis warned
that declining an engine while accepting five small rule tables is how you get an
engine you never designed. The discipline here: **the scoring function is code —
one implementation, testable, versioned.** Only its weights are data. When
putaway, replenishment and disposition need the same treatment, they get the same
shape: code that scores, configuration that weights. If we ever find ourselves
adding a table where *the logic itself* is rows, that is the line, and we should
notice we are crossing it.

### D14 — Lot, expiry and rotation

**Decision.** Add `lot` as a real entity, carry `lot_id` to `package_content`,
keep it *off* `fulfilment_line`, and store shelf-life **facts** on the lot while
shelf-life **requirements** live with the customer.

```
lot
  id
  item_id                   -- a lot is always of exactly one item
  code                      -- ours
  supplier_lot_ref          -- theirs, often different; both are needed for a recall
  supplier_id               -- nullable until inbound exists
  manufactured_at
  received_at
  expiry_date               -- the hard date
  best_before_date          -- nullable; differs from expiry for a lot of food

item
  ...
  tracking                  -- none | lot | serial
  shelf_life_days           -- expected, for validating a received expiry date
  rotation_type             -- fifo | fefo | lifo | none
```

**Two dates, not Odoo's four — because the fourth is not a lot property.**
Odoo carries `expiration_date`, `use_date`, `removal_date` and `alert_date`. The
analysis is right that collapsing them naively makes *"don't ship with under 90
days remaining"* unimplementable. But storing `removal_date` on the lot is the
wrong fix, because **minimum remaining shelf life is a customer requirement, not
a fact about the goods.** Grocery chains commonly demand a fixed proportion of
shelf life remaining on delivery, and different customers demand different
amounts for the same lot.

So the requirement goes where it belongs:

```
customer
  ...
  min_shelf_life_days       -- or
  min_shelf_life_pct        -- proportion of total shelf life that must remain
```

and shippability becomes a computation — `expiry_date - ship_date` against the
customer's rule — rather than a date frozen at receipt against one customer's
assumption. This is strictly more capable than Odoo's single `removal_date`, and
it is the same shape as D13: **the model holds facts, the policy sits beside it.**

`alert_date` is derivable from `expiry_date` and a lead time, so it is not
stored. A lot pulled early for a quality reason is not a date problem at all —
that is `inventory_status` (D4).

**`lot_id` goes on `package_content`. It does not go on `fulfilment_line`.**
Here I disagree with the competitor analysis, which recommended both.

`fulfilment_line` is **demand** — "ship 100 of item X". The lot is chosen later,
at allocation and pick time, and a line may legitimately ship from several lots.
Putting a lot on the demand row either over-specifies the order or forces a
second fulfilment line per lot, conflating what was asked for with what was sent.
`stock_allocation` already carries `lot_id` (D12) and so does `stock_movement`,
which is where supply decisions belong.

`package_content` is different: it is a **fact about a physical carton**. Without
`lot_id` there, a package holding two lots of the same item is unrepresentable,
and the recall question dead-ends at exactly the table built to answer "what is
in this box".

Both recall directions then work:

- *Which customers received lot L?* `stock_movement WHERE lot_id = L AND
  fulfilment_line_id IS NOT NULL` → line → fulfilment → order → customer. This
  query only exists because D10 made the cause a typed FK.
- *Which cartons on which pallets hold lot L?* `package_content.lot_id`, walking
  `parent_package_id` (D6).

**Rotation slots into D13 with no new machinery.** `item.rotation_type` selects
which date the scoring function uses as its rotation key — `expiry_date` for
FEFO, `received_at` for FIFO — and `allocation_policy` supplies the weight and
`rotation_tolerance_days`. Nothing about rotation is hard-coded; FEFO is a
configuration of a general allocator, not a mode.

**A recall writes movements; it is not a flag.** Holding a lot means writing
status-change movements (`from_status = available`, `to_status = hold`, per D4)
across its cells, referencing a `lot_hold` record that carries the reason and the
decision-maker. It is a bulk write, and recalls are rare enough that this is
fine. The alternative — a `lot.on_hold` boolean overriding cell status — creates
a second answer to "is this available", which is how availability logic starts
disagreeing with itself.

The retroactive part falls out: stock of a held lot that is already allocated
produces allocations against unavailable stock, which is a **finding** under D8
rather than a special case anyone has to code.

**Holds are intentions; the movements are the facts that carry them out.** This
is principle 2's three categories doing real work, and it buys precision that a
flag cannot.

```
lot_hold                    -- an intention (principle 2)
  id, lot_id
  reason, reference          -- recall notice number, test result, customer complaint
  scope_note
  raised_at, raised_by_id
  lifted_at, lifted_by_id, lift_reason
```

Every status movement written by a hold references its `lot_hold`. Three things
follow, and the third is the one that matters:

**Release is precisely scoped.** Lifting hold H returns only what H held. A flag,
or a naive "release everything held for this lot", would also release stock held
for an *unrelated* reason — damage found separately, a quality quarantine, a
customer complaint on the same lot. Because the movements name their cause, the
reversal cannot overreach.

**Overlapping holds compose correctly.** Two active holds on one lot mean stock
returns to `available` only when the last is lifted. That is a count of unlifted
`lot_hold` rows, not a boolean anyone has to keep consistent.

**Stock that moves while held stays held.** A transfer of held stock is a
movement with the status unchanged on both sides, so the hold follows the goods
to their new location without anything tracking it. Release then acts on wherever
the stock actually is now — which a snapshot of affected cells, taken at hold
time, would have got wrong.

**Amendment keeps the mistake visible.** If a hold was scoped too widely, the
over-held stock is released with its own reason, and the record still shows what
was held, by whom, and why it changed. Nothing is rewritten, so the correction is
as auditable as the original decision — which is D8's invariant applied to
directives rather than to work.

**Serial stays split, per the analysis.** `tracking = serial` reserves the enum
value, but **unit-level serialised inventory remains out of scope** — a serial as
a stock-bearing entity with its own custody chain would reshape `stock` the way
containers do. Pack-time serial capture is a different, much cheaper thing: one
table hanging off `package_content`, with no reach into stock, allocation or
routing. That version is worth having when a customer asks for it.

**Indexes.** `stock_movement(lot_id, occurred_at)` — the primary trace query, and
missing from the original list. `lot(item_id, expiry_date)` for FEFO candidate
selection. `package_content(lot_id)` for recall-to-carton.

### D15 — Three groupings, kept separate; `consignment.fulfilment_id` is dropped

**Decision.** `fulfilment.order_id` stays singular. `consignment.fulfilment_id`
is **removed** — the relationship already exists, through packages. No new join
tables.

**The mistake worth naming.** The competitor analysis said waves push
`fulfilment.order_id` toward many-to-many and consolidated freight pushes
`consignment.fulfilment_id` the same way, so both should become join tables. That
reasoning conflates **three independent groupings** that happen to overlap in
other systems:

| Grouping | Question it answers | Where it belongs |
|---|---|---|
| **Demand** | What did a customer ask for? | `order` |
| **Work** | How do we organise the picking? | `pick_batch` / `move_task` (intentions) |
| **Freight** | How does it travel? | `consignment` |

Every WMS with a bloated shipment model got there by making one table serve two
of these. Keep them apart and each stays simple — principle 1.

**Waves do not touch `fulfilment.order_id`.** A wave is a grouping of *work*, not
of demand. It belongs in the intentions layer, where `pick_batch` spans
fulfilments freely and nothing about the order structure has to bend. The
pressure the analysis detected is real; it just lands on a different table.

So a fulfilment stays "one order's commitment to ship from one site". One order
can already have many fulfilments — partial shipment, multi-site, backorder
release — because the FK is many-to-one. That was never the constraint.

**Consolidated freight needs no change either, because packages already carry
it.** The path exists today:

```
consignment → consignment_package → package → fulfilment → order
```

A consignment carries **physical things**, not abstract fulfilments. Two orders
consolidating onto one truck is two fulfilments putting their packages on one
consignment — which is exactly what physically happens. `consignment.fulfilment_id`
was a second, weaker representation of a relationship the package path already
expressed correctly, and it silently forbade the consolidation it looked like it
was modelling.

Dropping it also removes a consistency hazard: with both present, nothing stopped
`consignment.fulfilment_id` disagreeing with the fulfilments reachable through
its packages.

**Both directions stay cheap**, with `package(fulfilment_id)` and
`consignment_package(package_id)` indexed:

- *Which fulfilments are on this consignment?* → two indexed joins.
- *Which consignment carries this fulfilment?* → the same path, reversed.

**What this buys, concretely.** Consolidating two orders for one customer onto a
single pallet run — normal practice on the Swift and Direct pallet freight that
is our highest volume — is now expressible. Under the old shape it was not, and
the walkthrough's one-fulfilment-one-consignment flow would have hardened into a
constraint rather than being simply what happens most of the time.

**One loose end.** D6 made `package.fulfilment_id` nullable so a package can be a
reusable tote or an LPN in racking. A package on a consignment should have a
fulfilment — except possibly for an inter-site transfer, which is a shipment that
fulfils no customer order. Worth deciding whether a transfer is a kind of
fulfilment or its own thing (question 37).

### D16 — A transfer is its own demand, sharing the fulfilment machinery

**Decision.** Inter-site transfers get their own demand entity. `fulfilment`
references demand through **typed FKs** (D10), not through a widened `order`.

```
transfer_order
  id, from_site_id, to_site_id
  requested_at, required_by, status

transfer_order_line
  id, transfer_order_id, item_id, quantity

fulfilment
  order_id             -- customer demand
  transfer_order_id    -- internal demand
  CHECK (num_nonnulls(order_id, transfer_order_id) = 1)
```

`fulfilment_line` gains the same treatment against `order_line` /
`transfer_order_line`.

**Why not just add a `kind` and a nullable customer to `order`.** That is the
generic document model already on the deliberately-not-building list. It would
mean `customer_id` nullable on every customer order, shelf-life rules (D14)
reaching for a customer that may not exist, and every query carrying a `WHERE
kind = …` that the database cannot help with. Two honest tables beat one
apologetic one.

**Why this is the same insight as D15.** A transfer differs from a customer order
on the **demand** side only — no customer, a destination site, no revenue. The
**work** and **freight** sides are identical: it is allocated, picked, packed,
consigned, labelled and tracked exactly like anything else. So the demand entity
forks and everything downstream is shared. Splitting `fulfilment` too would
duplicate the entire outbound machinery for no gain.

**D15's loose end dissolves.** A transfer's packages *do* have a fulfilment — one
pointing at a `transfer_order` instead of an `order`. So the rule holds without
exception: **every package on a consignment has a fulfilment.** No nullable
special case, and D6's nullable `package.fulfilment_id` goes back to meaning only
what it was introduced for — totes and LPNs that are not shipping anywhere.

**The inbound side is symmetric.** A transfer arriving at the destination is a
goods receipt, so `goods_receipt` takes the same typed pair:

```
goods_receipt
  purchase_order_id     -- from a supplier
  transfer_order_id     -- from another site
  CHECK (num_nonnulls(purchase_order_id, transfer_order_id) = 1)
```

One entity, two demand sources, on both ends. A transfer is simply the case where
our own outbound feeds our own inbound.

**Stock in transit is derivable — no virtual location needed.** Between despatch
from A and receipt at B, the goods are in neither site's stock: the despatch
movement has `to_location_id = NULL` and the receipt has `from_location_id =
NULL`, per the existing convention. That makes in-transit stock invisible in
`stock` — but it is not unanswerable:

> transfer orders despatched and not yet fully received → their fulfilment lines
> minus their receipt lines.

The intention (the transfer order) plus the facts at each end give the answer
without inventing a location to park it in. This is the concrete reason the
analysis's admiration for Odoo's virtual-location model does not translate into
a reason to adopt it: we get the same answer from principle 2's categories
instead of from a NULL-elimination trick that would add a `usage` predicate to
every on-hand query.

### D17 — `work_task`: one table for directed work, and a second fact table for work that moves nothing

**Decision.** One `work_task` table across every kind of directed work, plus
`activity_event` as a second append-only fact table. Tasks are **intentions**
(principle 2); the movements and counts they produce are the facts.

```
work_task
  id, site_id
  purpose            -- pick | putaway | replenish | transfer | count | inspect
  pick_batch_id      -- nullable; the work grouping (D15)
  item_id            -- nullable: a count task is told a location, not an item
  from_location_id
  to_location_id     -- nullable: a count moves nothing
  planned_quantity   -- nullable: a count's quantity is the question, not the input
  sequence           -- travel order within the batch
  state              -- pending | claimed | started | completed | failed | cancelled
  claimed_by_id, claimed_at
  started_at, completed_at
  work_session_id    -- D11
```

**Why one table, when D15 warned about tables serving two masters.** The test is
whether the concepts are genuinely one thing. Pick, putaway, replenish, transfer,
count and inspect are all *directed work assigned to a person at a location, with
a state*. That is one concept. What differs is the **fact they produce** — a
movement, or a count — and those already live in separate tables. Manhattan
reaches the same shape with a single unified task table, and the analysis was
right to call it the principle-1-consistent answer.

**Named `work_task`, not `move_task`, because a count moves nothing.** Calling it
`move_task` and then filing counts and inspections in it is exactly the small
dishonesty that accretes into a schema nobody can read. It also pairs with
`work_session` (D11). Two nullable columns — `to_location_id` and
`planned_quantity` — are the honest cost of covering non-moving work, and they
are nullable *for a stated reason* rather than by drift.

**Claiming is advisory, but coordination here is cheap.** D5 traded coordination
away where it would block physical work. A task claim is the opposite case: it is
low-stakes, and losing a race costs a moment rather than a pick. So the server
takes a first-claim-wins lock and tells the loser immediately over the existing
real-time channel.

**The distinction worth stating: we avoid coordination where it would stop the
floor, not everywhere.** Blocking a scan is unacceptable because the physical
event already happened. Blocking a claim is fine because nothing has happened
yet. If two people do the same task anyway — offline, or by ignoring the
warning — both sets of movements are still facts, and the duplication is a
finding under D8. The claim is a courtesy, not a guarantee.

**Cluster picking needs no extra table.** One visit to a cell can serve several
orders. `stock_allocation.work_task_id` (D12) links N allocations to one task, and
each allocation already knows its `fulfilment_line` and therefore its destination
receptacle. The task's `planned_quantity` is just the sum of its allocations. Pick
once, distribute by allocation.

```
pick_batch                    -- the work grouping (D15)
  id, site_id
  kind                        -- wave | cluster | zone | single
  state, created_at, released_at, completed_at, created_by_id

receptacle_assignment         -- trolley slots and put-wall cells, one mechanism
  id, pick_batch_id, fulfilment_id
  package_id                  -- the tote, which is a container (D6)
  position
  opened_at, released_at
```

A partial unique index on `(pick_batch_id, position) WHERE released_at IS NULL`
gives first-empty-wins allocation of slots and route-back-to-the-same-slot in one
index. The tote being a `package` is D6 paying off — no parallel container
concept was needed.

**`activity_event`: the denominator.** Work that moves no stock currently has
nowhere to live — a failed scan, a skip, a location found empty, a search that
turned up nothing, time between tasks. Without it, productivity has counts but no
denominators, and exception patterns are invisible.

```
activity_event                -- a fact (principle 2), append-only
  id, occurred_at, recorded_at
  client_event_id (unique), device_id      -- shares D5's idempotency columns
  recorded_by_id, work_session_id
  work_task_id, location_id                -- both nullable
  kind          -- scan_ok | scan_mismatch | location_empty | skip
                -- | search_failed | task_paused | idle
  detail
```

Kept separate from `stock_movement` deliberately: mixing them would put a
`WHERE` clause on the sum that defines stock, and D5 exists to keep that sum
unconditional. It is also the natural home for the handheld's event stream, so
the same idempotency machinery serves both.

**A `location_empty` event is worth more than its size suggests** — it is D9's
point-of-capture principle applied to picking. Somebody stood at a bin the system
believed had stock and found none, which is a strong signal recorded at the
moment it was cheapest to catch.

**Not every movement has a task.** Ad-hoc work is real — a pallet moved because
it was in the way. `work_task_id` is nullable on `stock_movement`.

### Correction to D10

D10 listed `move_task_id` as one of four **mutually exclusive** causes on
`stock_movement`, with a CHECK that exactly one is set. That is wrong: a pick
movement has *both* a `fulfilment_line_id` (why the stock moved) and a task (how
the work was organised). They are orthogonal dimensions, not alternatives.

Corrected:

```
stock_movement
  fulfilment_line_id      -- cause
  goods_receipt_line_id   -- cause
  discrepancy_id          -- cause
  CHECK (num_nonnulls(fulfilment_line_id, goods_receipt_line_id,
                      discrepancy_id) <= 1)     -- AT MOST one, not exactly one

  work_task_id            -- orthogonal: nullable, always permitted
```

**At most one**, because an internal move — a replenishment, or an ad-hoc
relocation — has no demand-side cause at all. The existing `reason` enum already
distinguishes what kind of movement it is; the cause FK says which document
demanded it, when one did.

### D18 — Multi-tenant and multi-site are different axes, and we build both

**Decision.** `tenant` owns `site`. Multi-tenancy is a stated, non-negotiable
requirement; multi-site already existed. They are orthogonal and cheap together,
expensive apart.

```
tenant
  id, name, slug, active

site
  id, tenant_id, name, timezone      -- tenant_id is new
```

`tenant_id` is denormalised onto every major table alongside the `site_id` the
competitor analysis already recommended, and isolation is enforced by Postgres
row-level security rather than by remembering a `WHERE` clause.

**Why the distinction is worth stating.** Multiple warehouses in multiple
Australian states is **multi-site** — one organisation, many locations, and the
model already handled it. **Multi-tenant** is a different boundary: separate
organisations whose data must never meet.

They behave in opposite ways on exactly the thing we just designed:

| | Across sites | Across tenants |
|---|---|---|
| Stock transfers (D16) | Normal | Must be impossible |
| Reporting | Rolls up | Never joins |
| Users | May span, with permissions | Never span |
| Queries | A feature | A leak |

**D16 is the proof.** A `transfer_order` moves stock between sites. You do not
transfer stock between tenants — that is a sale, or a 3PL movement, not a
transfer. So the Australian states are sites of one tenant, and building hard
isolation around them would break the inter-state transfers just designed.

**Why build tenancy now anyway.** It is the most expensive thing on the list to
retrofit — every table, query, index and cache key — and Nosdesk's shape (BUSL
licence, licence keypair, licensing module, hosted deployment targets) says this
codebase is heading somewhere commercial. A `tenant_id` column added now costs
about what the `site_id` denormalisation already costs. Added later it is a
migration touching everything.

**Deployment stays open.** Row-level security supports both shared-database and
database-per-tenant, and a BUSL product that self-hosts usually wants the latter
available. Deciding the schema now does not commit the deployment model.

**Explicitly deferred: `stock.owner_id`.** Holding *another* organisation's
stock at our site — 3PL — is a third axis again, and it would put owner in the
`stock` key alongside status (D4), making it the fifth key column. We ship our
own goods, so this is not needed. Recorded rather than assumed, because if 3PL
ever becomes a product direction this is the migration nobody wants: see
question 48.

### D19 — People span tenants; reference data can be shared, observations cannot

**Decision.** `person` has no `tenant_id` — membership is a join table. Reference
data takes a **nullable** `tenant_id` where NULL means shared. Observed and
operational data is **always** tenant-scoped, even when it describes a shared
item.

```
person                      -- global identity
  id, name, email, active

person_tenant               -- membership; append-only, timestamped
  person_id, tenant_id, role, joined_at, left_at

person_site                 -- site access within a tenant
  person_id, site_id, joined_at, left_at
```

**The split that is not obvious.** "Companies with multiple tenants share similar
product" is true, but it does not follow that an *item row* can simply be shared.
An item carries two very different kinds of information:

| | Example | Scope |
|---|---|---|
| **Intrinsic** — what the thing *is* | code, description, GTIN, DG class, UN number, packing group | Shareable |
| **Operational** — how *we* handle it | measurements, packing config, internal barcodes, rotation type, shelf life | Never shareable |

Two tenants stocking the same product may receive it from different suppliers, in
different case packs, on different pallet configurations. **Their measurements
legitimately differ, and neither is wrong.** So D14's `measurement` and
`item_packing_config` stay tenant-scoped even when the `item` they describe is
shared — otherwise one tenant's cubing corrections silently rewrite another
tenant's autofill, which is the D9 confidence model quietly poisoned across an
isolation boundary.

The pleasant consequence: a shared item is **thin** — identity and intrinsic
facts only. That is exactly the part that genuinely is the same everywhere, and
it is also the part that is expensive to key in and easy to get wrong (UN numbers
in particular). The valuable sharing happens without any of the risky sharing.

```
item
  tenant_id            -- NULL = shared catalogue
  code, description
  dangerous_goods_class, un_number, packing_group
  tracking

item_barcode
  tenant_id            -- NULL for a GTIN; set for an internal barcode

measurement            -- tenant_id NOT NULL, always
item_packing_config    -- tenant_id NOT NULL, always
```

**RLS follows the same shape.** Reference tables get
`tenant_id IS NULL OR tenant_id = current_tenant()`; everything else gets
`tenant_id = current_tenant()`. Two policy shapes, applied by category, not
per-table judgement.

**Accountability still works across the boundary.** `recorded_by_id` (D11) points
at a global `person`, but the facts it appears on are tenant-scoped. So someone
working in two tenants has one identity and two separate histories, and a manager
in one cannot see their activity in the other. That falls out of RLS rather than
needing a rule.

**Membership is append-only**, matching `work_session_member` (D11): who had
access to what, when, is answerable historically. Access that was removed leaves
evidence.

### D20 — Capability is a property of the data, not a configuration mode

**The principle.** Support as many operating models as possible without imposing
any of them. An organisation with a streamlined process should never encounter
the machinery that serves a complicated one — not because it is switched off in
settings, but because **the dimension only exists on the records that need it.**

This is the difference between "enable lot tracking" as a global mode that
changes how the whole system behaves, and `item.tracking = lot` on the forty
items that need it. The second is discoverable, per-item, reversible, and
invisible to everyone else. It is also already how D14 works, so this decision
generalises an existing pattern rather than inventing one.

Four capabilities, one shape:

| Capability | Carried by | Default | Cost to an org that does not need it |
|---|---|---|---|
| Lot / expiry / FEFO | `item.tracking`, `item.rotation_type` | `none` | Nothing |
| Catch weight | `item.quantity_mode` | `count` | Nothing |
| Third-party stock (3PL) | `stock.owner_id` | the site's own entity | Nothing |
| Multiple legal entities | `site.legal_entity_id` | the tenant's own entity | Nothing |

Every one defaults to the simple case. Nothing needs configuring to get the
streamlined behaviour, and nothing needs "going deep into context options" to get
the complicated one — you set a property on the product or the site.

### `party` and `legal_entity` — the third axis

3PL is confirmed as in scope, which requires an owner concept for stock. Once
that exists, the corporate-group case comes free, so these are one decision:

```
party                        -- anyone we transact with or on behalf of
  id, tenant_id, kind        -- legal_entity | customer | supplier | carrier
  name, abn, active

site
  legal_entity_id            -- which of our entities operates this site

stock
  owner_id                   -- party; defaults to the site's legal entity
```

**Three axes, not one.** This is the distinction D18 started and did not finish:

| Axis | Question it answers | Crossing it means |
|---|---|---|
| `tenant` | Who may see this? | Impossible |
| `legal_entity` | Who owns it and who invoices? | An inter-company sale |
| `site` | Where is it? | A transfer (D16) |

**This de-risks question 49.** Whether the Australian states are one legal entity
or several changes the *deployment* — one tenant or several — but **not the
schema**, because `legal_entity` expresses a group either way. If they are
several entities under one operational group, the right answer is almost
certainly one tenant with several legal entities: operationally one warehouse
network, legally several companies. That keeps D16's transfers working while
letting them generate the inter-company paperwork they legally require.

**`owner_id` joins the `stock` key**, making it (item, location, lot, status,
owner). Six columns is wide, and it is the same shape Odoo reached. For an
organisation that never holds third-party stock the column is a constant, so the
index behaves as though it were not there. This is the migration D4 warned about,
which is precisely why it is being done now rather than discovered later.

### Catch weight, contained

A catch-weight item is sold by actual weight but handled as discrete units — six
cartons of beef weighing 47.3 kg in total. The trap is letting that turn
`quantity` into two numbers everywhere.

It does not have to. **The count stays primary**; the weight rides alongside as
an observation captured at the same moment:

```
item.quantity_mode          -- count | catch_weight
stock_movement.catch_weight_g   -- nullable; required when quantity_mode = catch_weight
package_content.catch_weight_g
```

Picking, allocation, cubing and the ledger all keep working on counts unchanged.
Weight is captured at pick and pack time, flows to `package_content`, and drives
invoicing and freight. Enforcement follows the same pattern as `tracking = lot`
(question 31): application-level, plus a periodic assertion.

### Ordering by weight is unit conversion, not a different allocator

*(Revised — I first called this "a genuinely different allocation problem". It is
not, and the simpler reading is better.)*

Weight is a **property of the stock**, and a kilogram is a unit that converts
through the weight per unit we already hold. So ordering in kg is the same
mechanism as ordering in pallets: `entered_quantity` + `entered_unit`, converted
to the base unit for everything downstream.

```
order_line
  entered_quantity, entered_unit     -- 240, 'kg'
  quantity                           -- 12, base units (derived)
  quantity_tolerance_pct             -- how close is close enough
```

Two cases, one mechanism:

- **Fixed weight** — a box of screws is always 12 kg. `240 kg → 20 boxes`
  exactly. Pure unit conversion; catch-weight machinery never engages.
- **True catch weight** — a box of beef is *about* 20 kg. `240 kg → ~12 boxes` is
  a **planning estimate**, which is all allocation ever needed. The real numbers
  arrive when the boxes are actually picked and weighed.

**Allocation stays on counts, unchanged.** It plans against nominal weight because
at planning time nominal weight is the only weight that exists — the actual boxes
have not been chosen yet. Trying to solve closest-fit in the allocator means
optimising against numbers we have not observed, which is exactly the mistake D5
exists to avoid.

**Closest-fit belongs at pick time, where the scale is.** The picker has real
weights, so the handheld can guide: *"241.3 kg picked, target 240 ± 2%, within
tolerance."* Under or over tolerance is a decision made with actual numbers in
hand, and if it ships outside tolerance that is a finding (D8), not a rejected
pick.

**Stock in kilograms becomes a projection, not a calculation.** Because actual
weights land on movements, weight-on-hand sums the same way count does:

```
stock
  quantity        -- projection of stock_movement.quantity
  weight_g        -- projection of stock_movement.catch_weight_g
```

So *"how many kilograms of beef do we have"* is a single indexed read, exactly
like the count — and it is **actual** weight rather than an estimate. For
non-catch-weight items the column is null and nominal weight is derived from
`measurement` on demand.

**What still needs differentiating** is what the customer *asked for*, which
`entered_unit` records. An order for 240 kg and an order for 12 boxes are
satisfied differently even when they pick the same stock: one is judged against a
weight tolerance, the other against a count.

### D21 — Assertions: statements of record neither side may revise

*Adopted 2026-08-01 from [mechanism-design.md](./mechanism-design.md), with the
provenance closure test replacing the closure claim, rule 3 stated as its
negative half only, and principle 3 restated to `bytea`. D26 remains proposed.*

**Decision.** An **assertion** is a statement of record exchanged with another
party, stored exactly as exchanged, which neither side may unilaterally revise.

**The cut is control, not authorship.** The property that generates every rule is
not *who wrote it* — it is that **a copy exists outside our control**. Our own
outbound despatch advice is as unrevisable as a supplier's inbound one, because
they hold a copy and will quote it back. Taking the symmetric version costs one
`direction` column and buys outbound EDI, proof of delivery and quotations on
machinery we build once.

**Why "intentions have an author" fails.** Three decisive reasons: mutability is
the intention category's *defining* rule and must be disabled for every
counterparty claim; assertions arrive in the author's vocabulary and are normally
unresolvable, where an intention with dangling FKs is a defect; and intentions
project into `stock.allocated_quantity` while an ASN must not.

**The five rules.**

1. **Immutable.** No UPDATE, no DELETE, ever. A revision is a new assertion.
2. **Always names its author party.** `author_party_id NOT NULL` — an
   access-control boundary, not metadata.
3. **Never projects into `stock`, and never into a commitment that survives
   withdrawal of the claim.** *(Narrowed by D24 (supply side) — assertions project
   into `expected_supply`, and demand may bind to it. This is a policy change, not
   a schema one: a counterparty's claim can now reach a customer promise. See
   D24's rule-3 section.)*
4. **Exists to be compared.** A claim never checked is itself a finding.
5. **Recorded in the author's vocabulary.** Resolution into ours is a separate,
   fallible, recorded step.

```
party_message                 -- FACT. Replaces provider_exchange.
  id, tenant_id, party_id
  direction                   -- inbound | outbound
  channel                     -- edi | portal | csv | email | api | webhook | print
  transport_ref, content_type
  payload bytea               -- verbatim. NEVER jsonb (principle 3).
  byte_count, content_hash
  occurred_at, recorded_at, client_event_id
  parse_status                -- pending | parsed | partial | failed | unsupported
  parser_version
  UNIQUE (tenant_id, party_id, content_hash, transport_ref)

assertion                     -- ASSERTION. Envelope.
  id, tenant_id, kind         -- despatch_advice | carrier_status | equipment_docket
                              -- | delivery_receipt | order_response | price_advice
  direction, author_party_id (NOT NULL), transmitted_by_party_id
  owner_party_id, site_id
  author_reference, author_version, message_function
  asserted_at                 -- their clock
  received_at                 -- ours. NEVER null.
  party_message_id            -- the artefact, when one exists
  captured_by_id              -- the person, when keyed from paper
  client_event_id
  supersedes_assertion_id     -- THEIR claim that this replaces that
  correction_of_assertion_id  -- OUR transcription fix
  CHECK (party_message_id IS NOT NULL OR captured_by_id IS NOT NULL)
  CHECK (correction_of_assertion_id IS NULL OR party_message_id IS NULL)
  UNIQUE (id, kind)                              -- composite FK target for bodies
  UNIQUE (id, tenant_id, author_party_id, kind)  -- target for supersession
  -- NO unique on (author_reference, author_version): a duplicate resend must be
  --   STORABLE and raise a finding (D5), not be refused at the write.
  -- NO status column: our position is assertion_stance (D25).

assertion_stance              -- FACT: our position on a claim
  id, tenant_id, assertion_id
  stance                      -- pending | in_force | rejected | superseded
                              -- | withdrawn_by_author | expired
  reason_code, note, successor_assertion_id
  CHECK (stance <> 'superseded' OR successor_assertion_id IS NOT NULL)
  occurred_at, recorded_at, client_event_id
  recorded_by_id / automation_key, authorised_by_id

assertion_check               -- FACT: a claim was checked against reality
  id, tenant_id, assertion_id
  asserted_unit_id, asserted_unit_content_id
  metric_id                   -- FK metric (D23). NOT a second vocabulary.
  outcome                     -- agreed | disagreed | unverifiable
                              -- | unchecked_at_close
  asserted_numeric, observed_numeric        -- canonical units (D23)
  asserted_text, observed_text
  variance_numeric GENERATED
  discrepancy_id
  CHECK (outcome <> 'disagreed' OR discrepancy_id IS NOT NULL)
  checked_at, recorded_at, client_event_id, recorded_by_id / automation_key
```

**Typed bodies, one per kind**, joined by a composite FK on `(assertion_id, kind)`
with the body's `kind` a stored generated constant — so "this body belongs to an
assertion of the matching kind" is declarative rather than a trigger.

```
despatch_advice               -- body for kind = 'despatch_advice'
  assertion_id PK, kind (GENERATED, + composite FK)
  inbound_shipment_id         -- the SUBJECT this claim is about (our resolution)
  ship_from_gln, ship_to_gln, gsin, ginc
  carrier_party_id, conveyance_ref, container_ref, seal_number
  despatched_at, estimated_arrival_at
  split_shipment, completes_order, granularity
  resolved_purchase_order_id, resolved_at, resolved_by_id, resolution_method

asserted_unit                 -- the declared logistic hierarchy, per claim
  id, assertion_id, parent_asserted_unit_id
  level_code, sscc, sequence
  raw_package_type_code, resolved_package_type_id
  -- NO weights, NO ti/hi. Those are OBSERVATIONS whose observable is this
  --   asserted_unit and whose asserted_by is the author (D23).
  -- Nesting is unbounded here (cold path); it collapses to D24's cap at receipt.

asserted_unit_content
  id, asserted_unit_id
  raw_gtin, raw_item_code, resolved_item_id
  raw_po_reference, raw_po_line_number, resolved_purchase_order_line_id
  quantity, entered_quantity, entered_unit_id   -- structural: the receipt
  lot_code, expiry_date, best_before_date       --   compares these line by line
  resolved_at, resolved_by_id, resolution_method
```

**The boundary with observations.** An assertion body holds **identifiers,
structure, and the values the receipt compares line by line**. Every other number
with a unit is an `observation` (D23) whose observable is the asserted unit. A
supplier-declared carton weight is therefore an observation with
`asserted_by_party_id = supplier`, and comparing it to our scale is one query
against one vocabulary rather than two parallel ones.

**Two column classes, and immutability follows the class.** `raw_*` and every
transcribed value are immutable. `resolved_*` are *our annotation* and may be
written when resolution later succeeds — a GTIN unresolvable today becomes
resolvable when the item is created tomorrow, and refusing that would discard a
claim because our catalogue was behind. But a re-resolution **freezes on first
use**: once an `assertion_check` or a `goods_receipt_line` references it, it may
not be rewritten, and a correction writes a new assertion. Same rule as
`goods_receipt_line.expected_quantity`.

**`inbound_shipment` is a subject, not an assertion.** Filing it as an assertion
means a resend mints a second row and orphans every FK pointing at the first —
the `consignment.fulfilment_id` defect D15 already deleted once.

```
inbound_shipment              -- PROJECTION (subject)
  id, tenant_id, site_id, supplier_party_id, owner_party_id
  vendor_shipment_ref
  in_force_assertion_id       -- @projection: the currently effective claim
  granularity, estimated_arrival_at
  asserted_unit_count, asserted_base_quantity      -- for the gate check
  first_asserted_at, superseded_count
  vehicle_arrival_id
  UNIQUE (tenant_id, supplier_party_id, vendor_shipment_ref)
```

**Nothing on it is NOT NULL that requires an assertion**, so blind receipt — rung
zero of the degradation ladder — is a **schema property**, not a workflow branch.

#### Amendments to earlier decisions

- **Principle 2** — the fourth provenance value, with the admission test.
- **Principle 3** — restated to `bytea`; the model contains no `jsonb` column.
- **D1** — `provider_exchange` becomes `party_message`; `consignment.eta`,
  `.status` and `.price_minor` become projections of the in-force carrier advice.
- **D5** — terminology: "counts are assertions, not deltas" becomes "counts are
  **absolute claims** — register semantics". `stock_count` is a fact, and ours.
  "Assertion" now means a statement of record exchanged with a party.
- **D8** — `discrepancy` gains `assertion_check_id`; kinds `+= expiry_mismatch`,
  `identity_mismatch`, `assertion_unresolvable`, `asserted_unit_absent`,
  `asserted_unit_unexpected`.
- **D11** — machine actors: `automation_key` XOR `recorded_by_id`, on
  assertion-ingestion facts **only**. `stock_movement` keeps its NOT NULL person.
- **D14** — `lot.expiry_date` remains the *accepted operational value*; a
  supplier-asserted expiry is an assertion, and disagreement is `expiry_mismatch`.

**Rejects.** "A counterparty's intention is still an intention". One table per
assertion kind with author, artefact and clocks repeated. A single assertion table
with a JSONB payload. An EAV bag of asserted attributes. Correcting an assertion
in place where an artefact exists. Making the category asymmetric — inbound only.
Treating adopted rate cards and customer shelf-life requirements as assertions:
those are **policy**, carrying `adopted_from_assertion_id`, because we may change
them unilaterally.

### D22 — Policy resolves against a scope lattice

*Adopted 2026-08-01 from [mechanism-design.md](./mechanism-design.md), with
taxonomy changes as facts added. D21, D23, D25 and D26 remain proposed.*

**Decision.** One `policy_binding` table. A policy is a **typed value row bound to
a point in a lattice of six ordered, tree-shaped scope dimensions, effective over
a period**. Resolution matches every binding whose non-null dimensions are
at-or-above the request's node on each axis, orders the matches by their **depth
vector** compared lexicographically in a precedence order declared per kind in
code, takes the winner's value row, then clamps any field the value type declares
as clamped.

| Dimension | Nodes, least to most specific | Columns |
|---|---|---|
| **Tenancy** | operator (NULL) → tenant | `tenant_id` |
| **Product** | any → `item_class` ancestors → `item_class` → `item` | `item_class_id`, `item_id` |
| **Counterparty** | any → `party_class` → `party` | `party_class_id`, `party_id` |
| **Space** | any → `site` → `zone` | `site_id`, `zone_id` |
| **Ownership** | any → `owner_party` | `owner_party_id` |
| **Metric** | any → `metric` (flat) | `metric_id` |

**Tenancy is not a declarable dimension** — it is the mandatory first component of
every depth vector, so a tenant's binding always beats an operator-shipped one.
Without this, a per-kind order ranking Product above Tenancy would let our default
outrank a tenant's own configuration: a correctness hole, not a support surface.

**Specificity is a vector, not a number.** Collapsing a componentwise comparison
to one integer lets a large count in a low-weight component beat a small count in
a high-weight one. CSS is twenty years of proof; there is no `specificity` column.

**A scope is a conjunction.** The columns are independent nullable axes, NULL
meaning "any". There is deliberately **no `num_nonnulls` CHECK** — one would
reverse the semantics and forbid the all-NULL operator default that shipped
defaults and clamping require.

**The entire matching language has cardinality one:** *is this node an
ancestor-or-self of that node*, over closure tables. No `<`, no `LIKE`, no `IN`,
no boolean connectives anywhere in the data. That is why this is not a rules
engine, and it is greppable.

**Ties are prevented, not broken.** Within a tree dimension a request node has
exactly one ancestor at each depth, so two matching bindings with identical depth
vectors must name identical scopes — forbidden by the unique index. **The
load-bearing dependency is that every scope dimension is single-parent.** If
`item_class` ever becomes many-to-many tags, resolution becomes non-deterministic
and this design is unsound. Defence in depth: equal vectors take the lower binding
id (deterministic — never stop the floor) and raise
`discrepancy.kind = 'policy_ambiguous'`.

```
policy_binding                -- WHERE a policy applies. Scope is IMMUTABLE.
  id, tenant_id               -- NULL = operator-shipped default
  kind
  item_class_id, item_id, party_class_id, party_id
  site_id, zone_id, owner_party_id, metric_id
  supersedes_id, note, created_at, created_by_id
  UNIQUE NULLS NOT DISTINCT (tenant_id, kind, item_class_id, item_id,
                             party_class_id, party_id, site_id, zone_id,
                             owner_party_id, metric_id)
  UNIQUE (id, kind)           -- composite FK target for value tables
  INDEX (tenant_id, kind)     -- the resolver's only scan

policy_change                 -- FACT. Append-only. Mandatory reason.
  id, tenant_id, occurred_at, recorded_at
  policy_binding_id, kind
  action                      -- created | revalued | retired | reinstated
  reason (NOT NULL)           -- a weight change with no reason is how tuning
                              --   becomes superstition
  recorded_by_id, authorised_by_id

<kind>_policy                 -- WHAT applies and WHEN. Append-only versions.
  id, policy_binding_id, kind
  CHECK (kind = '<its kind>')
  FOREIGN KEY (policy_binding_id, kind) REFERENCES policy_binding (id, kind)
  effective tstzrange
  EXCLUDE USING gist (policy_binding_id WITH =, effective WITH &&)
  ... typed scalars ...
```

**Eleven kinds:** `allocation`, `putaway`, `receiving`, `order_tolerance`,
`count_tolerance`, `shelf_life`, `sampling`, `cycle_count`, `specification`,
`observation_precedence`, `observation_acceptance`. The enum, the `%_policy` table
set and the compiled Rust registry are asserted equal in CI.

**Combination is most-specific-wins over the whole value row**, not per field —
you must not take `weight_rotation` from a customer binding and `weight_travel`
from a site binding, because weights are only meaningful relative to each other.
The one exception is **per-field clamping declared on the Rust value type**: the
winner's value, clamped against every less-specific match. That is what "customer
× item class, plus a site floor" (q33, q39) actually asks for, and it gives a
commercial product an operator-shipped ceiling no tenant can exceed.

**No per-row override flag.** That is `!important`, and it exists precisely to
escape the precedence order it was supposed to live in. If an operation needs both
a floor customers cannot undercut and a default they can, those are two fields
with two declarations.

**Instance agreements sit outside the resolver and win outright.** An explicitly
agreed value on an instance — `order_line.tolerance_under_pct` from an EDI order
or typed by a salesperson — is a different category of thing (what was *agreed*,
not what we do by default), and the resolver is not consulted.

**Reproducing a past decision is a foreign key, not a replay.** Value rows are
append-only, so `stock_allocation.allocation_policy_id` points at the exact
immutable row that scored it. One naming convention, asserted:
`<kind>_policy_id`, always an FK to the value row, never a version integer.

**Scope is immutable.** Editing a binding's scope would silently change the
meaning of every value row a past decision already references. Rescoping is
retire-and-create, linked by `supersedes_id`.

**The resolver returns an explanation, not a value** — winner, what clamped it,
and in explain mode the candidates considered and the near-misses with the
dimension that failed. *"Why is the 60 I configured not applying?"* is only
answerable by evaluating bindings that did not match. `resolve_batch` is the
primary interface; single-request is a wrapper.

#### Where the line sits

D13 said *"if we ever find ourselves adding a table where the logic itself is
rows, that is the line"* — true, and unfalsifiable as written. Sharpened:

> **Data may say where a number applies and how big it is. Only code may say what
> to do with it.**
> A row may contain: a scope node identifier, a period, and a typed scalar.
> A row may never contain: the name of a field, the name of an operator, a
> comparison, a boolean connective, the target of an action, or an ordering of
> steps. **The moment a table has a column whose *value* is a *column name*, we
> have crossed.**

That is a grep, and it caught its own author: the first draft of this design
failed it on a `band_axis` column.

**One bounded extension, fenced now rather than smuggled in later.** A value table
may have **at most one child, keyed on a single numeric axis declared in code**,
with `[lower, upper)` bands and a no-overlap exclusion constraint, containing only
bounds and typed scalars. `order_tolerance_band` is the only instance, and the
axis is named in the Rust type — there is no `band_axis` column.

#### Taxonomy changes are facts

*(Added on adoption.)* Depth vectors make **tree shape semantically
load-bearing**, and the failure mode is subtler than it looks. Membership changes
are intuitive — move a class out of `dairy` and dairy's rules stop applying. But
**cross-dimension flips are possible**: a binding at Product-3/Space-0 beats one
at Product-2/Space-2; re-parent so the first is depth 2 and the second now wins,
with nothing about either binding changed.

Retire-and-create for taxonomy nodes was rejected as too heavy for a structure
that legitimately evolves. Instead the change is recorded, and its blast radius is
computed **before** it is committed:

```
taxonomy_change               -- FACT. Append-only.
  id, tenant_id, occurred_at, recorded_at
  item_class_id, party_class_id            -- exactly one
  CHECK (num_nonnulls(item_class_id, party_class_id) = 1)
  action                      -- created | reparented | renamed | retired
  from_parent_id, to_parent_id
  reason (NOT NULL)
  affected_resolution_count   -- computed before the move, frozen on the fact
  recorded_by_id, authorised_by_id
```

Two things follow. The operator sees *"this move changes N active resolutions"*
before confirming, so the blast radius is a decision rather than a discovery. And
*"why did this item's shelf-life rule change last March"* becomes answerable by
the same anti-join that answers it for `policy_change` — which is the point: a
taxonomy edit and a policy edit have identical consequences and should leave
identical evidence.

#### Prerequisites

`item_class` and `party_class` are per-tenant rooted trees with closure-table
projections. `zone` becomes a real table (`zone(id, site_id, code, …)`,
`location.zone_id`), not a bare column — the Space dimension needs something to
FK to and a depth to read.

**`item.item_class_id NOT NULL` would break D19** and is not used: a shared item
(`tenant_id IS NULL`) cannot carry a mandatory FK into one tenant's private
taxonomy, since every other tenant reads it as an unresolvable link. Classification
is an association:

```
item_classification
  tenant_id, item_id, item_class_id
  PRIMARY KEY (tenant_id, item_id)      -- exactly one class per item per tenant
```

Single parentage is preserved, so the tie-freedom proof holds, and D19's thin
shared item survives.

#### Amendments to earlier decisions

- **D13** — `allocation_policy(scope_kind, scope_id)` → `policy_binding_id`. The
  scoring function stays code, unchanged and reaffirmed; the line becomes a grep.
  "We ship defaults, not hard-coded behaviour" becomes literally true: our
  defaults ship as `tenant_id IS NULL` bindings.
- **D14** — `customer.min_shelf_life_days`/`_pct` are **removed**; they cannot
  express "different requirements by category". Replaced by `shelf_life_policy`
  with clamping, so a site floor raises a customer rule.
- **D9 / q21** — `count_tolerance_policy`, distinct from order tolerance:
  different numbers, different screens.
- **D20 q55** — `order_line.quantity_tolerance_pct` becomes an instance
  agreement; the policy value moves to `order_tolerance_policy` plus its band
  child. **`order_line` is not a scope** — it would put instance-cardinality rows
  in a config table.
- **D8** — `discrepancy.kind += policy_ambiguous`; `respond_by` populated from
  `receiving_policy.respond_by_hours`.
- **D19** — a third RLS shape, for operator-shipped shared bindings.

**Rejects.** A polymorphic `policy_scope(scope_kind, scope_id, precedence)` pair,
structurally unable to express *(customer AND item class)*. A scalar or packed
specificity. Tie-breaking by entry order, `created_at`, or document order. A
per-row `is_override` flag. A `combine` column chosen per kind as data — combining
is semantics and belongs in the Rust type. Predicate rows.
`policy_value(policy_id, field_name, value)`. JSONB value blobs. Many-to-many item
tags. Per-tenant policy kinds or tenant-defined dimensions. A `policy_resolution`
audit table — volume is per-scan, and the value-row FK carries the same
information.

**Not a projection, deliberately.** `policy_change` holds no values, so a claim
that policy state is rebuildable from it reduces to rebuilding the value rows from
the value rows. The guarantee is carried entirely by a bidirectional anti-join:
every value version has a matching `policy_change` and vice versa.

### D23 — Observations generalise; the subject set opens on a registry

*Adopted 2026-08-01 from [mechanism-design.md](./mechanism-design.md), with the
`stock_count` boundary stated and the projection-under-policy rule lifted in.
D21, D25 and D26 remain proposed; references to them are marked.*

**Decision.** `measurement` is replaced by a two-level fact pair —
`observation_event` (the act) and `observation` (one result of it) — over three
reference primitives: an `observable` subject registry, a data-defined `metric`
vocabulary whose *result kinds* are code-defined, and a `dimension`/`unit` pair
carrying exact rational conversion to one canonical integer per dimension.

**Three welds, not one.** `metric` is closed by an enum — widening it alone fails
on the first temperature, because an affine unit cannot be an integer in an
implied canonical unit, an ETA is not an integer at all, and a quality grade is an
ordinal term. `subject_type` is closed by an enum. And `source` conflates three
orthogonal things: `carrier_actual` bundles *a carrier asserted it* with *an
instrument produced it*; `operator_correction` is not a source at all but a
lifecycle event about a different row.

#### The subject is typed once, in a registry

```
observable                    -- REFERENCE. The ONLY place the subject set widens.
  id, tenant_id (NOT NULL)
  kind                        -- GENERATED: which arm is set
  item_id, packaging_level, item_packing_config_id   -- each|inner|carton|layer|pallet
  package_type_id, package_id, lot_id, location_id, consignment_id
  device_id, vehicle_arrival_id
  asserted_unit_id, asserted_unit_content_id         -- [D21, proposed]
  CHECK (num_nonnulls(<arms>) = 1)
  CHECK ((item_id IS NOT NULL) = (packaging_level IS NOT NULL))
  CHECK (item_id IS NULL OR packaging_level = 'each'
         OR item_packing_config_id IS NOT NULL)
  UNIQUE (id, tenant_id)
  ... one partial unique index per arm ...
```

Every arm is a real FK, so an investigation cannot dead-end, and batch loading is
two hops with no N+1. **The fact tables are permanently stable in shape**: adding
"we now observe pallet-pooling accounts" is one column on a table of ~10⁵ rows and
zero change to anything holding 10⁷. This is the answer to question 20 — typed
subject FKs, but on the registry rather than on the fact, which is what stops the
subject set being frozen at the moment inbound opens it.

**`item` carries a `packaging_level`**, so "the carton, not the each" is
expressible. The identity is `(item_id, packaging_level, item_packing_config_id)`,
with the config NULL only at `each` — a carton is only a definite physical object
relative to a case pack, and because `item_packing_config` is versioned, a
corrected case pack cannot silently rewrite the dimensions of cartons shipped last
year. `packaging_level` is a **subject qualifier, never a unit**: a carton is not
commensurable with a millimetre.

#### The discriminated-union boundary rule

*(Amends the four-arm limit from the cross-cutting review.)*

> Typed nullable FKs with a mutual-exclusion CHECK are correct when the arms are
> **alternative identities of one referent** — a discriminated union where exactly
> one is structurally required and "none" is meaningless. They strain when the
> arms are **distinct relationships that merely happen to be exclusive today** —
> causes, demands, sources — because there exclusivity is a *policy*, and policies
> turn out to be wrong.

That explains both prior failures: `stock_movement`'s cause CHECK and
`goods_receipt`'s demand CHECK both had to relax to `<= 1`. Nobody will ever
discover an observation about no thing, or about two things at once. The rule
licenses `observable`'s arms and **constrains** cause sets, which stay at `<= 1`.

#### The boundary with `stock_count`

*(Stated on adoption. A `stock` cell is deliberately not an `observable`.)*

Admitting it would drag D4, D12, D20 and D24 into this decision for a case
`stock_count` already serves, and D24 gives `stock` a surrogate id that would make
it tempting. The line:

> **Quantities of cells are `stock_count`. Quantities of identified things are
> `observation`.**

Counting bin A3 is a `stock_count` — a cell is a coordinate, not a thing. A
supplier claiming "this pallet holds 40 cartons" is an `observation` about a
package, because a pallet is a thing with an identity. Counterparty-asserted
quantities therefore work without exception, because they are always properties of
an identified object.

#### Units, dimensions and metrics

```
dimension        id, code, canonical_unit_id      -- length|mass|volume|temperature
                 UNIQUE (id, canonical_unit_id)   -- |count|ratio|time_interval
                 -- shipped by us; no tenant_id, ever

unit             id, dimension_id, code, ucum_code, uncefact_code
                 factor_num, factor_den           -- EXACT rational. in = 254/10 mm
                 offset_num, offset_den           -- affine; degC = +273150 mK
                 display_decimals
                 UNIQUE (id, dimension_id), UNIQUE (dimension_id, code)

metric           id, tenant_id                    -- NULL = shipped (D19)
                 code, label
                 result_kind                      -- quantity|instant|code|boolean|text
                 dimension_id                     -- NOT NULL iff quantity
                 reserved                         -- only code may name these
                 applies_to                       -- which observable arms are legal
                 higher_is_better
                 UNIQUE (id, result_kind), UNIQUE (id, dimension_id)
                 UNIQUE NULLS NOT DISTINCT (tenant_id, code)
                 CHECK ((result_kind='quantity') = (dimension_id IS NOT NULL))
                 CHECK (NOT reserved OR tenant_id IS NULL)

metric_code      id, metric_id, code, label, ordinal
```

**`metric.aggregation` is removed; `higher_is_better` stays.** Aggregation
(last|min|max|mean) is a per-row data value selecting which fold a projection
performs — that is semantics, and semantics belong in the Rust type, the same
argument that refused a `combine` column in D22. `higher_is_better` is a display
and scorecard hint, not a fold.

**Why this is not a custom-field framework.** EAV is deferring *type* decisions to
runtime; its signature is one `value text` column, an arbitrary attribute name, an
untyped subject, and a schema that cannot be read. This has none of them: the
subject is an FK; the value is one of five typed columns chosen by the metric's
declared `result_kind` and enforced per row by a composite FK plus a CHECK; the
unit is enforced commensurable by a second composite FK, so recording a length in
grams is a constraint violation rather than a code-review finding; nothing
queryable is in JSONB; and a metric cannot add a column elsewhere or make the
system branch. **The result types are code; only the vocabulary is data** — D13
one level up.

Enforced two ways: reserved metrics ship with `tenant_id IS NULL, reserved = true`,
and **application code may name only reserved codes**, which is a grep in CI. The
day someone writes `if metric.code == "customer_special_thing"`, the build fails.

**Gross, net and tare are three metrics, not one with a modifier.** GS1 settled
this (AI 310n net, AI 330n gross). The single `weight` metric is genuinely
ambiguous today, and gross-versus-net is exactly what a carrier re-weigh surfaces.

#### The facts

```
observation_event             -- THE ACT. Append-only.
  id, tenant_id, observable_id
  observed_at                 -- VALID time (device clock, D5)
  recorded_at                 -- TRANSACTION time (server clock, D5)
  device_id                   -- the RECORDING device. Unconditional (D11).
  instrument_device_id        -- the MEASURING instrument; set only when
                              --   method IN ('instrument','scan')
  recorded_by_id / automation_key      -- CHECK num_nonnulls(...) = 1
  work_session_id, authorised_by_id, work_task_id, goods_receipt_id
  asserted_by_party_id        -- WHO claims it. NULL = us.
  method                      -- HOW: instrument|scan|keyed|derived|estimated
                              --      |transcribed|asserted
  ingestion_channel           -- THROUGH WHAT: edi|portal|csv|email|api|keyed
                              --               |scale|scanner|derived
  derived_from_event_id
  party_message_id, attachment_id       -- [D21 / inbound, proposed]
  -- NOTE: challenge fields are NOT here. See the correction below: a challenge
  --   is a property of a captured VALUE, and an event may carry several.
  UNIQUE (id, observable_id), UNIQUE (id, observed_at), UNIQUE (id, tenant_id)

observation                   -- ONE RESULT. Append-only. Never UPDATEd.
  id, tenant_id, observation_event_id
  observable_id, observed_at             -- denormalised, composite-FK'd
  metric_id, result_kind, dimension_id   -- denormalised, composite-FK'd
  value_numeric bigint        -- ALWAYS the dimension's canonical unit.
                              --   NO unit column: non-canonical storage is
                              --   structurally unrepresentable.
  value_instant, value_code_id, value_boolean, value_text
  uncertainty_dimension_id, uncertainty_numeric   -- half-width
  absent_reason               -- not_measured|not_applicable|unreadable|retracted
  entered_value numeric, entered_unit_id          -- as the counterparty gave it
  confidence smallint
  corrects_observation_id     -- the target was NEVER true (retroactive)
  retracts_observation_id     -- the target should not exist
  FK (metric_id, result_kind) -> metric(id, result_kind)
  FK (metric_id, dimension_id) -> metric(id, dimension_id)
  FK (entered_unit_id, dimension_id) -> unit(id, dimension_id)
  FK (value_code_id, metric_id) -> metric_code(id, metric_id)
```

`uncertainty_dimension_id` is separate from `dimension_id` because an ETA has no
dimension but "± 2 hours" is a real answer.

**Provenance is three deliberately uncorrelated columns.** A carrier re-weigh is
`(carrier, instrument)`. A supplier ASN is `(supplier, asserted)`. Our own eyeball
is `(NULL, estimated)`. The old enum could express the first and third only by
having a value per combination, which is why it ran out.

**The five-channel test.** The same fact — pallet SSCC 393123… weighs 412.5 kg —
arriving over EDI, a portal, a CSV, a dock scale and a keyboard produces five rows
that are **byte-identical in `(observable_id, metric_id, value_numeric,
entered_value, entered_unit_id)`**, differing only in provenance. One CI fixture
per channel, one assertion. If a new adapter ever needs a content column the
others do not have, the test fails on the day it is introduced. **That is the
interoperability requirement made testable instead of asserted.**

**Supersession, correction and retraction are three different things.**
Supersession needs no mechanism — a pallet weighed 400 kg Monday and 380 kg
Tuesday because a carton came off; both are true at their own times. Correction is
an explicit link because the old row was *never* true and must stop influencing
the projection **retroactively**. Retraction is an explicit link with no
replacement. All three are observations, so the table stays append-only with no
mutable status on a fact.

With both clocks and corrections distinguished from supersessions, two genuinely
different questions get different answers: *what did the pallet actually weigh on
Monday* (`observed_at <= Monday`, excluding corrected and retracted) and *what did
we believe on Monday* (`recorded_at <= Monday`, including rows later corrected).
The second is what a chargeback dispute needs, and it is unanswerable if
correction and supersession are the same thing.

#### The projection, and a general rule

```
observation_current           -- PROJECTION, keyed (observable_id, metric_id)
  observation_id, value_*, observed_at, recorded_at
  method, confidence, uncertainty_numeric, asserted_by_party_id
  observation_precedence_policy_id      -- WHICH policy row chose this (D22)
  in_breach                             -- against the resolved specification_policy
  cube_numeric                          -- COMPUTED here; never stored
```

**Precedence is a policy, not a number** — `observation_precedence`, one of D22's
eleven kinds. That makes *"trust supplier dimensions for items we have never
measured, but never trust their weight over our scale"* a configuration a manager
owns rather than a branch in our code.

> **General rule, lifted in on adoption: any projection maintained under a policy
> must record the policy row that produced it.** Otherwise the rebuild-and-assert
> job reports every policy change as drift — the projection was correct under the
> old policy and correct under the new one, and a rebuild cannot tell the
> difference without knowing which applied.

This is not specific to observations. It binds every projection D22 governs, and
it is why `observation_current` carries `observation_precedence_policy_id` and
`stock_allocation` carries `allocation_policy_id` (D22).

**A derived value is stored only when the derivation was a captured act with its
own provenance; otherwise it is computed.** `cube` is computed. A supplier
*asserting* a cube is an assertion and stays expressible.

**`package` dimensions are frozen at seal, not live projections.** Making them
projections of `observation_current` would break the stated invariant that *a
shipped package's dimensions are a historical fact about that consignment and must
never change* — a retroactive correction would rewrite the number a freight
invoice was computed against. Same argument as `goods_receipt_line.expected_quantity`.
The projection assertion applies to unsealed packages only.

#### Amendments to earlier decisions

- **Principle 5** — restated from a census of three conventions to a rule: every
  dimension has exactly one canonical unit; that unit is a **ratio scale**; stored
  values are integers in it; conversion is **exact rational**, never a float
  factor; affine units carry an offset that never reaches storage, so canonical
  temperature is **millikelvin** and `AVG`, differences and ranges are meaningful
  while cold-chain values never go negative. `numeric` is permitted for the
  preserved entered value — the prohibition is on floating point, not on exact
  decimal.
- **Principle 3** — the observation family is JSONB-free, asserted.
- **D5** — extended, not amended: both clocks carry their stated meanings.
- **D8** — `discrepancy.observation_id`; kinds `specification_breach`,
  `uncalibrated_instrument`. We do not reject the reading; we record it and raise
  the finding.
- **D9** — the policy deciding *when* to challenge is `count_tolerance_policy`
  (D22). *(This amendment originally promoted `challenged`/`challenge_context`/
  `confirmed` to `observation_event` and stripped `stock_count`'s copies. That was
  wrong — see the correction below.)*

#### Correction — a challenge belongs with the value, not the act

*(2026-08-02.)* The amendment above created a live defect. It moved the challenge
fields to `observation_event` **and** this decision's own boundary rule says a
`stock` cell is deliberately not an `observable` — *"quantities of cells are
`stock_count`"*. So a bin count has no `observation_event` to carry the challenge,
and **D9's founding worked example — "this location has not moved since the last
count of 50, and you have entered 47" — became unrecordable.**

The error was putting a **per-value** property on a **per-act** table. A challenge
contradicts a *number*, and one act may carry several: a cubing scan produces four
observations from one capture, and two of them may each be challenged. A single
flag on the envelope cannot say which.

> **The challenge lives with the captured value:** `challenged`,
> `challenge_context` and `confirmed` sit on **`observation`** (the result, not the
> event) and on **`stock_count`** (which is both act and result — a count is one
> number).

That is one *rule* applied to two value tables, not two mechanisms. It is the same
shape as the cell-key columns appearing on both `stock_movement` and `stock_count`,
which the model already accepts for the same reason: the value is where the
property belongs.
- **D13** — extended one level up: result types are code, vocabulary is data.
- **D19** — `dimension`/`unit` are global; `metric`/`metric_code` are shared
  reference; everything else tenant-scoped.
- **D20** — `measurement` **replaced**; `package.dimensions_source` deleted as a
  weaker private copy of `method`; `package_type.tare_weight_g` becomes an
  observation.

**Rejects.** Widening the enums in place. A polymorphic `(subject_type,
subject_id)`. Typed subject FKs on the observation row itself — correct goal,
wrong location: a ten-arm CHECK on the second-largest table plus ~80 bytes of
nulls per row forever. A join table between observation and subject (permits zero
and two subjects, both meaningless). One `value text` column or a JSONB result.
`metric` as an enum — it must carry attributes, unlike `activity_event.kind` where
code branches and an enum is honest. Statistical aggregates on the row. FHIR-style
comparators. Folding in `stock_count`. Money as a dimension. Storing `cube`.
`confidence` as the sole ranker. A float `factor` column. Milli-degrees-Celsius as
canonical. A separate lifecycle table for corrections.

### D24 — Containment joins the `stock` key; a package's placement is a fact

*Adopted 2026-08-01 from [mechanism-design.md](./mechanism-design.md), with the
three amendments from [containment-review.md](./containment-review.md) applied.
Numbering is kept stable across both documents: **D21, D22, D23, D25 and D26
remain proposed and are not adopted here.** Where this decision references them,
that is marked.*

**Scope.** The containment half of the proposed D24 is adopted. The supply-side
half (`expected_supply`, `stock_allocation`'s two supply arms) is **not** — it
depends on D21 and D23 and was not part of the review.

**Decision.** `package_id` joins the `stock` key as an **exclusive alternative to
`location_id``. `package_content` becomes a view over `stock`. A package's own
placement is a projection of a new append-only `package_event`.

```
stock                         -- PROJECTION
  id                          -- surrogate; stable
  tenant_id, item_id
  holder_location_id          -- \ exactly one
  holder_package_id           -- /
  lot_id, status_id, owner_id
  CHECK (num_nonnulls(holder_location_id, holder_package_id) = 1)
  UNIQUE NULLS NOT DISTINCT (tenant_id, item_id, holder_location_id,
                             holder_package_id, lot_id, status_id, owner_id)
  quantity, weight_g, allocated_quantity
  available_quantity          GENERATED (quantity - allocated_quantity) STORED
  resolved_location_id        -- @projection: holder location, or the holder's
  site_id                     -- @projection from resolved_location_id
  INDEX (tenant_id, item_id, site_id) INCLUDE (available_quantity)
        WHERE quantity <> 0

CREATE VIEW package_content AS
  SELECT id, holder_package_id AS package_id, item_id, lot_id,
         quantity, weight_g AS catch_weight_g
    FROM stock WHERE holder_package_id IS NOT NULL;
```

**Why an exclusive arm rather than a seventh dimension.** `location_id` and
`package_id` answer the same question at two resolutions, and a package's location
is a property of the package. Carrying both on a stock row is two independently
writable representations of one fact — the drift question 59 named as the default
outcome. As an exclusive arm the drift becomes **unrepresentable** rather than
detected, which is the stronger form. The key is six dimensions in seven columns.

Every capability D6 claimed for `package_content` survives, and two improve: it
gains `item_id`, `status_id` and `owner_id`, which it never had; and a sealed
carton's manifest acquires history, because it is the movements that put stock
into it up to `sealed_at`.

```
package_event                 -- FACT. Append-only.
  id, tenant_id, site_id
  occurred_at                 -- device clock; orders the register
  recorded_at                 -- server clock; first tiebreak
  recorded_by_id, work_session_id, authorised_by_id, device_id, work_task_id
  package_id                  -- THE SUBJECT. Always exactly one.
  kind        -- created | placed | contained | observed | identified
              -- | sealed | opened | relabelled | despatched | voided
  parent_package_id, location_id
  sscc, barcode
  source      -- operator_scan | label | asn | derived | correction
  asserts_placement           -- GENERATED: kind IN (created, placed, contained)
  CHECK (parent_package_id IS NULL OR location_id IS NULL)
  CHECK (kind <> 'contained' OR parent_package_id IS NOT NULL)
  CHECK (kind <> 'placed'    OR location_id IS NOT NULL)
```

Idempotency columns follow D5 until the `client_event` registry (D25, proposed)
is adopted.

**Placement is a register, not a counter — a different CRDT class from stock.**
D5 ruled out last-writer-wins because it silently discards a pick. That is right,
and it is about *quantities*. Two concurrent picks are both true; two concurrent
claims that a carton is on P1 and on P2 cannot both be true, and choosing a winner
is not data loss. **Quantities are counters; relationships are registers**, and we
implement the register over the same append-only log. Yjs stays ruled out — we
need the loser retained, ordered by device clock, and raised as a finding, none of
which `Y.Map` does.

Maintenance is **compare-and-set**, ordered by `(occurred_at, recorded_at, id)`,
so a late event with an earlier `occurred_at` loses without touching the current
value. The projection update is therefore commutative and idempotent, and
shuffling arrival order is a property test. A losing placement raises
`discrepancy.kind = 'containment_conflict'`.

`package.parent_package_id`, `location_id`, `resolved_location_id`, `status` and
`depth` become projections of `package_event`, maintained by the same
rebuild-and-assert job that guards `stock`. Nothing writes them directly.

**D6's nesting cap goes from two levels to three** (depth 0 = root). Overwrap →
pallet → carton is physically real.

**It is not a CHECK, and that matters.** `depth` is a *projection* column. A CHECK
on it would mean a `contained` event creating a four-level chain is a valid fact
the projection cannot represent — and since the projection must be rebuildable
from the log in any arrival order (D5), rebuild fails too. The result is not a
rejected event but an **unprojectable log and a wedged projection**, which is
worse than either alternative.

So the cap is enforced the way every other physical impossibility in this model
is — as a **finding**:

- `depth` records whatever the log implies, without limit.
- Depth greater than 2 raises `discrepancy.kind = 'nesting_too_deep'`.
- The resolution fold stays a **fixed three-hop join** — which is what D6's cap
  was actually protecting — and returns NULL beyond it.
- A NULL `resolved_location_id` on stock with quantity then raises
  `stock_without_location` through the existing invariant, so an over-deep chain
  surfaces twice rather than silently resolving to the wrong place.

The event is always accepted (D5), the fold stays non-recursive, and the
impossible state is visible rather than prevented.

#### The rule that decides which fact gets written

*(Amendment 1. The proposal said "custody changes" — not decidable, because a
carton is both a holder and a thing with a holder.)*

> - **`stock_movement`** — a stock cell's **key** changed: holder, lot, status or
>   owner; or quantity entered or left the system.
> - **`package_event`** — a package's **placement** changed: its parent, or its
>   location.

The two are disjoint **by subject**: a movement is about a quantity of an item, an
event is about a container. No act qualifies for both; none falls between.

| Physical act | What changed | Fact |
|---|---|---|
| Pick loose units from a bin into a tote | stock's holder | `stock_movement` |
| Pick 6 of 12 units out of a carton | stock's holder | `stock_movement` |
| Pick a whole carton onto an outbound pallet | the carton's parent | `package_event` |
| Move a pallet, bay A → bay B | the pallet's location | `package_event` |
| Goods arrive / leave | stock enters / leaves | `stock_movement` |
| Quarantine a pallet's contents | stock's status | `stock_movement` |
| Re-key a mis-recorded lot | stock's lot | `stock_movement` |
| Count a bin | nothing observed to change | `stock_count` |

**A whole-carton pick writes no movement, and that is the point.** Nothing
happened to the goods — they never left the container, nobody counted them,
nobody saw them. A movement would assert an inspection that did not occur. The
alternative writes forty movements for a pallet move, each a claim about goods
nobody touched, which is the lie D8 exists to prevent. **The fact recorded is the
fact observed.**

Work questions are asked at the **act** layer, not by unioning consequence
tables: one physical act inserts one act row plus all its facts in one
transaction, so *"what did this person do today"* joins out to whichever facts
resulted. That is D8's work-event invariant implemented properly rather than
scattered across the tables recording its effects.

**Fan-out is confined to the system boundary.** Receiving and despatching an
ASN'd pallet genuinely writes per-line movements, because goods entered or left
custody and both PO variance and D14's recall trace require it. Internal moves
are O(1) facts regardless of contents.

#### Package minting is a policy

*(Amendment 2.)* A `package` row exists **when something identifies it** — an
SSCC, a licence plate, a scan. Cartons sitting in bulk on a pallet are not
individually identified and do not become packages until labelled or picked.

This matters because LPN grain is **not** inherently larger than location grain —
five SKUs on a mixed pallet is five `stock` rows, exactly as five SKUs in a bin
is. Cardinality multiplies only if we mint a package per carton. The failure mode
to guard against is minting per-carton at receipt "for completeness" and
discovering the cost later. Minting granularity is configurable, and the default
is never per-carton.

#### Dead cells are reapable

*(Amendment 3. The proposal said `stock` rows are never deleted.)* `stock` is a
**projection** and rebuildable from the ledger by definition. A zero-quantity cell
with no allocation referencing it holds nothing the ledger does not. Rows are
**not deleted while referenced**; unreferenced dead cells are reaped by a
maintenance job. This removes the unbounded-growth concern rather than indexing
around it.

#### Movements become two-sided in space

The spine said `quantity` is "signed" *and* gave a from/to pair. Those are not
compatible, and "stock on hand is the sum of these" is then not a well-defined
fold. Corrected: **`quantity` is strictly positive and every movement folds into
two cells** — `−quantity` at the from-cell, `+quantity` at the to-cell. A receipt
has an empty from-side; a despatch an empty to-side. D5's CRDT property is
untouched. This is two-sidedness in *space*, not double-entry in *value*; the
financial ledger stays on the not-building list.

#### The cell key travels — and two dimensions were missing their pair

| Dimension | On `stock_movement` | Verdict |
|---|---|---|
| `item_id` | single | Correct. Changing item is a transformation: two movements. |
| `location_id` | pair | ✓ |
| `status_id` | pair (D4) | ✓ |
| `owner_id` | **absent** | The known D20 breakage. Pair added. |
| `lot_id` | **single** | **The same breakage, undetected.** Pair added. |
| `package_id` | new | pair by construction |
| `tenant_id` | single | Correct (D18); both sides must resolve to one tenant. |

```
stock_movement                -- amended
  item_id, quantity (> 0), catch_weight_g
  from_location_id, from_package_id, from_lot_id, from_status_id, from_owner_id
  to_location_id,   to_package_id,   to_lot_id,   to_status_id,   to_owner_id
  lot_id GENERATED ALWAYS AS (COALESCE(to_lot_id, from_lot_id)) STORED
  CHECK (num_nonnulls(from_location_id, from_package_id) <= 1)
  CHECK (num_nonnulls(to_location_id,   to_package_id)   <= 1)
  -- a populated side must carry the WHOLE key, not just a holder:
  CHECK (num_nonnulls(from_location_id, from_package_id) = 0
         OR (from_status_id IS NOT NULL AND from_owner_id IS NOT NULL))
  CHECK (num_nonnulls(to_location_id, to_package_id) = 0
         OR (to_status_id IS NOT NULL AND to_owner_id IS NOT NULL))
  CHECK (ROW(from_*) IS DISTINCT FROM ROW(to_*))
```

The whole-key CHECKs matter more than they look: under `NULLS NOT DISTINCT` a
NULL owner is a *different cell* from the site's entity, so an omitted column
would not error — it would silently fork the balance.

#### Re-lotting is a correction only

The generated `lot_id` preserves D14's recall index and query verbatim, but it
preserves the *index* while changing the *trace*: lot A re-lotted to B and then
shipped means the despatch carries `from_lot_id = B`, so *"which customers
received lot A"* returns nothing.

**Whether that is right depends on why the re-lot happened, so the answer is to
permit only one reason.**

- **Correction** — "we keyed A, it was always B". Permitted. The trace must
  **not** follow: those goods were never lot A, and following would produce a
  false recall.
- **Transformation** — a genuine merge or split. **Forbidden.** Lot merging is
  already unacceptable in food traceability, and forbidding it keeps D14's recall
  query exactly as written with no chain-walking to remember. A genuine split, if
  ever needed, is two movements through a transformation — the same treatment
  `item_id` already gets.

`adjustment_reason_id` records the correction on the row, and the partial index on
`WHERE from_lot_id IS DISTINCT FROM to_lot_id` becomes a correction audit rather
than a required leg of every recall.

#### Amendments to earlier decisions

- **D5** — registers clause added (relationships are registers, quantities are
  counters); `quantity` is positive with a two-sided fold.
- **D6** — `package_content` retired as a base table; containment columns demoted
  to projections; nesting cap raised to three levels and enforced.
- **D12** — `owner_id` and `lot_id` pairs restore the broken invariant.
  `stock_allocation` references `stock_id`.
- **D14** — `lot_id` pair; re-lotting is correction-only; recall query unchanged.
- **D20** — `owner_id` pair; the key re-framed as six dimensions in seven columns.

#### Index correction

Inbound Tier-0 asked for `stock(location_id, item_id)`. It must be
**`stock(resolved_location_id, item_id)`** — on `holder_location_id` it would make
container-held stock invisible to every commingling and putaway check.

### D24 (supply side) — expected supply, netting and pre-receipt allocation

*Adopted 2026-08-01 from [supply-side-design.md](./supply-side-design.md), which
corrected four defects and two false claims in the sketch deferred at D24's
adoption. Four further amendments applied on adoption, marked below.*

**Decision.** Supply that has not arrived is a projection, `expected_supply`, over
purchase order lines, transfer order lines, advised ASN content and return
authorisation lines. `stock_allocation` gains a second supply arm so demand can be
bound to a promise. Netting between a promise and its refinement is a **transient
suppression released as the refinement is consumed**, not a subtraction.

#### The bug the sketch had, and the invariant that encoded it

`quantity_available GENERATED (expected − refined − received − allocated)`
**double-subtracts**. A PO promising 100, an ASN advising 60, 58 arriving reads
`100 − 60 − 58 = −18`: the same 58 units subtracted once as suppression and once
as consumption.

`J8` in the invariant register — *"`quantity_refined` = the sum of refining
rows"* — **was the bug**, not the check for it. The replacement is a partition
identity that holds by construction, including under over-refinement
(`100 = 120 + 0 + 0 + (−20)`):

> `quantity_expected = quantity_refined + quantity_received + quantity_closed_short + quantity_outstanding`

**A wrong invariant is worse than a missing one**, because it confers confidence.
That is now the register's own first lesson.

```
expected_supply               -- role: PROJECTION. Folds intentions, assertions
  id, tenant_id, site_id      --   and facts.
  item_id (NOT NULL)          -- unresolvable content produces a finding, not a row
  owner_id, status_id         -- @projection from the source line: what the goods
                              --   will be ON ARRIVAL. Not a mid-flight claim.

  purchase_order_line_id      \
  transfer_order_line_id       |  exactly one — D23's discriminated-union rule:
  asserted_unit_content_id     |  these are alternative identities of one promise's
  return_authorisation_line_id/  origin, and "none" is meaningless for a projection
  CHECK (num_nonnulls(<the four>) = 1)

  refines_expected_supply_id  -- an ASN row refining a PO row. ONE LEVEL ONLY.
  CHECK (refines_expected_supply_id IS NULL OR asserted_unit_content_id IS NOT NULL)

  advised_lot_code            -- RAW supplier string. Never resolved to lot_id.
  advised_expiry_date         -- RAW. What FEFO cross-dock sorts on.
  expected_from, expected_to  -- a window: a dock appointment has two ends
  date_confidence             -- advised | ordered | inferred | none

  quantity_expected           -- @projection, per arm
  quantity_refined            -- @projection: SUM of OPEN children's OUTSTANDING
  quantity_received           -- @projection: receipts naming this row or a child
  quantity_closed_short       -- @projection: the source line's agreed release
  quantity_allocated          -- @projection: active allocations naming this row
  quantity_outstanding  GENERATED (expected - refined - received - closed_short)
  quantity_promisable   GENERATED (outstanding - allocated)

  closed_at, closed_reason    -- received_in_full | short_closed | superseded
                              -- | cancelled | expired | withdrawn
  derived_from_assertion_id, receiving_policy_id, allocation_policy_id
  UNIQUE (tenant_id, purchase_order_line_id)      -- one partial unique per arm;
  UNIQUE (tenant_id, transfer_order_line_id)      --   the idempotency guard for
  UNIQUE (tenant_id, asserted_unit_content_id)    --   message reprocessing
  UNIQUE (tenant_id, return_authorisation_line_id)
```

**The arm determines which rules apply to the row.** *(Amendment 3.)* This table
is a discriminated union whose branches carry different obligations: rule 3 (D21)
binds `asserted_unit_content_id` rows and not the others; the transfer arm derives
from our own despatch movements and has **zero exposure to rule 3**, which is why
it is the arm to build first. Anyone querying `expected_supply` needs to know
that, so it is stated here rather than implied across three sections.

`stock` was always multi-provenance too — `quantity` from facts,
`allocated_quantity` from intentions. The real distinction is **column grain
versus row grain**: D12 separated by column, and `expected_supply` cannot.

#### Ownership in transit is out of scope, and the boundary is stated

*(Settling question 107.)* `owner_id` is a **projection of the source line**
describing the arrival state, so it stays correct when a PO is amended to change
the receiving entity — which is the case that would actually have gone stale. It
is not, and does not attempt to be, a statement about who held title mid-flight.

> **We model custody — who holds the goods — and allocatable ownership — whose
> goods we may promise. Legal title timing, meaning when an asset moved between
> entities for tax, insurance and revenue recognition, is the finance system's
> record.** NetSuite remains the financial system (D20, q56).

Incoterms allocate risk and cost and explicitly do **not** transfer title; title
passes per the sales contract. That is a contract fact, not a warehouse fact, and
a warehouse system that models it will be wrong in a way nobody notices until an
audit.

The cases that look like they need it do not:

- **Consignment stock and VMI** work at rest (`stock.owner_id` = the supplier) and
  at consumption (a movement carrying `from_owner_id`/`to_owner_id`, D24).
- **Loss in transit** is a `discrepancy` with `counterparty_party_id`. We record
  who to pursue without recording who held title at the moment it vanished.
- **Inter-company transfer** crosses `legal_entity`, which D20 already says is a
  sale. The sale's documents and their timing belong to whoever raises them.

If this is ever needed it is a `supply_custody_change` fact with owner and
custodian pairs, and `owner_id` becomes its projection. Recorded as a **refusal
with a mechanism**, not an open question.

*(Amendment 2: the proposed scoping of S3 — "`<= 1` on grouping tables, `= 1` on
projections" — is **dropped**. D23's discriminated-union rule already gives `= 1`
here, and a second test reaching the same answer is the accretion this model
exists to refuse.)*

#### Multi-PO ASNs are supported, and the scalar FK is why

*(Settling question 109, which was recorded as an omission on a misreading.)*

The concern was that one `asserted_unit_content` line cannot draw on two purchase
order lines, and that widening it to an association table would invalidate J8's
partition identity. Both halves are true. Neither is needed.

**The X12 ORDER hierarchy level exists precisely to partition advised content by
purchase order.** As the inbound analysis established, `S-O-T-P-I` is not five
containers — S and O are *documents*, and the physical depth is pallet → carton.
So an ORDER-level split does not need a new structure: it becomes content lines
each naming one PO line, which is exactly what
`asserted_unit_content.resolved_purchase_order_line_id` holds.

**A content line never legitimately spans two POs, because the ORDER level
separates them.** Therefore:

- Multi-PO ASNs are **in scope and supported**. The scalar FK is correct rather
  than a limitation, and `refines_expected_supply_id` stays scalar.
- **J8 is safe**: each content line produces one `expected_supply` row refining
  one parent, so the partition identity holds per row.
- A content line that genuinely names two POs is **malformed** under GS1 and X12
  semantics and raises `assertion_unresolvable` — D8 behaving as designed.

The residual case is a loose channel — a CSV or portal with no ORDER grouping and
no per-line PO reference — where a shipment spans POs and nothing states the
split. That is unresolvable, and correctly so: **we cannot invent an allocation
the supplier did not state.** Which is also why the Australian grocery mandate
(Metcash and Coles both forbidding multi-PO ASNs) is the sane position rather
than a constraint we are working around.

#### Allocation gains a second supply arm

```
stock_allocation              -- INTENTION (amended)
  fulfilment_line_id          -- the demand. Unchanged, single arm.
  stock_id                    -- \ exactly one
  expected_supply_id          -- /
  CHECK (num_nonnulls(stock_id, expected_supply_id) = 1)
  origin_expected_supply_id   -- set once at binding, never cleared
  binding_kind    GENERATED   -- on_hand | pre_receipt | in_transit
  bound_at, expires_at
  rebind_count, last_rebound_at   -- volatility, not a path (q108)
  firm, firmed_at, firmed_by_id, firmed_reason   -- what the re-allocator may not steal
  allocation_policy_id
  state -- allocated | picking | picked | packed | fulfilled | short | released
```

**Allocations are never migrated by an ingestion event.** Every vendor rebinds a
PO-bound allocation when the ASN lands; we do not, and the reason is rule 3 — *an
ASN arriving must not rewrite one of our commitment rows*, because that is the
supplier's message authoring our intention. The ASN is an **input to the
allocator**, and the allocator's output is our own act with a fresh `bound_at` and
`allocation_policy_id`. No rebinding mechanism, no event log for intentions.

**Partial receipt splits the allocation, and the movements commit regardless.** An
allocation of 100 against an ASN row where 60 arrives becomes two rows — 60
cell-bound, 40 still expectation-bound — with `origin_expected_supply_id` on both.
**Rolling back a receipt because an intention could not be rewritten would be the
clearest D5 violation in the model.** A failed re-point raises a finding; the goods
are on the dock either way.

#### Re-point history: first, last, and a volatility signal

*(Settling question 108.)* An allocation records where it was **first** bound
(`origin_expected_supply_id`) and where it is **now** (the live arm). The path
between is not stored, and most of what it was wanted for is answerable elsewhere.

**"Which PO did this unit come from?"** is answered by **containment, not by
allocation history.** Goods arrive in identified packages, and D24 makes the
package part of the `stock` key — so PO X's pallet and PO Y's pallet are
*different cells*, and receipt movements carry `goods_receipt_line_id` → PO line.
Physical provenance lives in the fact ledger. Once a pallet is broken down and
cartons are mixed into one tote, provenance blurs — but that is **physically
true, not a modelling gap**, and a schema claiming otherwise would be lying.

**"Why did the promise slip?"** is answered by findings: `expected_supply` rows
close with `closed_reason`, assertions supersede via `assertion_stance`, and
`supply_withdrawn` / `commitment_unbacked` carry timestamps and a counterparty.

**What is genuinely unanswerable is auditing an automated re-allocator** — did it
release a binding it should not have, and why? A per-allocation event log is the
wrong shape for that: it records *"the row changed from A to B"*, which is the
changelog D25 refuses and which fails D25's own falsifier (bounded by our code
paths, not by things that happened in the world).

**A planner decision, by contrast, is a thing that happened in the world.** The
right mechanism generalises the proposed `work_creation_outcome` — trigger,
inputs considered, outcome, reason, policy version — which are columns a state
transition does not have. It is the same category as `policy_change` and
`taxonomy_change`: a **fact about a decision**, not a history of a row. It passes
the falsifier rather than needing an exception to it.

> **Deferred with a trigger: build `planner_decision` when the re-allocator is
> built.** Not before — there is nothing to audit until something automated is
> making these choices, and building the audit table first means guessing what it
> needs to record.

What ships now is `rebind_count` and `last_rebound_at` on the allocation: a
counter and a timestamp on an intention, which D25 permits, and which make *"this
promise has moved four times"* visible without a log. **An unstable promise is the
one worth looking at**, and that is the operationally useful half of the question.

#### Demand-side coverage — the symmetric fold

*(Amendment 4, settling question 106.)*

```
fulfilment_line               -- amended
  quantity
  allocated_quantity          -- @projection: active allocations, either arm
  uncovered_quantity    GENERATED (quantity - allocated_quantity) STORED
  INDEX (tenant_id, site_id, uncovered_quantity) WHERE uncovered_quantity > 0
```

`stock.allocated_quantity` and `fulfilment_line.allocated_quantity` are **the same
sum folded two ways** — one groups allocations by supply, the other by demand.
D12 already accepted the supply-side fold; having one materialised and not the
other means every *"is this demand covered"* question takes a different shape from
every *"is this supply committed"* question, for no reason but which we needed
first. **The asymmetry was the anomaly, not the column.**

D12's *"backorder is not an entity"* stands untouched: backorder is still derived,
now from a materialised sum rather than a live aggregate — exactly as
`stock.allocated_quantity` already was.

The payoff is the generated companion, not the column. *"Find every line not fully
covered"* stops being a join across all open lines and all allocations and becomes
a partial-index scan — the same move D24 made with `WHERE quantity <> 0`.

**The cost, named:** a `stock_allocation.state` transition now moves **two**
projections (one supply-side, one demand-side — not three, because the supply arms
are mutually exclusive), making it the model's hottest projection trigger.

#### Cross-dock adds no policy kinds

The capability needs a supply window, a shelf-life tolerance and a statement of
which arms may be allocated against. All are typed scalars folding into the
existing `allocation_policy` — `consider_expected_supply`, one
`allow_supply_*` boolean per arm, `window_before`/`window_after`,
`crossdock_min_window`/`max_window`, `crossdock_expiry_tolerance_days`,
`revalidate_on_receipt`, `rotation_key_expected`.

**Not an ordered supply-source child table.** D365's cross-dock template has one
and it fails S11 twice: `sequence` is an ordering of steps and `supply_source` is
a column whose value names an arm. The contrast worth recording:
`fill_sequence ∈ {inventory_only, crossdock_only, prioritize_inventory,
prioritize_crossdock}` names four **code-implemented strategies** and passes
cleanly. An enum naming columns does not.

**Revalidation at receipt may refuse, and refusal never blocks.** Window missed,
goods still land: the cross-dock allocation releases, putaway proceeds, a finding
is raised.

#### Supersession, short arrival, and never arriving

| Event | Mechanism |
|---|---|
| **ASN replaced or cancelled** | Derived rows close (`superseded`/`cancelled`); the parent's `quantity_refined` releases by the closed rows' outstanding in the **same transaction**. Replacement rows are created by **identity-preserving upsert** keyed on `(tenant_id, asserted_unit_content_id)` — never truncate-and-regenerate, because live allocations hold these ids. Allocations are **not** auto-released: `supply_withdrawn` is raised and a human decides. A counterparty's retraction must not silently un-promise a customer order. |
| **Arrives short** | The residual stays outstanding until the row closes or the fence passes. |
| **Arrives over** | `quantity_promisable` goes negative; `over_receipt`. Tolerance is an instance agreement (D22). |
| **Blind receipt** | Names no `expected_supply` row, so it nets **nothing**. The PO stays open and the overdue sweep raises it, rather than a matching heuristic quietly closing the wrong row. `receipt_unmatched` makes it countable. |
| **Never arrives** | The gap the whole comparison set gets wrong — D365's scheduled supply simply stops appearing, projected on-hand drops with no event, and commitments become unbacked invisibly. Here a sweep past `expected_to + receiving_policy.supply_overdue_hours` closes the row `expired` and raises `supply_overdue`, plus `commitment_unbacked` if allocations reference it. Both carry `counterparty_party_id` so they aggregate into the supplier scorecard. |

`expected_supply` rows are **retained after `closed_at`**. D24's dead-cell reaper
applies to `stock` only.

#### The availability read path

**Two index-only range scans, and D12's guarantee needs restating because the
version in the document was never true.** Availability was never a single row
read — it is a fold over the cells of one item at one site across lot × status ×
owner × holder. What was actually load-bearing survives intact:

> **No join, and no aggregate over a fact table, on the availability path.**

Two corrections to the adopted schema make that true:

- **`owner_id` and `status_id` join the index key.** D24's adopted index is
  `(tenant_id, item_id, site_id) INCLUDE (available_quantity) WHERE quantity <> 0`
  — neither owner nor status is in it, so every candidate needs a heap fetch and
  the `INCLUDE` buys nothing. **The failure mode is silence, not slowness:** a
  single-owner tenant never notices, and a 3PL tenant promises a vendor's units.
  D20 argued the column is a constant for single-owner tenants; D24 then wrote the
  index without it. Both go in, and `owner_id` becomes a **mandatory** argument of
  the availability function so the defaulting bug is unrepresentable.
- **`inventory_status.is_available_for_allocation` is never joined.** The
  allocatable status set is resolved once per request in code and passed as
  `= ANY`.

**Date-qualified ATP is deliberately not built.** The sketch claimed *"ATP over
future supply is one indexed read"*, which is false: ATP is a **running minimum
over a forward horizon**, and a PO for 100 landing day 30 against demand for 100
due day 5 nets to zero per row and the promise gets made. No vendor computes it
from row-per-supply storage. Building it needs a third projection hop (breaking
J24's two-hop cap) **and** the async escape D25 refuses by name — two exceptions
argued, not one. Until then the floor never asks *"when can I promise"*.

The column is therefore `quantity_promisable`, not `quantity_available`. Two
near-identical names with different meanings on two same-shaped tables is how
availability logic starts disagreeing with itself.

#### Rule 3 is narrowed, and that is a policy decision

*(Amendment 1. Stated here as what it is, rather than as a schema detail.)*

D21 rule 3 as adopted: *"Never projects into `stock` or into commitment."*
Restated:

> **Never projects into `stock`, and never into a commitment that survives
> withdrawal of the claim.**

**In plain terms: we now let a counterparty's claim reach a customer promise.**
Allocate against advised supply, the supplier retracts, and we hold a commitment
with nothing behind it. That is the price of cross-dock, and cross-dock is worth
it — but it is a change in what we allow, not a change in how we store it.

The compensating guarantees are real and both are asserted. Nothing silently
changes a balance, because an assertion-sourced allocation never touches a cell —
the test is **J19**: truncate every assertion table, and `stock` plus
`stock.allocated_quantity` rebuild byte-identical. And a withdrawal never silently
un-promises: it raises `supply_withdrawn` and leaves the commitment standing for a
human.

#### Invariants created

| # | Invariant |
|---|---|
| J3 *(restated)* | `stock.allocated_quantity` = active allocations **with `stock_id` set**, state ∈ `{allocated, picking, picked, packed}`. Enumerated, not adjectival. |
| J4 | `expected_supply.quantity_allocated` = the same fold over `expected_supply_id` allocations |
| J8 *(replaced)* | `quantity_expected = refined + received + closed_short + outstanding`. **The check that catches the double-subtraction; the old formulation was the bug.** |
| J9 *(restated)* | `parent.quantity_refined = SUM(child.quantity_outstanding)` over **open** children — never over children's `quantity_expected` |
| J25 | `refines_expected_supply_id` is acyclic and of depth exactly 1; violations raise `refinement_too_deep`. **Asserted by a job, never a CHECK** — a CHECK on a projection column wedges the rebuild (D24's own q92 ruling) |
| J26 | `expected_supply.quantity_received` = the fold of `goods_receipt_line` rows naming this row or any row refining it |
| J27 | Transfer arm: **no unit is simultaneously counted in origin `stock.available_quantity` and destination `quantity_promisable`** |
| J28 | No open row with `quantity_outstanding > 0` past `expected_to + grace` → `supply_overdue` |
| J29 | No active allocation references a closed or overdue row → `supply_withdrawn` / `commitment_unbacked`. The allocation is **not** released by the job |
| J30 | Rebuilding `expected_supply` preserves row identity. Truncate-and-regenerate is forbidden while any allocation holds an `expected_supply_id` |
| J31 | `fulfilment_line.allocated_quantity` = active allocations against that line, **either arm** |
| J19 *(scoped)* | `expected_supply` and `stock_allocation.expected_supply_id` are exempt and named — that is what rule 3's narrowing permits |
| S25 | Availability indexes on `stock` and `expected_supply` both carry `owner_id` and `status_id` in the key; no availability query joins `inventory_status` |
| S26 | `expected_supply` carries at most five maintained quantity columns; a sixth requires a recorded decision |

#### Amendments to earlier decisions

- **D21** — rule 3 narrowed, above. **Freeze-on-first-use gains a fourth
  referencer**: `expected_supply` references `asserted_unit_content.resolved_*`,
  and a late re-resolution must not re-key a projection row a live allocation is
  bound to.
- **D12** — `stock.allocated_quantity` narrowed by an enumerated predicate; the
  allocation lifecycle gains `picked` and `packed`, without which picked-but-not-
  despatched stock reads as available again — the `usage`-predicate cost D16
  refused, reintroduced by the back door. `fulfilment_line.allocated_quantity`
  added as the symmetric fold.
- **D16** — **q40 answered: yes**, a transfer can be allocated from despatch,
  against a destination-site row. In-transit stays off `stock`, reinforced.
- **D22** — no new policy kinds. Cross-dock scalars fold into `allocation_policy`.
  Incoterms and title-transfer triggers, if ever needed, are **instance
  agreements** on the order, not a policy kind.
- **D25** — `discrepancy` gains its **sixth** source arm, `expected_supply_id`,
  which is the recorded decision the cap demanded. Knowingly a *subject standing
  in for an absent cause* — the cause of "nothing arrived" is the absence of a
  movement — so D23's boundary rule is stretched deliberately rather than quietly.
- **D8** — `discrepancy.kind +=` `supply_withdrawn` (reinstated),
  `supply_overdue`, `supply_over_refined`, `commitment_unbacked`,
  `advised_lot_mismatch`, `refinement_too_deep`, `receipt_unmatched`,
  `over_receipt`. `discrepancy` gains `counterparty_party_id`, without which none
  of the supplier-facing kinds aggregate.
- **D24 (containment)** — the availability index gains `owner_id, status_id`. And
  `stock_movement` gains `CHECK (num_nonnulls(from_location_id, from_package_id) +
  num_nonnulls(to_location_id, to_package_id) >= 1)`: today a movement with both
  sides empty **passes every CHECK and is insertable**, but folds into two cells
  with no holder, which `stock`'s own CHECK forbids. Insertable but unprojectable
  — the wedged-rebuild failure D24 refused for `depth`.
- **D14 / q32 answered: no.** A lot is not created before its goods arrive. The
  advised code and expiry ride on `expected_supply` as raw, non-authoritative
  strings.

**Rejects.** `expected_supply` as a view or UNION — netting computed once beats a
rule every query remembers, *and* the FK target is the gate row Postgres needs to
serialise concurrent allocations without gap locks. A signed-adjustment ledger
with caller-supplied compensation (D365's, where the vendor documents that
avoiding double-count is the integrator's job). Depleting the parent (NetSuite,
Oracle) — it conflates *"the supplier promised 100"* with *"the supplier has told
me about 60"*, and supplier-promise accuracy becomes unanswerable. The movement
graph as the supply binding (Odoo's chained moves) — `stock_movement` has no
UPDATE grant, and a status predicate on the fold is a WHERE clause on the sum D5
keeps unconditional. **A transit location or transit warehouse** — no `transit`
value on `location.kind`, ever, recorded as a named refusal rather than left
protected by reasoning. A reservation as a ledger row with a zero physical delta
(OFBiz) — attractive, refused three ways independently, recorded so it is refused
once rather than re-proposed by everyone who has seen OFBiz. A `quantity_short`
column on `stock_allocation`. A stepped `stock_by_item_site` rollup (ERPNext's
`Bin`) — its `projected_qty` has no date, so a PO due in six months and a pallet
on the floor contribute identically. Quota / allocated ATP as a column —
entitlement is not supply, and consumption windows make it many-to-many.

### D25 — Status is derived, declared or forbidden; projections are enforced by the database

*Adopted 2026-08-01 from [mechanism-design.md](./mechanism-design.md), with the
role axis lifted into principle 2. D21 and D26 remain proposed.*

**Decision.** Every status column is exactly one of three things, determined by
the **provenance and role** of the row it sits on. Projections are enforced by
column-level grants, not by convention. One `client_event` registry owns
idempotency. One `acceptance` table owns assent.

**Why the cross-cutting review's own test is rejected.** *"Derive status where the
transition is evidence, store it where it is only state"* is not decidable —
there is no way to lose the argument that a transition is evidence. It also
answers the wrong question (the evidence in a consignment delivery is the
carrier's message, not a status log), and it has two branches where the model
needs four. The largest class here is statuses that are neither evidence nor state
but **arithmetic over facts that already exist**, for which an event table is
strictly worse than the column it replaces.

**The rule, and it is total:**

| Provenance / role | Treatment |
|---|---|
| **Fact** | **No status.** Facts do not have lifecycles. |
| **Intention** | **Declared** — the row owns it, one timestamp per state reached, no history table. Principle 2 defines an intention as mutable; giving it an immutable event log contradicts its own category. |
| **Finding** | **Declared.** `discrepancy.state` is ours, with `resolved_at`/`resolved_by_id` as its timestamps. |
| **Grouping / projection** *(role)* | **Derived** — materialised, maintained in the same transaction, never written by the application, rebuildable, asserted. |
| **A time-varying relationship** | **Forbidden as a column.** It lives in a fact table; the current value is a projection (D24's containment). |
| **Assertion** | **Forbidden.** The claim is immutable; *our position* on it is a separate fact (`assertion_stance`, D21). |

**The falsifier that stops event tables breeding:**

> An event table earns its place only if it has columns a state transition does
> not. If it would be `(entity_id, from_state, to_state, changed_at, changed_by)`
> and nothing more, it is a changelog. **An event table's row count is bounded by
> things that happened in the world; a changelog's is bounded by our own code
> paths.**

`policy_change` (D22) passes: mandatory `reason`, `authorised_by_id`, and a
valid/transaction time split. `work_task_status_history` fails, and is refused.

#### One column per source — D12's move, applied to status

`purchase_order.status ∈ {draft, issued, partially_received, closed, cancelled}`
is **two facts about two different things in one enum**: `draft/issued/cancelled`
is *our intention*, `partially_received/closed` is *arithmetic over the ledger*.
Storing both in one column means either the arithmetic overwrites the intention or
a human overwrites the arithmetic — and NetSuite is what happens when you do that
for fifteen years.

```
purchase_order   state          -- DECLARED: draft | issued | cancelled
                 issued_at, cancelled_at
                 receipt_status -- @projection: none|partial|complete|over
transfer_order   state / receipt_status               -- same split
order            state          -- DECLARED: placed | on_hold | cancelled
fulfilment       state          -- DECLARED: planned | released | cancelled
                 progress       -- @projection
goods_receipt    status         -- @projection: lines + movements
consignment      status         -- @projection: in-force carrier advice
package          status         -- @projection: package_event + consignment
work_task        state          -- DECLARED
stock_allocation state          -- DECLARED
discrepancy      state          -- DECLARED (finding)
```

**`order.fulfilment_status` is dropped.** It would be a third hop
(`stock_movement → fulfilment.progress → order.fulfilment_status`), breaking the
two-hop cascade cap. An order has few fulfilments; compute it on read.

**`work_task.state` stays declared**, for three stated reasons — not "a pick lasts
ninety seconds", which would not survive a week-long task. A monotone lifecycle's
timestamps **are** its event log transposed (`claimed_at`, `started_at`,
`completed_at` — zero extra rows, no greatest-n-per-group). The non-monotone parts
have a home already: `activity_event` gains `task_claimed | task_released |
task_reassigned`. And the hot read is the current state, which principle 6
decides. A status changelog here would be ~20,000 rows/day/site recording
transitions three columns already imply.

#### Enforcement is the database, not a sentence in a document

The model already says *"Nothing writes to `stock` directly. Ever."* Postgres can
make that a fact rather than a hope.

- **Column-level grants, issued column-wise from the first migration.** The trap:
  granting table-wide and then revoking one column **does not work**. A single
  table-wide `GRANT UPDATE` would silently disarm every projection guard in the
  schema, and nothing would fail loudly.
- **Fact tables get no `UPDATE` and no `DELETE` grant at all.** Append-only stops
  being a convention. One mechanism and one catalogue assertion replaces four
  separate immutability-trigger families.
- **Triggers exist for projection maintenance and nothing else.** One function per
  projection, named for it. Never business rules, defaults, validation or
  cascades. Unbounded trigger logic is Postgres's own accretion failure mode.
- **`SECURITY DEFINER` maintainers require `FORCE ROW LEVEL SECURITY`** on every
  RLS-protected table involved. Table owners bypass RLS by default, so without
  this the mechanism guarding the projections punches a hole through D18.
- **Registration is checkable.** Each projection column carries
  `COMMENT '@projection <source>'`, and CI diffs the commented set against the
  code registry of rebuild functions, bidirectionally.

#### Idempotency has one registry

```
client_event                  -- Unpartitioned, by necessity.
  tenant_id, client_event_id  -- PRIMARY KEY (tenant_id, client_event_id)
  site_id, device_id, work_session_id
  recorded_by_id / automation_key      -- CHECK num_nonnulls(...) = 1
  app_version, submitted_at, received_at
```

**Every fact table carries `client_event_id` as a plain FK**, not a unique one.
Two reasons the per-table `UNIQUE` had to go, both of which void D5's stated
non-negotiable property:

1. **One physical act produces many facts** — a receipt writes a `package_event`
   and N movements; a cubing scan writes an event and four observations.
2. **Postgres requires the partition key in any unique constraint.** On a table
   range-partitioned by `occurred_at`, a per-table `UNIQUE(client_event_id)`
   silently degrades to *per-partition* uniqueness, and a replay landing in a
   different month is accepted.

One submission inserts one `client_event` row plus all its facts in one
transaction; a replay aborts on the primary key and rolls back. The
`(tenant_id, …)` key also closes a cross-tenant unique-constraint oracle.

`recorded_by_id` stays denormalised on every fact row — D11 is emphatic that it is
the non-repudiable floor and a join is the wrong shape for an accountability query
— and CI asserts the denormalisation agrees with the envelope.

#### Acceptance, and what happens when it is contradicted

```
acceptance                    -- FACT: a person took responsibility for a state
  id, tenant_id, occurred_at, recorded_at, client_event_id
  accepted_by_person_id       -- ours (D19's global person)
  accepted_by_party_id        -- the counterparty, when external
  authorised_by_id
  goods_receipt_id, consignment_id, discrepancy_id, observation_id
  assertion_id                -- [D21, proposed]
  CHECK (num_nonnulls(<arms>) = 1)   -- a subject union, per D23's rule
  decision                    -- accepted | rejected | accepted_with_exception
  accepted_state              -- the derived value AS AT acceptance. FROZEN.
  basis                       -- manual | policy_auto
  observation_acceptance_policy_id   -- which policy auto-accepted (D22)
  reason_id, note
  rejection_window_expires_at -- statutory clock, computed once and frozen
```

The five arms are legitimate under D23's discriminated-union rule: these are
alternative identities of the thing being accepted, not a cause set.

**The frozen `accepted_state` answers open question 13.** When a derived status
recomputes to a value that contradicts an `acceptance`, the recomputation does
**not** lose — but it raises `discrepancy.kind = 'accepted_state_contradicted'`.

> The projection is the truth about the facts; the acceptance is the truth about
> what a person committed to; their disagreement is the finding.

```
projection_check              -- FACT: we checked a projection against its source
  id, tenant_id, projection_name, scope_kind, scope_id
  checked_at, rows_checked, rows_mismatched, duration_ms
```

Mismatches raise `discrepancy.kind = 'projection_drift'`, so the model's
self-consistency lands in the same queue as every other finding.

#### `row_audit` is not built

A generic `(table_name, row_id, before jsonb, after jsonb)` changelog is a
polymorphic reference plus an untyped payload, defended only by "we never read
it". It is also mostly dead weight: fact tables have no `UPDATE` or `DELETE`
grant, so their audit rows could only ever be inserts — doubling the write volume
of the largest tables in the system to record nothing. The tables that *are*
mutable are intentions and policy, and policy already has `policy_change`. If
compliance later demands row-level audit for intentions, that is an
infrastructure decision with its own justification, not a domain table smuggled in
on a principle-3 exception.

#### Amendments to earlier decisions

- **Principle 2** — the role axis, lifted in above.
- **D5** — the `client_event` registry replaces per-table idempotency uniqueness.
- **D8** — `discrepancy.kind +=` `containment_conflict`, `projection_drift`,
  `clock_skew`, `accepted_state_contradicted`, `policy_ambiguous`,
  `stock_without_location`, `specification_breach`, `uncalibrated_instrument`,
  `nesting_too_deep`. **Source arms are capped at five** with `CHECK <= 1`; a
  sixth requires a recorded decision, because these are causes, not a subject
  union.
- **D12** — one-column-per-source, generalised to status.
- **D17** — `work_task.state` confirmed with the reason replaced; `activity_event`
  gains three kinds.

**Rejects.** A global `events` table. Per-entity status-history tables. The
evidence test. CQRS with async projectors — the model already chose transactional
projections for `stock`, and async would make availability and task queues stale
on exactly the paths D5 spent its coordination budget to get right.
Event-sourcing ceremony: aggregates, upcasting, snapshots. Postgres tables *are*
the snapshots; upcasting is what you build when you cannot migrate.
System-versioned temporal shadow tables. `row_audit`. An event log for intentions.

### D26 — Extensibility: a schema compiler, an outbox, and no document store

*Adopted 2026-08-01 from [mechanism-design.md](./mechanism-design.md), with four
amendments applied. **This completes D1–D26; nothing remains proposed.***

**Decision.** Extensibility decomposes into exactly three things a tenant can
want, and each gets one primitive:

| Want | Primitive |
|---|---|
| **Data** the product does not model | `record_scheme` — a schema compiler |
| **Decisions** the product makes | D22's scope lattice — nothing new |
| **Reactions** to things that happen | `event_subscription` + `outbox` |

A fourth — presentation — is not extensibility and never touches the schema.
**Three is the budget. A fourth request means one of the three is wrong.**

#### The premise that changed

Principle 4's refusal rested on *"adding a column is cheap and migrations are
routine"*. That has a hidden subject — cheap **for us** — and D18 made it
non-universal. But the refusal was never about columns; it was about **untyped
attribute soup**. So the boundary moves from *who may add a column* to **what a
column may be**.

```
record_scheme                 -- REFERENCE. tenant_id NULL = shipped by us (D19)
  id, tenant_id, key, version
  provenance                  -- fact | intention | assertion | finding
  role                        -- reference | grouping
  attaches_to                 -- a core entity (see "one registry" below)
  cardinality                 -- one | many
  physical_table              -- 'ext_daff_biosec_discrepancy_v1'; immutable
  manifest_source bytea, manifest_hash          -- retained; never queried
  source                      -- shipped | tenant | plugin
  plugin_id, state, materialised_at, created_by_id
  UNIQUE (tenant_id, key, version)

record_scheme_field           -- the COMPILED SYMBOL TABLE. Rows, not JSON.
  id, record_scheme_id, ordinal, column_name, label
  field_type                  -- integer|text|boolean|date|timestamptz
                              -- |quantity|money_minor|enum|ref|attachment
  unit_id                     -- FK unit (D23). NOT NULL iff quantity.
  currency                    -- NOT NULL iff money_minor
  enum_values text[]          -- non-empty iff enum   -> generates a CHECK
  ref_entity                  -- NOT NULL iff ref     -> generates a real FK
  required, min_value, max_value
  CHECK (parameter presence matches field_type)
  UNIQUE (record_scheme_id, column_name)
```

**This is a code generator whose input happens to live in a row**, not an
attribute store. The generated table gets a real `tenant_id` FK, a real parent FK
with **`ON DELETE RESTRICT`** (not CASCADE — a fact scheme's evidence must not be
destroyed when a receipt is deleted), `client_event_id` where
`provenance = fact`, RLS with `FORCE`, column-wise grants **derived from
`provenance`**, and real columns with real types, CHECKs and indexes.

Against six tests: referential integrity — real FKs. Database enforces invariants
— NOT NULL, CHECK, UNIQUE, RLS, and no UPDATE grant for facts, which is the
**first time principle 2's categories are mechanical rather than a naming
convention**. Survives migrations — a scheme version *is* a migration. Queryable —
`contamination_g` is an integer with planner statistics. Debuggable — `\d` tells
you everything; there is no interpreter. Not a language — nine type constructors,
no nesting, no `any`. EAV fails all six; spare-column sidecars fail all six;
JSONB-with-a-schema fails all six.

**Evolution is additive in place, otherwise a new version.** Adding a nullable
column is metadata-only in Postgres and permitted; narrowing, dropping or adding
NOT NULL mints version N+1 with a new table and a generated backfill, and the old
table stays. **A scheme is never rewritten** — D8's invariant applied to schema.

**Ceilings are declared numbers**: 50 schemes per tenant, 60 fields per scheme,
100 tenant-defined metrics. Not because 51 breaks anything, but because the
ceiling is what keeps this a schema *extension* rather than a schema *escape*.
Salesforce's flex-column pivot is what happens when it comes off.

**The boundary against D23:** a single unit-carrying number with provenance is a
`metric`; a coherent multi-field record is a `record_scheme`. Most "we need a
field" requests are actually observations, which is why D23 absorbs the larger
share.

#### Ownership, not detection

*(Amendments 3 and 4.)* The compiler runs DDL from tenant-supplied declarations,
so it is the same deliberately-elevated path question 102 identified for the
projection maintainer. It gets the same treatment, and one mechanism does the work
of two:

> **The compiler role owns every generated table. The application role receives
> DML grants only.**

`ALTER TABLE` requires ownership in Postgres, so manual drift is not *detected*,
it is **unrepresentable** — D25's move applied one level down. That collapses the
drift job from *"has anything diverged?"* to *"did a materialisation complete?"*,
which is a far smaller surface and is checkable at materialisation rather than by
polling.

What remains is checked in **one set-based query** over `pg_attribute` and
`pg_constraint`, aggregated to a hash per table and joined to `record_scheme` —
not one query per table. At any plausible scale that is a catalogue read of a few
hundred thousand rows.

The compiler role requires `FORCE ROW LEVEL SECURITY`, its own audit, and a
stated rule on who may invoke materialisation.

**Scale is a ceiling, not an expectation:** shipped schemes have
`tenant_id IS NULL` and are **shared**, so only tenant-declared schemes multiply.
**Escape hatch, recorded not built:** if generated tables ever grow large enough
to matter, they move into a per-tenant Postgres namespace — which also turns
"everything belonging to tenant T" into a schema listing rather than a filtered
scan, helping export and deletion. The trigger is catalogue-query latency; the
cost is a dimension on every generated FK and grant.

#### Reactions

```
event_subscription            -- INTENTION
  id, tenant_id, name
  source_table                -- a core entity (see below)
  site_id, party_id, item_class_id      -- scope filter, D22's dimensions
  delivery                    -- webhook | plugin | outbox_only
  endpoint_id, plugin_id, format_version, state

outbox                        -- FACT. Written in the SAME TRANSACTION as its fact.
  id, tenant_id, occurred_at, enqueued_at
  source_table, source_id     -- audit only; NEVER dereferenced (see below)
  subscription_id
  party_message_id            -- THE PAYLOAD, rendered at enqueue (D21)
  attempt_count, next_attempt_at, delivered_at, last_error
  INDEX (next_attempt_at) WHERE delivered_at IS NULL

registered_endpoint           -- SSRF guard: targets are registered, not free-form
  id, tenant_id, url, host, auth_kind, secret_ref, verified_at, active
```

**The outbox's polymorphic pair is permitted, and the reason is an invariant, not
a comment.** *(Amendment 2.)*

> **S27 — the outbox source reference is never dereferenced. The rendered bytes in
> `party_message_id` are the payload.**

D10's decisive argument against polymorphic references was that batch loading
cannot be expressed over one. That argument does not apply to a queue *only
because* the payload is rendered at enqueue. Without S27 asserted, a delivery
worker that looks up the source puts polymorphic joins back on a hot path, and
nothing would fail.

**Subscription filtering uses D22's scope dimensions, not a predicate language.**
*"Webhook me for discrepancies against supplier X"* is a scope, not an expression
— one addressing mechanism across policy and subscriptions.

#### One registry, not three lists

*(Amendment 1.)* `record_scheme.attaches_to` and `event_subscription.source_table`
were both specified as hand-maintained closed enums naming core tables. Two lists
tracking the same moving target drift — and had already begun to: three members of
`source_table` were renamed by decisions written in the same document.

Both are instead **derived from the code-side table registry** that S4 already
requires and CI already diffs against `information_schema`. Attachability and
subscribability become capability flags on a registration, not lists someone
remembers to update.

`observable`'s arms (D23) stay as they are and are legitimately different: those
are typed FKs to *instances*, not an enum naming *types*.

#### Plugins, with one divergence from Nosdesk

The plugin surface reuses Nosdesk's sandbox wholesale — opaque-origin iframe on a
separate registrable domain, `connect-src 'none'`, Comlink over a transferred port
authenticated by holding the port, manifest-declared permissions enforced from
trusted DB state, signed bundles with trust tiers, an egress proxy injecting
credentials the plugin never sees.

**One deliberate divergence: no document store.** Nosdesk's
`plugin_collection_rows.data jsonb` is right for a helpdesk, where a plugin's
saved addresses are nobody's business but the plugin's. It is wrong here, because
**warehouse plugin data is almost never private to the plugin** — a biosecurity
form is evidence in a dispute, a quality result gates a release. In a JSONB
collection it cannot be joined to a receipt, reported on, exported into a claim,
or given a foreign key: D23's trapped-in-`measurement` failure, one level down. A
warehouse plugin declares a `record_scheme` and gets a real table.

#### Two deferrals, both with thresholds

**`decision_rule`** — a compiled, type-checked, total predicate (Cedar or
equivalent) is a genuinely better answer than an interpreted rule table, and if
ever built it should be adopted rather than written. But it crosses D22's
sharpened line on every clause, and **both its motivating examples have
evaporated**: *"vendor X's goods go to zone 3"* is a `putaway` binding, and
subscription filtering is a scope. **Revisit when two tenants want different
behaviour at the same decision point** — one tenant is a shipped vertical.

**Server-side WASM** — nothing in the three axes needs arbitrary computation
inside a warehouse transaction, and for the one job it might serve WASM is
strictly worse: Wasmtime bounds guests with fuel or epoch interruption, and
neither is a **type checker**, which is the property we actually want. Adopting it
would buy generality by deferring *what a plugin computes* to runtime — the exact
failure the standing direction names.

#### Amendments to earlier decisions

- **Principle 1** — corollary: an extension mechanism is itself a primitive.
  Three is the budget.
- **Principle 2** — the categories become mechanical: a scheme's `provenance`
  drives its grants.
- **Principle 4** — amended above.
- **D7 / q14** — Nosdesk is shared as **library crates** (sandbox, bridge,
  consent, signing), not as a deployment. **Not** shared: the plugin collection
  store.
- **D19** — the nullable-tenant reference shape covers `record_scheme`.
- **D20** — cited as the consistency check: an org with no schemes and no
  subscriptions encounters none of this, because there are no rows.
- **D25 / q102** — answered for the compiler: ownership, `FORCE ROW LEVEL
  SECURITY`, its own audit.
- **Tenant export and deletion are materially de-risked** — because tenant
  extension data lives in enumerable named tables rather than shared blobs,
  "export everything for tenant T" and "delete T except statutorily retained
  facts" are generated queries over `record_scheme.physical_table`, not a hunt.
  That is an argument *for* the compiler that has nothing to do with
  extensibility.

**Rejects.** EAV. Spare-column sidecars (`ext_int_1..20`) — EAV with extra steps,
and the planner's statistics land on `ext_int_7` rather than on `contamination_g`.
JSONB plus JSON Schema. Schema-per-tenant with **tenant-owned DDL** — it fails on
operations, not capability: if the tenant owns the DDL, *we* cannot upgrade, and
the rebuild-and-assert jobs holding this model together cannot be written once.
(Database-per-tenant as a *deployment topology* stays available per D18, and
namespacing without tenant DDL stays available as the escape hatch above.)
Interpreted rule tables. Writing our own condition language. Server-side WASM
(deferred, seam open). Nosdesk's plugin collection store. Shipped verticals as the
*only* answer. A polymorphic `(entity_type, entity_id)` for attaching extension
records — the genericity lives in the compiler, not in the row.

### D27 — `device`: one table, two roles, calibration as facts

*Adopted 2026-08-02, settling question 99. `device_id` is referenced by D5, D11,
D23, D24 and D25 and was defined by none of them.*

**Decision.** One `device` table covering both roles a device plays, with
commissioning as timestamps and calibration as an append-only fact.

#### Two roles, one table

D23 already distinguishes them on `observation_event`:

- **`device_id`** — the **recording** device. The handheld that submitted the
  fact. Unconditional under D11: every fact names the hardware it came from.
- **`instrument_device_id`** — the **measuring** instrument. The scale, the cubing
  station, the thermometer. Set only when `method ∈ {instrument, scan}`.

A handheld with a built-in scanner is both, on different facts. That is two roles
of one thing, not two things, so it is one table with a `kind` — the same
reasoning D17 used for `work_task`.

```
device                        -- role: REFERENCE
  id, tenant_id
  home_site_id                -- nullable; a handheld moves, a dock scale does not
  kind                        -- handheld | scanner | scale | cubing_station
                              -- | printer | workstation | gateway
  serial_number, model, manufacturer, asset_tag
  commissioned_at, decommissioned_at        -- see below

  -- measurement capability: NULL for a device that measures nothing
  measures_dimension_id       -- FK dimension (D23)
  resolution_numeric          -- least count, canonical unit. D23's
                              --   observation.uncertainty default comes from here.
  range_min_numeric, range_max_numeric

  -- trade-legal metrology
  approval_authority          -- nmi | oiml | none
  approval_number             -- e.g. an NMI pattern approval
  verification_class
  calibration_valid_until     -- @projection from device_calibration

  CHECK ((measures_dimension_id IS NULL) = (resolution_numeric IS NULL))
```

#### Calibration is a fact, not a column

A device is calibrated repeatedly, and *"was this scale in calibration when it
produced that weight"* is the question a billing dispute turns on.

```
device_calibration            -- FACT. Append-only.
  id, tenant_id, device_id
  calibrated_at, valid_until
  performed_by_party_id       -- the external calibrator
  certificate_ref, attachment_id
  outcome                     -- passed | adjusted | failed
  recorded_by_id, client_event_id
```

This gives D23's `uncalibrated_instrument` finding an actual source: an
`observation` whose `instrument_device_id` had
`calibration_valid_until < observed_at` raises it. Per D23 and D5 we **do not
reject the reading** — the goods really did weigh that much — we record it and
raise the finding, because the reading may be perfectly good and the certificate
merely lapsed.

#### Why this is not bureaucracy: catch weight

D20 admitted catch-weight items, which are **sold by actual weight**. Under the
National Measurement Act a weight used for trade must come from an instrument with
pattern approval and current verification. So the chain
`observation → instrument_device → approval_number + calibration_valid_until` is
what makes a catch-weight consignment legally invoiceable. Without it we can weigh
things but cannot defend the number.

#### `active` is derived, not stored

`commissioned_at` and `decommissioned_at` are a **monotone lifecycle**, so their
timestamps *are* the event log transposed — D25's `work_task` reasoning applied
verbatim, and `active` is derived rather than a mutable boolean. Decommissioning
matters: a dispute may turn on whether a scale was still in service, and a boolean
cannot say when it stopped being.

#### A gap this exposed in principle 2

**Reference tables have a role but no provenance.** `device`, `dimension`, `unit`,
`metric` and `observable` are all role `reference`, and none of them is a fact, an
intention, an assertion or a finding — we neither observed them nor plan them nor
were told them.

This is not a fifth provenance value: under D21's admission test, reference data
changes who may write it (us) but not what may project from it or whether it may
be revised in any distinctive way. The honest statement is:

> **Role `reference` tables do not register a provenance.** Their mutable state is
> treated as an intention would be — declared, with timestamps, no history table
> unless a transition is itself a fact worth keeping (`device_calibration` is).

Recorded here rather than left implicit, because D25's rule table is indexed by
provenance and would otherwise have no row for the tables it most obviously
applies to.

#### `device_id` and `automation_key` are different questions

D21 admits machine actors via `automation_key XOR recorded_by_id`, and q105 asks
what an automation key is. `device` answers it by contrast rather than directly:
**`device_id` is *how* a fact was captured; `automation_key` is *who* captured
it.** An EDI parser has an automation key and no device; a handheld has a device
and a person. They are orthogonal and both may be present.

#### Amendments to earlier decisions

- **D5, D11, D24, D25** — `device_id` becomes a real FK to `device`. It was a bare
  column on `stock_movement`, `package_event`, `stock_count` and `client_event`.
- **D23** — `observation.uncertainty_numeric` defaults from
  `device.resolution_numeric`, which is now a real column;
  `uncalibrated_instrument` gains its source.
- **D19** — `device` is tenant-scoped, not global. Unlike `person`, hardware
  belongs to an organisation.

### D28 — Failed scans: record resolution failures, never decode failures

*Adopted 2026-08-02 from [d24-open-questions.md](./d24-open-questions.md),
settling question 89. Two amendments applied: the canonical length unit becomes
micrometres, and `discrepancy`'s source-arm cap is retired rather than spent.*

**Decision.** `activity_event` gains four **resolution**-failure kinds and typed
columns for the identifier that failed to resolve. `scan_ok` is **deleted** from
D17's kind list. Scan-rate denominators come from `client_event` (D25), which
already takes one row per fact-producing act.

#### The obvious answer is wrong in both directions

**A decode failure is not observable, so a `no_read` kind would read zero forever
and be believed.** On the dominant handheld platform a no-read produces *nothing*:
the scan intent bundle carries `source, label_type, data_string, decode_data,
decoded_mode` — no status field and no failure variant — and the scanner-status
enum has no "failed decode" value. Trigger-driven readers emit events on success
only.

Making it observable would mean owning the decode session via soft trigger, which
makes **scanning depend on our process being healthy** — D5's central trade run
backwards. Refused with the reason.

**The population we *can* record is the benign one, and the decision must say so.**
A misread returns a valid-looking wrong value and is indistinguishable from a
correct scan; it surfaces only as a contradiction against an expectation
(`scan_mismatch`, `containment_conflict`). Recording unresolvable identifiers does
nothing to find misreads, and a failure kind must not imply otherwise.

**`activity_event` is the only table that can hold a subjectless fact.** Not
`observation` — `observable` has typed arms under `= 1`, and D23's licensing
argument is that *"nobody will ever discover an observation about no thing"*. Not
`package_event` — `package_id` is the subject, always exactly one. So a failed
scan is **keyed on context, never on a subject**: adding a `package_id` that is
NULL for the entire failure population is the always-NULL column D23 refused.

#### The volume argument, made rather than assumed

A site at 5,000 picks/day takes 20,000–50,000 application-level identifier
captures/day across picking, receiving, putaway, replenishment and counting.

| | rows/year/site | storage |
|---|---|---|
| `scan_ok` in `activity_event` | 7.3M – 18M | 2.2 – 5.5 GB |
| its `client_event` companion (S19) | 7.3M – 18M | **and this one cannot be partitioned** |

The second row is the cost nobody had computed. S19 requires every fact to carry a
`client_event`, and D25 states that `client_event` can **never** be partitioned.
Failures only, at 0.1–2% of captures, are 20–1,000 rows/day/site — **a ~100×
ratio, and it is the whole decision.**

**The denominator survives without `scan_ok`.** `client_event` already carries
`device_id`, `recorded_by_id`, `work_session_id`, `site_id` and `submitted_at`,
one row per act, so scan rate is a `GROUP BY` over an existing table at zero
marginal cost. Its only bias is scans producing no fact at all — exactly the
population that should not mint rows. D17's denominator claim is narrowed:
`activity_event` supplies **labour-time** denominators (`idle`, `task_paused`,
`skip`, `search_failed`); `client_event` supplies **scan-rate** denominators.

```
activity_event                 -- FACT (D17), amended. Range-partitioned on occurred_at.
  id, tenant_id NOT NULL, site_id NOT NULL      -- both absent from D17's sketch
  occurred_at, recorded_at
  client_event_id              -- PLAIN FK (D25); D17's "(unique)" was stale
  device_id                    -- FK device (D27): the RECORDING device
  instrument_device_id         -- FK device: the scan engine, when separately mounted
  recorded_by_id, work_session_id, authorised_by_id
  work_task_id, location_id                     -- CONTEXT, not subject; both nullable
  location_provenance          -- observed | context
  kind
  scanned_value    text        -- the decoded string, capped and truncated
  symbology_id                 -- FK symbology (shared reference)
  parsed_ai        text        -- FIXED-WIDTH TEXT, never smallint: '00' keeps its
                               --   leading zero and 310n has a variable final digit
  expected_entity_kind         -- package | location | item | lot | none
  attempt_ordinal  smallint    -- within the client_event
  detail                       -- retained; nothing queryable may live here

symbology                      -- REFERENCE, tenant_id NULL (D19 shape)
  id, aim_code, device_label_type, label
  -- a table, not an enum: scanner platforms ship ~60 label types and they grow
  -- with firmware. An enum turns a vendor release into a migration.
```

**`location_provenance` earns its column.** A failed scan's location is the app's
*belief*, not an observation. Mixing the two makes a per-bin failure heatmap
confidently blame the last bin that scanned correctly.

**Grain is one row per operator-initiated capture attempt.** This belongs in the
decision, not in an implementation note: camera decoders run per preview frame, so
a three-second aim is 45–90 failed decodes, and at decode-attempt grain a
20,000-scan site generates ~1.3M rows/day. **Four orders of magnitude turn on that
sentence.**

**Retries coalesce by `client_event_id`, server-side.** An operator scanning a
smudged label six times in four seconds is one world event. Six rows would measure
label quality × operator persistence, and a patient operator would score worse
than one who gives up. Never coalesce on the client, where the discard has no
audit and depends on app version.

#### Amendment 1 — the canonical length unit becomes micrometres

Principle 5 as restated by D23 makes canonical length **millimetres as integers**.
A verifier aperture of ten thousandths of an inch is 0.254 mm and **rounds to
zero**. The design used this to argue barcode grading is out of scope; the real
problem is that the failure is *silent truncation* rather than a stated boundary.

> **Canonical length is micrometres.** 0.254 mm is 254 µm, a standard pallet is
> 1,165,000 µm, and a `bigint` covers nine orders of magnitude beyond anything a
> warehouse holds.

It costs nothing today because nothing is built. **Instrument specifications —
aperture, wavelength — are not observations of goods and do not use the canon.**
They are `device` attributes (D27) with their own units. That is the clean split:
*the canon measures things we handle; specs describe the instruments that measure
them.*

#### Amendment 2 — `discrepancy`'s source-arm cap is retired

D25 capped `discrepancy` source arms at five and required a recorded decision for a
sixth; D24 (supply side) spent the sixth on `expected_supply_id` while noting it
was "a subject standing in for an absent cause". Scan-failure aggregates want a
seventh.

**The cap was imported from the wrong rule.** `stock_movement`'s cause CHECK is
capped because causes are *distinct relationships that merely happen to be
exclusive* — D23's straining case. `discrepancy.source_*` is not that: it is **the
row this finding is most closely associated with**, seen through different types.
Two of six arms already being subjects is the symptom, not an anomaly.

Under D23's own test that is a **subject union with an optional none** — "none" is
meaningful (a negative balance has no single associated row), so `<= 1` stays, and
the arms grow with the subject set exactly as `observable` does.

> **The cap is removed. `discrepancy.source_*` grows with the subject set under
> D23's discriminated-union rule; `<= 1` is retained because a finding may be
> associated with no single row.**

`activity_event_id` joins as an arm. **Findings are raised per pattern, not per
attempt** — one `activity_event` per capture, and N failures at one supplier,
device or location within a window is what a human sees.

#### Amendments to earlier decisions

- **D17** — `activity_event` gains `tenant_id`, `site_id`, `instrument_device_id`
  and the identification columns; four resolution-failure kinds; `scan_ok`
  deleted; `client_event_id` corrected to a plain FK; the denominator claim
  narrowed.
- **D23 / principle 5** — canonical length is micrometres (amendment 1).
- **D24** — `package_event.source` gains **`keyed`**. Today a hand-keyed SSCC must
  be recorded as `operator_scan`, which is a false fact under D24's own *"the fact
  recorded is the fact observed"*. Manual keying is the only reliable proxy for an
  unreadable label, which is why GS1 mandates human-readable interpretation on
  logistic labels.
- **D25** — `activity_event` is range-partitioned on `occurred_at` from the first
  migration, with local indexes. **Retention on a fact table is partition DDL by
  the owning role, not a DELETE grant** — compatible with S6 rather than an
  exception to it, and written down before someone requests a grant or quietly
  stops recording. Source-arm cap retired (amendment 2).
- **D19** — `symbology` joins the shared reference set.
- **D27** — instrument specifications (aperture, wavelength) are device attributes
  with their own units, outside the observation canon.

**Rejects.** `scan_ok`, refused with the number. `no_read` as a kind —
structurally unpopulatable. Per-decode-attempt grain — bounded by our frame rate,
not by the world. A `scan_stat` counter table — it has **no role value** under
D25's axis: not reference, not policy, not grouping, and not a projection, because
a counter over scans not otherwise recorded has no source to rebuild from. It
would be the first unrebuildable maintained table in the model. A derived supplier
label-quality score — GS1's own verification template disclaims the inference in
both directions, and an inferred score has no author, which D21 rule 2 makes an
access-control boundary rather than metadata. Failure aggregates may **trigger** a
verification; the verification is the assertion of record. Barcode print-quality
grading as a by-product of picking — D27 instrument territory. `detail` as the
home for the scanned string: "which barcodes are failing, on which device" is the
entire point of the row, so it is queryable, so principle 3 promotes it to a
column.

### D29 — Nothing mints a package at receipt

*Adopted 2026-08-02 from [d24-open-questions.md](./d24-open-questions.md),
settling question 90.*

**Decision.** Goods arriving unlabelled land at a dock `location` —
`holder_location_id` set, `holder_package_id` NULL, zero `package` rows. A package
is minted on exactly **three triggers, all of them our acts**, and the identifier
for an unlabelled pallet is an **internal licence plate, never an SSCC**.

#### D24's minting rule contradicted its own default, and J19 could not see it

D24 says a package exists *"when something identifies it — an SSCC, a licence
plate, a scan"*, and four lines later that *"the default is never per-carton"*.
Those collide, and they collide on the shape Australian grocery **mandates**: an
ASN carrying SSCCs at the carton level, which is required whenever a pallet holds
more than one SKU. At a reference site that is 1,200 cartons/day — and D24's rule
as written fires per carton.

That is the cheap half. The expensive half:

> If a `package` is minted from `asserted_unit.sscc`, and stock is received into
> it, then `stock.holder_package_id` — **a component of the six-dimension `stock`
> key** — was determined by a counterparty's message.

D21 rule 3 forbids exactly that. **And J19 passes anyway.** Truncate every
assertion table: `assertion`, `asserted_unit` and `asserted_unit_content` go;
`package` is not an assertion table and survives; `package_event` is a *fact* with
`source = 'asn'` and survives; `stock` rebuilds byte-identical.

**This is the J8 pattern again.** The invariant tests the *values* after a
truncation, and the laundering happened in the *keys*, through an intermediate
table the truncation does not reach. A wrong invariant is worse than a missing
one — and this one was the register's confidence in rule 3.

**The fix is one word:**

> A `package` row exists when something **we observe** identifies it. A
> counterparty's claim about a logistic unit lives in `asserted_unit` and becomes
> a `package` only when someone scans it or we build it.

#### Two arguments stronger than cardinality

**Per-carton identification at receipt is physically unobservable.** GS1 General
Specifications 4.4.2: on a nested pallet *"only the SSCC barcode of the higher
logistic unit SHOULD be readable. The SSCC barcodes of the lower level logistic
units should be obscured."* A receiver in front of a wrapped pallet **cannot** scan
the cartons, because the standard says the labels are covered. Minting per carton
would be minting packages nobody identified.

**Per-carton SSCC minting is arithmetically impossible for a small tenant.** An
SSCC is 18 digits: extension digit + company prefix + serial reference + check
digit, with prefix and serial sharing 16. A 12-digit prefix — what a small
Australian company is issued — leaves **four** serial digits: 100,000 total. GS1's
one-year non-reallocation rule turns that into a sustained ceiling of **274
SSCCs/day, forever**. Carton grain at 1,200/day exhausts a lifetime namespace in
four months and breaches the reuse rule from day one. Pallet grain is ~50/day.

That kills per-carton on the standard, before labour and long before the database
notices. **Do not argue this on storage grounds.**

#### The three triggers

1. **We scanned a real label** — a supplier SSCC read off the pallet at the dock.
2. **We built the logistic unit** — re-palletising, consolidating loose cartons,
   rebuilding a broken pallet. GS1 4.4.1.2: *"the physical builder of the logistic
   unit or the brand owner is responsible for the allocation of the SSCC."*
3. **Putaway to a location that requires a holder** — the licence plate is a
   property of *where the goods land*, not of the goods or the receipt. The dock
   needs no package; a bulk rack gets one at putaway, which is the moment the
   pallet first becomes a thing anyone must address later.

**The identifier is an internal LP, not an SSCC.** Every property that makes an
SSCC expensive — a licensed prefix, a finite serial budget, a 12-month obligation,
an implicit assertion of authorship — exists to make it meaningful to *other
parties*. A pallet broken down into putaway locations before anything leaves the
site pays every cost and gets no benefit. **An SSCC is minted at the boundary:**
despatch, or re-palletisation into something that will ship.

The LP format must be **mechanically distinguishable from an SSCC in one regex** —
alpha-prefixed, never an 18-digit numeric. An internal plate with a coincidentally
valid check digit will eventually be transmitted on a despatch advice, and that
class of error is undetectable afterwards.

#### The issuing machinery, which did not exist

`package.sscc` (D6) had no issuer; `party` had no company prefix; there was no
number range.

```
number_range              -- REFERENCE. OPERATOR-OWNED (tenant_id IS NULL).
  id
  issuer_party_id         -- the LEGAL ENTITY holding the prefix (D20), not the tenant
  key                     -- 'sscc' | 'internal_lp'
  extension_digit         -- explicit row per digit; NO automatic rollover
  next_value, block_size  -- claimed under FOR UPDATE, handed out from process memory
  issued_through          -- high-water mark: serials consumed but never applied are
                          --   still evidenced against the reuse window
  exhausted_at            -- exhaustion raises a finding and FALLS BACK to internal
                          --   LPs. It never blocks a print. Same code path as
                          --   "tenant has no prefix" — one fallback, exercised daily.

sscc_allocation           -- FACT. Append-only.
  id, tenant_id, client_event_id
  issuer_party_id, extension_digit, gcp, gcp_length, serial_reference
  sscc CHAR(18) GENERATED -- CHAR, never bigint: leading zeros are significant
  issued_at
  UNIQUE (issuer_party_id, extension_digit, serial_reference)
```

#### D24's fan-out guarantee, stated honestly

Without a package, a pallet move is **not** the O(1) `package_event` D24 promises
— it is N `stock_movement` rows. So D24's guarantee does **not** hold at the dock
for unlabelled goods, which is the common case.

Trigger 3 is what recovers it: the pallet acquires an LP **at putaway**, so every
move after putaway is O(1). Only the dock→putaway move fans out, and that move is
a receipt, where fan-out at the system boundary is expected and correct (D24).

#### Amendments to earlier decisions

- **D24** — the minting rule gains "we observe"; the fan-out guarantee is scoped
  to post-putaway.
- **D21 / J19** — widened: truncate every assertion table, rebuild `stock`, assert
  byte-identical **and** assert that no column of the `stock` key is reachable
  from an assertion table by any path that survives truncation.
- **J34** *(new)* — no `package` row's earliest `package_event` has
  `source = 'asn'`. Minting from an assertion is structurally absent.
- **J6** *(extended)* — the `package_event` fold covers `sscc`, `barcode` and
  `identifier_kind`. Its enumerated fold omitted them, so relabelling drift passed
  the check written to catch it — a third bad invariant of the J8 shape.
- **D20** — `party` gains `gs1_company_prefix` and `gs1_prefix_length`.
- **J35** *(new)* — every `sscc_allocation` serial lies within its range's issued
  span, and no serial is reissued within the reuse window.

**Rejects.** Minting per carton from an ASN. Minting an SSCC for internal use.
An 18-digit numeric internal plate. Automatic extension-digit rollover on
exhaustion — it changes the first character of every SSCC we issue and downstream
systems pattern-match it. Blocking a print on range exhaustion.

### D30 — The reaper: one reference, and the predicate belongs to the rebuild

*Adopted 2026-08-02, settling question 91.*

**Decision.** "Unreferenced" is a closed, CI-asserted list of **exactly one
foreign key** — `stock_allocation.stock_id`, **in every state**, not the
enumerated live set. `stock.id` is a handle for the life of the cell, not an
archival key. The reaper runs weekly, off-peak, under the projection-maintainer
role, batched, with a grace period and a kill switch.

#### J3 is a quantity fold that reads as a reference test

`stock.allocated_quantity` folds only `{allocated, picking, picked, packed}`.
**Terminal allocations contribute nothing to it and still hold the foreign key.**
So the obvious cheap predicate — `quantity = 0 AND allocated_quantity = 0`, which
J3 makes look authoritative — **deletes rows that live foreign keys point at.**

Write it as an `EXISTS` over `stock_allocation` in **any** state, and record that
**J3 must never be used as a reference test.** Fourth bad invariant of the J8
shape.

**The reaper as adopted was also a near no-op.** A `fulfilled` allocation against
a now-zero cell **is the normal end of every pick**, so under a literal reading of
"not deleted while referenced" every cell that ever served a pick is pinned
forever.

There is no referential action that both reaps and keeps the allocation: RESTRICT
blocks, CASCADE destroys fulfilment history, and SET NULL violates
`CHECK (num_nonnulls(stock_id, expected_supply_id) = 1)`. Relaxing that CHECK is
refused twice over — by D23's rule and by D24 (supply side) amendment 2, which
dropped exactly that scoping. So: **RESTRICT, declared, with the reaper narrowed
to match.**

#### `stock.id` is a handle, not an archival key

**The model has already answered this three times without writing it down.**
`stock_count` and `discrepancy` carry the full cell key *column set* rather than an
FK. `observable` (D23) deliberately excludes stock cells and says why —
*"D24 gives `stock` a surrogate id that would make it tempting."* `stock_movement`
carries `from_*`/`to_*` pairs, never a `stock_id`.

> **`stock.id` is a current-state handle, not an archival key. History is
> `stock_movement`.**

That collapses the "historical reporting joins `stock.id`" worry into a rule the
model already obeys — and it is why `outbox.source_id` is safe: **S27 is doing
load-bearing work for the reaper that nobody wrote it for.**

**Three referencers the register did not cover:**

1. **D26's schema compiler.** `record_scheme_field.field_type = 'ref'` generates a
   real FK with `ON DELETE RESTRICT`, and D26 derives `attaches_to` from the code
   registry — which contains `stock`. So **a tenant could declare a scheme that
   creates a durable FK to `stock.id` at runtime**, disabling an operator
   invariant with no privilege required, surfacing as a maintenance job erroring.
2. **`package_content` is a view exposing `stock.id`.** Any export or `ref_entity`
   naming it persists a reapable surrogate.
3. **`projection_check.scope_kind`/`scope_id`** (D25) is a polymorphic pair on a
   fact with no DELETE grant — scope a check to a cell and it holds a `stock_id`
   forever, uncatchable by any FK.

**S2 licensed the bug.** *"Every table naming a stock cell carries the whole key —
FK to `stock.id` **or** the complete column set."* Under a reapable `stock` those
are not equivalent: the column set survives the row's death and the FK does not.
**The disjunction is removed.**

#### The rebuild collision

J1 asserts `stock.quantity` equals the fold of `stock_movement` over the cell key.
A reaped cell folds to zero and has no row — so unless the rebuild's definition of
*which cells exist* excludes them, **every reap cycle emits `projection_drift`**
and D8's queue fills with noise the model generates about itself.

> A cell exists iff `quantity <> 0 OR weight_g <> 0 OR allocated_quantity <> 0 OR
> referenced`.

`weight_g` is easy to miss and matters: J2 folds `catch_weight_g` independently, so
a cell can reach `quantity = 0` with `weight_g <> 0`. That is a catch-weight
capture bug, and it is exactly the evidence a quantity-only reaper destroys while
the rebuild resurrects the row.

#### The honest benefit

D24 amendment 3 claimed reaping *"removes the unbounded-growth concern"*. **That
is wrong.**

- The availability index is already partial (`WHERE quantity <> 0`), so dead cells
  are already invisible to the read path.
- The `UNIQUE NULLS NOT DISTINCT` arbiter index **cannot** be partial — it must
  find a zero cell to resurrect it — so it carries every cell that ever existed.
  Reaping trims about **one B-tree level**: roughly one page access per upsert.
- At 5,000 picks/day, twelve months unreaped is ~730k dead rows, ~330 MB/year/site.
  The ratio is the argument, not the megabytes.
- **The real cost on `stock` is non-HOT UPDATE churn, and reaping does not touch
  it.** `available_quantity` is `GENERATED STORED` and sits in the availability
  index's `INCLUDE`, so every quantity change and every allocation state
  transition writes new index tuples.

Restated: **reaping bounds the arbiter index's page count.** It does not solve
growth.

#### Mechanics the natural implementation gets wrong

- **The `DELETE` repeats the full predicate.** Under READ COMMITTED,
  `DELETE ... WHERE id = ANY($1)` deletes a cell resurrected between the SELECT
  and the DELETE. Batch by id **and** predicate.
- **`stock_allocation(stock_id)` plain btree must exist first.** Postgres does not
  index the referencing side of a foreign key; without it each delete fires an RI
  trigger that sequentially scans the allocation table.
- **Grace period.** `stock` gains `last_movement_at` (`@projection`) with a
  candidate index. A cycle-count wave revisits a bin a week later; measure grace
  in days.
- **Per-table autovacuum** in the migration that creates `stock`, justified by
  UPDATE churn rather than by the reaper. A self-hosted deployment (D18) has no
  DBA to set it.
- The reap-versus-resurrect race is **not** a problem: `ON CONFLICT DO UPDATE`
  guarantees insert-or-update against a concurrent delete. The reaper cannot make
  a receipt fail.

#### Amendments to earlier decisions

- **D24** — amendment 3's premise corrected; predicate stated as an `EXISTS` over
  every allocation state; benefit restated. `stock` gains `last_movement_at`.
  `stock.id` is documented as *"a handle for the life of the cell. NOT durable:
  reissued if the cell is reaped and returns."*
- **D12 / D24** — `stock_allocation.stock_id` declared `ON DELETE RESTRICT` with a
  plain btree.
- **D25** — **DELETE revoked on projection tables** from the app role. S5 covered
  UPDATE only and S6 covered fact tables only, so *"nothing writes to `stock`
  directly, ever"* was unenforced against DELETE. `projection_check.scope_kind`
  may not name a stock cell.
- **D26** — `stock` and `package_content` carry neither the attachable nor the
  subscribable capability flag.
- **S2** *(corrected)* — the disjunction removed.
- **J33** *(new)* — rebuilding `stock` preserves row identity; truncate-and-
  regenerate is forbidden while any allocation holds a `stock_id`. **This is
  J30's missing analogue** — D24 (supply side) forbade it for `expected_supply`
  because live allocations hold those ids, and `stock` has the same exposure under
  the same CHECK on the same table.
- **J32** *(new)* — the reap predicate is the complement of the rebuild's
  existence predicate: reap, rebuild, assert produces zero `projection_drift`.
- **q102** — the reaper runs as the projection maintainer, so q102 blocks it.

**Rejects.** Reaping on `allocated_quantity = 0`. Relaxing the `= 1` CHECK to
permit SET NULL; CASCADE. Loose foreign keys with a deletion queue and worker — it
deletes the guard that stops a caller naming a cell that never existed. A
`stock_reaped` tombstone — storage to record having freed storage, recreating the
unbounded table the reap exists to prevent; extractors get the natural key, never
the surrogate. `deleted_at` soft delete, which is not a reap. Never-reap plus
periodic `REINDEX CONCURRENTLY` — attractive on the numbers, refused on D5,
because a concurrent reindex of a unique index can make `INSERT ... ON CONFLICT`
fail with a spurious unique violation, and on `stock`'s arbiter index that is a
receipt scan being rejected. Deterministic `stock.id` (UUIDv5 over the key) —
considered seriously, unnecessary once nothing durable holds the id, and it puts a
random-key B-tree on the hottest table in the system.

### D31 — Retention: floors are declared, and nothing that folds is ever deleted

*Adopted 2026-08-03, settling questions 101, 113 and 115 together.*

**Decision.** Retention has exactly two drivers: **verifiability**, which sets a
hard floor nothing may cross, and **claim windows**, which set the minimum age for
anything that can still be argued about. **Value decay is rejected as a driver.**
Ageing data out is done by **archiving, never deleting**. Every floor is a
declared row with a named authority, and CI asserts the data actually reaches it.

#### Why value decay is rejected

The intuitive model is that detail matters while something is in motion and fades
into summary afterwards, the way memory does. It is seductive and it is wrong for
an audit trail, for one reason:

> **Significance is determined retrospectively.** Nothing is knowable as noise at
> the time it is written. An event becomes evidence when a dispute surfaces, and
> that can be months later.

The memory analogy fails precisely where it matters. Human memory is lossy and we
accept that. A chargeback dispute needs exactly the detail that looked like noise
when it was recorded.

#### The verifiability floor

Facts divide into two classes by whether anything folds from them.

**Facts that fold to a projection** — the movement ledger, observations, container
placement — **are never deleted.** The check that makes stock trustworthy is that
the stored total equals the fold of the whole ledger, and deleting any of it means
that check can no longer run. This is not a retention policy so much as a
consequence of the model: the log is the only truth, and projections are caches
that may be discarded and refolded at any time.

**Facts that fold to nothing** — scan failures, activity, work that moved no stock
— may age out, but see the archive rule below.

#### Archive, never drop

*(Adopted from the substrate work in the `timespace` project, whose law 8 states
compaction as freeze-with-tested-unfreeze and archives a segment only once
everything in it is snapshot-covered.)*

D28 range-partitions `activity_event` on time, with the implication that old
partitions are dropped. **Dropping is deletion, and question 115 named the failure
mode: it is silent.** A fold invariant detects source deletion because the
projection stops matching. An **existence** predicate — has this identifier been
used in the last twelve months, has this submission been seen before — has no
projection to compare against, so after a truncation both sides agree and nothing
fails.

So a partition is **detached and archived**, not dropped. It reopens cold and
transparently. The failure mode of archiving is slowness; the failure mode of
dropping is a check that quietly starts passing.

#### Retention floors are declared facts with an authority

*(Settling question 115.)*

```
retention_floor               -- REFERENCE
  id, tenant_id               -- NULL = applies to all
  subject                     -- the table or check the floor protects
  minimum_age                 -- interval
  basis                       -- statutory | standard | contractual | operational
  authority                   -- the instrument it comes from, named
  established_at, established_by_id, note
```

The floors known from the inbound research, each with the instrument behind it:

| Subject | Minimum age | Basis |
|---|---|---|
| Identifier reuse guard | 12 months | GS1 General Specifications, SSCC non-reallocation |
| Receipt and discrepancy evidence | 30 days minimum | Food and Grocery Code of Conduct, claim window |
| Pallet account movements | 180 days | Carrier equipment control policy, liability window |
| Carrier charge disputes | 12 months | Quarterly dispute cycles, four quarters of cover |

**[Unverified and probably the binding one: Australian business record retention
under tax and corporations law, commonly five years. Needs legal confirmation
before any floor is set below it.]**

**The assertion that makes a floor real**: for every declared floor, either the
oldest live row in the subject reaches `minimum_age`, or the archive manifest
covers back to it. A partition detached below the floor fails the check loudly
rather than degrading a guard nobody is watching.

#### `client_event` retention is derived, not chosen

*(Settling questions 101 and 113.)*

Every fact carries `client_event_id`. The row it points at holds the person, the
device, the session, the app version and both clocks, which is exactly the material
D8 and D11 depend on for an investigation. **Deleting it while keeping the fact
would leave the record intact and gut the ability to investigate it.**

So the retention of `client_event` is not an independent decision. **It lives as
long as the longest-lived fact that references it**, which for the ledger is
indefinitely.

#### The premise of question 101 was wrong

D25 asserted that `client_event` can never be partitioned, because Postgres
requires the partition key inside any unique constraint, so partitioning by time
would degrade a global uniqueness guarantee into a per-partition one and let a
replay landing in a different month through.

That holds only when the partition key is **independent** of the identifier. It is
not a property of the table.

> **Derive the partition key from the identifier and a replay routes to the
> partition its original landed in, so uniqueness within the partition is globally
> sufficient.**

With a time-ordered identifier (UUIDv7, already the recommended scheme), the
server computes the bucket from the id itself and stores it as a plain column. The
key becomes `(tenant_id, bucket, client_event_id)`. A replay carries the same id,
therefore the same bucket, therefore the same partition, and the conflict is
caught. Two distinct submissions can never collide because their identifiers
differ.

The bucket is computed server-side from the identifier, never supplied by the
client.

#### The volume does not justify urgency

With `scan_ok` deleted (D28), `client_event` takes one row per fact-producing
submission rather than per capture: on the order of 10,000 a day per site. The row
is narrow.

| | |
|---|---|
| Rows per year per site | ~3.7M |
| Storage per year per site, with indexes | ~500 MB |
| Ten years, twenty sites | ~100 GB |

That is unremarkable for Postgres. **The honest answer to question 101 is that
`client_event` is retained indefinitely, it is partitionable if that ever becomes
useful, and the question was more urgent in the asking than in the answering.**

#### Snapshot membership is by identity, never by time

*(Adopted pre-emptively from the same substrate work, whose law 3 is marked as a
correction, implying it was learned the hard way.)*

Nothing is snapshotted today, so this costs nothing to write down now and would be
expensive to discover later.

> When a segment of the ledger is folded into a snapshot, the remainder is defined
> as **the operations the snapshot does not contain**, never as *"everything after
> time T"*.

A time-keyed cut loses any movement that arrives late but is dated before the cut.
The model is built to make exactly that case correct: D5 orders the ledger by
device clock so a late scan lands in its true position, and D9 computes count
variance against ledger state at the moment of counting rather than at write time.
The first time-keyed snapshot would quietly undo both.

**And when a snapshot exists, it joins the trusted base.** Today nothing is trusted
except the log. Afterwards a corrupted snapshot is invisible to the mechanism built
to detect corruption, which is an acceptable trade if it is chosen rather than
arrived at.

#### Amendments to earlier decisions

- **D25** — the claim that `client_event` can never be partitioned is withdrawn;
  it holds only for a partition key independent of the identifier.
- **D28** — `activity_event` partitions are **archived, not dropped**.
- **J-series** — a new assertion per declared `retention_floor`, checking the
  oldest live row or the archive manifest reaches it.

**Rejects.** Value decay as a retention driver. Dropping partitions on a table any
existence check reads. Deleting `client_event` rows while referencing facts
survive. Choosing an arbitrary retention window in place of a derived one.
Time-keyed snapshot cuts.

### D32 — One `party` for identity, roles as relationships

*Adopted 2026-08-03, settling question 57 and answering question 53.*

**Decision.** One `party` table holding a company's identity, and a `party_role`
table saying what that company is **to us**. Role-specific operational data hangs
off the role, not the party. Every foreign key meaning "a company" points at
`party.id`, a single column with no arms.

#### The `kind` column is a shape this model already refused

`party(id, kind, …)` with `kind ∈ {customer, supplier, carrier, legal_entity}` is
the same construction D16 rejected for `order`: *"adding a kind and a nullable
customer to `order` would be the generic document model already on the
deliberately-not-building list."* The objection was that a discriminator column
forces every consumer to carry a predicate the database cannot help with, and that
two honest tables beat one apologetic one.

Here it fails for a sharper reason.

#### Roles are not exclusive, so neither a discriminator nor separate tables works

D23's rule says typed alternatives are correct when the arms are **alternative
identities of one referent**, where exactly one applies and "none" is meaningless.
A party's roles are not that. **A company can hold several at once**, so this is a
set, not a union.

Both of the obvious shapes break on it in the same way. A `kind` column means a
company that is both customer and supplier gets two rows, therefore two
identities, and "are these the same company" becomes unanswerable. Separate
`customer` / `supplier` / `carrier` tables have the identical problem with more
DDL, and additionally force four typed arms onto every table that references a
counterparty.

**The overlap is not hypothetical, and the clearest case is already in the
model.** A carrier invoices us. D31's freight-cost goal is to compare what a
carrier charged against what was predicted, which makes a carrier's invoice a
supplier document from a company that, under a discriminator, is not a supplier.
Swift is a carrier when it moves a pallet and a supplier when it bills for it, and
it is one company throughout.

```
party                         -- REFERENCE. Identity. Intrinsic (D19).
  id, tenant_id               -- NULL = shared across tenants
  name, trading_name
  abn                         -- Australian Business Number
  gln                         -- GS1 Global Location Number
  gs1_company_prefix, gs1_prefix_length      -- D29, for identifier issuance
  active

party_role                    -- REFERENCE. What they are TO US. Operational.
  id, tenant_id (NOT NULL), party_id
  role                        -- customer | supplier | carrier | freight_provider
                              -- | legal_entity | pool_provider | calibrator
  owner_party_id              -- whose supplier is this? NULL = ours (D20's 3PL)
  account_reference           -- our account with them, or theirs with us
  established_at, ended_at    -- a monotone lifecycle; timestamps are its log (D25)
  UNIQUE (tenant_id, party_id, role, owner_party_id)
```

**Role-specific data hangs off `party_role`, never off `party`.** A company that is
both supplier and carrier has two role rows, each carrying its own operational
detail: `carrier_profile` (D22's despatch scalars) attaches to the carrier role,
supplier capability such as whether they send advices attaches to the supplier
role. Hanging both off the party would produce one sparse table where most columns
are null for most rows, which is the attribute-soup shape principle 4 refuses.

**`owner_party_id` is what makes the role relative.** D20 admitted third-party
stock, and a 3PL client has their own suppliers whose goods arrive at our dock.
That party is a supplier *to the client*, not to us. One nullable column expresses
it, defaults to NULL meaning ours, and an operation that never holds another
company's stock never encounters it. D20's own pattern.

#### D19's split falls out for the third time, which answers question 53

Question 53 asked whether carriers and package types are shared reference data
too, and noted that if the intrinsic-versus-operational split applied again it
would be *"a good sign the split is real rather than fitted to items"*.

It applies exactly. A company's name, ABN, GLN and GS1 prefix are facts about the
company that are true for everyone, so `party` is shareable with `tenant_id NULL`.
What that company is to a given tenant, the account number, the despatch rules,
whether they send advices, is observed and operational, so `party_role` is
tenant-scoped and never shared.

**Third independent case, none of them fitted to the others.** The split is real.

#### What this changes in the freight model

D1 introduced `carrier` and `freight_provider` as separate tables. A carrier is a
company, so `carrier` collapses into `party` plus a carrier role. `carrier_service`
survives unchanged, because a service offering is not a company.

`freight_provider` survives as a **route**, which was always D1's point, and now
names the company at the other end of it:

```
freight_provider              -- HOW a carrier is reached
  id, tenant_id
  party_id                    -- the intermediary; NULL when reached directly
  kind                        -- aggregator | direct
  ... credentials, endpoint ...
```

D1's whole argument is preserved and gets sharper. Swift reached through an
aggregator and Swift reached directly are the same carrier because they are the
same `party`, and the aggregator is itself a party we hold a relationship with.

#### The consequence that matters

Every reference to a company is one column. `discrepancy.counterparty_party_id`,
`observation_event.asserted_by_party_id`, `assertion.author_party_id`,
`stock.owner_id`, `site.legal_entity_id`, `purchase_order.supplier_party_id` and
`consignment.carrier_party_id` all point at `party.id`.

Under separate tables each of those would need four typed arms and a CHECK, on
seven tables. Under a discriminator each would point at a row whose meaning
depends on a column the database cannot constrain. **One identity per company is
what makes a supplier scorecard, a carrier cost history and a counterparty finding
join to each other at all.**

#### Amendments to earlier decisions

- **D1** — `carrier` collapses into `party` plus a carrier role;
  `freight_provider` gains `party_id` and keeps its routing meaning.
- **D20** — `party` loses its `kind` column; roles move to `party_role`. The
  `legal_entity` axis is unchanged, and `site.legal_entity_id` now points at a
  party holding that role.
- **D19** — extended to parties, which is its third independent application.
- **D22** — `carrier_profile` attaches to the carrier `party_role`, not to a
  separate carrier table.
- **D29** — the GS1 company prefix sits on `party`, where identifier issuance
  already assumed it.

**Rejects.** A `kind` discriminator on `party`, refused on D16's reasoning and on
the fact that roles are not exclusive. Separate `customer` / `supplier` /
`carrier` tables, which multiply the identity problem and force four typed arms
onto seven tables. A single `party_profile` carrying every role's operational
columns, which is sparse by construction. Deriving a role from the existence of
related rows, such as treating any party with a purchase order as a supplier,
which cannot express a supplier we have not yet ordered from.

### D33 — Two confirmations before the first migration

*Adopted 2026-08-03, settling questions 31 and 44. Both had a stated lean; both
leans hold, and one holds for a different reason than the one given.*

#### Lot tracking is enforced by a finding, never by a rejection

A CHECK cannot reach from `stock_movement.lot_id` to `item.tracking`, so a
movement for a lot-tracked item that carries no lot cannot be forbidden by the
database in the ordinary way. D23 leaned toward application validation plus a
periodic assertion on the grounds that it matches how `stock` is already
reconciled. That is true and it is not the reason.

**The reason is D5.** A trigger that rejects the insert blocks the floor to
protect a data rule. Picture the case: a picker scans an item whose lot label is
damaged or missing. The goods are real, the pick happened, and a trigger would
refuse to record it. That is the exact trade D5 exists to refuse, and refusing it
here is worse than usual because the discarded record is the one a recall would
have needed.

So enforcement runs the same way every other impossible state does:

1. **Challenged at capture** (D9). The handheld knows the item is lot-tracked and
   asks for the lot while the operator is standing at the shelf and can look
   again. This is where almost all of them get caught.
2. **Accepted if confirmed.** An operator who cannot read the label records the
   movement without one. The goods moved.
3. **Raised as a finding.** `discrepancy.kind = 'lot_missing'`, carrying the
   person, the device and the timestamp, so somebody can go and look at the pallet
   while it is still where it was put.

A trigger would have produced a rejection, which loses the event. A finding
produces an investigation, which is the thing that recovers the lot.

**One detail this exposed.** `item.tracking` is mutable, because an item can start
being lot-tracked. Historical movements made before that change are still valid
and must not fail the assertion. So `item` gains `tracking_effective_from`, and the
assertion only considers movements at or after it. Without that column, switching
an item to lot-tracked would retroactively flag every movement it ever had.

#### `activity_event.kind` is an enum, and the model already has the test

D28 leaned enum. Confirmed, and the general rule is worth stating because there
are now three instances pointing at it.

> A value set is a **table** when it carries attributes and grows independently of
> the code that reads it. It is an **enum** when code branches on it, because then
> the set is closed by the code that handles it, and adding a value without adding
> handling is a bug rather than a configuration.

| Set | Shape | Why |
|---|---|---|
| `metric` (D23) | table | Carries a result kind, a dimension, a unit; tenants may define their own |
| `symbology` (D28) | table | Scanner platforms ship around sixty label types and add more with firmware |
| `activity_event.kind` | **enum** | Every value exists because code does something different with it |
| `discrepancy.kind` | **enum** | Same: each kind routes differently |

D23 had already drawn the line in passing, when it refused a `metric` enum
*"contrast question 44's `activity_event.kind`, where code branches and an enum is
honest"*. This confirms it and makes the test explicit rather than a remark.

**The escape hatch already exists**, which is what makes the refusal safe. D28
rejected a kind table on the grounds that it *"invites per-site custom kinds,
which is a small step toward the rules-engine-by-accretion D13 warned about"*. A
tenant that needs to record something the enum does not cover declares a
`record_scheme` (D26) and gets a real typed table for it. That is the sanctioned
path, and it does not require loosening a discriminator the application branches
on.

#### Amendments to earlier decisions

- **D14 / D23** — `item` gains `tracking_effective_from`; the lot-tracking
  assertion is scoped to movements at or after it.
- **D8** — `discrepancy.kind += lot_missing`.
- **D23** — the table-versus-enum test is stated as a rule rather than left as an
  aside.

**Rejects.** A trigger enforcing lot presence, refused on D5. Denormalising
`item.tracking` onto the movement with a composite foreign key: the idiom is
sound and D23 uses it, but the foreign key would forbid ever changing an item's
tracking, which is a legitimate operation. A kind table for `activity_event`.
Deriving tracking obligations from the presence of related rows.

## Open questions

1. ~~Lot/batch and expiry~~ — settled by D14, and the scope question is answered:
   the business distributes **food safety products** (gloves, hair nets,
   protective equipment), which are largely non-perishable. So `tracking = lot` is
   the **exception, not the default**, and rotation applies to a small part of the
   catalogue. The capability is built for breadth, not for current need — see D20.
2. ~~Does a fulfilment ever span multiple orders?~~ Settled by D15: no. Waves are
   a work grouping and belong in `pick_batch`, not in the order structure.
3. ~~Does a consignment ever span multiple fulfilments?~~ Settled by D15: yes,
   and it always could — via `consignment_package → package → fulfilment`.
   `consignment.fulfilment_id` is dropped.
4. **Is `order` ours, or a mirror of NetSuite's?** During coexistence it is a
   mirror. The field list above is deliberately thin so that the mirror is cheap
   and the eventual ownership is not painful.
5. *(Vocabulary supplied by D23's `dimension`/`unit`; the catch-weight case is
   settled by D20.)* **Item base units.** `base_unit` assumes each item has one sensible base.
   Anything sold by weight or length breaks that assumption. *(Likely answered by
   the `entered_quantity`/`entered_unit` change — see the competitor analysis.)*

Raised by D5–D7:

13. ~~Does the count-as-assertion approach hold?~~ Resolved by D8, and the
    late-arrival case is settled by D25: a recomputation that contradicts an
    `acceptance` does not lose, it raises `accepted_state_contradicted`.
14. ~~Nosdesk: shared workspace, or service boundary?~~ Settled by D26: shared as
    **library crates** (sandbox, bridge, consent, signing), not as a deployment;
    the plugin collection store is explicitly not shared. ~~Sharing the platform
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

17. ~~How does a movement reference its cause?~~ Settled by D10: typed FKs.
18. ~~Does `actor_id` mean who did it or who is accountable?~~ Settled by D11:
    `recorded_by_id`, `work_session_id` and `authorised_by_id` are separate.
19. ~~What is the tolerance policy?~~ Settled by D9: operator-configurable, not
    hard-coded, with point-of-capture challenge as the primary mechanism.

Raised by D9–D11:

20. ~~Does `measurement` get typed subject FKs too (D10)?~~ Settled by D23: yes,
    but on the `observable` registry rather than on the fact, which is what keeps
    the subject set open. ~~Consistency says yes.
    The counter-argument is that `measurement` is append-only reference data on a
    cold path, where the batch-loading argument does not apply — so this may be
    a case where the polymorphic pair genuinely costs nothing.
21. ~~Who configures tolerances, and at what grain?~~ Settled by D22: the scope
    lattice, with `count_tolerance` and `order_tolerance` as separate kinds. ~~Per item, item class, site,
    or location kind? D9 says the operator decides, but not yet at what
    resolution they express it.
22. **What is a `work_session` in practice?** A shift, a task, a wave, or an
    ad-hoc grouping someone opens and closes? The schema does not care; the floor
    process does, and it determines whether sign-on is a habit or a chore.
23. **Can a movement have no `work_session`?** Modelled as nullable, so solo work
    just has `recorded_by_id`. Worth confirming that is right rather than forcing
    everyone into a session of one.

Raised by D12:

24. ~~FEFO versus travel — which wins?~~ Settled by D13: neither, in code. The
    model holds expiry, travel and access cost; a manager sets the weights.
25. ~~When are allocations released?~~ Settled by D22:
    `allocation_policy.allocation_expiry_hours`. ~~Explicit release on cancellation is
    obvious. Less obvious: does an allocation expire? One held for a week is a
    lie that suppresses availability for everything else. A sweep needs a rule.
26. **Who allocates, and when?** At order import, on a schedule, at wave
    creation, or on demand when picking starts? Allocating late reduces churn;
    allocating early makes ATP meaningful. Probably late plus an explicit
    "commit this order" action, but it is a real choice.
27. **Does allocation cross sites?** Modelled as not — a cell belongs to one
    location and therefore one site. Multi-site fulfilment of a single order
    would change this, and relates to question 2.

Raised by D13:

28. **Does the allocator run before the location survey exists?** Travel and
    access scoring need coordinates and `reachable_by`, and neither is populated
    yet. Until then the weights collapse to rotation only — which is fine, but it
    means the survey gates allocation *quality*, not just the map. A nullable
    `location.sequence` as an interim travel proxy would soften this.
29. **Is `relative_cost` on `equipment_class` enough**, or does access cost need
    to account for equipment *availability* (one forklift, three people wanting
    it)? Queueing is a scheduling problem, and modelling it properly is a much
    larger commitment than a scalar.
30. ~~Who may change an `allocation_policy`, and is the change audited?~~ Settled
    by D22: `policy_change` is a fact with a mandatory reason. ~~These
    weights directly affect spoilage and labour cost. Per D8's spirit, a policy
    change is exactly the kind of thing you want to correlate against a later
    change in findings — which argues for policy edits being facts too.

Raised by D14:

31. ~~How is `tracking = lot` enforced?~~ Settled by D33: challenged at capture,
    accepted if confirmed, raised as a finding. A trigger would block the floor,
    which D5 refuses. ~~A CHECK cannot reach from
    `stock_movement.lot_id` to `item.tracking`. Options are application-level
    validation plus a periodic assertion (consistent with how `stock` is already
    reconciled), or a trigger. The first fits the existing pattern; the second is
    stricter. Worth deciding once, since putaway, receiving and adjustment all
    need the same rule.
32. ~~Can a lot exist before its goods arrive?~~ Settled by D24 (supply side):
    **no**. The advised code and expiry ride on `expected_supply` as raw,
    non-authoritative strings. ~~Supplier ASNs name lots ahead of
    delivery. If yes, `lot` is created by inbound rather than by the first
    movement, and `received_at` becomes nullable — which is fine, but it means
    lots can exist with no stock, and expiry reporting must not count them.
33. ~~Is `min_shelf_life` per customer, or per customer and item?~~ Settled by
    D22: `shelf_life_policy` on the lattice, any combination of dimensions. ~~Modelled on
    the customer. A single retailer often has different requirements by category,
    which would push it to a customer-item-class pair.
34. **What happens to allocations when a lot is held?** D14 says they become
    findings. But should the system also auto-release them so the demand
    re-allocates to good stock, or wait for a human? Auto-release is convenient
    and quietly discards the evidence of what the plan had been.

Raised by D15:

35. **What identifies a delivery to the customer?** With two orders consolidated
    onto one consignment, the customer receives one delivery containing two
    orders. Tracking is per-consignment and per-package, which works — but
    packing lists, ASNs and customer notifications need an explicit answer about
    whether they are per-order or per-consignment.
36. **Can packages from different customers share a consignment?** Physically yes
    for a milk run; commercially it depends on the carrier and the rate. Nothing
    in the schema forbids it, which is correct, but the allocator and any
    consolidation logic need a rule.
37. ~~Is an inter-site transfer a fulfilment?~~ Settled by D16: it is a fulfilment
    against a `transfer_order` rather than an `order`. Every package on a
    consignment has a fulfilment, with no exception.

Raised by D16:

38. ~~Does a transfer's receipt reconcile against its despatch automatically?~~
    Settled by D24 (supply side): yes, through the destination-site
    `expected_supply` row. The **destination owns the variance**, and it is
    suppressed as a timing difference until `expected_to + supply_overdue_hours`.
    ~~Original:~~
    Shipped 100, received 98 is a discrepancy (D8) — but which site owns it, and
    at what point does in-transit shrinkage become someone's finding rather than
    a timing difference? Needs a rule, since transfers will otherwise generate
    noise every time a truck is mid-journey at a reporting boundary.
39. ~~Do shelf-life rules apply to transfers?~~ Settled by D22:
    `shelf_life_policy.min_remaining_days_transfer`, with a site floor via
    clamping. ~~D14 puts `min_shelf_life` on the
    customer, and a transfer has none. If site B serves a customer who demands 90
    days, sending them stock with 30 days left is a real failure that the current
    model would not catch.
40. ~~Can a transfer be allocated before it arrives?~~ Settled by D24 (supply
    side): **yes**, from the moment of despatch, against a destination-site
    `expected_supply` row. The transfer arm has zero exposure to rule 3 and is the
    arm to build first. ~~Committing inbound stock to
    outbound demand is normal practice, but our allocation is against a specific
    `stock` cell (D12), and in-transit stock is in no cell at all.

Raised by D17:

41. **Does a count task lock its location?** D8 computes variance against ledger
    state at `counted_at`, which works without a freeze. But a picker taking
    stock from a cell mid-count produces a variance that is a timing artefact,
    not a finding. Either counts tolerate it (and D8's tolerance settings absorb
    the noise), or count tasks block picking on that cell — which is
    coordination, and needs justifying against D17's stated line.
42. **How does `sequence` get computed before the survey?** Travel order within a
    batch needs the same coordinates D13's scoring needs, and they do not exist
    yet. The interim `location.sequence` proxy would serve both, which
    strengthens the case for adding it now rather than waiting.
43. **What closes a `pick_batch`?** All tasks terminal is the obvious rule, but a
    batch with one permanently failed task would never close. Probably needs an
    explicit abandon, which is itself a decision worth recording.
44. ~~Are `activity_event` kinds an enum or a table?~~ Settled by D33: enum, and
    the table-versus-enum test is now stated as a rule. ~~An enum is honest and
    typed; a table invites per-site custom kinds, which is a small step toward
    the rules-engine-by-accretion D13 warned about. Leaning enum.

Raised by D18:

48. ~~Will we ever hold third-party stock (3PL)?~~ Yes — settled by D20.
    `owner_id` joins the `stock` key now rather than as a later migration.
49. *(De-risked by D20: this changes the deployment, not the schema.)*
    **Are the Australian states one legal entity or several?** If several, they
    may be separate tenants that nonetheless move stock between each other —
    which D18 says is impossible, and would need an inter-tenant transfer concept
    (effectively an internal sale). This is the one thing that could invalidate
    the site-not-tenant reading.
50. ~~Is reference data per-tenant or shared?~~ Settled by D19: shareable when
    intrinsic, tenant-scoped when observed or operational.
51. ~~Does `person` span tenants?~~ Settled by D19: yes, via `person_tenant`.

Raised by D19:

52. **Who governs the shared catalogue?** If tenant A edits a shared item's
    description, tenant B sees it. Either shared reference data is
    operator-managed and read-only to tenants, or a tenant needing a change forks
    it into a tenant-scoped copy. The fork is more flexible and quietly
    reintroduces the duplication that sharing was meant to avoid.
53. ~~Are carriers and `package_type` shared too?~~ Answered for carriers by D32:
    yes, and the intrinsic/operational split applied a third time without being
    fitted, which was the stated test. `package_type` still wants confirming.
    ~~A carrier looks intrinsic —
    Swift is Swift — but `carrier_profile` (despatch times, caller values) and
    account credentials emphatically are not. Probably the same intrinsic /
    operational split applied again, which would be a good sign the split is real
    rather than fitted to items.
54. **Can a `work_session` span tenants?** A person may belong to two, but one
    shift crossing tenants would make `work_session_id` ambiguous on movements.
    Simplest answer is no — a session belongs to one site, therefore one tenant —
    but it should be stated rather than assumed.

Raised by D20:

55. ~~Can a customer order by weight rather than by count?~~ Settled by D20's
    revision: yes, as unit conversion. Allocation plans on nominal weight;
    closest-fit happens at pick time where the scale is.

    **Tolerance is a policy object, not a scalar** *(2026-07-31)*. It resolves
    like every other policy here — most specific wins across site, item class,
    item, customer and order line — but the *shape* stays open too, because
    `± 2%` is only one of the models an operation might need:

    - symmetric percentage or absolute
    - asymmetric (`never under, up to 5% over` is common in food)
    - stepped by order size, where small orders need looser proportional limits

    So `tolerance` is its own small typed entity rather than a column on
    `order_line`, and which one applies is resolved the same way `allocation_policy`
    is (D13). This keeps the environment and the product each able to express what
    they actually need, without a tolerance column sprouting on five tables.
    Consistent with D20: the capability exists where it is needed and is invisible
    where it is not.
56. **Does an inter-company movement generate documents automatically?** D20 says
    crossing `legal_entity` is a sale. Whether we raise the corresponding order,
    purchase order and invoice, or merely flag it for the finance system, decides
    how far this project reaches into accounting.
57. ~~Is `party` one table or several?~~ Settled by D32: one `party` for
    identity, `party_role` for what a company is to us. Roles are not exclusive,
    so neither a discriminator nor separate tables can represent a carrier that
    also invoices. ~~Modelled as one with a `kind`, which is
    the generic-document-model smell the project has otherwise avoided. The
    counter-argument is that a customer can also be a supplier and the same
    carrier can be both — real overlap that separate tables handle badly.
    Worth revisiting before it is built.

Raised by D24 (adopted 2026-08-01):

89. ~~Does a failed container scan need an `activity_event`?~~ Settled by D28:
    **yes for resolution failures, never for decode failures** — the latter are
    not observable on the hardware. `scan_ok` deleted.
90. ~~What mints a package at receipt when the supplier sends no SSCC?~~ Settled
    by D29: **nothing**. Goods land at a dock location; three minting triggers,
    all ours; internal licence plates, never SSCCs.
91. ~~When does the reaper run, and what is "unreferenced"?~~ Settled by D30:
    exactly one FK in every state, and `stock.id` is a handle rather than an
    archival key — a rule the model already obeyed in four places.
92. ~~Is `depth <= 2` enforced on write or on projection?~~ Settled 2026-08-01:
    neither. It cannot be a CHECK on a projection without making the log
    unprojectable, so it is a finding (`nesting_too_deep`) with a fixed three-hop
    fold returning NULL beyond. See D24.

Raised by D22 (adopted 2026-08-01):

93. **The eleven per-kind precedence orderings are undocumented.** Eleven
    orderings of six dimensions, declared in a Rust const. Counterparty over
    product for shelf life, product over space for putaway — both defensible,
    neither obvious, and a manager who assumes wrong misconfigures confidently.
    Each needs a written justification, not just a declaration.
94. **S23 — "no resolver call inside a loop" — is probably not enforceable** as an
    AST check in Rust, with closures, iterator chains and helper functions in
    play. Worth having, but the batch-first interface shape is doing the real
    work and should not be assumed redundant.
95. **`affected_resolution_count` is computed before a taxonomy move — against
    what?** Active bindings is cheap; actual future resolutions is unbounded. It
    needs a defined denominator or the number is theatre.
96. **Does `metric` want a hierarchy?** It is the only flat scope dimension. "All
    temperature metrics" is a plausible near-term ask, and adding a tree later
    changes existing depth vectors — the same class of hazard as q78.

Raised by D23 (adopted 2026-08-01):

97. **`observable` has ten arms and one partial unique index each, and it grows
    monotonically with the domain.** The discriminated-union rule licenses it, but
    the growth path should be acknowledged: at what count does the CHECK and the
    index set stop being reasonable? Probably never in practice, but it should be
    a noticed threshold rather than a surprise.
98. **`observation` denormalises five columns** (`observable_id`, `observed_at`,
    `metric_id`, `result_kind`, `dimension_id`) from its event and metric, with
    composite FKs enforcing agreement. That is the price of database-enforced type
    safety on the typed value columns, and it is roughly 40 bytes a row on the
    second-largest table. Deliberate, but worth measuring before it is 10⁷ rows.
99. ~~`device` is referenced by adopted decisions and defined by none.~~ Settled
    by D27: one table, two roles, calibration as an append-only fact.
100. **Does `metric.applies_to` belong in data?** It constrains which `observable`
    arms a metric is legal against — arguably a type rule, which D23's own
    reasoning would put in code. It reads as the one place the vocabulary/type
    line is blurred.

Raised by D25 (adopted 2026-08-01):

101. ~~What is the idempotency retention window?~~ Settled by D31: derived, not
    chosen. `client_event` lives as long as the facts referencing it, and the
    "never partitioned" premise was wrong. ~~`client_event` is the one
    table that can never be partitioned — partitioning it would reintroduce
    the exact per-partition-uniqueness bug it exists to prevent. It takes a row
    per fact-producing act, forever, and nothing says when rows may go. If a
    handheld can be offline for a week the window is a week; if the answer is
    "forever", that is an unbounded unpartitionable table and it should be a
    decision rather than a discovery.
102. *(Answered for the compiler by D26: ownership, `FORCE ROW LEVEL SECURITY`,
    its own audit. Still open for the projection maintainer itself.)*
    **Who may write a `@projection` column during a rebuild?** The maintainer
    role has grants the application role does not, so the rebuild path is the one
    place the guard is deliberately open. It needs the same `FORCE ROW LEVEL
    SECURITY` treatment and its own audit, or it becomes the way around every
    other rule here.

Raised by D21 (adopted 2026-08-01):

103. ~~Rule 3's positive half has no target.~~ Settled by D24 (supply side):
    assertions project into `expected_supply`, and rule 3 is narrowed in writing
    rather than stretched. ~~Assertions must never project into
    `stock` or commitment, which is settled — but where they *do* project depends
    on D24's supply-side (`expected_supply`), which is not adopted. Until it is,
    an ASN informs nothing downstream, which makes cross-dock and pre-receipt
    allocation unreachable rather than merely unbuilt.
104. **`assertion_check` holds a third copy of both values.** The asserted value
    is an observation, the observed value is an observation, and the check
    denormalises both. Justified — a comparison must be immutable and
    self-contained for a dispute, same argument as
    `goods_receipt_line.expected_quantity` — but it is a third copy and should be
    a noticed cost.
105. **What is `automation_key`?** D11 is extended to machine actors on
    assertion-ingestion facts, but nothing says whether an automation key is a
    row in a table, a config value, or a service identity. Accountability under
    D8 reaches a person; it needs to reach *something* auditable here. *(D27
    narrows it: an automation key is **who**, a device is **how**, and they are
    orthogonal — so it is not solved by pointing it at `device`.)*

Raised by D24 (supply side), adopted 2026-08-01:

106. ~~Does `fulfilment_line` get a maintained `allocated_quantity`?~~ Settled:
    **yes**, with a generated `uncovered_quantity` and a partial index. Justified
    by symmetry with D12's supply-side fold rather than as an exception to it.
107. ~~Does title change while in transit, and do we need to record it?~~
    Settled: **out of scope, with the boundary stated** — we model custody and
    allocatable ownership; legal title timing belongs to the finance system. The
    rebuildability concern was misplaced: `owner_id` is a projection of the source
    line describing the arrival state, now marked as such. See D24 (supply side).
108. ~~Are intermediate re-points reconstructable?~~ Settled: **first, last and a
    volatility counter now; the full path deferred with a trigger.** PO
    provenance comes from containment rather than allocation history, promise
    slippage from findings, and auditing an automated re-allocator wants a
    `planner_decision` fact — not an event log for intentions. See D24 (supply
    side).
109. ~~Multi-PO ASN — in or out?~~ Settled: **in, and already supported.** The
    X12 ORDER hierarchy level partitions advised content by PO, so a content line
    names exactly one PO line and the scalar FK is correct. Recorded as an
    omission on a misreading. See D24 (supply side).

Raised by D26 (adopted 2026-08-01):

110. **What is the materialisation authority?** The compiler role owns generated
    tables and runs DDL from tenant-supplied declarations. Who may *invoke* it —
    the tenant directly, an operator approval step, or a signed plugin bundle —
    is a product decision with a privilege-escalation surface behind it.
111. **Do the ceilings need enforcement, or only assertion?** 50 schemes and 60
    fields are declared numbers checked by a job. A tenant hitting the ceiling
    mid-declaration needs a defined behaviour, and "the job complains tomorrow"
    is not one.

Raised by D28 (adopted 2026-08-02):

114. ~~`client_event` retention is now the binding constraint.~~ Settled by D31:
    the volume is unremarkable and the retention is derived. ~~Original:~~ D28 avoided
    7–18M rows/year/site by deleting `scan_ok`, but migration imports still put
    30–60k rows per tenant in on day one, and `client_event` is the only table
    with no range-drop exit. Question 101 is promoted: answer it with the
    partitioning plan, not separately.
115. ~~Retention floors are a class the invariant register cannot check.~~
    Settled by D31: a floor is a declared row with a named authority, and the
    assertion is that live data or the archive manifest reaches it. ~~Original:~~ A
    duplicate-identifier guard needs N months of history; drop a partition and
    the check *silently starts passing*. Fold invariants detect source deletion
    because the projection stops matching; an **existence predicate** has no
    projection to compare against, so after a truncation both sides agree and
    nothing fails. Retention floors must be declared and asserted separately.

*All decisions D1–D32 are now adopted. The proposals in
[mechanism-design.md](./mechanism-design.md), [inbound-analysis.md](./inbound-analysis.md)
and [supply-side-design.md](./supply-side-design.md) are superseded by this
document where they disagree; their open questions (73–88) remain there as
working notes.*
