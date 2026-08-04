# Open questions register

The single home for every open question. Before this file existed they lived in
five documents with a shared numbering scheme that had collided three times, and
questions raised in a proposal stayed behind when the proposal was adopted.

**The rule that keeps it true:** a question raised anywhere is migrated here in
the same commit that adopts the decision raising it. Research documents may state
questions; they do not own them. Where a research document and this register
disagree, this register wins.

Numbering is canonical here. Three collisions were resolved on consolidation: the
supply-side design's 110 and 111 duplicated numbers already used, and its
surviving live question was renumbered to 120.

---

## Live and blocking

**None.** Nothing on this list stops the first migration or the first screen. The
four that did were settled by D34, D35, D36 and D37 on 2026-08-03.

What replaces them is a measurement rather than a question: 122 below cannot be
answered without a seeded database, so it is deferred against building one rather
than left here looking like a decision nobody has made.

## Live, needing a business answer

**None.** All seven were answered on 2026-08-03.

Once answered, six of them turned out to be one principle asked in six places:
**every integration is a capability, never a dependency.** Orders, inter-company
documents and legal entities were the same question about three subjects. The
seventh, grocery business-to-business, was answered as roadmap rather than first
version, and what remains of it is a verification rather than a decision, carried
by 123.

Six of the seven were settled on 2026-08-03 by D39 to D42. What they had in
common, once answered, was one principle: **every integration is a capability,
never a dependency.** Three of them were the same question asked about orders,
about inter-company documents and about legal entities.

## Live, deferred against a trigger

| # | Question | Trigger |
|---|---|---|
| 26 | Who allocates, and when | Building the allocator |
| 28, 42 | Whether the allocator and task ordering can run before the location survey | The survey, or the interim sequence column |
| 29 | Whether equipment cost needs to model contention rather than a scalar | Forklift queuing becoming the bottleneck |
| 34 | Whether held-lot allocations auto-release or wait for a human | Building the re-allocator |
| 41 | Whether a count task locks its location | Building cycle counting |
| 43 | What closes a `pick_batch` | Building batch picking |
| 52 | Who governs the shared catalogue | The second tenant |
| 65, 81 | Whether a 3PL client is an owner scope inside a tenant | First 3PL client |
| 70 | Statutory retention against a tenant's right to deletion | First deletion request |
| 71 | Serial capture at receipt | A customer asking |
| 76 | The partitioning plan for the large fact tables | The first large tenant |
| 78 | Taxonomy re-parenting silently changing which settings win | Building the taxonomy editor |
| 80 | Resolver cache invalidation | Building the resolver |
| 86 | The closed decision-point set | If `decision_rule` is ever built |
| 118 | Where the reaper's kill switch lives and who may flip it | Building the reaper (now a phase of the rebuild, D35) |
| 119 | Whether the internal licence plate format is shipped or tenant-configurable | The second tenant |
| 120 | The `expected_supply` concurrency budget under advice ingestion | Building inbound |
| 121 | Whether `event_subscription` needs a ceiling, and what it is | Measured outbox throughput |
| 122 | The receiving queries are written and reasoned about, not measured. Retires 75 | The first migration, with a year of seeded history |
| 123 | Verify the GS1 grocery surface is reachable without structural change: GTIN allocation, SSCC issuance and reuse, ITF-14 on master cartons, GS1-128 pallet labels, EDI despatch advice, National Product Catalogue. Carries the live half of 69 | Before the first grocery customer, and worth doing sooner because it is falsifiable now |
| 124 | Benchmarking's cohort floor, suppression rule and consent model. D41 set the shape and deferred the build | Enough tenants for a cohort to mean anything |
| 126 | Whether a counterparty's **message rules** are a `policy_kind` under D22 or a `party_profile` capability column under D20. Both fit; they differ in whether the rule resolves by scope. Raised by D43 as cardinality; widened by D44 to cover acknowledgement-required and structure-required, which resolve the same way | The second counterparty with a stated message rule |
| 127 | Whether `order_line` carries a price and a currency, and where the boundary with D40 sits. The cheap half is a column pair; the commercial half touches the deferred `stock_movement.unit_cost_minor` and whatever a rate card becomes. A grocery customer's order acknowledgement confirms price contractually, so this is not optional for that market. Raised by D44 | Before the first customer order arrives by EDI, and before `order_line` has history |
| 129 | Whether `zone` needs to nest. D46 made it flat because D22's Space dimension is `any → site → zone` with no ancestors level, and a chilled area holding a chilled pick face and a chilled bulk run is the shape that would want one. It costs a closure table and one lattice row, exactly as Product already has | A tenant with sub-zones |
| 128 | What links a cancelled order to the one raised in its place. Metcash's stated amendment channel for an externally-authoritative order is cancel-and-reraise, and D44 added `order.supersedes_order_id` for the link without deciding what else the succession carries. Raised by D44 | The first EDI customer |

## Live, wanting a written answer rather than a decision

Nothing blocks on these. They are places where the model is right and the reasoning
is undocumented, which is how the five bad invariants happened. The largest of
them, 88, was settled by D38; [invariants.md](./invariants.md) is now the same
fix applied to invariants that this file is to questions.

| # | Question |
|---|---|
| 93 / 79 | The eleven per-kind precedence orderings are declared in code and justified nowhere. A manager who assumes wrong misconfigures confidently. |
| 84 | Bitemporal queries are easy to write backwards. "What did the pallet weigh on Monday" and "what did we believe on Monday" differ by one predicate, and getting it wrong in a dispute is worse than not having the capability. |
| 85 | The falsifier for new event tables is gameable by adding a decorative column. Reviewers must apply the provenance rule first. |
| 87 | Reason fields are only as good as what gets typed into them. Mandatory-not-null produces "update". |
| 15 | What the reconciliation surface for negative stock actually is. D5 tolerating negative balances is only defensible if somewhere real resolves them. |
| 95 | What `affected_resolution_count` is computed against. Without a defined denominator the number is theatre. |
| 105 | What an `automation_key` is. D27 narrowed it by contrast (a device is *how*, a key is *who*) without defining it. |
| 62 | Whether D8's non-blocking rule gets a counterparty carve-out, and where the statutory clock lives. |
| 125 | Whether a `raw_*` column may ever hold a value inherited from another node, stated generally rather than per standard. D43 answered it for the X12 order level by storing the node; any hierarchical message can state an attribute above the level we store, so the 856 is the first instance and not the last. |

## Live, minor

Noticed thresholds and consistency questions, none urgent: 5, 16, 22, 23, 27, 35,
36, 54, 94, 96, 97, 98, 100, 104.

---

## Settled

| # | Settled by | # | Settled by |
|---|---|---|---|
| 1, 32 | D14, D20 | 68 | D24 supply side, refined by D43 |
| 2, 3 | D15 | 72 | D33 |
| 13 | D8, D25 | 73 | D26 |
| 14 | D26 | 74 | D29, D30 |
| 17, 18, 19 | D10, D11, D9 | 89 | D28 |
| 20 | D23 | 90 | D29 |
| 21, 25, 30, 33, 39 | D22 | 91 | D30 |
| 24 | D13 | 92 | D24 |
| 31, 44 | D33 | 99 | D27 |
| 37 | D16 | 101, 113, 114, 115 | D31 |
| 38, 40, 60 | D24 supply side | 103 | D24 supply side |
| 45, 55 | D20 | 106 | D24 supply side |
| 46 | D20 | 107, 108, 109 | D24 supply side |
| 47, 48 | D18, D20 | 110 (supply-side's) | D28 |
| 50, 51 | D19 | 112 | D28 |
| 53, 57 | D32 | | |
| 59 | D24 | | |
| 61 | D21 | 116 | D34 |
| 63 | D22 | 102, 117 | D35 |
| 64 | D23 | 111 | D36 |
| | | 75 | D37, into 122 |
| | | 88 | D38 |
| | | 4, 58 | D39 |
| | | 49, 56 | D39 |
| | | 66 | D40 |
| | | 67 | D41 |
| | | 77 | D42 |
| | | 69 | answered; verification half is 123 |

**68 and 109 were settled correctly and refined rather than reopened.** D43 found
that one of the two reasons D24 (supply side) gave holds for EDIFACT and not for
X12, which states the purchase order at the order node rather than on the line.
The conclusion stands, the order level is now stored as a node, and neither
question returns to the live list. The stale text in `inbound-analysis.md` and
`supply-side-design.md` still describes 68 as undecided; this register is
authoritative, which is the rule working as intended.

## Duplicates, resolved

| Number | Duplicated | Kept |
|---|---|---|
| 79 | 93 | 93 |
| 82 | 66 | 66 |
| 83 | 67 | 67 |
| 117 | 102 | both, settled together by D35 |
| supply-side 110, 111 | domain-model 110, 111 | renumbered; the live one is 120 |

The competitor analysis carried its own sequence of eleven questions predating this
numbering. All were absorbed into 1 to 57 during adoption and are superseded.

---

## Counts

| | |
|---|---|
| Live and blocking | 0 |
| Live, business answer | 0 |
| Live, deferred with trigger | 25 |
| Live, wanting a written answer | 9 |
| Live, minor | 14 |
| **Live total** | **48** |
| Settled | ~63 |

**The previous total was one short of its own sections.** It read 42 against
21 + 8 + 14 = 43, and D43's two additions surfaced it rather than caused it. The
total is now derived from the sections rather than carried forward, which is the
same failure mode as the invariant numbering and has the same fix: generate it.

All four blockers were settled the day this register was written, and settling
two of them raised 121 and 122. 116 had been sitting in a research document since
the inbound pass without ever being carried across, which is the failure this
register exists to stop repeating. 121 and 122 were migrated here in the commits
that adopted the decisions raising them, which is the rule working.
