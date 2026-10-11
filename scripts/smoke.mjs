#!/usr/bin/env node
// npm test: a temporary database, migrate, seed twice, then exercise every command and
// the rules that matter (frozen statements, close gates, clawbacks, super timing, import).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { execute, parse, specs, reads, render } from './commissions.mjs';
import { parseCsv } from './lib/csv.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'commissions-test-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const env = { ...process.env };
const actor = 'Test operator';
const exercised = new Set();
let db;
const run = async (cmd, o = {}) => { exercised.add(cmd); return execute(db, cmd, o); };
const fixture = (f) => path.join(REPO_ROOT, 'fixtures', f);
const cli = (args) => spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'commissions.mjs'), ...args], { cwd: REPO_ROOT, env, encoding: 'utf8' });
const n = (v) => Number(v);

try {
  db = await getDb();
  assert.equal((await migrate(db)).ran.length, 1);
  assert.equal((await migrate(db)).ran.length, 0, 'migrate is repeatable');
  await seed(db);
  await seed(db);
  assert.equal((await run('payees')).length, 5, 'seed is idempotent');
  for (const cmd of Object.keys(reads)) assert(Array.isArray(await run(cmd)), `${cmd} returns rows`);

  const periods = await run('periods');
  const [p3, p2, p1, p0] = periods.map((p) => p.period);
  assert.deepEqual(periods.map((p) => p.status), ['paid', 'paid', 'open', 'open']);

  // Tiered maths: Aroha two months back credited 86,000 on a 60,000 quota.
  const aroha = await run('statement', { payee: 'aroha', period: p2 });
  assert.equal(n(aroha.credited_cents), 8600000);
  assert.equal(n(aroha.commission_cents), 30000 * 4 + 30000 * 8 + 26000 * 12, '4% + 8% + 12% bands');
  assert.equal(aroha.lines.filter((l) => l.kind === 'band').length, 3);
  assert.equal(aroha.provisional, false);

  // Split deal: Carlton Grocer 50/50 between Ben and Priya.
  const ben = await run('statement', { payee: 'Ben Carter', period: p2 });
  assert.equal(n(ben.credited_cents), 4600000 + 2500000);
  assert.equal(n(ben.super_due_cents), Math.round(n(ben.total_cents) * 0.12), 'AU super at 12%');

  // Frozen statements: no edits, no deletes.
  await assert.rejects(db.query('update comm.payouts set total_cents = 1'), /cannot change/);
  await assert.rejects(db.query('delete from comm.payouts'), /seven years/);
  await assert.rejects(db.query('delete from comm.payout_lines'), /frozen/);
  await assert.rejects(run('adjust', { payee: 'Ben', kind: 'spiff', amount: '100', reason: 'x', period: p2, actor }), /paid/);

  // Close gate: last month cannot lock with issues unless overridden.
  const issues = await run('close-check');
  assert(issues.some((i) => i.issue === 'Deal has no payee credited'));
  assert(issues.some((i) => i.issue === 'Deal splits do not add to 100%'));
  assert(issues.some((i) => i.issue === 'Open dispute'));
  await assert.rejects(run('lock-period', { period: p1, actor }), /close issue/);

  // Clawback: Mt Eden was paid two months back and cancelled inside 90 days.
  const claw = await run('clawbacks');
  assert.equal(claw.length, 1);
  assert.equal(claw[0].payee, 'Aroha Ngata');
  assert.equal(n(claw[0].clawback_cents), Math.round(1200000 * (672000 / 8600000)));

  // Compliance findings from the seed.
  const comp = await run('compliance');
  const rules = comp.map((c) => c.rule).join('|');
  assert.match(rules, /Payday Super/);
  assert.match(rules, /SGR 2009\/2/);
  assert.match(rules, /Holidays Act/);
  assert.match(rules, /super rate on commission is 12%/);

  // Fix last month the way an admin would, then lock it.
  await run('split-deal', { deal: 'surry hills', payee: 'Priya', pct: '40', actor });
  await run('split-deal', { deal: 'Surry Hills', payee: 'Ben Carter', pct: '60', actor });
  await assert.rejects(run('split-deal', { deal: 'Surry', payee: 'Nobody Here', pct: '10', actor }), /No payee/);
  await run('split-deal', { deal: 'Taupo', payee: 'Mia', pct: '100', actor });
  const dispute = (await run('disputes'))[0];
  const draft = await run('draft-dispute-reply', { dispute: dispute.id.slice(0, 8) });
  assert(fs.readFileSync(draft.file, 'utf8').includes('Nothing has been sent'));
  await run('resolve-dispute', { dispute: dispute.id.slice(0, 8), outcome: 'upheld', resolution: 'Split moved to 60/40 after review with Leah', actor });
  await assert.rejects(run('resolve-dispute', { dispute: dispute.id.slice(0, 8), outcome: 'rejected', resolution: 'again', actor }), /already resolved/);
  await run('accept-plan', { payee: 'Mia Rossi', evidence: 'Signed plan letter', actor });
  const clawed = await run('apply-clawback', { deal: 'Mt Eden', period: p1, actor });
  assert.equal(clawed[0].amount_cents, -n(claw[0].clawback_cents));
  await assert.rejects(run('apply-clawback', { deal: 'Mt Eden', period: p1, actor }), /Nothing to claw back/);
  assert.equal((await run('close-check')).filter((i) => i.period === p1).length, 0, 'last month is clean');
  const provisional = await run('statement', { payee: 'Aroha', period: p1 });
  assert.equal(provisional.provisional, true);
  assert(provisional.lines.some((l) => l.kind === 'adjustment' && n(l.amount_cents) < 0));
  const locked = await run('lock-period', { period: p1, actor });
  assert.equal(locked.payouts, 5);
  await assert.rejects(run('lock-period', { period: p1, actor }), /already locked/);
  assert.equal((await run('accruals')).some((a) => a.stage === 'Locked, not yet paid'), true);
  await assert.rejects(run('record-super', { payee: 'Ben', period: p1, date: '2026-01-01', actor }), /not been paid/);
  const lockedOn = (await run('periods')).find((p) => p.period === p1).locked_on;
  await run('mark-paid', { period: p1, date: lockedOn, 'payroll-ref': 'PAY-TEST', actor });
  const sup = await run('record-super', { payee: 'Ben', period: p1, date: lockedOn, ref: 'CH-1', actor });
  assert.equal(sup.on_time, true);
  assert.equal(sup.business_days_after_payday, 0);

  // Current month: add, adjust, quota gap, attainment.
  const newbie = await run('add-payee', { name: 'Lena Fox', country: 'AU', actor });
  assert(newbie.id);
  assert.equal(n((await db.query('select retirement_rate_pct from comm.payees where id = $1', [newbie.id]))[0].retirement_rate_pct), 12, 'AU default super');
  await assert.rejects(run('add-payee', { name: 'lena fox', actor }), /unique|duplicate/);
  await run('assign-plan', { payee: 'Lena', plan: 'account executive', quota: '50000', start: (await run('periods')).at(-1).starts_on, actor });
  await run('add-deal', { name: 'Hobart Provisions listing', customer: 'Hobart Provisions', closed: (await run('periods')).at(-1).starts_on, amount: '30,000', payee: 'Lena', term: '24', actor });
  await run('adjust', { payee: 'Lena', kind: 'spiff', amount: '250', reason: 'First deal spiff', period: p0, actor });
  await assert.rejects(run('adjust', { payee: 'Lena', kind: 'clawback', amount: '-1', reason: 'x', actor }), /Kind/);
  const att = await run('attainment', {});
  const lena = att.find((a) => a.payee === 'Lena Fox');
  assert.equal(n(lena.commission_cents), 2500000 * 0.04 + 500000 * 0.08);
  assert.equal(n(lena.earned_cents), n(lena.commission_cents) + 25000);
  const gap = await run('quota-gap', { period: p0 });
  assert.equal(n(gap.find((g) => g.payee === 'Lena Fox').to_quota_cents), 2000000);
  await run('cancel-deal', { deal: 'Hobart', reason: 'Customer withdrew', actor });
  assert.equal(n((await run('attainment', { period: p0 })).find((a) => a.payee === 'Lena Fox').credited_cents), 0, 'cancelled in period: no credit');

  assert((await run('contract-costs')).length >= 3);
  assert((await run('cost-of-sales')).length > 0);
  assert((await run('attention')).length > 0);
  const weekly = await run('weekly-review');
  for (const k of ['attention', 'attainment', 'accruals', 'disputes', 'compliance']) assert(Array.isArray(weekly[k]), `weekly ${k}`);
  await run('raise-dispute', { payee: 'Lena', period: p0, detail: 'Hobart should still count', owner: 'Leah Moore', actor });
  const stmt = await run('draft-statement', { payee: 'Aroha', period: p1 });
  assert(fs.readFileSync(stmt.file, 'utf8').includes('Commission statement'));
  assert.equal((await run('help')).length, Object.keys(specs).length);
  assert((await run('history')).length > 0);

  // Import: dry run changes nothing, real run is repeatable, mapping and dates are honoured.
  const imp = { payees: fixture('captivateiq-payees.csv'), deals: fixture('captivateiq-deals.csv'), payouts: fixture('captivateiq-payouts.csv'), actor };
  const dry = await run('import', { ...imp, 'dry-run': true });
  assert.equal(dry.payees.created, 3);
  assert.equal((await run('payees')).length, 6, 'dry run wrote nothing');
  const real = await run('import', imp);
  assert.deepEqual([real.payees.created, real.deals.created, real.payouts.created], [3, 3, 3]);
  assert.deepEqual(real.problems, []);
  const again = await run('import', imp);
  assert.deepEqual([again.payees.skipped, again.deals.skipped, again.payouts.skipped], [3, 3, 3]);
  const kate = (await db.query("select * from comm.payees where source_id = 'EMP-202'"))[0];
  assert.equal(kate.name, "O'Brien, Kate");
  assert.equal(kate.country, 'AU');
  assert.equal((await db.query("select employment from comm.payees where source_id = 'EMP-203'"))[0].employment, 'contractor');
  assert.equal((await db.query("select closed_on from comm.deals where source_id = 'OPP-9002'"))[0].closed_on, '2026-05-14', 'day-first dates');
  assert.equal(n((await db.query("select amount_cents from comm.deals where source_id = 'OPP-9001'"))[0].amount_cents), 2450000);
  assert.equal((await db.query("select status from comm.periods where name = '2026-04'"))[0].status, 'paid');
  const mapFile = path.join(tmp, 'map.json');
  fs.writeFileSync(mapFile, JSON.stringify({ payees: { name: 'Full Name' } }));
  const csv = path.join(tmp, 'p.csv');
  fs.writeFileSync(csv, '﻿Full Name,Country\r\nAna Lee,AU\r\n');
  assert.equal((await run('import', { payees: csv, mapping: mapFile, actor })).payees.created, 1);
  fs.writeFileSync(mapFile, JSON.stringify({ payees: { nickname: 'X' } }));
  await assert.rejects(run('import', { payees: csv, mapping: mapFile, actor }), /unknown field/);
  assert.throws(() => parseCsv('a,b\n1'), /expected 2 fields/);
  assert.throws(() => parseCsv('a,a\n1,2'), /unique/);

  const ex = await run('export', { out: path.join(tmp, 'export.json') });
  assert(ex.tables.payouts > 0);

  // Parsing and validation.
  assert.throws(() => parse(['nope']), /Unknown command/);
  assert.throws(() => parse(['payees', '--name=x']), /Unknown --name/);
  assert.throws(() => parse(['import', 'salesforce']), /import captivateiq/);
  await assert.rejects(run('add-deal', { name: 'Bad date', customer: 'X', closed: '2026-02-30', amount: '10', payee: 'Ben', actor }), /Invalid date/);
  await assert.rejects(run('add-deal', { name: 'Bad amount', customer: 'X', closed: '2026-02-03', amount: 'ten', payee: 'Ben', actor }), /Invalid amount/);
  await assert.rejects(run('statement', { payee: 'a' }), /More than one payee/);
  assert.match(render('periods', await run('periods')), /period/);

  // The CLI itself: JSON, human tables, exit code on ambiguity.
  const j = cli(['payees', '--json']);
  assert.equal(j.status, 0, j.stderr);
  assert(JSON.parse(j.stdout).length >= 5);
  const amb = cli(['statement', '--payee=a']);
  assert.equal(amb.status, 1);
  assert.match(amb.stderr, /More than one payee/);

  // Views and documents render, escaped.
  for (const [script, out] of [['view.mjs', 'views'], ['docs.mjs', 'docs-out']]) {
    const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script)], { cwd: REPO_ROOT, env: { ...env, OUTPUT_DIR: tmp }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(out));
  }

  const missing = Object.keys(specs).filter((c) => !exercised.has(c));
  assert.deepEqual(missing, [], `every command is exercised: missing ${missing.join(', ')}`);
  console.log(`PASS: ${exercised.size} commands exercised on ${db.mode}`);
} finally {
  if (db) await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
