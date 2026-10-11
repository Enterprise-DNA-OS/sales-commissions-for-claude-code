---
description: Add someone who is paid commission.
---

Read CLAUDE.md first.

```bash
npm run commissions -- add-payee --name="Lena Fox" --country=AU --team="AU Sales" --employment=employee --actor="Leah Moore"
```

AU employees default to 12% super and NZ employees to 3.5% KiwiSaver. Contractors default to none. Confirm the rate with the operator.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
