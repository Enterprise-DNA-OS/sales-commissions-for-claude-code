#!/usr/bin/env node
// Loads the demo business, then closes its two older months the way an admin would:
// lock, pay through payroll, record super. Safe to run more than once.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { execute } from './commissions.mjs';

const actor = 'Seed';

export async function seed(db) {
  await db.exec('BEGIN');
  try {
    await db.exec(readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
  const periods = await db.query('select id, name, status, ends_on from comm.periods order by starts_on');
  const [oldest, older, last] = periods;
  const plus = async (d, n) => (await db.query('select ($1::date + $2::int)::text as d', [d, n]))[0].d;

  // Three months back: paid by bank transfer outside payroll (no payroll reference).
  if (oldest?.status === 'open') {
    await execute(db, 'lock-period', { period: oldest.name, date: await plus(oldest.ends_on, 3), actor });
    const paid = await plus(oldest.ends_on, 5);
    await execute(db, 'mark-paid', { period: oldest.name, date: paid, actor });
    await execute(db, 'record-super', { payee: 'Ben Carter', period: oldest.name, date: await plus(paid, 2), ref: 'Clearing house 4471', actor });
    await execute(db, 'record-super', { payee: 'Priya Shah', period: oldest.name, date: await plus(paid, 2), ref: 'Clearing house 4471', actor });
  }
  // Two months back: paid through payroll. Ben's super arrived late; Priya's is not recorded.
  if (older?.status === 'open') {
    await execute(db, 'lock-period', { period: older.name, date: await plus(older.ends_on, 4), actor });
    const paid = await plus(older.ends_on, 6);
    await execute(db, 'mark-paid', { period: older.name, date: paid, 'payroll-ref': `PAY-${older.name}`, actor });
    await execute(db, 'record-super', { payee: 'Ben Carter', period: older.name, date: await plus(paid, 15), ref: 'Clearing house 4520', actor });
  }
  // Last month: a spiff for the Surry Hills win, still open.
  if (last?.status === 'open' && !(await db.query("select 1 from comm.adjustments where kind = 'spiff'")).length) {
    await execute(db, 'adjust', { payee: 'Ben Carter', kind: 'spiff', amount: '500', reason: 'New-logo spiff: Surry Hills Larder', period: last.name, actor: 'Leah Moore' });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    await seed(db);
    console.log('seed: Kōwhai Distribution demo ready (two months paid, last month waiting to lock)');
  } finally {
    await db.close();
  }
}
