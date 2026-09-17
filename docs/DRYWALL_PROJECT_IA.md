# Drywall project stages — what belongs where

**Written 2026-09-17** from Mark's observation that the Order page has become a catch-all.
This is a thinking document, not a plan. Nothing here is scheduled to be built.

Stages today: Project Info · Quote · Schedule · Field Measurement · Order · Production ·
Closeout · Photos & Files.

---

## 1. What is actually on the Order page

Verified, not remembered:

| Block | What it is |
|---|---|
| Order list + editor | items, supplier, delivery date, status draft → sent → complete |
| `OrderFinancialCard` | quote vs field-takeoff estimate — does this order still fit the bid |
| Field materials PDF | what to buy |
| Labor rate card PDF | the crew's pay basis for the job |
| `ChangeOrdersSection` | contract changes — what the customer now owes |

Five blocks, and they do not share an audience or a lifecycle.

## 2. Three lifecycles wearing one page

**Procurement.** What material, from whom, arriving when. Driven by the field takeoff,
owned by the office, ends when the truck arrives. Lifecycle: draft → sent → delivered.

**Contract.** A change order changes what the customer owes. It is closer kin to the quote
than to a purchase — same parties, same document trail, same argument three months later.
Its lifecycle is the job's, not an order's.

**Labor.** The rate card is a production document. It tells the crew what the work pays. It
has nothing to do with what L&W drops on Tuesday.

The test that separates them: *who opens this, and what question are they answering?* Three
different answers means three different homes.

## 3. Where each would go

**Change orders → nearer the Quote.** They restate the contract. The quote stage already
owns customer-facing money, alternates and the PDF; a change order is the same conversation
continued after work started. Keeping it on Order means the person checking what to buy
walks past the contract every time, and the person amending the contract goes to a
purchasing screen to do it.

**The labor rate card → Production.** That is where the crew, the hours and the pay already
live.

**The financial card → stays, with a caveat.** This one is not simply misplaced. It answers
"does the order I am about to place still fit the bid" — a procurement gate, and it belongs
where the buying decision is made.

But **Production already carries the money view**: running cost, margin vs bid, estimated vs
actual material, estimated vs actual labor, current crew. So there are two financial
surfaces answering different questions — *before* committing (Order) and *during* the work
(Production). That is defensible. It is worth being deliberate that it is the intent, rather
than letting a third one appear.

## 4. Orders per phase — mostly already built

The strongest of the three ideas, and the model is already there.

- `projects.metadata.legacy.orders` has always been an **array**.
- An order carries **`scheduleItemId`** — the stock schedule item it lands on.
- Delivery date **resolves from the linked schedule item**, so moving Stock on the schedule
  moves the board date (`20260723150000_drywall_supplier_orders_schedule_link.sql`).
- **22 of 37 live orders are already linked this way.**

So "insulation is its own order, drywall is its own order" needs no new data model.
Insulation's order links to the *Insulation and RC Channel* item, the board order links to
*Stock*, and each appears on the supplier view under its own date, because the date comes
from the schedule.

**What is missing is framing, not mechanism:**

1. The page reads as *the* order, singular. Nothing suggests one per stock event.
2. Nothing proposes the split. Goodwill Multi already has separate Topout and main-phase
   stock dates that want exactly this, and nobody was prompted.
3. An order has no sense of *what phase it is for* beyond the schedule item it points at.
   That link may be enough — worth checking before adding a field.
4. Only 1 of 36 projects has more than one order, so the multi-order path is effectively
   unexercised. Whatever is built should be tried on a real two-delivery job first.

## 5. Folding Order into Field Measurement — the argument against

Measurement is an **input**: what is physically there, captured by a measurer in the field,
written through a crew-scoped RPC. An order is a **decision**: what to buy, from whom,
arriving when — made by the office, with its own lifecycle that outlives the measurement.

Merging them puts two actors with different permissions and different tempos on one page.
That is the same mistake the Order page already made, relocated.

Measurement should keep **feeding** orders, which it already does. If anything the pull is
the other way: orders belong nearer the **schedule**, because the schedule is what decides
when material lands — and the delivery date already comes from there.

## 6. Questions this cannot answer

1. Does a change order ever need to change an **order** — more board because scope grew? If
   so the two stay linked even after they are separated, and the link needs designing.
2. Is a phase order created **from the schedule** (here is a stock date, what is on it) or
   **from the takeoff** (here is the material, when does it land)? That decides where the
   button goes.
3. What is a phase — insulation vs drywall vs topout vs main? The schedule already names
   them; is that the list, or is there a shorter one?
4. Does the crew ever need to see an order? Today they see materials via the schedule item.
   If phase orders become the unit, that relationship changes.

## 7. What this is not

Not a plan, not sized, not sequenced. The Order page works; nothing here is broken in a way
that is costing money today. It is a note of where the seams are, so that whenever the next
change lands near this code it is pushed in a coherent direction rather than adding a sixth
block to the same page.

---

## 8. Mark's answers, and what they change (2026-09-17)

### 1. A change order can change an order — yes

So separating the contract from the purchase does not sever them. Scope grows, the customer
is billed, and more board has to arrive. Whatever home a change order gets, it needs a way
to say "this added material" and land that on an order — either amending an open one or
producing a supplemental delivery.

Worth noting the crew side already reasons about this: accepted change orders contribute
additional crew sqft (`crewWorkspaceService` §"Sum of accepted change orders"). The link
exists in the labor direction already; the material direction is the missing half.

### 2. Both, but it starts with the takeoff — this is the important one

That reframes the feature. It is not "create an order", it is **allocation**: the takeoff is
one pile of material, and you divide it across deliveries. The schedule supplies each
delivery's date; the takeoff supplies what is in it.

Three things follow that "create an order" never raises:

- **A remainder exists.** What has the takeoff got that is not on any order yet? That is the
  question the page should answer on sight, and today nothing can.
- **Over-allocation is possible.** Ordering more board across three deliveries than the
  takeoff called for should be visible, not discovered at the job.
- **The split is the work.** The interesting action is "put these lines on the PreRock
  delivery and those on the main stock", not filling in a blank order.

This also explains why the current page feels wrong for it: it presents a blank order to
fill, when the real task is dividing something that already exists.

### 3. Phase is free-form — floor, trade, or stage

No fixed taxonomy. "Floor 2", "insulation", "PreRock" and "production stock" are all phases
and they are not the same kind of thing. So **do not build a phase entity**.

An order needs a **name** plus its existing optional schedule-item link. The schedule already
carries the real-world meaning where one exists — Goodwill Multi literally has *PreRock*,
*Stock Topout* and *Stock* as items — and a free-text name covers the cases the schedule does
not name, like a floor.

### 4. Crew sometimes need to see materials — already true, and it improves

`resolveOrderMaterials` already builds the crew's list **from the orders**, one group per
order, every non-cancelled order included. The group label falls back to order number, then
supplier, then "Material order".

So phase orders make the crew view better rather than harder: today a hanger on Goodwill
Multi sees one undifferentiated pile; with a delivery per phase they would see "PreRock" and
"Board stock" as separate groups with their own dates. It also means **the name in answer 3
earns its keep twice** — it is what the crew reads, not just an office label.

### What this adds up to

The shape is clearer than it was this morning:

- Material comes from the takeoff, once.
- It is **allocated** across one or more deliveries, each named, each optionally pinned to a
  schedule item that supplies its date.
- The unallocated remainder is a first-class thing to show.
- Change orders can add to the pile after the fact.
- The crew read the deliveries, so the names are user-facing.

None of that needs a new table. It needs a name on an order, a remainder calculation, and a
page built around splitting rather than filling.

**Still unanswered:** what happens to the 15 existing supplier-less drafts and the 22 orders
already linked to a schedule item when this arrives — they are the migration, and they are
all real jobs.

---

## 9. Correction — the takeoff is the phased thing (2026-09-17)

§8.2 read "starts with the takeoff" as *one complete takeoff, divided across deliveries*.
That is not what Mark meant, and the difference is the whole design.

His process: **the schedule item creates the demand, and the takeoff is performed to serve
it.** "What material do I need to take off *now* to get the order prepared for the schedule
item that stocks that material." Stock Topout is 31 July, so before that someone measures the
topout scope and that becomes the topout order. Stock is 5 October, so nearer that someone
measures the main scope and that becomes the main order.

So the unit is a triple:

> **stock event on the schedule → the takeoff performed for it → the order that fulfils it**

Not one pile split N ways. N takeoffs, each with its own order, each pinned to its own date.

### The structural mismatch

`FieldTakeoff` is **singular per project**: one `measurements` array, one `accessories` list,
one `totalMeasuredSqft`, one `reviewStatus`, one `signedOffBy`, one approval
(`types/drywall.ts:739`). One takeoff per job.

The process wants several per job. Everything awkward around this area follows from that:

- **Review state collides.** D.6.8 gave the takeoff a `pending_review → approved` cycle with
  a measurer submitting and an operator approving. With two phases in one record, approving
  the topout takeoff approves the main one that has not been measured yet.
- **Order suggestion always offers everything.** `suggestOrderItemsFromFieldTakeoff` reads the
  whole takeoff, so on a two-phase job "create order" proposes the entire job's material
  every time, for every delivery.
- **This is probably what produced the duplicate orders.** Ten jobs carried an abandoned
  supplier-less draft beside the real order, created the same day, with item counts that
  differed slightly (cleaned up 2026-09-17, `cleanup-orphan-supplier-orders.mjs`). One
  takeoff that keeps changing, plus a suggestion that always offers all of it, is exactly
  how you get two nearly-identical drafts in one sitting.
- **Accessory auto-calc runs off whole-job sqft.** It recomputes from
  `totalMeasuredSqft` on every visit, which is why deleting a finishing line never sticks —
  there is no phase for it to belong to, only the job total.

### Which means §5 was wrong

§5 argued against folding Order into Field Measurement, on the grounds that measurement is an
input by the crew and ordering is a decision by the office.

That objection used the wrong unit. If the job is "prepare the material for the 5 October
stock", then measuring for it and ordering for it are two steps of **one task**, and it is
unremarkable that different people do each step. The actors differ; the unit of work does
not. Mark's original instinct — "maybe Order gets wrapped into field measure and we flesh
that out more" — was better than the objection to it.

The honest version: **Field Measurement and Order are one workflow per stock event**, and
what looks like two stages is one stage that can happen several times on a job.

### The fork this opens

Does a phase takeoff become **its own record**, or a **partition inside the existing one**?

*Separate records* match the process and give each phase its own review cycle, sign-off and
order. They also touch every reader of `legacy.fieldTakeoff` — the crew measure page, the
save RPC (`save_field_takeoff_as_measurer`), the review banner, order suggestion, accessory
calc, the materials PDF, and the crew materials list.

*A partition* — measurements tagged with a phase — is far less disruptive, since areas
already exist. But approval, sign-off and `totalMeasuredSqft` are whole-record, so phases
would still share one review state, which is one of the things that is wrong today.

Not a decision to take quickly. It is the largest structural question standing in the drywall
workflow, and it sits underneath the Order page complaint that started this.

---

## 10. What the jobs actually do (2026-09-17)

§9 left a fork — separate takeoff records or a partition — and Mark's reply was "each
measurement needs its own approval flow, but I don't want to over-engineer everything." The
schedule data settles where that line sits.

Counting drywall schedule items across **55 projects**:

### Multiple deliveries: common — 12 of 55

And mostly not phases. They are one measurement with several drops:

| Job | Deliveries |
|---|---|
| Bay Village - Dills | Stock 9-11, Delivery 9-16 |
| Beachwood - Bannet | Stock 7-27, Scaffold Delivery 8-11, Delivery 8-12 |
| 27 West Main St | Stock Drywall 7-13, Scaffold Delivery 7-13 (same day) |
| Twinsburg - Rubin | Stock Mechanical Closet 7-15, Stock 8-17, Delivery 8-24 |
| Kirtland - Pluscusky | Stock 8-27, Delivery (early morning) 9-01 |

Board, scaffold, a top-up. One takeoff, several drops.

**Hudson Springs Dialysis Den** is Mark's insulation example exactly — Stock Metal Stud 8-21,
Stock Drywall and Batts 9-22, Stock ACT 10-02 — and it has **one** measure event. Three
orders by material type off a single takeoff.

### Multiple takeoffs: rare — 2, and one is not real

Only two projects have more than one measure event. *Service - Warranty & Point-up* is a
catch-all bucket, not a job. That leaves **Goodwill Multi**: Measure Topout 7-28 → Stock
Topout 7-31, then Measure 9-28 → Stock 10-05. One genuine case.

### Which sets the line

| Need | Jobs today | Model change |
|---|---|---|
| Several orders from one takeoff | **12** | none — `scheduleItemId` already carries it |
| Several takeoffs, each approved separately | **1** | restructures `FieldTakeoff` and every reader of it |

The thing that would help twelve jobs needs **no model change**. It needs "one order per
delivery" to be an obvious action rather than something reachable if you already know it is
possible — plus a name on each order so the crew can tell the board drop from the scaffold
drop (§8.3, §8.4).

Per-phase approval is real and it is coming: Goodwill Multi, Hudson Springs, Lisbon and
Ohio Mutual are all commercial, and commercial is where phased measuring happens. But it is
one job today, and it is the change that touches the crew measure page,
`save_field_takeoff_as_measurer`, the review banner, order suggestion, accessory calc, the
materials PDF and the crew materials list.

**Recommendation: wait for three or four real cases before restructuring the takeoff.** By
then the separate-records-versus-partition question answers itself from how the jobs actually
divide. Deciding it now would be a guess wearing the clothes of a decision.

### What that leaves as the next move, if anyone wants one

Small, and it serves the twelve:

1. A name on an order, shown to the crew.
2. Creating an order **from a stock schedule item**, so the date and the link come for free
   instead of being set by hand.
3. Nothing else. No phase entity (§8.3), no allocation or remainder tracking — that was an
   invention of §8.2 and Mark never asked for it.

The Order page's misfiled blocks (§3) are a separate, smaller cleanup and do not depend on
any of this.
