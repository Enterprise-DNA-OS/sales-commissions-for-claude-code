---
description: Log a rep's query about their commission against a period and, if named, a deal.
---

Read CLAUDE.md first.

```bash
npm run commissions -- raise-dispute --payee="Priya" --period=2026-09 --deal="Surry Hills" --detail="Expected 70/30 split" --owner="Leah Moore" --actor="Leah Moore"
```

Write the rep's words in --detail, not a summary of them.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
