---
description: Put a rep on a plan with a monthly quota from a start date (ends any earlier plan the day before).
---

Read CLAUDE.md first.

```bash
npm run commissions -- assign-plan --payee="Lena" --plan="Account Executive 2026" --quota=50000 --start=2026-10-01 --actor="Leah Moore"
```

Then render the plan letter with `npm run docs -- plan-letter` for the rep to sign.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
