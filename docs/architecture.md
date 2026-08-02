# Warehouse platform: architecture

## What it is

A warehouse management system for a distributor of food safety products (gloves,
hair nets, protective equipment) running several sites across Australia, built to
replace Oracle NetSuite. Rust and PostgreSQL on the server, React on the client,
Tauri on the handhelds. Multi-tenant from the first migration, because it is
intended to become a product.

The business it serves does not handle perishables. The model handles them
regardless, deliberately. Lot tracking, expiry, rotation policy, catch weight and
third-party stock are all built and all default to off. A distributor of gloves
never encounters any of it. A distributor of chilled goods enables it per item,
without a migration and without reopening the core.

That breadth rests on one decision, covered below: capability is a property of the
data rather than a mode the system runs in. It is the difference between a
platform that grows into new industries and one that has to be forked for each.

The work it replaces is packing and despatching several hundred orders a day. That
process spans two systems and about a dozen screens. Most of it is navigation
rather than judgement. The operator already knows what to do and spends the time
telling the software about it.

## The premise

Most warehouse systems treat the database as the authority and the floor as a
source of errors to be validated. This one inverts that.

A scanner in someone's hand observes physical reality. The database only models
it. When the two disagree the scanner is usually right, and a system that rejects
the scan to protect its own consistency has discarded the more reliable of the
two.

Three things follow, and most of the design sits downstream of them.

Scans are facts rather than requests. A pick is recorded as something that
happened at a place and time, not as a transaction awaiting approval. The movement
ledger is append-only and every entry carries a client-assigned identifier, which
makes it an operation-based CRDT. Replaying an entry does nothing and arrival
order does not matter, so a network dropout degrades into late arrivals instead of
into a separate offline mode with its own code path.

Convergence is not correctness, and the gap is accepted. Two pickers taking the
last unit drive the balance to minus one. That is allowed. Rejecting the second
pick would discard a true observation to protect a database invariant, and the
unit is gone either way.

Disagreement is the most valuable output. A negative balance means something
physical happened that nobody recorded: stock damaged and not reported, a delivery
that never arrived, a mislabelled pallet. Competing systems treat these as
adjustments to be reconciled away. Here they are findings, with an owner, evidence
and a resolution, and they escalate to a ticket so a manager can investigate
without stopping the floor.

That is why accountability is a schema requirement rather than a feature. Every
movement and every scan names an individual person, the device used, and both the
device clock and the server clock. A crew name in place of a person makes the
whole apparatus decorative, because an investigation cannot be followed up with
"Casual Melbourne".

## Four kinds of thing

Every table sits on two axes. The first says where a row's authority comes from.

| Category | Meaning | Rules |
|---|---|---|
| Fact | What happened | Append-only, immutable, projects to current state |
| Intention | What is planned | Mutable, cancellable, reconciled against facts |
| Assertion | What a counterparty stated | Immutable, names its author, never reaches a balance |
| Finding | Where two of those disagree | The output, not the failure mode |

The second axis says how a table is read and who may write it: reference,
projection, policy, or grouping.

The second axis is what keeps the first one closed. A goods receipt looks like a
fifth kind of thing, and so does a stock balance, and so does a policy table.
None of them is. They are the same four categories seen through a role, and once
roles have names the provenance list stops growing.

Assertions are the least obvious of the four and the most useful. A supplier's
despatch advice is not a fact, because nothing here observed it. It is not an
intention either, because nothing here planned it and nothing here can cancel it.
It is a claim, and the property that generates every rule about it is not
authorship but that a copy exists outside this system's control. An outbound
advice is exactly as unrevisable, so the category is symmetric and costs one
column.

## The spine

Two append-only tables carry everything.

`stock_movement` records that a quantity of an item changed hands: a different
location, container, lot, condition or owner. Movements are two-sided, folding a
negative into one cell and a positive into another. Stock on hand is a projection
of that fold, maintained in the same transaction, rebuildable from the ledger, and
checked by a job that asserts the two agree.

`observation` records that something was measured, with its source, its confidence
and both clocks. Dimensions, weights, temperatures, quality grades, carrier
arrival estimates and supplier-declared quantities all use it. The subject is a
foreign key into a registry rather than a type column on the fact, so the set of
observable things grows without touching a table holding tens of millions of rows.

That second table is the interoperability answer. The same fact arriving over EDI,
a supplier portal, a spreadsheet, a dock scale or a keyboard produces rows that
are byte-identical in their content columns and differ only in provenance. A test
enforces it, one fixture per channel, so a new adapter that needs a column the
others lack fails on the day it is written.

Nothing writes to a projection directly. Column-level grants enforce that rather
than convention, so "nothing writes to stock" is a property Postgres holds instead
of a sentence in a document.

## The parts worth arguing about

### Containment is part of the stock key

A pallet is a container, and stock sits either at a location or inside a
container, never both. Moving a pallet of forty cartons writes one event rather
than forty movements. Forty movements would assert forty inspections that nobody
performed, and the ledger's value is that every row is work someone actually did.

The rule deciding which fact to write is stated by subject rather than by intent,
because "custody changed" is undecidable: a carton is both a holder and a thing
with a holder. A movement records a stock cell's key changing. An event records a
container's placement changing. They cannot both apply, and neither can be
skipped.

### Policy is data, logic is code

Eight things want the same most-specific-wins resolution: allocation weights,
tolerances, shelf life, putaway scoring, receiving defaults, quality sampling,
audit tiering and over-receipt limits. They share one resolver over a lattice of
scope dimensions, and a manager owns the weights.

The line between configuration and a rules engine is a grep rather than a
judgement. A row may hold a scope identifier, a period and a typed number. A row
may never hold the name of a field, the name of an operator, a comparison, or an
ordering of steps. A table with a column whose value is a column name is a rules
engine, and this design excludes one.

### Rotation policy is not baked in

Rotation against travel cost is a business decision that varies by product and by
situation, and most of the current catalogue has no rotation requirement at all.
Taking the next best thing from another bay at ground level is often right. The
same substitution is a different call when it needs a forklift to bring a pallet
down. The model holds expiry, distance and access cost, the allocator scores over
them, and a manager sets the weights. A flexible model can always become strict. A
strict one cannot become flexible without surgery.

### Capability is a property of the data

This is the decision the breadth rests on. Lot tracking, catch weight,
third-party stock and multiple legal entities are properties of an item or a
site, and they default to off. An operation that needs none of them configures
nothing and never meets the machinery. There is no settings screen where enabling
something changes how the whole system behaves.

A global mode per feature is what forces a vendor to maintain separate builds for
separate industries. Here a single item can be lot-tracked and rotation-managed
while everything beside it on the shelf is neither, so one deployment serves a PPE
distributor and a chilled food operation without either paying for the other's
requirements.

### Extensibility compiles to real columns

A tenant declares a typed field set and gets a real table with real types,
constraints, foreign keys and indexes. It is a code generator whose input happens
to live in a row.

The usual argument against custom fields is that adding a column is cheap. That
holds for a single-tenant system and stops holding for a product, where the party
who needs the column and the party who can add it are different. The objection was
never about columns. It is about deferring type decisions to runtime, and that
part still stands.

## What it does that NetSuite cannot

These are consequences of the model rather than features bolted onto it.

It can say what is physically in a carton. Packages are real rows and their
contents join back to order lines, so a packing list is per package, a damage
claim names the package the item was in, and a declared weight can be checked
against its contents before a carrier bills for the difference. NetSuite holds one
line per product type with no package count, so that number exists nowhere until
an operator types it into the freight system.

It can say where freight went and what it cost. Carrier and freight provider are
separate, so Swift reached through MachShip today and Swift reached directly
tomorrow are the same carrier, and cost per carrier spans the migration.

It can say which of its own records are wrong. Every dimension carries how it was
obtained and how well it has held up. Carrier re-weigh figures return as
observations authored by the carrier, so comparing the prediction against the
invoice is a query. It finds bad data and what that data costs.

It can say what a supplier actually did. An advice is kept as sent, and the
receipt compares against it line by line. Because the original claim is never
overwritten, supplier promise accuracy stays answerable afterwards, which is the
thing every system that depletes the original quantity gives up.

## Deliberate exclusions

Recorded as decisions rather than gaps: a rules engine, an
entity-attribute-value store, a generic document model, a workflow designer,
configurable mobile screens, three-way match and inventory valuation, yard and
dock scheduling, transport execution, unit-level serialised inventory, and
date-qualified available-to-promise.

Two of those warrant an explanation. Available-to-promise is a running minimum
over a forward horizon, and no vendor computes it from row-per-supply storage. It
would need an extra projection hop and an asynchronous projector, and this design
excludes async projectors by name. That is two exceptions rather than one. Yard
management stays out while a vehicle arrival with a gate count stays in, because
Australian grocery contractually requires a signed paper delivery docket carrying
a pallet count, and that is not the yard.

## Current state

Thirty decisions, around fifty-five invariants, no code.

The invariant register is the constraint set the model is checked against. It is
currently prose, and it is intended to be generated from the test suite rather
than maintained beside it, so that a constraint and its check cannot disagree.

Three things want settling as the first migration is written rather than before
it. How long client event records are kept, since that table cannot be partitioned
and every fact references it. Who owns projections and who may write them during a
rebuild. Where the schema compiler's privileges sit. Everything else is deferred
against a stated trigger.

## Reading further

- [domain-model.md](./domain-model.md), the decision record from D1 to D30
- [order-fulfilment-process.md](./order-fulfilment-process.md), the process being
  replaced, as it runs today
- [warehouse-data-model.md](./warehouse-data-model.md), the shared data layer and
  the features that sit on it
- [competitor-analysis.md](./competitor-analysis.md),
  [inbound-analysis.md](./inbound-analysis.md) and
  [supply-side-design.md](./supply-side-design.md), the supporting research
