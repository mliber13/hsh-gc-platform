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

Live numbers (`tallWallPricing.ts`). Mark, 2026-10-16, after the before/after on real quotes:
keep the factors; raise the labor cents from the proposed 2/4/8¢, "since we are only applying to
that area's sqft".

| Band | Mud & tape | Tall-wall labor |
|---|---|---|
| 10–11' | ×1.10 | +$0.03/sqft |
| 12–14' | ×1.20 | +$0.06/sqft |
| 15'+ | ×1.30 | +$0.12/sqft |

The labor rates are editable per quote (`tall_wall_labor_rates`, on the Pricing card when the
quote has tall board). They live in `tallWallPricing.ts`, apart from `ceilingHeights.ts`, because
the latter is on the crew read path and these are money.

**Field:** each measured area gets a ceiling height (`FieldMeasurementArea.heightFt`). Areas are
already split by floor (1st floor, 2nd floor, Garage, Basement in the live data), and each has
its sqft, so tall sqft is exact once measured.

**Quote — a height on every drywall line (Mark, 2026-10-15, revised the same day).** Mark builds
quotes from a Togal takeoff: each floor, and each tall room broken out, is a Togal **area**
(→ the line's location), walls are labelled with their height (`9' 1/2" Walls` → 9'), and
ceilings are just `Ceiling`. So the import fills `QuoteLineItem.height_ft`: walls from the label,
ceilings from their area's wall height (the height carrying the most wall sqft in that area —
`wallHeightByArea`). Lines typed by hand show a height field in their edit dialog; blank means
the quote's `default_height_ft` (the strip above Pricing). Heights then price line by line, which
is how the quote already computes mud, tape and labor.

_Superseded the same day:_ a separate box of tall-area rows (name · height · sqft). It entered tall
sqft twice with nothing checking the two agreed, and Mark found it confusing next to the lines.

**Field from the quote:** an empty Field measurement offers "Start from the quote's areas" —
one area per quote location at its height (`quoteAreasForField`), so the measurer starts with the
job laid out as quoted.

**Crew see it (2026-10-15):** a Ceiling heights card on the crew job page — each area, its
height, a "Tall work" banner for 10' and up, and the area's sqft for crew allowed to see job size
(job info on, not a field foreman). Measured heights win; before measuring, the quote's areas.
The crew allowlist passes `height_ft` and `default_height_ft` (migration `20261015160000`).

## Steps

1. **Record heights** — no price changes. **Done 2026-10-15:** line heights (import fills them;
   edit dialog; shown under each line's location), the quote's default height + tall-board
   summary, Field area heights (office and crew), and Field areas started from the quote.
   Hydration of every new key is tested (`ceilingHeights.test.ts`).
2. **Mud & tape factors** — **live 2026-10-16.** A tall line's compound and tape quantities scale
   by its band's factor (quote accessories and the accessory roll-up); the Field order sizes
   tall areas' finished board up by the same factors (`tallFieldMudTapeExtraSqft`).
3. **Tall-wall labor line** — **live 2026-10-16.** Tall sqft × the band rate, burdened like
   finishing, in the labor of the markup base and in `linesSubtotal` (so the margin-floor cost
   counts it). Shown as "Tall-wall labor" in the cost breakdown, wages apart from the one burden
   line. Crew pay is untouched; it stays at Field step 3. Alternates carry none yet.

Before going live, no live quote had a line 10' or up (Hogan, the only quote with heights, tops
out at 9'), so no existing price moved. Real engine on Bridgeworks with heights read from its
labels (in memory): accessories +$1,390, tall-wall labor $7,296, total +$12,555 (+0.36%).
