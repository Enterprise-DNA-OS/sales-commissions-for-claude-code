# Moving off CaptivateIQ

CaptivateIQ keeps payees, the data you load (deals from your CRM), the plans, and every payout it has calculated. Three exports bring the history across: payees, deals and payouts. Plans stay behind, because in CaptivateIQ they are worksheets and formulas, not rows. You set your bands up once here (ten minutes with `/customise`), lock one month in both systems, and compare.

## 1. Export from CaptivateIQ

CaptivateIQ builds exports from templates you save, so you choose the columns. Put these in each template; any heading in the right-hand column works.

**Payees** (from the payee list or the employee assumptions export)

| Field here | Headings the importer accepts |
|---|---|
| id | Employee ID, Payee ID, ID |
| name (required) | Name, Employee Name, Payee Name, Payee |
| email | Email, Employee Email |
| role | Role, Title, Job Title |
| team | Team, Department |
| manager | Manager, Manager Name |
| country | Country (New Zealand, Australia, NZ, AU) |
| currency | Currency, Payout Currency |
| start, end | Start Date, Hire Date; End Date, Termination Date |
| employment | Employment Type, Worker Type (anything containing "contract" becomes a contractor) |

**Deals** (the data worksheet you load from your CRM, or a CRM report)

| Field here | Headings the importer accepts |
|---|---|
| id | Deal ID, Opportunity ID, Record ID |
| name (required) | Deal Name, Opportunity Name, Name |
| customer | Account Name, Customer, Account |
| closed (required) | Close Date, Closed Date |
| amount (required) | Amount, Deal Amount, ACV |
| currency | Currency (defaults to the payee's) |
| term | Term (Months), Contract Term, Term Months (defaults to 12) |
| payee (required) | Owner, Opportunity Owner, Deal Owner, Payee, Employee ID (matched on employee ID, name or email) |
| split | Split %, Split Percent, Credit % (defaults to 100) |

**Payouts** (a payout report, one row per payee per period)

| Field here | Headings the importer accepts |
|---|---|
| payee (required) | Employee ID, Payee ID, Payee, Name, Employee Name |
| start (required) | Period Start, Period Start Date, Payout Period Start |
| paid | Payout Date, Pay Date |
| amount (required) | Payout Amount, Amount, Total Payout |
| currency | Currency, Payout Currency |

Dates can be `YYYY-MM-DD` or day first (`14/05/2026`), the way NZ and AU exports write them. Amounts can carry commas and a dollar sign.

Headings named differently? Write a mapping file and pass `--mapping=map.json`:

```json
{ "payees": { "name": "Full Name" }, "deals": { "payee": "Sales Rep Email" } }
```

## 2. Do a test run

```bash
npm run commissions -- import captivateiq --payees=imports/payees.csv --deals=imports/deals.csv --payouts=imports/payouts.csv --actor="Migration" --dry-run
```

It reports what it would create, what it would skip as already there, and every row it could not place (a deal whose owner is not a payee, a payout for a month you have already opened here). Nothing is saved. Fix the export and run it again until the problems list is empty.

## 3. Import for real

Run the same command without `--dry-run`. Running it twice is safe: rows already imported are skipped by their CaptivateIQ ID or name.

## What maps

- Payees, with country, currency and employment. Australian employees get 12% super and New Zealand employees 3.5% KiwiSaver by default; check each one with `npm run commissions -- payees`.
- Deals, credited to the payee at the split in the file.
- Past payouts, as paid (or locked, with no payout date) periods. Each one keeps the full original row, so the record of what CaptivateIQ paid is intact.

## What does not carry over

- **Plans and formulas.** Recreate them as rate bands (`/customise`: "our AE plan pays 5% to quota and 10% above it, clawback 120 days"), then assign each rep with `assign-plan`.
- **The workings behind past payouts.** Imported payouts carry the total, not CaptivateIQ's line-by-line calculation. Keep a PDF of past statements if you need them for disputes.
- **Quotas and plan acceptances.** Set with `assign-plan` and `accept-plan`.
- **Disputes, approvals and comments** inside CaptivateIQ.
- **Super payment dates.** They live in payroll; record recent ones with `record-super` if you want the Payday Super check to cover them.

## 4. Run one month in parallel

Load the month's deals here, run `close-check`, `lock-period`, and compare each payee's total with CaptivateIQ's for the same month. When they match, the next month runs here only.
