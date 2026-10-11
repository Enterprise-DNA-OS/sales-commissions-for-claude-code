---
description: List everything blocking the month-end lock: uncredited deals, splits that do not add to 100%, reps with no plan, currency mismatches, unaccepted plans and open disputes.
---

Read CLAUDE.md first.

```bash
npm run commissions -- close-check
```

For each issue, name the command that fixes it (split-deal, assign-plan, accept-plan, resolve-dispute). Do not fix anything without a yes.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
