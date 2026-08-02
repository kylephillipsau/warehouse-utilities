# Warehouse platform: architecture

A design overview for someone reading it cold. The full decision record is in
[domain-model.md](./domain-model.md). This document covers the shape of the system
and the reasoning behind the parts that are unusual.

## What it is

A warehouse management system for a food distributor running several sites across
Australia, built to replace Oracle NetSuite. Rust and PostgreSQL on the server,
React on the client, Tauri on the handhelds. Multi-tenant from the first migration,
because it is meant to become a product.

The work it replaces is packing and despatching several hundred orders a day. That
process currently spans two systems and about a dozen screens. Most of it is
navigation rather than judgement. The operator already knows what to do and spends
their time telling the software about it.

## The bet

Most warehouse systems treat the database as the authority and the floor as a
source of errors to be validated. This one inverts that.

A scanner in someone's hand is observing physical reality. The database is only a
model of it. When the two disagree the scanner is usually right, and a system that
rejects the scan to protect its own consistency has discarded the more reliable of
the two.

Three things follow, and most of the design sits downstream of them.

Scans are facts rather than requests. A pick is recorded as something that
happened at a place and time, not as a transaction awaiting approval. The movement
ledger is append-only and every entry carries a client-assigned identifier, which
makes it an operation-based CRDT. Replaying an entry does nothing and arrival
order does not matter, so a network dropout degrades into late arrivals instead of
into a separate offline mode with its own code path.

Convergence is not correctness, and we accept the gap. Two pickers taking the last
unit will drive the balance to minus one. We allow it. Rejecting the second pick
would discard a true observation to protect a database invariant, and the unit is
gone either way.

Disagreement is the most valuable thing the system produces. A negative balance
means something physical happened that nobody recorded: stock damaged and not
reported, a delivery that never arrived, a mislabelled pallet. Competitors treat
these as adjustments to be reconciled away. Here they are findings, with an owner,
evidence and a resolution, and they escalate to a ticket so a manager can
investigate without stopping the floor.

That last point is why accountability is a schema requirement rather than a
feature. Every movement and every scan names an individual person, the device they
used, and both the device clock and the server clock. Recording a crew name
instead of a person makes the whole apparatus decorative, because you cannot
follow up an investigation with "Casual Melbourne".

## Four kinds of thing

Every table sits on two axes. The first says where a row's authority comes from.

| Category | Meaning | Rules |
|---|---|---|
| Fact | What happened | Append-only, immutable, projects to current state |
| Intention | What we plan | Mutable, cancellable, reconciled against facts |
| Assertion | What a counterparty stated | Immutable, names its author, never reaches a balance |
| Finding | Where two of those disagree | The output, not the failure mode |

The second axis says how a table is read and who may write it: reference,
projection, policy, or grouping.

This began as one axis with two values and grew to three before anyone noticed
that the growth was itself the symptom. A goods receipt kept looking like a fifth
kind of thing. So did a stock balance, and so did a policy table. None of them is
a new kind of thing. They are the same four seen through a role that had no name.
The first axis has not moved since the second one was added.

Assertions are the least obvious of the four and the most useful. A supplier's
despatch advice is not a fact, because we did not observe it. It is not an
intention, because we did not plan it and cannot cancel it. It is a claim, and the
property that generates every rule about it is not who wrote it but that a copy
exists outside our control. Our own outbound advice is exactly as unrevisable, so
the category is symmetric and costs one column.

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
things we can observe grows without touching a table holding tens of millions of
rows.

That second table is the interoperability answer. The same fact arriving over EDI,
a supplier portal, a spreadsheet, a dock scale or a keyboard produces rows that
are byte-identical in their content columns and differ only in provenance. There
is a test for it, one fixture per channel, and a new adapter that needs a column
the others lack fails on the day someone writes it.

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
because "custody changed" turned out to be undecidable. A carton is both a holder
and a thing with a holder. A movement records a stock cell's key changing. An
event records a container's placement changing. They cannot both apply, and
neither can be skipped.

### Policy is data, logic is code

Eight things wanted the same most-specific-wins resolution: allocation weights,
tolerances, shelf life, putaway scoring, receiving defaults, quality sampling,
audit tiering and over-receipt limits. They share one resolver over a lattice of
scope dimensions, and a manager owns the weights.

The line between configuration and a rules engine is a grep rather than a
judgement. A row may hold a scope identifier, a period and a typed number. A row
may never hold the name of a field, the name of an operator, a comparison, or an
ordering of steps. Once a table has a column whose value is a column name, we have
built the rules engine we refused. The first draft of that rule failed its own
check.

### Rotation policy is not baked in

FEFO against travel cost is a business decision that varies by product and by
situation. Grabbing the next best thing from another bay at ground level is often
right. The same substitution is a different call when it needs a forklift to bring
a pallet down. The model holds expiry, distance and access cost, the allocator
scores over them, and a manager sets the weights. A flexible model can always
become strict. A strict one cannot become flexible without surgery.

### Capability is a property of the data

Lot tracking, catch weight, third-party stock and multiple legal entities are
properties of an item or a site, and they default to off. An operation that needs
none of them configures nothing and never meets the machinery. There is no
settings screen where enabling something changes how the whole system behaves.

### Extensibility compiles to real columns

A tenant can declare a typed field set and get a real table with real types,
constraints, foreign keys and indexes. It is a code generator whose input happens
to live in a row.

This is the one place a principle was reversed. The original refusal of custom
fields rested on "adding a column is cheap", which is true for us and stopped
being universal the moment this became multi-tenant. The refusal was never about
columns. It was about deferring type decisions to runtime, and that part still
holds.

## What it does that NetSuite cannot

These are consequences of the model rather than features bolted onto it.

It can say what is physically in a carton. Packages are real rows and their
contents join back to order lines, so a packing list is per package, a damage
claim names the package the item was in, and a declared weight can be checked
against its contents before a carrier bills us for the difference. NetSuite holds
one line per product type with no package count, so that number exists nowhere
until an operator types it into the freight system.

It can say where freight went and what it cost. Carrier and freight provider are
separate, so Swift reached through MachShip today and Swift reached directly
tomorrow are the same carrier, and cost per carrier spans the migration.

It can say which of our own records are wrong. Every dimension carries how it was
obtained and how well it has held up. Carrier re-weigh figures come back as
observations authored by the carrier, so comparing what we predicted against what
we were billed is a query. It finds bad data and what that data costs.

It can say what a supplier actually did. An advice is kept as sent, and the
receipt compares against it line by line. Because the original claim is never
overwritten, supplier promise accuracy stays answerable afterwards, which is the
thing every system that depletes the original quantity gives up.

## What we deliberately do not build

Named so they are decisions rather than gaps: a rules engine, an
entity-attribute-value store, a generic document model, a workflow designer,
configurable mobile screens, three-way match and inventory valuation, yard and
dock scheduling, transport execution, unit-level serialised inventory, and
date-qualified available-to-promise.

Two of those deserve an explanation. Available-to-promise is a running minimum
over a forward horizon, and no vendor computes it from row-per-supply storage.
Ours would need an extra projection hop and an asynchronous projector, and the
design refuses async projectors by name. That is two exceptions rather than one.
Yard management stays out while a vehicle arrival with a gate count stays in,
because Australian grocery contractually requires a signed paper delivery docket
carrying a pallet count, and that is not the yard.

## Where it stands

Thirty decisions, around fifty-five invariants, no code.

The design has stopped generating new questions. The last three review passes
found defects in the invariants rather than in the model, which is a fair signal
to stop analysing. Five of those invariants encoded the bug they were written to
catch, including one that codified a double-subtraction in the check meant to
prevent it. Every one was found by an outside pass reading the whole document.
None were found by review.

That is the argument for what comes next. The invariant register is the most
productive artefact here and the least trustworthy, and both facts have the same
cause: it is prose. It stops being prose when it becomes the test suite and the
table is generated from it.

Three things want deciding while the first migration is written rather than
before it. How long client event records are kept, since that table cannot be
partitioned and every fact references it. Who owns projections and who may write
them during a rebuild. Where the schema compiler's privileges sit. Everything else
is deferred with a stated trigger.

## Reading further

- [domain-model.md](./domain-model.md), the decision record from D1 to D30, with
  the reasoning and what each one rejected
- [order-fulfilment-process.md](./order-fulfilment-process.md), the process being
  replaced, as it runs today
- [warehouse-data-model.md](./warehouse-data-model.md), the shared data layer and
  the features that sit on it
- [competitor-analysis.md](./competitor-analysis.md),
  [inbound-analysis.md](./inbound-analysis.md) and
  [supply-side-design.md](./supply-side-design.md), the research the decisions
  rest on
