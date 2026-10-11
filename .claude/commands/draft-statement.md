---
description: Write a rep's commission statement as a draft note they can be sent.
---

Read CLAUDE.md first.

```bash
npm run commissions -- draft-statement --payee="Aroha" --period=2026-08
```

Output goes to drafts/. Never send it. For the branded HTML version run `npm run docs -- commission-statement`.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
