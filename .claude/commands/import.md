---
description: Bring payees, deals and past payouts across from CaptivateIQ exports.
---

Read CLAUDE.md first.

```bash
npm run commissions -- import captivateiq --payees=imports/payees.csv --deals=imports/deals.csv --payouts=imports/payouts.csv --actor="Migration" --dry-run
```

Always run with --dry-run first and show the report. Then run without it on a yes. Read docs/replace-captivateiq.md for the export template and what does not carry over. Use --mapping=<file.json> for headings named differently.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
