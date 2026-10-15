# Ceiling heights in estimating

_Designed with Mark, 2026-10-15. Supersedes the July sketch in memory ("Drywall Estimating Detail")._

## The problem

Tape, mud and labor are priced and ordered at flat ratios per sqft, whatever the height:
one roll of paper tape per 1,400 sqft, all-purpose compound per 4,800 sqft by finish level,
hanger and finisher labor at sqft × rate (`quoteV3Accessories.ts`, `accessoryCalc.ts`,
`quoteV3Math.ts`). A tall room is quoted and ordered as if it were standard. Mark covers it today
by adding "a couple cents per sqft" to the whole job's rate, by judgment.

## Decisions (Mark, 2026-10-15)

| Question | Answer |
|---|---|
| What grows on tall walls? | All of it — material (seams, tape, mud), finisher time, hanger time |
| From what height? | **10' and up.** 9' and under prices as today |
| Labor adder | **One number** for labor, not hanger and finisher separately |
| Walls or ceilings? | **One height covers both** — a vaulted great room is just a tall area |
| How heights are known | From the prints: floors (8' up, 9' down, 10' garage) plus special rooms (18' great room). If quoted in the field, the measurer fills them in |
| Whole-house cents | **Stay**, for everything that is not height (access, cut-up rooms, a hard GC). The height adder only takes care of height, so it is not paid twice |

## The design

**Bands** (`ceilingHeights.ts`): standard < 10'; tall bands 10–11', 12–14', 15'+.

Starting numbers — Mark will see each before it changes a quote, and can edit them:

| Band | Mud & tape | Tall-wall labor |
|---|---|---|
| 10–11' | ×1.10 | +$0.02/sqft |
| 12–14' | ×1.20 | +$0.04/sqft |
| 15'+ | ×1.30 | +$0.08/sqft |

**Field:** each measured area gets a ceiling height (`FieldMeasurementArea.heightFt`). Areas are
already split by floor (1st floor, 2nd floor, Garage, Basement in the live data), and each has
its sqft, so tall sqft is exact once measured.

**Quote (proposed 2026-10-15, awaiting Mark's OK):** a *Heights* box apart from the line items —
a job default height plus optional tall-area rows (name · height · approx sqft). The factor and
adder apply to those sqft only. Lines stay as Mark writes them.
_Why not per line location:_ 57 of 92 live v3 quotes put every line under one location
("Main Scope"); Mark prices by board type, not by floor, and only 2 of 39 jobs share a name
between quote locations and field areas. Height by line location would force re-splitting
quotes. A quote written after measuring can fill the Heights box from the field areas.

## Steps

1. **Record heights** — no price changes. Field half done 2026-10-15 (area height box, office
   and crew measure pages, survives load: `ceilingHeights.test.ts`). Quote Heights box after
   Mark's OK.
2. **Mud & tape factors** — quote material and Field order quantities for tall sqft. Show
   before/after on real jobs to tune before it goes live.
3. **Tall-wall labor line** — one $/sqft per band on tall sqft, its own line on the Pricing
   card, editable per quote. Crew pay is untouched; it stays at Field step 3.
