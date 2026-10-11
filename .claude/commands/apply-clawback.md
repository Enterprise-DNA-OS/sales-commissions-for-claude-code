---
description: Recover commission on a cancelled deal as a negative adjustment in the open period.
---

Read CLAUDE.md first.

```bash
npm run commissions -- apply-clawback --deal="Mt Eden" --period=2026-09 --actor="Leah Moore"
```

One clawback per deal and rep. If it would take a rep's month below zero, say so before running it.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
