---
description: Close a dispute as upheld or rejected, with the reason.
---

Read CLAUDE.md first.

```bash
npm run commissions -- resolve-dispute --dispute=f0000000 --outcome=upheld --resolution="Split moved to 60/40 after review" --actor="Leah Moore"
```

If upheld, follow with the fix: split-deal before the lock, or adjust --kind=correction after it.

Every command takes --json. Dates are YYYY-MM-DD. A name that matches more than one record lists the candidates and stops: ask which one. Never send, publish or delete from this recipe.
