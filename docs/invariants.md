# Invariant register

Every rule the design must always satisfy, in one place. Before this file existed
they lived in four documents with a hand-allocated numbering scheme that had
collided once, and the current text of some entries required reading two of them.

**The rule that keeps it true:** an invariant stated in a decision's amendments
is added here in the same commit that adopts the decision. A decision may state
an invariant; it does not own the numbering. Where a decision's text and this
register disagree, this register wins.

**What this becomes.** Today this file is written by hand and the numbers are
allocated here. That is a stopgap and it is the thing that already failed once.
Once the backend exists, each entry is a test carrying its own metadata, this
file is generated from the suite, and CI fails when the generated file differs
from the committed one. The identifier is then a constant in code, so allocating
the same number twice stops being a mistake anyone can make and becomes a
compile error. That is the same bidirectional-diff mechanism D25 already uses for
`@projection` columns, applied to itself.

Each entry carries a `status`. All of them are currently `specified`, meaning
stated and reasoned about with no test behind it. The count of `specified`
entries is a number that can only go down, and it is a more honest measure of
progress than the count of decisions.

---

## Classes

**Structural (S)** is checked against `information_schema` and `pg_catalog` in
CI. It needs no data. A failure blocks a deploy.

**Job-asserted (J)** is checked by the rebuild-and-assert cycle against real
data. A failure raises a `discrepancy`, never an error, so the model's
self-consistency lands in the same queue as every other finding and never stops
the floor.

## The vacuity column

Marked entries assert an **absence**: zero rows match, no column is named this,
no such thing exists. Every one of them **passes when its population is empty**,
so truncating a source, dropping a partition or simply not having built the
feature yet makes the check quietly start succeeding.

Fold invariants do not have this property. Delete half of `stock_movement` and
J1 fails, because the projection stops matching its source. That asymmetry was
first noticed for one case, the SSCC reuse guard, and it is general: **an
anti-join is only as strong as the assertion that its population is non-empty and
reaches back far enough.**

Marked entries need a companion population assertion. S34 is the general one for
history depth. The rest are named per entry as they are implemented, and an entry
marked here that reaches `implemented` without one is a lie the suite tells
itself.

---

## Structural

| # | Invariant | Owner | Assertion | Vacuity |
|---|---|---|---|---|
| S1 | Every `stock` key column except `tenant_id` and `item_id` appears on `stock_movement` as a `from_`/`to_` pair, under an explicit name map | D4, D12, D20, D24 | Catalogue diff. **Caught D20-broke-D12 and the undetected `lot_id` twin** | |
| S2 | Every table naming a stock cell carries **the complete column set**. The "or FK to `stock.id`" disjunction is removed: under a reapable `stock` the two are not equivalent | D24, Q91 | Catalogue diff over a declared list | |
| S3 | Every demand/cause CHECK on a grouping table is `<= 1`, never `= 1` | D10 corrected, D16 | Grep `pg_constraint`. **Caught D16-repeats-D10** | ● |
| S4 | Every table registers exactly one provenance and one role, and the registry covers `information_schema.tables`, sourced from code and from `record_scheme` | D21, D26 | Bidirectional diff | |
| S5 | Every `@projection` column has UPDATE revoked from the app role and a registered rebuild function; every rebuild function names a live column | D25 | `column_privileges` + bidirectional registry diff | |
| S6 | Every fact table has no UPDATE and no DELETE granted to the app role | D25 | `role_table_grants`; attempt both, expect failure | |
| S7 | Every trigger maps to a registered projection. No trigger implements rules, validation, defaults or cascades | D25 | `pg_trigger` diff | |
| S8 | Every RLS-protected table with a `SECURITY DEFINER` maintainer has `FORCE ROW LEVEL SECURITY` | D18, D25 | `pg_class.relforcerowsecurity` | |
| S9 | Exactly three RLS shapes exist, selected by category | D19 amended | `pg_policy` | |
| S10 | The model contains **no `jsonb` column** | Principle 3 | `information_schema.columns` | ● |
| S11 | No `policy%`/`%_policy` column has a name in {field, attribute, column, operator, comparator, expression, condition, rule, action, target, sql, script}; the only text columns are `policy_binding.note`, `policy_change.reason`, taxonomy `code`/`name` | D22 | Column-name denylist. **This is D13 made greppable, and it is the check the first draft failed, on `band_axis`** | ● |
| S12 | `policy_binding` has **no** `num_nonnulls` CHECK; its uniqueness is `NULLS NOT DISTINCT` and non-deferrable | D22 | Assert absence and presence | |
| S13 | The `policy_kind` enum, the `%_policy` table set and the Rust `PolicyKind` registry are the same set | D22 | Three-way diff | |
| S14 | Every `%_policy` table has `CHECK (kind = ...)`, the composite FK to `(policy_binding.id, kind)`, and the effective-range exclusion constraint | D22 | Catalogue scan, generated from one template | |
| S15 | Tenancy is index 0 of every kind's `DIMENSIONS` const | D22 | Compiled registry check | |
| S16 | Every consuming column is named `<kind>_policy_id` and is an FK to the value table | D22 | Enumerated register + catalogue | |
| S17 | Every foreign key from a non-assertion table to an assertion table is **nullable**, excluding the assertion mechanism's own tables | D21 | `pg_constraint` ⋈ `attnotnull`. *Scoped: the first draft's version failed on its own `assertion_stance`* | ● |
| S18 | No table in the assertion set has a `status` or `state` column | D21, D25 | Column-name check | ● |
| S19 | Every fact row has a `client_event` FK, and `fact.recorded_by_id` = `client_event.recorded_by_id` where the person arm is set | D5, D11, D25 | Catalogue + anti-join | ● |
| S20 | Every generated `ext_*` table matches its scheme's compiled fields, its `manifest_hash` recomputes, its parent FK is `ON DELETE RESTRICT`, and it has RLS with FORCE | D26 | Drift job | |
| S21 | Every application metric-code literal appears in the reserved seed with `reserved = true, tenant_id IS NULL` | D23 | Grep | ● |
| S22 | No canonical unit has a non-zero offset or a factor other than 1/1 | Principle 5 | Two count-zero queries | ● |
| S23 | No resolver call appears inside a loop | Principle 6, D22 | AST check | ● |
| S24 | `expected_supply` has one partial unique index per provenance arm, and **no** unique index over `(item_id, owner_id, status_id)` | D24 supply side | Catalogue scan | |
| S25 | Availability indexes on `stock` and `expected_supply` both carry `owner_id` and `status_id` in the key; no availability query joins `inventory_status` | D24 supply side | Catalogue + query register | |
| S26 | `expected_supply` carries at most five maintained quantity columns; a sixth requires a recorded decision | D24 supply side | Catalogue count | |
| S27 | The outbox source reference is **never dereferenced**. The rendered bytes in `party_message_id` are the payload | D26 | Query-register grep | ● |
| S28 | Exactly one foreign key in the schema targets `stock(id)`, and it is `stock_allocation.stock_id`, declared `ON DELETE RESTRICT`. `stock_allocation(stock_id)` has a plain btree | D24, Q91 | `pg_constraint` ⋈ declared list; catalogue scan | |
| S29 | `stock` and `package_content` carry neither the attachable nor the subscribable capability flag in the code-side table registry; `projection_check.scope_kind` may not name a stock cell | D26, D25, Q91 | Registry check + enumerated denylist | ● |
| S30 | Projection tables have no **DELETE** granted to the app role. S5 covers UPDATE; S6 covers fact tables | D25, Q91 | `role_table_grants`; attempt, expect failure | |
| S31 | Every identification datum on `activity_event` is a typed column. `activity_event.detail` appears in no `WHERE`, `GROUP BY` or `JOIN` in the query register | Principle 3, Q89 | Query-register grep | ● |
| S32 | `activity_event` is range-partitioned on `occurred_at` with local indexes from the first migration, and carries `tenant_id NOT NULL` and `site_id` | D18/J20, D25, Q89 | Catalogue scan | |
| S33 | No `party.gs1_company_prefix` is all-zero or absent-yet-used; no literal default prefix appears in code; SSCC issuance is gated on an explicit `number_range` row | D20, Q90 | CHECK + grep | ● |
| S34 | For every row in `retention_floor`, either the oldest live partition or the archive index covers back to `now() - minimum_age`. **This is the companion assertion for every vacuity-marked entry whose population is bounded by history depth** | D31 | Partition catalogue + archive index | |

## Job-asserted

| # | Invariant | Owner | Vacuity |
|---|---|---|---|
| J1 | `stock.quantity` = the signed two-sided fold of `stock_movement` over the cell key | D5, D12, D24 | |
| J2 | `stock.weight_g` = the same fold over `catch_weight_g` | D20 | |
| J3 | `stock.allocated_quantity` = active cell-bound allocations only, enumerating `{allocated, picking, picked, packed}`. **It is a quantity fold and must never be used as a reference test**: terminal allocations hold `stock_id` and contribute nothing to it | D12 narrowed, Q91 | |
| J4 | `expected_supply.quantity_allocated` = active allocations against it | D24 | |
| J5 | `stock.resolved_location_id` = holder location, or the holder package's | D24 | |
| J6 | `package.parent`, `location`, `resolved_location`, `status`, `depth`, **`sscc`, `barcode` and `identifier_kind`** = the fold of `package_event` in `(occurred_at, recorded_at, id)` order; replay in **any** arrival order is identical | D24, Q90 | |
| J7 | `stock.quantity > 0 ⇒ resolved_location_id IS NOT NULL` → `stock_without_location` | D24 | ● |
| J8 | `expected_supply.quantity_refined` = the sum of refining rows, the double-count guard | D24 | |
| J9 | No active allocation references a closed `expected_supply` → `supply_withdrawn` | D24 | ● |
| J10 | `observation_current` is exactly rebuildable from `observation` plus the recorded precedence policy row | D23 | |
| J11 | A counterparty-asserted observation enters `observation_current` only with an `acceptance` | D23, D25 | ● |
| J12 | `package` dimensions equal `observation_current` **for unsealed packages only** | D23 | |
| J13 | Every policy value version has a matching `policy_change`, anti-joined both ways | D22 | |
| J14 | Every scope FK **and every value-table FK** resolves within the binding's tenant; an operator-shipped binding references only shared rows | D22, D18 | ● |
| J15 | No binding names a node inconsistent with a coarser node on the same dimension: item ∉ item_class, zone ∉ site, party ∉ party_class | D22 | ● |
| J16 | Zero `discrepancy` rows of kind `policy_ambiguous` after the suite | D22 | ● |
| J17 | `assertion.supersedes` is acyclic; at most one in-force assertion per `(tenant, author, kind, author_reference)` | D21 | ● |
| J18 | A counterparty observation's promoted value still equals its assertion's | D21, D23 | |
| J19 | Truncate every assertion table, rebuild `stock` and `allocated_quantity`, assert byte-identical, **and** assert that no column of the `stock` key is reachable from an assertion table by any path that survives truncation. `expected_supply` and `stock_allocation.expected_supply_id` are exempt and named | D21 rule 3, Q90, D24 supply side | |
| J20 | Every `tenant_id` on a fact agrees with its subject's and its event's | D18 | ● |
| J21 | Per-tenant extension ceilings hold. **Superseded as a job by D36**: the ceiling is now claimed slots enforced at declaration, so this becomes the assertion that no tenant holds more claimed slots than issued | D26, D36 | ● |
| J22 | Golden snapshot: adding a scope dimension changes no existing resolution without an explicit `RESOLVER_VERSION` bump | D22 | |
| J23 | The five ingestion channels produce identical content columns | D23 | |
| J24 | Projection cascades are at most two hops from the originating fact | D25 | |
| J25 | `refines_expected_supply_id` is acyclic and of depth exactly 1; violations raise `refinement_too_deep`. **Asserted by a job, never a CHECK**: a CHECK on a projection column wedges the rebuild | D24 supply side | ● |
| J26 | `expected_supply.quantity_received` = the fold of `goods_receipt_line` rows naming this row or any row refining it | D24 supply side | |
| J27 | Transfer arm: **no unit is simultaneously counted** in origin `stock.available_quantity` and destination `quantity_promisable` | D24 supply side | ● |
| J28 | No open row with `quantity_outstanding > 0` past `expected_to + grace` → `supply_overdue` | D24 supply side | ● |
| J29 | No active allocation references a closed or overdue row → `supply_withdrawn` / `commitment_unbacked`. The allocation is **not** released by the job | D24 supply side | ● |
| J30 | Rebuilding `expected_supply` preserves row identity. Truncate-and-regenerate is forbidden while any allocation holds an `expected_supply_id` | D24 supply side | |
| J31 | `fulfilment_line.allocated_quantity` = active allocations against that line, **either arm** | D24 supply side | |
| J32 | The reap predicate is the complement of the rebuild's existence predicate: reap, rebuild, assert produces zero `projection_drift`. **Structural since D35**, because the reap is a phase inside the rebuild function and the intermediate state is unobservable | D24, D25, Q91, D35 | |
| J33 | Rebuilding `stock` preserves row identity: every live cell resolves to the same `id` before and after. Truncate-and-regenerate is forbidden while any allocation holds a `stock_id`. *(J30's missing analogue.)* | D24, Q91 | |
| J34 | No `package` row's earliest `package_event` has `source = 'asn'`. Minting from an assertion is structurally absent | D21, D24, Q90 | ● |
| J35 | Every `sscc_allocation` serial lies within its `number_range`'s issued span, and no serial is reissued within the reuse window, 12 months plus any sector extension. **The exemplar of the vacuity problem**: truncate the history and it starts passing | D21, Q90 | ● (S34) |
| J36 | No login role holds `INSERT`, `UPDATE` or `DELETE` on any column commented `@projection` | D35 | ● |
| J37 | Every `SECURITY DEFINER` function in the maintainer set has `search_path` set in `proconfig` and no `EXECUTE` grant to `PUBLIC`. **Catches a new maintainer function written correctly and deployed with Postgres defaults**, which is the likely failure rather than a deliberate one | D35 | ● |
| J38 | `relforcerowsecurity` is true on every table carrying an `@projection` column | D35 | |
| J39 | Every `record_scheme` row has a claiming `extension_slot`, and no slot is claimed by two keys | D36 | |
| J40 | No `record_scheme` whose slot is released has an unarchived materialised table | D36 | ● |
| J41 | `expected_supply.inbound_shipment_id` equals the walk `asserted_unit_content → asserted_unit → assertion → despatch_advice` for every assertion-arm row, and is NULL for every other arm | D37 | |
| J42 | Every GTIN in `item_barcode` is 14 characters and passes the mod-10 check digit. Asserted over the table, not the call site, because normalisation happens on write and a second write path will be added | D34 | ● |
| J43 | The `item_barcode` exclusion constraint's `COALESCE` sentinels are present. The failure mode of their removal is that duplicate shared barcodes become insertable and nothing complains | D34 | |

---

## Numbering

**One collision has occurred.** D34 allocated J34 and J35 on 2026-08-03 while
D28 and D29 already held them. The earlier claim wins, so D34's two entries were
renumbered to J42 and J43. Nothing outside D34's own text cited them.

That collision is the argument for this file. It happened in a document that had
just been consolidated to stop exactly this failure for questions, four
paragraphs after writing down the rule, and it happened because the numbers were
hand-allocated in prose across four documents. Under the generation contract at
the top it would not have compiled.

**One invariant had no number.** D31's assertion that every declared retention
floor is actually covered was stated in the decision and never entered any
register. It is S34.

**Three entries could not be stated from one document.** J3 was annotated in one
place and defined in another, J6 was extended twice in two documents, J19 was
widened in one and scoped in a second, and S2 was corrected in a third. Each
appears here as its current whole text.

## Counts

| | |
|---|---|
| Structural | 34 |
| Job-asserted | 43 |
| **Total** | **77** |
| Marked for vacuity | 29 |
| `specified` | 77 |
| `implemented` | 0 |

Twenty-nine of seventy-seven assert an absence and pass on an empty population.
That is the number worth watching, because those are the entries that will report
success on the day they stop being checked.
