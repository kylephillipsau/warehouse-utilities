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

## Open questions

1. ~~Lot/batch and expiry~~ — settled by D14. Still needs confirming whether food
   and FEFO are actually in scope, since that decides whether `tracking = lot` is
   the default or the exception.
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

17. ~~How does a movement reference its cause?~~ Settled by D10: typed FKs.
18. ~~Does `actor_id` mean who did it or who is accountable?~~ Settled by D11:
    `recorded_by_id`, `work_session_id` and `authorised_by_id` are separate.
19. ~~What is the tolerance policy?~~ Settled by D9: operator-configurable, not
    hard-coded, with point-of-capture challenge as the primary mechanism.

Raised by D9–D11:

20. **Does `measurement` get typed subject FKs too (D10)?** Consistency says yes.
    The counter-argument is that `measurement` is append-only reference data on a
    cold path, where the batch-loading argument does not apply — so this may be
    a case where the polymorphic pair genuinely costs nothing.
21. **Who configures tolerances, and at what grain?** Per item, item class, site,
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
25. **When are allocations released?** Explicit release on cancellation is
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
30. **Who may change an `allocation_policy`, and is the change audited?** These
    weights directly affect spoilage and labour cost. Per D8's spirit, a policy
    change is exactly the kind of thing you want to correlate against a later
    change in findings — which argues for policy edits being facts too.

Raised by D14:

31. **How is `tracking = lot` enforced?** A CHECK cannot reach from
    `stock_movement.lot_id` to `item.tracking`. Options are application-level
    validation plus a periodic assertion (consistent with how `stock` is already
    reconciled), or a trigger. The first fits the existing pattern; the second is
    stricter. Worth deciding once, since putaway, receiving and adjustment all
    need the same rule.
32. **Can a lot exist before its goods arrive?** Supplier ASNs name lots ahead of
    delivery. If yes, `lot` is created by inbound rather than by the first
    movement, and `received_at` becomes nullable — which is fine, but it means
    lots can exist with no stock, and expiry reporting must not count them.
33. **Is `min_shelf_life` per customer, or per customer *and* item?** Modelled on
    the customer. A single retailer often has different requirements by category,
    which would push it to a customer-item-class pair.
34. **What happens to allocations when a lot is held?** D14 says they become
    findings. But should the system also auto-release them so the demand
    re-allocates to good stock, or wait for a human? Auto-release is convenient
    and quietly discards the evidence of what the plan had been.
