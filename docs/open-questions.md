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

These stop something specific. Each names what.

| # | Question | Blocks |
|---|---|---|
| **75** | The receiving screen's query must be written and explained once, as its own acceptance test. Six designs each added joins to that path and none could measure the total. | Building the receiving screen |
| **111** | Do the extensibility ceilings need enforcement or only assertion? A tenant hitting the limit mid-declaration needs defined behaviour; "the job complains tomorrow" is not one. | Building the schema compiler (D26) |

## Live, needing a business answer

Nobody can settle these from the code.

| # | Question |
|---|---|
| **4 / 58** | Are `order` and `purchase_order` ours, or mirrors of NetSuite's? During coexistence they are mirrors. This decides the size of the whole inbound build. |
| **66** | Do we bill for third-party storage and handling? D20 admitted the stock; the exclusions still decline the billing. Holding another company's stock without billing for it is not a business. |
| **67** | Cross-tenant supplier benchmarking: forbidden, or a product capability needing a carve-out? D19 currently forbids it as a side effect of a data-scoping rule rather than as a decision. |
| **69** | Is grocery business-to-business in the roadmap? Decides whether identifier issuance, prefix management and outbound advices are urgent. Unanswered since the competitor analysis. |
| **49** | Are the Australian states one legal entity or several? De-risked by D20, so it changes the deployment rather than the schema, but it is still unanswered. |
| **56** | Does an inter-company movement generate documents automatically, or flag them for the finance system? Decides how far this reaches into accounting. |
| **77** | Is "who changed the ship-to address" a real requirement? `row_audit` was dropped. If it comes back it is an infrastructure decision with its own justification. |

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
| 118 | Where the reaper's kill switch lives and who may flip it | Building the reaper |
| 119 | Whether the internal licence plate format is shipped or tenant-configurable | The second tenant |
| 120 | The `expected_supply` concurrency budget under advice ingestion | Building inbound |

## Live, wanting a written answer rather than a decision

Nothing blocks on these. They are places where the model is right and the reasoning
is undocumented, which is how the five bad invariants happened.

| # | Question |
|---|---|
| **88** | **The invariant register needs an owner and a home.** It is the artefact that would have caught every silent breakage, it is currently prose, and it will erode exactly as principle 3's census did. This register is the same fix applied to questions. |
| 93 / 79 | The eleven per-kind precedence orderings are declared in code and justified nowhere. A manager who assumes wrong misconfigures confidently. |
| 84 | Bitemporal queries are easy to write backwards. "What did the pallet weigh on Monday" and "what did we believe on Monday" differ by one predicate, and getting it wrong in a dispute is worse than not having the capability. |
| 85 | The falsifier for new event tables is gameable by adding a decorative column. Reviewers must apply the provenance rule first. |
| 87 | Reason fields are only as good as what gets typed into them. Mandatory-not-null produces "update". |
| 15 | What the reconciliation surface for negative stock actually is. D5 tolerating negative balances is only defensible if somewhere real resolves them. |
| 95 | What `affected_resolution_count` is computed against. Without a defined denominator the number is theatre. |
| 105 | What an `automation_key` is. D27 narrowed it by contrast (a device is *how*, a key is *who*) without defining it. |
| 62 | Whether D8's non-blocking rule gets a counterparty carve-out, and where the statutory clock lives. |

## Live, minor

Noticed thresholds and consistency questions, none urgent: 5, 16, 22, 23, 27, 35,
36, 54, 94, 96, 97, 98, 100, 104.

---

## Settled

| # | Settled by | # | Settled by |
|---|---|---|---|
| 1, 32 | D14, D20 | 68 | D24 supply side |
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
| 64 | D23 | | |

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
| Live and blocking | 2 |
| Live, business answer | 7 |
| Live, deferred with trigger | 17 |
| Live, wanting a written answer | 9 |
| Live, minor | 14 |
| **Live total** | **48** |
| Settled | ~53 |

116, 102 and 117 were settled the day this register was written. 116 had been
sitting in a research document since the inbound pass without ever being carried
across, which is the failure this register exists to stop repeating.
