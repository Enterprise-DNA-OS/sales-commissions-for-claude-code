# Research notes: CaptivateIQ and commission software

Checked 11 October 2026.

## What CaptivateIQ charges

- The pricing page publishes no prices. It says pricing is "simple, per-seat pricing" plus "a one-time setup fee", and that seats are "the number of admin users plus the total number of payees". ASC-606 reporting is "available as an add-on subscription". Managed services come in three tiers. Source: https://www.captivateiq.com/pricing
- Third-party estimates (Vendr data quoted by Coefficient) put contracts for 30 to 50 reps in the tens of thousands of US dollars a year after discounts, with implementation on top. These are estimates, not vendor prices: https://coefficient.io/sales-operations/captivateiq-pricing

## A rival that does publish prices

QuotaPath, billed annually (https://www.quotapath.com/pricing/):

- Growth: $35 per user per month plus a $525 per month platform fee that covers the first five users.
- Premium: $50 per user per month plus an $800 per month platform fee that covers the first five users.
- Admins and members both count as users.

## What the export gives you

CaptivateIQ lets admins save payout export templates and export payout reports each period (https://www.captivateiq.com/blog/export-payout-data-with-customizable-templates). Its API has export endpoints for payout summaries, payout adjustments and employee assumptions (payee attributes). Plans live as worksheets and formulas inside CaptivateIQ and do not export as data.

## What commission admins do every month

Pull won deals from the CRM, fix credits and splits, answer rep queries, lock the month, hand payroll a total per person, send statements, recover commission on cancelled deals, and give finance an accrual and a contract cost schedule. Those are the commands in this repo.
