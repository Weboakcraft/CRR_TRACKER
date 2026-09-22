# Data Integrity

Source workbook: `CRR_Calling_Data_Reprot.xlsx`

Every value in this application comes from that file. No demo, sample, placeholder
or synthetic record exists anywhere in the repository.

## Verification — row counts

Each sheet's data rows, from the workbook, against the generated JSON:

| Sheet | Excel | JSON | |
|---|---:|---:|---|
| 02 CALL LIST - TOP 100 | 100 | 100 | ✅ |
| 03 LAPSED BIG ACCOUNTS | 144 | 144 | ✅ |
| 04 DEALER & CHANNEL TARGETS | 54 | 54 | ✅ |
| 05 ARCHITECTS & INTERIORS | 38 | 38 | ✅ |
| 06 OTHER RESELLERS | 261 | 261 | ✅ |
| 07 INSTITUTIONS, GOVT & PSU | 19 | 19 | ✅ |
| 08 CORPORATES | 126 | 126 | ✅ |
| 09 ACTIVE REPEAT - PROTECT | 70 | 70 | ✅ |
| 10 ONE-TIME BUYERS | 396 | 396 | ✅ |
| 11 NEAR FACTORY - VISIT | 70 | 70 | ✅ |
| 12 NO PHONE ON FILE | 105 | 105 | ✅ |
| 13 DUPLICATES & SHARED PHONES | 42 | 42 | ✅ |
| 14 DATA TO CLEAN | 29 | 29 | ✅ |
| **Total** | **1,454** | **1,454** | ✅ |

## Verification — value totals

`Total Order Value (Rs.)` summed per sheet, Excel against JSON:

| Sheet | Excel | JSON | |
|---|---:|---:|---|
| 02 CALL LIST - TOP 100 | 69,171,657.79 | 69,171,657.79 | ✅ |
| 03 LAPSED BIG ACCOUNTS | 41,212,414.34 | 41,212,414.34 | ✅ |
| 04 DEALER & CHANNEL TARGETS | 9,299,105.36 | 9,299,105.36 | ✅ |
| 05 ARCHITECTS & INTERIORS | 10,529,507.25 | 10,529,507.25 | ✅ |
| 06 OTHER RESELLERS | 50,103,157.89 | 50,103,157.89 | ✅ |
| 07 INSTITUTIONS, GOVT & PSU | 4,643,853.00 | 4,643,853.00 | ✅ |
| 08 CORPORATES | 37,874,501.73 | 37,874,501.73 | ✅ |
| 09 ACTIVE REPEAT - PROTECT | 48,423,484.71 | 48,423,484.71 | ✅ |
| 10 ONE-TIME BUYERS | 18,959,650.69 | 18,959,650.69 | ✅ |
| 11 NEAR FACTORY - VISIT | 4,695,766.80 | 4,695,766.80 | ✅ |
| 12 NO PHONE ON FILE | 10,754,823.09 | 10,754,823.09 | ✅ |
| 14 DATA TO CLEAN | 67,142.00 | 67,142.00 | ✅ |

Sheets overlap by design — an account can appear in several. The workbook's own
`Sr. No.` is the identity key, giving **760 unique accounts** carrying
**₹11,50,00,957.63**.

## What the pipeline computes

The build script copies source cells verbatim, then derives these fields — all from
real values, nothing invented:

| Field | Derivation |
|---|---|
| `phones[]` | Split and validated from the `Phone No.` cell. Multi-number cells yield several. Nothing is fabricated when the cell is empty. |
| `has_phone` | Whether any valid number was found |
| `seg_code`, `seg_label` | Parsed from the workbook's own `segment` string |
| `abc`, `cum_share` | Pareto class from the cumulative revenue curve (A ≤ 80%, B ≤ 95%, C rest) |
| `R`, `F`, `M`, `rfm` | R from `days_since` (≤30/90/180/365), F from `total_orders` (1/2/3-4/5-9/10+), M from value quintiles |
| `churn_risk`, `risk_band` | Recency-weighted score, penalised for single-order accounts and 180-day+ gaps |
| `value_at_risk` | `total_value × churn_risk / 100` |
| `tags`, `sheets` | Which modules the account appears in |

Priority score in the call queue:

```
(upside × 0.55  +  total_value × 0.25  +  upside × churn_risk/100 × 0.6)
  × reachability (1.0 with a phone, 0.25 without)
  × action weight (CALL NOW 1.35, VISIT 1.20, DEALER/TENDER 1.15, LOW PRIORITY 0.45)
  × confidence  (HIGH 1.15, LOW 0.90)
```

## Accounts with no phone

**348 of 760** accounts carry no phone number in the source file. The application
never invents one — those rows are shaded, tagged **NO PHONE**, and down-weighted in
the priority queue. Module 12 isolates the **105** that are worth tracing, each with
its GSTIN and full address.

## Rebuilding

```bash
pip install openpyxl
SRC_XLSX=/path/to/CRR_Calling_Data_Reprot.xlsx python3 build_data.py
```

Outputs to `data/`: `meta`, `analytics`, `customers`, and one `module-*` per sheet,
each as `.json` and `.js`.
