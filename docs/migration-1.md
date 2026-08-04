# Migration 1: what has to be in it

An audit of the inbound analysis's tier-0 list, *"cheap now, ruinous later, do
before any inbound code"*, against the decisions adopted since it was written
(D21 to D44).

> **Derived, not authoritative.** [domain-model.md](./domain-model.md),
> [invariants.md](./invariants.md) and [open-questions.md](./open-questions.md)
> are the registers. This is a working list for sequencing the first migration
> and it goes stale the moment a decision lands. Re-derive it rather than trust
> it.

Generated 2026-08-04. Method: each of the eleven items checked by name against
the decision record, with the adopting decision cited or its absence recorded.

---

## The count

Six settled, one obsolete, four outstanding. Two prerequisites the list never had.

The four outstanding are the whole point of the exercise, because each one is
unrecoverable rather than merely inconvenient: the column has to exist before the
first row is written or the history it would have carried is gone.

---

## Settled since the list was written

**2. `stock_movement.from_owner_id` / `to_owner_id`.** Adopted in D24 (supply
side)'s `stock_movement` block, with a CHECK pairing status and owner. This was
the sharpest defect the inbound pass found, D20 having broken D12's invariant in
passing, and it is closed.

**3. `goods_receipt`'s demand CHECK, widened, with demand on the line.** S3 forces
`<= 1` on every grouping table and names this as the case that caught
D16-repeats-D10. D44 widened the header source set to four and added
`inbound_shipment_id`. The line reaches its own demand through `expected_supply`,
which J26 folds received quantity across.

**5. `item_barcode` and the shared unit vocabulary.** D34 defines `item_barcode`
with the exclusion constraint doing three jobs; D23 owns the unit vocabulary and
D34 names it as the consumer.

**6. `item_class`.** D22's prerequisites section defines `item_class` and
`party_class` as per-tenant rooted trees with closure-table projections, plus
`item_classification` as an association table keyed
`PRIMARY KEY (tenant_id, item_id)` so single parentage is preserved and D19's
thin shared item survives. The list's complaint that two decisions referenced it
and nothing defined it is no longer true.

**8. `number_range`.** D29 defines it scoped to the issuing legal entity, with an
explicit row per extension digit, `sscc_allocation` as the append-only fact, J35
as the reuse guard and D31 carrying the twelve-month floor. D44 records that the
same table needs a pool arm before it can issue GTINs, which is a later problem.

**9. The `stock` index, corrected on the way through.** D24 (supply side) says it
directly: *"Inbound Tier-0 asked for `stock(location_id, item_id)`. It must be
`stock(resolved_location_id, item_id)`"*, because on `holder_location_id` the
index misses everything sitting inside a package. The tier-0 item was right that
an index was needed and wrong about which one.

## Obsolete

**1. `package_content` gains `item_id` and typed demand FKs.** The list called
this *"the migration nobody wants"* and urged doing it while the table had no
history. It is moot: **D24 retired `package_content` as a base table**. It is now
a view over `stock`, and D6's containment columns were demoted to projections.

Worth pausing on, because it is the most interesting result here. The single most
expensive item on the list was not performed early, it was dissolved by getting
the model right. A structural fix removed the migration instead of scheduling it.

## Outstanding, and each one loses history if skipped

**4. `entered_quantity`, `entered_unit` and `item_packing_config_id` on
`goods_receipt_line` and `stock_movement`.** The idiom exists elsewhere, on catch
weight and on `asserted_unit_content`, but neither table the list names carries it
in an adopted block. The `item_packing_config_id` half is the one that bites:
without the FK, correcting a case pack silently rewrites what every historical
receipt meant. D23 already versions `item_packing_config` by `effective_from` for
exactly this reason, so the column is the other half of a mechanism that is
otherwise half-built.

**7. `lot.country_of_origin` and `lot.production_date`.** Zero mentions in the
decision record. Not backfillable, because nobody can reconstruct where a lot came
from after the pallet has gone. The GS1 pass strengthened the case: Coles requires
country of origin on every master carton, and the inbound analysis established
that it belongs on `lot` rather than `item` because it varies lot to lot for food.

**10. `stock_movement.unit_cost_minor`.** Still deferred, and deliberately. D44
names it while parking price, and question 127 now carries the boundary with D40.
This one is genuinely blocked rather than merely undone, but note what it costs:
history written before the decision has no cost on it, so the deferral has a
running price.

**11. `promised_from`, `promised_to` and `required_by` on `order` and
`order_line`.** Absent. `required_by` exists on `transfer_order` and nowhere else,
so lateness is undetectable on the customer side. D42 amended `order` without
adding them and D44 added `supersedes_order_id` without revisiting them.

## Two prerequisites the list never had

**`zone` becomes a real table.** D22's prerequisites: `zone(id, site_id, code, …)`
with `location.zone_id`, *"not a bare column, the Space dimension needs something
to FK to and a depth to read"*. The policy lattice does not work without it, and
it is cheaper in migration 1 than as a later split of a text column.

**~~`goods_receipt_line` has no adopted DDL anywhere.~~ Settled by D45.** Three
decisions depended on its columns while none defined it, which is where
`item_barcode` sat before D34 and `device` before D27.

Defining it found a defect rather than merely filling a gap. J26 folded
`expected_supply.quantity_received` across `goods_receipt_line` rows, and the
table carries no quantity, so the invariant named the right relationship over the
wrong table and could not have run. It now folds `stock_movement`. The line also
takes a single `expected_supply_id` in place of the inbound sketch's two arms,
which predated `expected_supply` and would have rebuilt its union one level down.

---

## Suggested order

1. **`zone`, `item_class`, `item_classification`.** Reference data with no
   dependencies, and the policy lattice needs them.
2. ~~**Define `goods_receipt_line`.**~~ Done, D45.
3. **The four outstanding column sets**, of which three can land immediately and
   `unit_cost_minor` waits on 127.
4. **The structural invariants.** Thirty-six of the eighty-five need no data and
   run against the empty schema, so they can be written alongside the migration
   and fail honestly until it exists.

Only after those does anything read or write rows worth keeping.

## What this does not cover

Sequencing beyond the first migration, the packing screen, and the seeded year of
history that question 122 wants. Those are unblocked by this work rather than part
of it.
