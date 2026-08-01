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
  challenged, challenge_context, confirmed        -- D9, generalised
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
- **D9** — `challenged`/`challenge_context`/`confirmed` promoted to
  `observation_event`; **`stock_count` loses its copies**. One mechanism, and the
  policy deciding *when* to challenge is `count_tolerance_policy` (D22).
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

## Open questions

1. ~~Lot/batch and expiry~~ — settled by D14. Still needs confirming whether food
   and FEFO are actually in scope, since that decides whether `tracking = lot` is
   the default or the exception.
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

38. **Does a transfer's receipt reconcile against its despatch automatically?**
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
40. **Can a transfer be allocated before it arrives?** Committing inbound stock to
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
44. **Are `activity_event` kinds an enum or a table?** An enum is honest and
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
53. **Are carriers and `package_type` shared too?** A carrier looks intrinsic —
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
57. **Is `party` one table or several?** Modelled as one with a `kind`, which is
    the generic-document-model smell the project has otherwise avoided. The
    counter-argument is that a customer can also be a supplier and the same
    carrier can be both — real overlap that separate tables handle badly.
    Worth revisiting before it is built.

Raised by D24 (adopted 2026-08-01):

89. **Does a failed container scan need an `activity_event`?** A carton scanned
    onto the wrong pallet and corrected leaves a `containment_conflict` finding,
    but a scan that resolved to nothing leaves no trace at all. D17's
    `location_empty` reasoning applies verbatim.
90. **What mints a package at receipt when the supplier sends no SSCC?** We
    generate one so the stock has a holder — but D24 says minting is a policy, so
    the default for an unlabelled pallet needs stating rather than defaulting to
    one-per-carton by accident.
91. **When does the reaper run, and what is "unreferenced"?** D24 makes dead cells
    reapable. `stock_allocation.stock_id` is the obvious reference; historical
    reporting that joins `stock.id` is the non-obvious one. If anything holds a
    `stock_id` long-term, reaping breaks it.
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
99. **`device` is now referenced by four adopted decisions and defined by none.**
    D5, D11, D23 and D24 all name `device_id`. It is where an instrument's
    calibration date and approval number live, and a billing dispute becomes a
    question about the instrument. Inbound Tier-0 flagged it; it is now blocking.
100. **Does `metric.applies_to` belong in data?** It constrains which `observable`
    arms a metric is legal against — arguably a type rule, which D23's own
    reasoning would put in code. It reads as the one place the vocabulary/type
    line is blurred.

*Numbering note: D21, D25 and D26 remain proposed in
[mechanism-design.md](./mechanism-design.md) and are not adopted. Their open
questions (73–88) live there until they are.*
