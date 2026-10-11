# Sales Commissions for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Record that a rep accepted their plan, with the evidence | `/accept-plan` |
| Show commission owed but not yet paid, by currency, with super on top, for the month-end accrual | `/accruals` |
| Add a won deal and credit it to a rep | `/add-deal` |
| Add someone who is paid commission | `/add-payee` |
| Add a spiff, correction or draw to a rep in the open period, with the reason and who approved it | `/adjust` |
| Recover commission on a cancelled deal as a negative adjustment in the open period | `/apply-clawback` |
| Put a rep on a plan with a monthly quota from a start date (ends any earlier plan the day before) | `/assign-plan` |
| Show each rep against quota this month: credited sales, attainment, commission earned so far | `/attainment` |
| List what has gone overdue or stuck: unlocked months, old disputes, clawbacks waiting, close issues and compliance breaches | `/attention` |
| Record that a won deal was cancelled, and show any clawback it triggers | `/cancel-deal` |
| List commission already paid on deals cancelled inside the plan's clawback window, and how much to recover | `/clawbacks` |
| List everything blocking the month-end lock: uncredited deals, splits that do not add to 100%, reps with no plan, currency mismatches, unaccepted plans and open disputes | `/close-check` |
| Check the records against the rules this industry lives under (the ones listed in docs/compliance.md) and report what is missing, late, or about to breach, with the rule cited | `/compliance` |
| Show commission to capitalise on multi-year deals and its monthly expense (AASB 15 and NZ IFRS 15, paragraphs 91 to 94) | `/contract-costs` |
| Show commission cost as a share of credited sales, by team and month | `/cost-of-sales` |
| Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it | `/customise` |
| List commission disputes, open ones first, with how long each has been open | `/disputes` |
| Draft a reply to a rep about their dispute, with the deal facts filled in | `/draft-dispute-reply` |
| Write a rep's commission statement as a draft note they can be sent | `/draft-statement` |
| Write every record to one JSON file the business owns | `/export` |
| List every command this system has, in plain words | `/help` |
| Show the last 50 changes and who made them | `/history` |
| Bring payees, deals and past payouts across from CaptivateIQ exports | `/import` |
| Lock a period: freeze every payout and its statement lines so payroll can pay it | `/lock-period` |
| Record that payroll has paid a locked period, with the payday and the payroll reference | `/mark-paid` |
| Run the month-end commission close: check, fix with approval, lock, then draft every statement | `/month-end` |
| Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view` | `/new-view` |
| List everyone paid commission, their country, currency and super or KiwiSaver rate | `/payees` |
| List frozen payouts by period with super due and paid | `/payouts` |
| List the commission plans with their rate bands and clawback windows | `/plans` |
| Show how far each rep is from quota and from the next rate band, with days left in the month | `/quota-gap` |
| Log a rep's query about their commission against a period and, if named, a deal | `/raise-dispute` |
| Record the day super reached the fund for a rep and period, and check it against Payday Super | `/record-super` |
| Close a dispute as upheld or rejected, with the reason | `/resolve-dispute` |
| Set a rep's share of a deal (splits must add to 100% before the lock) | `/split-deal` |
| Show one rep's commission statement for a period: every deal, each rate band, every adjustment | `/statement` |
| Write the Monday commission review from attention, attainment, accruals, disputes and compliance | `/weekly-review` |

If an ask fits nothing here, run the CLI directly (`npm run commissions -- help`) and then propose a new command for it.

## How commission works here

- Money is integer cents in the payee's currency. Never add NZD and AUD together.
- A deal counts in the month it closed, at each rep's split. Splits must total 100% before a month locks.
- A locked month is frozen. Corrections go into the next open month as an adjustment, with a reason and the approver.
- Locking, marking paid and applying a clawback change pay: confirm the period and amounts back to the operator and wait for a yes.
- Super, KiwiSaver, tax and filing stay in payroll. This system records and checks; it never pays.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off CaptivateIQ.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/captivateiq
