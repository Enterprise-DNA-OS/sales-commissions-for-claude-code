---
description: Record that a won deal was cancelled, and show any clawback it triggers.
---

Read CLAUDE.md first.

```bash
npm run commissions -- cancel-deal --deal="Hobart" --reason="Customer withdrew" --actor="Leah Moore"
```

Cancelled inside its own month it simply stops counting. Cancelled after it was paid, it goes to clawbacks.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
