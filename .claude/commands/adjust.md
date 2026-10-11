---
description: Add a spiff, correction or draw to a rep in the open period, with the reason and who approved it.
---

Read CLAUDE.md first.

```bash
npm run commissions -- adjust --payee="Ben" --kind=spiff --amount=500 --reason="New-logo spiff" --actor="Leah Moore"
```

Negative amounts are allowed for corrections. Locked periods never change: corrections land in the open period.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
