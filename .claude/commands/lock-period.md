---
description: Lock a period: freeze every payout and its statement lines so payroll can pay it.
---

Read CLAUDE.md first.

```bash
npm run commissions -- lock-period --period=2026-09 --actor="Leah Moore"
```

Run close-check first. Locking refuses while issues remain unless --override="<reason>" is given by the operator. Locking cannot be undone; confirm the period name back before you run it.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
