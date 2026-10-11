#!/usr/bin/env node
// The one CLI. Every slash command in .claude/commands drives this file.
//   npm run commissions -- <command> [--flags] [--json]
// Human tables by default, --json for machines. Names match case-insensitively, by id
// prefix, or by a unique part of the name; an ambiguous match lists the candidates and exits 1.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, heading } from './lib/format.mjs';

// ---------------------------------------------------------------- reads

export const reads = {
  payees: `select id, name, role, team, country, currency, employment, retirement_rate_pct as super_or_kiwisaver_pct, starts_on, ends_on
    from comm.payees order by name`,
  plans: `select pl.name as plan, trim_scale(t.floor_pct) || '%' || coalesce(' to ' || trim_scale(t.ceiling_pct) || '%', ' and up') as band, t.rate_pct as rate_pct, pl.clawback_days
    from comm.plans pl join comm.plan_tiers t on t.plan_id = pl.id order by pl.name, t.floor_pct`,
  assignments: `select a.id, y.name as payee, pl.name as plan, a.monthly_quota_cents as quota_cents, y.currency, a.starts_on, a.ends_on, a.accepted_on
    from comm.assignments a join comm.payees y on y.id = a.payee_id join comm.plans pl on pl.id = a.plan_id order by y.name, a.starts_on`,
  periods: `select name as period, status, starts_on, ends_on, locked_on, paid_on, payroll_ref,
    (select count(*) from comm.close_issues c where c.period_id = p.id)::int as close_issues
    from comm.periods p order by starts_on`,
  deals: `select d.id, d.name as deal, d.customer, d.closed_on, d.amount_cents, d.currency, d.term_months, d.cancelled_on,
    coalesce((select string_agg(y.name || ' ' || c.split_pct || '%', ', ' order by y.name) from comm.credits c join comm.payees y on y.id = c.payee_id where c.deal_id = d.id), '(nobody)') as credited_to
    from comm.deals d order by d.closed_on desc, d.name`,
  adjustments: `select a.id, pr.name as period, y.name as payee, a.kind, a.amount_cents, y.currency, a.reason, a.approved_by
    from comm.adjustments a join comm.payees y on y.id = a.payee_id join comm.periods pr on pr.id = a.period_id order by pr.starts_on desc, y.name`,
  disputes: `select s.id, s.name as dispute, y.name as payee, pr.name as period, s.status, s.raised_on, (current_date - s.raised_on) as days_open, s.owner, s.detail
    from comm.disputes s join comm.payees y on y.id = s.payee_id join comm.periods pr on pr.id = s.period_id
    order by (s.status = 'open') desc, s.raised_on`,
  payouts: `select pr.name as period, pr.status, y.name as payee, po.credited_cents, po.commission_cents, po.adjustments_cents, po.total_cents,
    po.super_due_cents, po.super_paid_on, po.currency
    from comm.payouts po join comm.payees y on y.id = po.payee_id join comm.periods pr on pr.id = po.period_id order by pr.starts_on desc, y.name`,
  'close-check': `select period, issue, item, detail from comm.close_issues order by period, issue, item`,
  clawbacks: `select deal, customer, payee, closed_on, cancelled_on, days_live, clawback_days, paid_period, clawback_cents, currency
    from comm.clawback_queue order by cancelled_on, deal`,
  compliance: `select severity, rule, payee, period, finding from comm.compliance_findings
    order by case severity when 'breached' then 0 else 1 end, rule, payee`,
  'cost-of-sales': `select period, team, currency, sum(credited_cents)::bigint as credited_cents,
    sum(commission_cents + adjustments_cents)::bigint as cost_cents,
    round(100.0 * sum(commission_cents + adjustments_cents) / nullif(sum(credited_cents), 0), 1) as cost_pct
    from comm.period_commission group by period, team, currency order by period desc, team, currency`,
  'contract-costs': `select y.name as payee, d.name as deal, d.closed_on, d.term_months, po.currency,
    round(l.basis_cents * po.commission_cents::numeric / nullif(po.credited_cents, 0))::bigint as capitalised_cents,
    least(d.term_months, greatest(0, (extract(year from age(current_date, d.closed_on)) * 12 + extract(month from age(current_date, d.closed_on)))::int)) as months_amortised,
    round(round(l.basis_cents * po.commission_cents::numeric / nullif(po.credited_cents, 0)) / d.term_months)::bigint as monthly_expense_cents
    from comm.payout_lines l join comm.payouts po on po.id = l.payout_id join comm.payees y on y.id = po.payee_id join comm.deals d on d.id = l.deal_id
    where l.kind = 'deal' and d.term_months > 12 and po.commission_cents > 0 order by d.closed_on, y.name`,
  history: `select created_at, actor, action, detail from comm.activity order by id desc limit 50`,
};

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- argument parsing

export const specs = {
  ...Object.fromEntries(Object.keys(reads).map((k) => [k, []])),
  help: [],
  attainment: ['period'],
  'quota-gap': ['period'],
  accruals: [],
  statement: ['payee', 'period'],
  attention: [],
  'weekly-review': [],
  'add-payee': ['name', 'email', 'role', 'team', 'manager', 'country', 'currency', 'employment', 'super', 'start', 'actor'],
  'assign-plan': ['payee', 'plan', 'quota', 'start', 'end', 'actor'],
  'accept-plan': ['payee', 'evidence', 'date', 'actor'],
  'add-deal': ['name', 'customer', 'closed', 'amount', 'currency', 'term', 'product', 'payee', 'actor'],
  'split-deal': ['deal', 'payee', 'pct', 'actor'],
  'cancel-deal': ['deal', 'date', 'reason', 'actor'],
  adjust: ['payee', 'kind', 'amount', 'reason', 'period', 'deal', 'actor'],
  'apply-clawback': ['deal', 'period', 'actor'],
  'raise-dispute': ['payee', 'period', 'deal', 'detail', 'owner', 'actor'],
  'resolve-dispute': ['dispute', 'outcome', 'resolution', 'actor'],
  'lock-period': ['period', 'override', 'date', 'actor'],
  'mark-paid': ['period', 'date', 'payroll-ref', 'actor'],
  'record-super': ['payee', 'period', 'date', 'ref', 'actor'],
  'draft-statement': ['payee', 'period'],
  'draft-dispute-reply': ['dispute'],
  import: ['payees', 'deals', 'payouts', 'mapping', 'dry-run', 'actor'],
  export: ['out'],
};

const FLAGS = new Set(['json', 'dry-run', 'help']);

export function parse(args) {
  const pos = [];
  const o = {};
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (!x.startsWith('--')) { pos.push(x); continue; }
    const at = x.indexOf('=');
    const k = x.slice(2, at < 0 ? undefined : at);
    let v = at < 0 ? true : x.slice(at + 1);
    if (at < 0 && !FLAGS.has(k) && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) v = args[++i];
    if (k in o) throw Error(`Repeated --${k}`);
    o[k] = v;
  }
  let cmd = pos[0] || 'help';
  if (o.help) { cmd = 'help'; delete o.help; }
  if (!specs[cmd]) throw Error(`Unknown command "${cmd}". Run help for the list.`);
  if (cmd === 'import') {
    if (pos[1] !== 'captivateiq') throw Error('Use: import captivateiq --payees=<csv> --deals=<csv> --payouts=<csv>');
  } else if (pos.length > 1) throw Error(`Unexpected argument "${pos[1]}"`);
  for (const k of Object.keys(o)) {
    if (k !== 'json' && !specs[cmd].includes(k)) throw Error(`Unknown --${k} for ${cmd}`);
    if (FLAGS.has(k) && o[k] !== true) throw Error(`--${k} takes no value`);
  }
  return { cmd, o };
}

// ---------------------------------------------------------------- validation

const req = (o, k) => {
  if (typeof o[k] !== 'string' || !o[k].trim()) throw Error(`--${k} is required`);
  return o[k].trim();
};
const opt = (o, k) => (typeof o[k] === 'string' && o[k].trim() ? o[k].trim() : null);

export function date(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw Error(`Invalid date "${v}" (use YYYY-MM-DD)`);
  return v;
}
export function cents(v, { signed = false } = {}) {
  const s = String(v).replace(/[$,\s]/g, '');
  const re = signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(s)) throw Error(`Invalid amount "${v}"`);
  const n = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(n)) throw Error('Amount is too large');
  return n;
}
const pct = (v, lo, hi) => {
  const n = Number(v);
  if (!/^\d+(\.\d+)?$/.test(String(v)) || n < lo || n > hi) throw Error(`Percentage must be between ${lo} and ${hi}`);
  return n;
};
const choice = (v, allowed, what) => {
  if (!allowed.includes(v)) throw Error(`${what} must be one of ${allowed.join(', ')}`);
  return v;
};

// ---------------------------------------------------------------- lookups

const KINDS = {
  payees: 'comm.payees', plans: 'comm.plans', deals: 'comm.deals', disputes: 'comm.disputes',
};

export async function resolve(db, kind, value) {
  const t = KINDS[kind];
  if (!t) throw Error(`Unknown record kind ${kind}`);
  const v = String(value).trim();
  let rows = await db.query(`select id, name from ${t} where lower(name) = lower($1) or ($2::text is not null and id::text like $2) order by name`,
    [v, /^[0-9a-f-]{4,36}$/i.test(v) ? `${v.toLowerCase()}%` : null]);
  if (!rows.length) rows = await db.query(`select id, name from ${t} where name ilike $1 order by name`, [`%${v.replace(/[%_]/g, '')}%`]);
  if (rows.length !== 1) {
    const list = rows.map((r) => `\n  ${String(r.id).slice(0, 8)}  ${r.name}`).join('');
    const e = Error(`${rows.length ? 'More than one' : 'No'} ${kind.replace(/s$/, '')} matches "${v}"${list}`);
    e.ambiguous = true;
    throw e;
  }
  return rows[0];
}

// A period by name (2026-09), by "current" (the open period holding today), or by
// default the earliest open period: the one month-end is working on.
export async function period(db, v) {
  if (v && v !== 'current') {
    const rows = await db.query('select * from comm.periods where name = $1', [v]);
    if (!rows.length) throw Error(`No period ${v}. Periods are named YYYY-MM.`);
    return rows[0];
  }
  if (v === 'current') {
    const rows = await db.query('select * from comm.periods where current_date between starts_on and ends_on');
    if (rows.length) return rows[0];
  }
  const rows = await db.query("select * from comm.periods where status = 'open' order by starts_on limit 1");
  if (!rows.length) throw Error('No open period. Add one with the next month name, for example: insert via /customise or import.');
  return rows[0];
}

async function ensurePeriod(db, name) {
  const found = await db.query('select * from comm.periods where name = $1', [name]);
  if (found.length) return found[0];
  const start = `${name}-01`;
  return (await db.query(`insert into comm.periods (name, starts_on, ends_on) values ($1, $2::date, ($2::date + interval '1 month' - interval '1 day')::date) returning *`, [name, start]))[0];
}

const log = (db, actor, action, detail) => db.query('insert into comm.activity (actor, action, detail) values ($1, $2, $3)', [actor, action, detail]);

async function tx(db, fn) {
  await db.exec('BEGIN');
  try {
    const r = await fn();
    await db.exec('COMMIT');
    return r;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------- the work

async function attainment(db, o) {
  const p = await period(db, opt(o, 'period') || 'current');
  return db.query(`select period, status, payee, plan, quota_cents, credited_cents, deals, attainment_pct, commission_cents, adjustments_cents,
      (commission_cents + adjustments_cents) as earned_cents, currency
    from comm.period_commission where period_id = $1 order by attainment_pct desc, payee`, [p.id]);
}

async function quotaGap(db, o) {
  const p = await period(db, opt(o, 'period') || 'current');
  return db.query(`select pc.payee, pc.attainment_pct, greatest(0, pc.quota_cents - pc.credited_cents)::bigint as to_quota_cents,
      (select greatest(0, round(pc.quota_cents * t.ceiling_pct / 100) - pc.credited_cents)::bigint from comm.plan_tiers t
        join comm.plans pl on pl.id = t.plan_id where pl.name = pc.plan and t.ceiling_pct is not null
        and round(pc.quota_cents * t.ceiling_pct / 100) > pc.credited_cents order by t.floor_pct limit 1) as to_next_band_cents,
      (select t.rate_pct from comm.plan_tiers t join comm.plans pl on pl.id = t.plan_id where pl.name = pc.plan
        and round(pc.quota_cents * t.floor_pct / 100) > pc.credited_cents order by t.floor_pct limit 1) as next_band_rate_pct,
      ((select ends_on from comm.periods where id = pc.period_id) - $2::date) as days_left, pc.currency
    from comm.period_commission pc where pc.period_id = $1 order by pc.attainment_pct, pc.payee`, [p.id, today()]);
}

async function accruals(db) {
  const open = await db.query(`select 'Earned, period still open' as stage, pc.currency, count(*)::int as payees,
      sum(pc.commission_cents + pc.adjustments_cents)::bigint as amount_cents,
      sum(case when y.employment = 'employee' then round(greatest(0, pc.commission_cents + pc.adjustments_cents) * y.retirement_rate_pct / 100) else 0 end)::bigint as on_cost_cents
    from comm.period_commission pc join comm.payees y on y.id = pc.payee_id where pc.status = 'open' group by pc.currency`);
  const locked = await db.query(`select 'Locked, not yet paid' as stage, po.currency, count(*)::int as payees, sum(po.total_cents)::bigint as amount_cents,
      sum(po.super_due_cents)::bigint as on_cost_cents
    from comm.payouts po join comm.periods pr on pr.id = po.period_id where pr.status = 'locked' group by po.currency`);
  const superOwed = await db.query(`select 'Paid, super not yet recorded' as stage, po.currency, count(*)::int as payees, 0::bigint as amount_cents,
      sum(po.super_due_cents)::bigint as on_cost_cents
    from comm.payouts po join comm.periods pr on pr.id = po.period_id join comm.payees y on y.id = po.payee_id
    where pr.status = 'paid' and y.country = 'AU' and po.super_due_cents > 0 and po.super_paid_on is null group by po.currency`);
  return [...open, ...locked, ...superOwed];
}

async function statement(db, o) {
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const p = await period(db, opt(o, 'period'));
  const payout = (await db.query('select * from comm.payouts where payee_id = $1 and period_id = $2', [y.id, p.id]))[0];
  if (payout) {
    const lines = await db.query('select kind, label, basis_cents, rate_pct, amount_cents from comm.payout_lines where payout_id = $1 order by position', [payout.id]);
    return { payee: y.name, period: p.name, status: p.status, provisional: false, currency: payout.currency, quota_cents: payout.quota_cents,
      credited_cents: payout.credited_cents, commission_cents: payout.commission_cents, adjustments_cents: payout.adjustments_cents,
      total_cents: payout.total_cents, super_due_cents: payout.super_due_cents, lines };
  }
  const live = (await db.query('select * from comm.period_commission where payee_id = $1 and period_id = $2', [y.id, p.id]))[0];
  if (!live) throw Error(`${y.name} has no plan in force for ${p.name}`);
  const lines = await liveLines(db, y.id, p.id);
  return { payee: y.name, period: p.name, status: p.status, provisional: true, currency: live.currency, quota_cents: live.quota_cents,
    credited_cents: live.credited_cents, commission_cents: live.commission_cents, adjustments_cents: live.adjustments_cents,
    total_cents: Number(live.commission_cents) + Number(live.adjustments_cents), super_due_cents: null, lines };
}

async function liveLines(db, payeeId, periodId) {
  const deals = await db.query(`select 'deal' as kind, deal || ' (' || customer || ', ' || closed_on || case when split_pct < 100 then ', ' || trim_scale(split_pct) || '% split' else '' end || ')' as label,
      credited_cents as basis_cents, null::numeric as rate_pct, null::bigint as amount_cents, deal_id
    from comm.credit_lines where payee_id = $1 and period_id = $2 order by closed_on, deal`, [payeeId, periodId]);
  const bands = await db.query(`select 'band' as kind, coalesce('Band ' || trim_scale(floor_pct) || '% to ' || trim_scale(ceiling_pct) || '% of quota', 'Above ' || trim_scale(floor_pct) || '% of quota') as label,
      basis_cents, rate_pct, round(basis_cents * rate_pct / 100)::bigint as amount_cents, null::uuid as deal_id
    from comm.band_earnings where payee_id = $1 and period_id = $2 and basis_cents > 0 order by floor_pct`, [payeeId, periodId]);
  const adj = await db.query(`select 'adjustment' as kind, initcap(kind) || ': ' || reason as label, null::bigint as basis_cents, null::numeric as rate_pct,
      amount_cents, deal_id from comm.adjustments where payee_id = $1 and period_id = $2 order by created_at`, [payeeId, periodId]);
  return [...deals, ...bands, ...adj];
}

async function lockPeriod(db, o) {
  const actor = req(o, 'actor');
  const p = await period(db, opt(o, 'period'));
  if (p.status !== 'open') throw Error(`${p.name} is already ${p.status}`);
  const on = o.date ? date(req(o, 'date')) : today();
  const override = opt(o, 'override');
  const issues = await db.query('select issue, item, detail from comm.close_issues where period_id = $1', [p.id]);
  if (issues.length && !override) {
    throw Error(`${p.name} has ${issues.length} close issue(s). Fix them, or lock with --override="<reason>":\n` +
      issues.map((i) => `  ${i.issue}: ${i.item} (${i.detail})`).join('\n'));
  }
  return tx(db, async () => {
    const rows = await db.query(`select pc.*, y.employment, y.retirement_rate_pct from comm.period_commission pc join comm.payees y on y.id = pc.payee_id where pc.period_id = $1`, [p.id]);
    let payouts = 0;
    for (const r of rows) {
      const total = Number(r.commission_cents) + Number(r.adjustments_cents);
      const superDue = r.employment === 'employee' && total > 0 ? Math.round(total * Number(r.retirement_rate_pct) / 100) : 0;
      const po = (await db.query(`insert into comm.payouts (payee_id, period_id, currency, quota_cents, credited_cents, commission_cents, adjustments_cents, total_cents, super_due_cents)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [r.payee_id, p.id, r.currency, r.quota_cents, r.credited_cents, r.commission_cents, r.adjustments_cents, total, superDue]))[0];
      const lines = await liveLines(db, r.payee_id, p.id);
      let i = 0;
      for (const l of lines) {
        await db.query(`insert into comm.payout_lines (payout_id, kind, label, basis_cents, rate_pct, amount_cents, deal_id, position) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [po.id, l.kind, l.label, l.basis_cents, l.rate_pct, l.amount_cents, l.deal_id, i++]);
      }
      payouts++;
    }
    await db.query(`update comm.periods set status = 'locked', locked_on = $2, locked_by = $3, lock_override = $4 where id = $1`, [p.id, on, actor, override]);
    await log(db, actor, 'lock-period', `${p.name}: ${payouts} payout(s) frozen${override ? `; override: ${override}` : ''}`);
    return { period: p.name, status: 'locked', payouts, override };
  });
}

async function markPaid(db, o) {
  const actor = req(o, 'actor');
  const p = await period(db, req(o, 'period'));
  if (p.status !== 'locked') throw Error(`${p.name} is ${p.status}: only a locked period can be marked paid`);
  const on = date(req(o, 'date'));
  if (on < p.locked_on) throw Error('Payday cannot be before the period locked');
  const ref = opt(o, 'payroll-ref');
  await db.query(`update comm.periods set status = 'paid', paid_on = $2, payroll_ref = $3 where id = $1`, [p.id, on, ref]);
  await log(db, actor, 'mark-paid', `${p.name} paid ${on}${ref ? ` (payroll ${ref})` : ' (no payroll reference)'}`);
  return { period: p.name, status: 'paid', paid_on: on, payroll_ref: ref };
}

async function recordSuper(db, o) {
  const actor = req(o, 'actor');
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const p = await period(db, req(o, 'period'));
  const on = date(req(o, 'date'));
  if (p.status !== 'paid') throw Error(`${p.name} has not been paid yet`);
  if (on < p.paid_on) throw Error('Super cannot reach the fund before payday');
  const rows = await db.query('update comm.payouts set super_paid_on = $3, super_ref = $4 where payee_id = $1 and period_id = $2 returning super_due_cents, currency', [y.id, p.id, on, opt(o, 'ref')]);
  if (!rows.length) throw Error(`${y.name} has no payout in ${p.name}`);
  const days = (await db.query('select comm.business_days_between($1::date, $2::date) as d', [p.paid_on, on]))[0].d;
  await log(db, actor, 'record-super', `${y.name} ${p.name}: ${money(rows[0].super_due_cents, rows[0].currency)} received ${on}, ${days} business day(s) after payday`);
  return { payee: y.name, period: p.name, super_paid_on: on, business_days_after_payday: days, on_time: days <= 7 };
}

async function addPayee(db, o) {
  const actor = req(o, 'actor');
  const country = choice(opt(o, 'country') || 'NZ', ['NZ', 'AU', 'OTHER'], 'Country');
  const employment = choice(opt(o, 'employment') || 'employee', ['employee', 'contractor'], 'Employment');
  const currency = (opt(o, 'currency') || (country === 'AU' ? 'AUD' : 'NZD')).toUpperCase();
  const dflt = employment === 'contractor' ? 0 : country === 'AU' ? 12 : country === 'NZ' ? 3.5 : 0;
  const rate = o.super !== undefined ? pct(req(o, 'super'), 0, 30) : dflt;
  const row = (await db.query(`insert into comm.payees (name, email, role, team, manager, country, currency, employment, retirement_rate_pct, starts_on)
    values ($1, $2, coalesce($3, 'Account executive'), coalesce($4, 'Sales'), $5, $6, $7, $8, $9, $10) returning id, name`,
  [req(o, 'name'), opt(o, 'email'), opt(o, 'role'), opt(o, 'team'), opt(o, 'manager'), country, currency, employment, rate, o.start ? date(req(o, 'start')) : today()]))[0];
  await log(db, actor, 'add-payee', `${row.name} (${country}, ${currency}, ${employment})`);
  return row;
}

async function assignPlan(db, o) {
  const actor = req(o, 'actor');
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const pl = await resolve(db, 'plans', req(o, 'plan'));
  const start = date(req(o, 'start'));
  const end = o.end ? date(req(o, 'end')) : null;
  return tx(db, async () => {
    await db.query(`update comm.assignments set ends_on = ($2::date - 1) where payee_id = $1 and starts_on < $2::date and (ends_on is null or ends_on >= $2::date)`, [y.id, start]);
    const row = (await db.query(`insert into comm.assignments (name, payee_id, plan_id, monthly_quota_cents, starts_on, ends_on) values ($1, $2, $3, $4, $5, $6) returning id`,
      [`${y.name}: ${pl.name} from ${start}`, y.id, pl.id, cents(req(o, 'quota')), start, end]))[0];
    await log(db, actor, 'assign-plan', `${y.name} on ${pl.name} from ${start}`);
    return { id: row.id, payee: y.name, plan: pl.name, starts_on: start, accepted: false };
  });
}

async function acceptPlan(db, o) {
  const actor = req(o, 'actor');
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const on = o.date ? date(req(o, 'date')) : today();
  const rows = await db.query(`update comm.assignments set accepted_on = $2, acceptance_evidence = $3
    where id = (select id from comm.assignments where payee_id = $1 and accepted_on is null order by starts_on desc limit 1) returning name`, [y.id, on, req(o, 'evidence')]);
  if (!rows.length) throw Error(`${y.name} has no plan waiting for acceptance`);
  await log(db, actor, 'accept-plan', `${rows[0].name} accepted ${on}`);
  return { assignment: rows[0].name, accepted_on: on };
}

async function addDeal(db, o) {
  const actor = req(o, 'actor');
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const payee = (await db.query('select currency from comm.payees where id = $1', [y.id]))[0];
  const currency = (opt(o, 'currency') || payee.currency).toUpperCase();
  return tx(db, async () => {
    const d = (await db.query(`insert into comm.deals (name, customer, closed_on, amount_cents, currency, term_months, product) values ($1, $2, $3, $4, $5, $6, $7) returning id, name`,
      [req(o, 'name'), req(o, 'customer'), date(req(o, 'closed')), cents(req(o, 'amount')), currency, o.term ? Number(req(o, 'term')) : 12, opt(o, 'product')]))[0];
    await db.query('insert into comm.credits (deal_id, payee_id, split_pct) values ($1, $2, 100)', [d.id, y.id]);
    await log(db, actor, 'add-deal', `${d.name} credited 100% to ${y.name}`);
    return { id: d.id, deal: d.name, credited_to: y.name };
  });
}

async function splitDeal(db, o) {
  const actor = req(o, 'actor');
  const d = await resolve(db, 'deals', req(o, 'deal'));
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const share = pct(req(o, 'pct'), 0.01, 100);
  await db.query(`insert into comm.credits (deal_id, payee_id, split_pct) values ($1, $2, $3) on conflict (deal_id, payee_id) do update set split_pct = excluded.split_pct`, [d.id, y.id, share]);
  const total = (await db.query('select sum(split_pct) as s from comm.credits where deal_id = $1', [d.id]))[0].s;
  await log(db, actor, 'split-deal', `${d.name}: ${y.name} ${share}% (deal now ${total}% credited)`);
  return { deal: d.name, payee: y.name, split_pct: share, deal_total_pct: Number(total) };
}

async function cancelDeal(db, o) {
  const actor = req(o, 'actor');
  const d = await resolve(db, 'deals', req(o, 'deal'));
  const on = o.date ? date(req(o, 'date')) : today();
  await db.query('update comm.deals set cancelled_on = $2, cancel_reason = $3 where id = $1', [d.id, on, req(o, 'reason')]);
  await log(db, actor, 'cancel-deal', `${d.name} cancelled ${on}`);
  const claw = await db.query('select payee, clawback_cents, currency from comm.clawback_queue where deal_id = $1', [d.id]);
  return { deal: d.name, cancelled_on: on, clawbacks_due: claw };
}

async function adjust(db, o) {
  const actor = req(o, 'actor');
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const p = await period(db, opt(o, 'period'));
  const kind = choice(req(o, 'kind'), ['spiff', 'correction', 'draw'], 'Kind (clawbacks go through apply-clawback)');
  const amount = cents(req(o, 'amount'), { signed: true });
  if (!amount) throw Error('Amount cannot be zero');
  const deal = o.deal ? (await resolve(db, 'deals', req(o, 'deal'))).id : null;
  const row = (await db.query(`insert into comm.adjustments (name, payee_id, period_id, kind, amount_cents, reason, deal_id, approved_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [`${y.name} ${kind} ${p.name}`, y.id, p.id, kind, amount, req(o, 'reason'), deal, actor]))[0];
  await log(db, actor, 'adjust', `${y.name} ${p.name} ${kind} ${amount / 100}: ${o.reason}`);
  return { id: row.id, payee: y.name, period: p.name, kind, amount_cents: amount };
}

async function applyClawback(db, o) {
  const actor = req(o, 'actor');
  const d = await resolve(db, 'deals', req(o, 'deal'));
  const p = await period(db, opt(o, 'period'));
  const due = await db.query('select * from comm.clawback_queue where deal_id = $1', [d.id]);
  if (!due.length) throw Error(`Nothing to claw back on ${d.name}: it was not paid, was cancelled outside the window, or is already clawed back`);
  return tx(db, async () => {
    const out = [];
    for (const c of due) {
      if (!Number(c.clawback_cents)) continue;
      await db.query(`insert into comm.adjustments (name, payee_id, period_id, kind, amount_cents, reason, deal_id, approved_by) values ($1, $2, $3, 'clawback', $4, $5, $6, $7)`,
        [`${c.payee} clawback ${d.name}`, c.payee_id, p.id, -Number(c.clawback_cents), `Clawback: ${d.name} cancelled ${c.cancelled_on}, ${c.days_live} days after close (plan window ${c.clawback_days})`, d.id, actor]);
      out.push({ payee: c.payee, period: p.name, amount_cents: -Number(c.clawback_cents), currency: c.currency });
    }
    await log(db, actor, 'apply-clawback', `${d.name} into ${p.name}: ${out.length} payee(s)`);
    return out;
  });
}

async function raiseDispute(db, o) {
  const actor = req(o, 'actor');
  const y = await resolve(db, 'payees', req(o, 'payee'));
  const p = await period(db, opt(o, 'period'));
  const deal = o.deal ? (await resolve(db, 'deals', req(o, 'deal'))).id : null;
  const row = (await db.query(`insert into comm.disputes (name, payee_id, period_id, deal_id, detail, owner) values ($1, $2, $3, $4, $5, $6) returning id`,
    [`${y.name} ${p.name}: ${req(o, 'detail').slice(0, 40)}`, y.id, p.id, deal, req(o, 'detail'), req(o, 'owner')]))[0];
  await log(db, actor, 'raise-dispute', `${y.name} ${p.name}: ${o.detail}`);
  return { id: row.id, payee: y.name, period: p.name, status: 'open' };
}

async function resolveDispute(db, o) {
  const actor = req(o, 'actor');
  const s = await resolve(db, 'disputes', req(o, 'dispute'));
  const outcome = choice(req(o, 'outcome'), ['upheld', 'rejected'], 'Outcome');
  const rows = await db.query(`update comm.disputes set status = $2, resolved_on = current_date, resolution = $3 where id = $1 and status = 'open' returning name`, [s.id, outcome, req(o, 'resolution')]);
  if (!rows.length) throw Error(`${s.name} is already resolved`);
  await log(db, actor, 'resolve-dispute', `${s.name}: ${outcome}`);
  return { dispute: s.name, status: outcome, next: outcome === 'upheld' ? 'Record the fix with adjust --kind=correction in the open period' : null };
}

async function attention(db) {
  return db.query(`
    select 'Period past month end, not locked' as item, name as about, (current_date - ends_on) || ' days since month end' as why from comm.periods where status = 'open' and ends_on < current_date
    union all select 'Locked, not paid', name, (current_date - locked_on) || ' days since lock' from comm.periods where status = 'locked' and locked_on < current_date - 7
    union all select 'Dispute open over 14 days', y.name, s.detail from comm.disputes s join comm.payees y on y.id = s.payee_id where s.status = 'open' and s.raised_on < current_date - 14
    union all select 'Clawback not applied', payee, deal || ' cancelled ' || cancelled_on from comm.clawback_queue
    union all select 'Close issue: ' || issue, item, period || ': ' || coalesce(detail, '') from comm.close_issues
    union all select 'Compliance: ' || rule, coalesce(payee, ''), finding from comm.compliance_findings where severity = 'breached'`);
}

async function weeklyReview(db) {
  return {
    attention: await attention(db),
    attainment: await attainment(db, { period: 'current' }),
    accruals: await accruals(db),
    disputes: (await db.query(reads.disputes)).filter((d) => d.status === 'open'),
    compliance: await db.query(reads.compliance),
  };
}

function statementMarkdown(s) {
  const m = (c) => (c === null || c === undefined ? '' : money(c, s.currency));
  const rows = s.lines.map((l) => `| ${l.kind} | ${l.label} | ${m(l.basis_cents)} | ${l.rate_pct === null || l.rate_pct === undefined ? '' : `${Number(l.rate_pct)}%`} | ${m(l.amount_cents)} |`).join('\n');
  return `# Commission statement: ${s.payee}, ${s.period}${s.provisional ? ' (provisional, period still open)' : ''}

| | |
|---|---|
| Quota | ${m(s.quota_cents)} |
| Credited | ${m(s.credited_cents)} |
| Commission | ${m(s.commission_cents)} |
| Adjustments | ${m(s.adjustments_cents)} |
| **Total** | **${m(s.total_cents)}** |

| Line | Detail | Basis | Rate | Amount |
|---|---|---|---|---|
${rows}

Questions about this statement? Reply with the deal name and what you expected, and we will look at it before the next period locks.
`;
}

function writeDraft(name, body) {
  const dir = path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${today()}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.md`);
  fs.writeFileSync(file, body);
  return file;
}

async function draftDisputeReply(db, o) {
  const s = await resolve(db, 'disputes', req(o, 'dispute'));
  const d = (await db.query(`select s.*, y.name as payee, pr.name as period, dl.name as deal, dl.amount_cents, dl.currency, dl.closed_on, dl.cancelled_on
    from comm.disputes s join comm.payees y on y.id = s.payee_id join comm.periods pr on pr.id = s.period_id left join comm.deals dl on dl.id = s.deal_id where s.id = $1`, [s.id]))[0];
  const credits = d.deal_id ? await db.query('select y.name, c.split_pct from comm.credits c join comm.payees y on y.id = c.payee_id where c.deal_id = $1 order by y.name', [d.deal_id]) : [];
  const body = `# Draft reply to ${d.payee} about ${d.period}

Status: ${d.status}. Owner: ${d.owner}. Raised ${d.raised_on}.

What they said: ${d.detail}

${d.deal ? `What the records show for ${d.deal}: closed ${d.closed_on}, ${money(d.amount_cents, d.currency)}${d.cancelled_on ? `, cancelled ${d.cancelled_on}` : ''}. Credited to ${credits.map((c) => `${c.name} ${Number(c.split_pct)}%`).join(', ') || 'nobody'}.` : 'No deal was named on this dispute.'}

Hi ${d.payee.split(' ')[0]},

Thanks for raising this. [Say what you checked and what you found, in one or two sentences.] [If upheld: the correction will appear on your ${d.period} statement as an adjustment.] [If not: say which plan rule applies and where it is written.]

[Your name]

Draft only. Nothing has been sent.
`;
  return { file: writeDraft(`dispute-${d.payee}-${d.period}`, body) };
}

// ---------------------------------------------------------------- import and export

// CaptivateIQ exports are built from templates you choose, so the importer accepts the
// usual headings and a --mapping file for anything named differently. See docs/replace-captivateiq.md.
export const DEFAULT_MAPPING = {
  payees: { id: ['Employee ID', 'Payee ID', 'ID'], name: ['Name', 'Employee Name', 'Payee Name', 'Payee'], email: ['Email', 'Employee Email'],
    role: ['Role', 'Title', 'Job Title'], team: ['Team', 'Department'], manager: ['Manager', 'Manager Name'], country: ['Country'], currency: ['Currency', 'Payout Currency'],
    start: ['Start Date', 'Hire Date'], end: ['End Date', 'Termination Date'], employment: ['Employment Type', 'Worker Type'] },
  deals: { id: ['Deal ID', 'Opportunity ID', 'Record ID'], name: ['Deal Name', 'Opportunity Name', 'Name'], customer: ['Account Name', 'Customer', 'Account'],
    closed: ['Close Date', 'Closed Date'], amount: ['Amount', 'Deal Amount', 'ACV'], currency: ['Currency'], term: ['Term (Months)', 'Contract Term', 'Term Months'],
    payee: ['Owner', 'Opportunity Owner', 'Deal Owner', 'Payee', 'Employee ID'], split: ['Split %', 'Split Percent', 'Credit %'] },
  payouts: { payee: ['Employee ID', 'Payee ID', 'Payee', 'Name', 'Employee Name'], start: ['Period Start', 'Period Start Date', 'Payout Period Start'],
    paid: ['Payout Date', 'Pay Date'], amount: ['Payout Amount', 'Amount', 'Total Payout'], currency: ['Currency', 'Payout Currency'] },
};

function loadMapping(file) {
  if (!file) return DEFAULT_MAPPING;
  const custom = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = structuredClone(DEFAULT_MAPPING);
  for (const [kind, fields] of Object.entries(custom)) {
    if (!out[kind]) throw Error(`Mapping has unknown section "${kind}" (use payees, deals, payouts)`);
    for (const [field, heads] of Object.entries(fields)) {
      if (!out[kind][field]) throw Error(`Mapping has unknown field ${kind}.${field}`);
      out[kind][field] = [].concat(heads, out[kind][field]);
    }
  }
  return out;
}

const readCsv = (file) => parseCsv(fs.readFileSync(path.resolve(file), 'utf8'));
const get = (row, map, field) => pick(row, ...map[field]).trim();
const looseDate = (v, what) => {
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return date(`${m[1]}-${m[2]}-${m[3]}`);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // NZ and AU exports: day first
  if (m) return date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  throw Error(`${what}: unreadable date "${v}"`);
};

async function importCaptivateIQ(db, o) {
  const actor = req(o, 'actor');
  const dry = o['dry-run'] === true;
  const map = loadMapping(opt(o, 'mapping'));
  if (!o.payees && !o.deals && !o.payouts) throw Error('Give at least one of --payees, --deals, --payouts');
  const report = { dry_run: dry, payees: { created: 0, skipped: 0 }, deals: { created: 0, skipped: 0 }, payouts: { created: 0, skipped: 0 }, periods_created: [], problems: [] };
  await db.exec('BEGIN');
  try {
    const findPayee = async (v) => {
      const rows = await db.query('select id, currency from comm.payees where source_id = $1 or lower(name) = lower($1) or lower(email) = lower($1)', [v]);
      return rows.length === 1 ? rows[0] : null;
    };
    if (o.payees) {
      for (const r of readCsv(req(o, 'payees'))) {
        const m = map.payees;
        const name = get(r, m, 'name');
        const sid = get(r, m, 'id') || null;
        if (!name) { report.problems.push(`payees: a row has no name`); continue; }
        const exists = await db.query('select 1 from comm.payees where source_id = $1 or lower(name) = lower($2)', [sid, name]);
        if (exists.length) { report.payees.skipped++; continue; }
        const country = (get(r, m, 'country') || 'NZ').toUpperCase().replace('NEW ZEALAND', 'NZ').replace('AUSTRALIA', 'AU');
        const c = ['NZ', 'AU'].includes(country) ? country : 'OTHER';
        const employment = /contract/i.test(get(r, m, 'employment')) ? 'contractor' : 'employee';
        const rate = employment === 'contractor' ? 0 : c === 'AU' ? 12 : c === 'NZ' ? 3.5 : 0;
        await db.query(`insert into comm.payees (name, email, role, team, manager, country, currency, employment, retirement_rate_pct, starts_on, ends_on, source_id)
          values ($1, $2, coalesce($3, 'Account executive'), coalesce($4, 'Sales'), $5, $6, $7, $8, $9, $10, $11, $12)`,
        [name, get(r, m, 'email') || null, get(r, m, 'role') || null, get(r, m, 'team') || null, get(r, m, 'manager') || null, c,
          (get(r, m, 'currency') || (c === 'AU' ? 'AUD' : 'NZD')).toUpperCase(), employment, rate,
          get(r, m, 'start') ? looseDate(get(r, m, 'start'), name) : today(), get(r, m, 'end') ? looseDate(get(r, m, 'end'), name) : null, sid]);
        report.payees.created++;
      }
    }
    if (o.deals) {
      for (const r of readCsv(req(o, 'deals'))) {
        const m = map.deals;
        const name = get(r, m, 'name');
        const sid = get(r, m, 'id') || null;
        if (!name) { report.problems.push('deals: a row has no deal name'); continue; }
        const exists = await db.query('select 1 from comm.deals where source_id = $1 or lower(name) = lower($2)', [sid, name]);
        if (exists.length) { report.deals.skipped++; continue; }
        const payee = await findPayee(get(r, m, 'payee'));
        if (!payee) { report.problems.push(`deals: ${name} names payee "${get(r, m, 'payee')}", who is not in the records (import payees first)`); continue; }
        const d = (await db.query(`insert into comm.deals (name, customer, closed_on, amount_cents, currency, term_months, source_id) values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [name, get(r, m, 'customer') || '(unknown)', looseDate(get(r, m, 'closed'), name), cents(get(r, m, 'amount')),
            (get(r, m, 'currency') || payee.currency).toUpperCase(), Number(get(r, m, 'term') || 12), sid]))[0];
        await db.query('insert into comm.credits (deal_id, payee_id, split_pct) values ($1, $2, $3)', [d.id, payee.id, Number(get(r, m, 'split') || 100)]);
        report.deals.created++;
      }
    }
    if (o.payouts) {
      for (const r of readCsv(req(o, 'payouts'))) {
        const m = map.payouts;
        const who = get(r, m, 'payee');
        const payee = await findPayee(who);
        if (!payee) { report.problems.push(`payouts: payee "${who}" is not in the records (import payees first)`); continue; }
        const start = looseDate(get(r, m, 'start'), who);
        const paid = get(r, m, 'paid') ? looseDate(get(r, m, 'paid'), who) : null;
        const name = start.slice(0, 7);
        let p = (await db.query('select * from comm.periods where name = $1', [name]))[0];
        if (!p) {
          p = await ensurePeriod(db, name);
          await db.query(`update comm.periods set status = $2, locked_on = $3, paid_on = $4, imported = true, locked_by = $5 where id = $1`,
            [p.id, paid ? 'paid' : 'locked', paid || p.ends_on, paid, actor]);
          report.periods_created.push(name);
        } else if (p.status === 'open') { report.problems.push(`payouts: ${who} ${name} is an open period here; lock it here instead of importing it`); continue; }
        const exists = await db.query('select 1 from comm.payouts where payee_id = $1 and period_id = $2', [payee.id, p.id]);
        if (exists.length) { report.payouts.skipped++; continue; }
        const amount = cents(get(r, m, 'amount'), { signed: true });
        const po = (await db.query(`insert into comm.payouts (payee_id, period_id, currency, total_cents, commission_cents, raw) values ($1, $2, $3, $4, $4, $5) returning id`,
          [payee.id, p.id, (get(r, m, 'currency') || payee.currency).toUpperCase(), amount, JSON.stringify(r)]))[0];
        await db.query(`insert into comm.payout_lines (payout_id, kind, label, amount_cents) values ($1, 'imported', 'Imported from CaptivateIQ payout report', $2)`, [po.id, amount]);
        report.payouts.created++;
      }
    }
    await log(db, actor, 'import captivateiq', JSON.stringify({ payees: report.payees, deals: report.deals, payouts: report.payouts }));
    await db.exec(dry ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
  return report;
}

async function exportAll(db, o) {
  const out = {};
  for (const t of ['payees', 'plans', 'plan_tiers', 'assignments', 'periods', 'deals', 'credits', 'adjustments', 'disputes', 'payouts', 'payout_lines', 'activity']) {
    out[t] = await db.query(`select * from comm.${t} order by 1`);
  }
  const file = path.resolve(opt(o, 'out') || path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'exports', `commissions-${today()}.json`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  return { file, tables: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) };
}

// ---------------------------------------------------------------- dispatch

export async function execute(db, cmd, o = {}) {
  if (reads[cmd]) return db.query(reads[cmd]);
  switch (cmd) {
    case 'help': return Object.keys(specs).map((c) => ({ command: c, flags: specs[c].map((f) => `--${f}`).join(' ') }));
    case 'attainment': return attainment(db, o);
    case 'quota-gap': return quotaGap(db, o);
    case 'accruals': return accruals(db);
    case 'statement': return statement(db, o);
    case 'attention': return attention(db);
    case 'weekly-review': return weeklyReview(db);
    case 'add-payee': return addPayee(db, o);
    case 'assign-plan': return assignPlan(db, o);
    case 'accept-plan': return acceptPlan(db, o);
    case 'add-deal': return addDeal(db, o);
    case 'split-deal': return splitDeal(db, o);
    case 'cancel-deal': return cancelDeal(db, o);
    case 'adjust': return adjust(db, o);
    case 'apply-clawback': return applyClawback(db, o);
    case 'raise-dispute': return raiseDispute(db, o);
    case 'resolve-dispute': return resolveDispute(db, o);
    case 'lock-period': return lockPeriod(db, o);
    case 'mark-paid': return markPaid(db, o);
    case 'record-super': return recordSuper(db, o);
    case 'draft-statement': { const s = await statement(db, o); return { file: writeDraft(`statement-${s.payee}-${s.period}`, statementMarkdown(s)) }; }
    case 'draft-dispute-reply': return draftDisputeReply(db, o);
    case 'import': return importCaptivateIQ(db, o);
    case 'export': return exportAll(db, o);
    default: throw Error(`Unknown command ${cmd}`);
  }
}

// ---------------------------------------------------------------- human output

function plain(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return /^-?\d+\.\d+$/.test(s) ? s.replace(/\.?0+$/, '') : s;
}

function columns(rows) {
  return Object.keys(rows[0]).filter((k) => k !== 'deal_id').map((k) => ({
    key: k,
    label: k.replace(/_cents$/, '').replace(/_pct$/, ' %').replace(/_/g, ' '),
    align: /_cents$|_pct$|^days|^deals$|^payees$|issues$/.test(k) ? 'right' : 'left',
    format: k.endsWith('_cents') ? (v, r) => (v === null || v === undefined ? '' : money(v, r.currency || 'NZD'))
      : k === 'id' ? (v) => String(v).slice(0, 8)
        : (v) => plain(v),
    width: 60,
  }));
}

export function render(cmd, result) {
  if (Array.isArray(result)) return result.length ? table(result, columns(result)) : '  (none)';
  if (cmd === 'statement') {
    const s = result;
    const head = `${s.payee}, ${s.period}${s.provisional ? ' (provisional: period still open)' : ` (${s.status})`}\n` +
      `  Quota ${money(s.quota_cents, s.currency)}  Credited ${money(s.credited_cents, s.currency)}  Commission ${money(s.commission_cents, s.currency)}  ` +
      `Adjustments ${money(s.adjustments_cents, s.currency)}  Total ${money(s.total_cents, s.currency)}`;
    return `${head}\n\n${table(s.lines.map((l) => ({ ...l, currency: s.currency })), columns(s.lines.map((l) => ({ ...l, currency: s.currency }))))}`;
  }
  if (cmd === 'weekly-review') {
    return Object.entries(result).map(([k, rows]) => `${heading(k.replace(/-/g, ' '))}\n${render('', rows)}`).join('\n');
  }
  return Object.entries(result).map(([k, v]) => `  ${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`).join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  let db;
  try {
    const { cmd, o } = parse(process.argv.slice(2));
    db = await getDb();
    const result = await execute(db, cmd, o);
    console.log(o.json ? JSON.stringify(result, null, 2) : render(cmd, result));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}
