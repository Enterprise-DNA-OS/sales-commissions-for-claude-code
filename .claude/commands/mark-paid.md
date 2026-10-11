---
description: Record that payroll has paid a locked period, with the payday and the payroll reference.
---

Read CLAUDE.md first.

```bash
npm run commissions -- mark-paid --period=2026-09 --date=2026-10-07 --payroll-ref="PAY-2026-09" --actor="Leah Moore"
```

Always ask for the payroll reference. A NZ commission paid outside payroll can miss holiday pay (see docs/compliance.md).

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
