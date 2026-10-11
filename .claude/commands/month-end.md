---
description: Run the month-end commission close: check, fix with approval, lock, then draft every statement.
---

Read CLAUDE.md first. This is the monthly ritual; go step by step and stop for a yes where it says so.

1. Run close-check for the oldest open period and show the issues.
2. Propose the fix for each one and wait for a yes before running it.
3. Run clawbacks; apply each one into this period only with a yes (apply-clawback).
4. When close-check is empty, ask for the go, then run `npm run commissions -- lock-period --period=YYYY-MM --actor="<name>"`. Use --override only if the operator gives a reason in words, and record that reason.
5. Run `npm run commissions -- draft-statement --payee=<name> --period=YYYY-MM` for each payee, and `npm run docs -- commission-statement` for the branded versions.
6. Report payouts by currency and the payroll total to hand over. A locked period never changes; anything wrong goes into next month as an adjustment.

Never send statements from here. They are drafts until a person sends them.
