# Gold price basis

There is no such thing as "the gold price". NeoOS never states one.

---

## 1. Five different numbers

At the same instant, these can differ by several percent, and they carry
different counterparty, storage, and delivery risks:

| Basis | What it is | The risk it carries |
|---|---|---|
| London spot, unallocated | The OTC benchmark | A claim on a bullion bank, not on a specific bar |
| Futures settlement | A dated contract | Embeds financing cost and time to delivery |
| ETF net asset value | The fund's own valuation | A security with a manager, a custodian, and fees |
| Allocated physical | Specific bars in a named account | Storage and insurance cost |
| Retail physical | What a person actually pays | Premium over spot, often several percent |

Reporting one as though it were another is a category error that looks like a
rounding difference on the way past. Retail physical is usually the only basis at
which an individual can genuinely transact, and usually the one omitted.

NeoOS therefore states: **which basis, in which currency, per which unit, from
which source, at which time.** `describeGoldQuote()` is the single function every
displayed gold price passes through, so the basis cannot be separated from the
number by a layout change.

---

## 2. Units

Canonical unit: **troy ounce**. Conversions are definitional constants, not
measurements:

| Unit | Grams | Note |
|---|---|---|
| Troy ounce | 31.1034768 | Exact, by international agreement |
| Gram | 1 | |
| Kilogram | 1000 | |
| Tola | 11.6638038 | The standard across the Gulf and South Asia |

The tola is supported because Gulf markets quote in it, and a system built for a
user in that region that silently assumes troy ounces is wrong by a factor of
2.67 without any visible symptom.

`toPricePerTroyOunce()` is total and exact — no rounding, no tolerance. It throws
rather than returning a number for an implausible input. A silent unit mismatch
here moves a gold valuation by a factor of thirty-one and looks entirely
plausible.

---

## 3. Gold's permanent ceiling

Gold's maximum live state is `partial_live`. **Permanently.**

The two-input test for `live_verified` requires a current official filing and a
current price. Gold has no issuer and files no accounts with any regulator. The
filing half cannot be satisfied — not because the evidence is missing today, but
because it does not exist and never will.

This should not be reported as a gap waiting to be closed. A future release
cannot fix it, and a roadmap item promising to would be dishonest.

---

## 4. Comparing quotes

`basesAreComparable()` returns false when the basis or currency differs.

A spot quote and an ETF NAV drifting apart is information about fees and tracking,
not a price discrepancy. Treating it as an evidence conflict would generate a
warning the user cannot act on, and a system that produces unactionable warnings
trains people to ignore the actionable ones.

---

## 5. Configuration

`METALS_BASE_URL` and `METALS_API_KEY` configure a spot feed. The adapter records
`priceUnit: "troy_ounce"` explicitly on every quote — a gold quote with an
unstated unit is meaningless, and the field is not optional.

Retail premium over spot is recorded only when a source states it. It is never
estimated: the premium varies by dealer, product, and quantity, and an assumed
figure would be the single most misleading number in a gold analysis.
