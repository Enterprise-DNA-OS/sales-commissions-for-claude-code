<h1 align="center">Sales Commissions for Claude Code</h1>

<p align="center">
  <strong>The open-source sales commission system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your CaptivateIQ data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=captivateiq">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/captivateiq?utm_source=github&utm_medium=readme&utm_campaign=captivateiq">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-captivateiq">Instead of CaptivateIQ</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Sales Commissions for Claude Code does the job you pay CaptivateIQ for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the CaptivateIQ dashboard cannot.

CaptivateIQ publishes no prices: its pricing page quotes per seat, counting every admin and every payee, plus a one-time setup fee, with ASC 606 reporting as an add-on subscription ([pricing page](https://www.captivateiq.com/pricing), checked 11 October 2026). For a published comparison, QuotaPath's Premium plan is $800 a month plus $50 a user above five ([pricing](https://www.quotapath.com/pricing/)).

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=captivateiq).

It runs the monthly commission cycle for a business that pays salespeople, account managers or referral partners on commission: monthly quotas, tiered rate bands with accelerators, split deals, spiffs and corrections, clawbacks on cancelled deals, rep disputes, a month-end lock that freezes every statement, and the hand-over to payroll. It knows the Australian and New Zealand rules that apply once commission is paid (super on commission, Payday Super, holiday pay on commission, pay records) and gives finance an accrual and a contract cost schedule. Built for NZ and AU sales teams of 5 to 200 people.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for what a rep portal gives that this does not.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/sales-commissions-for-claude-code.git
cd sales-commissions-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo is Kōwhai Distribution, a fictional NZ and AU wholesaler: last month is overdue to lock, a rep has an open dispute, a cancelled deal is waiting to be clawed back and one super payment arrived late.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

37 commands. Every one drives `npm run commissions -- <command>`, which also takes `--json`.

| Command | What it does |
|---|---|
| `/accept-plan` | Record that a rep accepted their plan, with the evidence. |
| `/accruals` | Show commission owed but not yet paid, by currency, with super on top, for the month-end accrual. |
| `/add-deal` | Add a won deal and credit it to a rep. |
| `/add-payee` | Add someone who is paid commission. |
| `/adjust` | Add a spiff, correction or draw to a rep in the open period, with the reason and who approved it. |
| `/apply-clawback` | Recover commission on a cancelled deal as a negative adjustment in the open period. |
| `/assign-plan` | Put a rep on a plan with a monthly quota from a start date (ends any earlier plan the day before). |
| `/attainment` | Show each rep against quota this month: credited sales, attainment, commission earned so far. |
| `/attention` | List what has gone overdue or stuck: unlocked months, old disputes, clawbacks waiting, close issues and compliance breaches. |
| `/cancel-deal` | Record that a won deal was cancelled, and show any clawback it triggers. |
| `/clawbacks` | List commission already paid on deals cancelled inside the plan's clawback window, and how much to recover. |
| `/close-check` | List everything blocking the month-end lock: uncredited deals, splits that do not add to 100%, reps with no plan, currency mismatches, unaccepted plans and open disputes. |
| `/compliance` | Check the records against the rules this industry lives under (the ones listed in docs/compliance.md) and report what is missing, late, or about to breach, with the rule cited. |
| `/contract-costs` | Show commission to capitalise on multi-year deals and its monthly expense (AASB 15 and NZ IFRS 15, paragraphs 91 to 94). |
| `/cost-of-sales` | Show commission cost as a share of credited sales, by team and month. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/disputes` | List commission disputes, open ones first, with how long each has been open. |
| `/draft-dispute-reply` | Draft a reply to a rep about their dispute, with the deal facts filled in. |
| `/draft-statement` | Write a rep's commission statement as a draft note they can be sent. |
| `/export` | Write every record to one JSON file the business owns. |
| `/help` | List every command this system has, in plain words. |
| `/history` | Show the last 50 changes and who made them. |
| `/import` | Bring payees, deals and past payouts across from CaptivateIQ exports. |
| `/lock-period` | Lock a period: freeze every payout and its statement lines so payroll can pay it. |
| `/mark-paid` | Record that payroll has paid a locked period, with the payday and the payroll reference. |
| `/month-end` | Run the month-end commission close: check, fix with approval, lock, then draft every statement. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/payees` | List everyone paid commission, their country, currency and super or KiwiSaver rate. |
| `/payouts` | List frozen payouts by period with super due and paid. |
| `/plans` | List the commission plans with their rate bands and clawback windows. |
| `/quota-gap` | Show how far each rep is from quota and from the next rate band, with days left in the month. |
| `/raise-dispute` | Log a rep's query about their commission against a period and, if named, a deal. |
| `/record-super` | Record the day super reached the fund for a rep and period, and check it against Payday Super. |
| `/resolve-dispute` | Close a dispute as upheld or rejected, with the reason. |
| `/split-deal` | Set a rep's share of a deal (splits must add to 100% before the lock). |
| `/statement` | Show one rep's commission statement for a period: every deal, each rate band, every adjustment. |
| `/weekly-review` | Write the Monday commission review from attention, attainment, accruals, disputes and compliance. |

### What it looks like

```
$ npm run commissions -- statement --payee=Aroha --period=2026-08
Aroha Ngata, 2026-08 (paid)
  Quota $60,000  Credited $86,000  Commission $6,720  Adjustments $0  Total $6,720

  kind  label                                                    basis  rate %  amount  currency
  deal  Kapiti Coast Markets three-year supply (...)           $74,000                  NZD
  deal  Mt Eden Organics trial (Mt Eden Organics, 2026-08-21)  $12,000                  NZD
  band  Band 0% to 50% of quota                                $30,000       4  $1,200  NZD
  band  Band 50% to 100% of quota                              $30,000       8  $2,400  NZD
  band  Above 100% of quota                                    $26,000      12  $3,120  NZD
```

## Ten questions CaptivateIQ's dashboards do not answer for you

Each is one command here, on your own data.

| Question | Command |
|---|---|
| Which paid deals were cancelled inside the clawback window, and how much do we recover from whom? | `clawbacks` |
| Did super on last month's commission reach the fund within 7 business days of payday? | `compliance` |
| Which NZ commission was paid outside payroll and could be missing from holiday pay? | `compliance` |
| What exactly stops us locking last month right now? | `close-check` |
| How much more does each rep need to reach the next rate band, with how many days left? | `quota-gap` |
| What commission do we owe but have not paid, by currency, with super on top? | `accruals` |
| How much commission on multi-year deals should the accountant capitalise, and what is this month's expense? | `contract-costs` |
| Which team's commission cost rose as a share of sales this month? | `cost-of-sales` |
| Who is being paid against a plan they never accepted? | `compliance` |
| Which disputes have been open more than two weeks, and who owns them? | `attention` |

## Your first hour: ten things to ask for

1. "Put our business name, logo and colours on the statements" (edits `brand.json`).
2. "What needs doing before payroll?"
3. "Why is Aroha's August commission $6,720?"
4. "Fix the Surry Hills split to 60/40 and resolve Priya's dispute."
5. "Claw back the Mt Eden commission into September."
6. "Lock September and draft every statement."
7. "Our AE plan pays 5% to quota and 10% above it, with a 120-day clawback" (`/customise`).
8. "Add a quarterly bonus for hitting three months in a row" (`/customise`).
9. "Give me a page for the sales manager: attainment and quota gap by team" (`/new-view`).
10. "Test our CaptivateIQ export without saving it."

## Instead of CaptivateIQ

Export payees, deals and payout history from CaptivateIQ as CSV, do a test run, then import:

```bash
npm run commissions -- import captivateiq --payees=imports/payees.csv --deals=imports/deals.csv --payouts=imports/payouts.csv --actor="Migration" --dry-run
```

Plans do not export from CaptivateIQ (they are worksheets and formulas there), so you set your rate bands up once with `/customise`. The full guide, with the columns to put in each export template and everything that does not carry over: [docs/replace-captivateiq.md](docs/replace-captivateiq.md).

## Documents and views

- `npm run docs` renders a branded commission statement for every frozen payout and a plan letter for every rep to sign, from `brand.json`.
- `npm run view` renders two read-only pages: the week (what needs doing, attainment, disputes) and finance (owed, earned, cost of sales).
- `/compliance` checks the records against the rules in [docs/compliance.md](docs/compliance.md), each with its source. What a screen gives that this does not: [docs/why-no-front-end.md](docs/why-no-front-end.md).

## How the numbers work

- Credit: a won deal counts in the month it closed, at each rep's split, in the rep's currency. A deal cancelled in the same month never counts.
- Bands: each band pays its rate on the slice of credited sales inside it, as a share of the monthly quota. The top band with no ceiling is the accelerator.
- Lock: locking a month freezes every payout and its lines. The database refuses edits and deletes from then on (pay records are kept for seven years); anything wrong goes into the next open month as an adjustment.
- Clawback: a paid deal cancelled inside the plan's window is recovered at the effective rate that month paid.
- Super: Australian employees carry 12%, New Zealand employees their KiwiSaver rate. The statement shows it; payroll pays it.

This is not payroll. It does not withhold tax, pay anyone or file with the ATO or IRD.

## Architecture

```
sales-commissions-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Sales Commissions for Claude Code for your business, migrates your CaptivateIQ data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=captivateiq)
- Read more: [enterprisedna.co/omni/instead-of/captivateiq](https://enterprisedna.co/omni/instead-of/captivateiq?utm_source=github&utm_medium=readme&utm_campaign=captivateiq)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
