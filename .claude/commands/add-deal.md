---
description: Add a won deal and credit it to a rep.
---

Read CLAUDE.md first.

```bash
npm run commissions -- add-deal --name="Grey Lynn Wholefoods supply" --customer="Grey Lynn Wholefoods" --closed=2026-10-03 --amount=33000 --term=12 --payee="Aroha" --actor="Leah Moore"
```

The deal is credited 100% to the named rep; use split-deal for shared deals. Term in months drives the contract cost schedule.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
