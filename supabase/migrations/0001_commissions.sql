-- Sales commissions: payees, plans with tiered rates, quotas, credited deals, monthly
-- periods that lock into frozen payout statements, adjustments, clawbacks and disputes.
-- Runs on Postgres 14+ and PGlite. Money is integer cents in the payee's currency.

create schema if not exists comm;

create or replace function comm.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table comm.payees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  email text,
  role text not null default 'Account executive',
  team text not null default 'Sales',
  manager text,
  country text not null default 'NZ' check (country in ('NZ', 'AU', 'OTHER')),
  currency text not null default 'NZD' check (currency ~ '^[A-Z]{3}$'),
  employment text not null default 'employee' check (employment in ('employee', 'contractor')),
  retirement_rate_pct numeric(5,2) not null default 0 check (retirement_rate_pct between 0 and 30),
  starts_on date not null default current_date,
  ends_on date,
  source_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payees_name_ci on comm.payees (lower(name));

create table comm.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  clawback_days integer not null default 90 check (clawback_days between 0 and 730),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index plans_name_ci on comm.plans (lower(name));

-- Marginal bands: the slice of credited value between floor and ceiling (as % of quota)
-- earns rate_pct. A null ceiling is the open top band (the accelerator).
create table comm.plan_tiers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references comm.plans(id) on delete cascade,
  floor_pct numeric(7,2) not null check (floor_pct >= 0),
  ceiling_pct numeric(7,2) check (ceiling_pct is null or ceiling_pct > floor_pct),
  rate_pct numeric(6,3) not null check (rate_pct >= 0 and rate_pct <= 100),
  unique (plan_id, floor_pct)
);

create table comm.assignments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payee_id uuid not null references comm.payees(id),
  plan_id uuid not null references comm.plans(id),
  monthly_quota_cents bigint not null check (monthly_quota_cents > 0),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  accepted_on date,
  acceptance_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (accepted_on is null or acceptance_evidence is not null)
);

create table comm.periods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name ~ '^\d{4}-\d{2}$'),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  status text not null default 'open' check (status in ('open', 'locked', 'paid')),
  locked_on date,
  locked_by text,
  lock_override text,
  paid_on date,
  payroll_ref text,
  imported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'open' or locked_on is not null),
  check (status <> 'paid' or paid_on is not null)
);

create table comm.deals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  customer text not null,
  closed_on date not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  term_months integer not null default 12 check (term_months between 1 and 120),
  product text,
  cancelled_on date check (cancelled_on is null or cancelled_on >= closed_on),
  cancel_reason text,
  source_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cancelled_on is null or cancel_reason is not null)
);
create unique index deals_name_ci on comm.deals (lower(name));

create table comm.credits (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references comm.deals(id) on delete cascade,
  payee_id uuid not null references comm.payees(id),
  split_pct numeric(5,2) not null check (split_pct > 0 and split_pct <= 100),
  unique (deal_id, payee_id)
);

create table comm.adjustments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payee_id uuid not null references comm.payees(id),
  period_id uuid not null references comm.periods(id),
  kind text not null check (kind in ('spiff', 'correction', 'clawback', 'draw')),
  amount_cents bigint not null check (amount_cents <> 0),
  reason text not null check (btrim(reason) <> ''),
  deal_id uuid references comm.deals(id),
  approved_by text not null,
  created_at timestamptz not null default now()
);
create unique index one_clawback_per_deal_payee on comm.adjustments (deal_id, payee_id) where kind = 'clawback';

create table comm.disputes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payee_id uuid not null references comm.payees(id),
  period_id uuid not null references comm.periods(id),
  deal_id uuid references comm.deals(id),
  raised_on date not null default current_date,
  detail text not null,
  owner text not null,
  status text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  resolved_on date,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'open' or (resolved_on is not null and resolution is not null))
);

-- Frozen at lock time. A payout never changes after its period locks; corrections go
-- into the next open period as adjustments, so every statement stays reproducible.
create table comm.payouts (
  id uuid primary key default gen_random_uuid(),
  payee_id uuid not null references comm.payees(id),
  period_id uuid not null references comm.periods(id),
  currency text not null,
  quota_cents bigint,
  credited_cents bigint not null default 0,
  commission_cents bigint not null default 0,
  adjustments_cents bigint not null default 0,
  total_cents bigint not null,
  super_due_cents bigint not null default 0,
  super_paid_on date,
  super_ref text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (payee_id, period_id)
);

create table comm.payout_lines (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references comm.payouts(id),
  kind text not null check (kind in ('deal', 'band', 'adjustment', 'imported')),
  label text not null,
  basis_cents bigint,
  rate_pct numeric(6,3),
  amount_cents bigint,
  deal_id uuid references comm.deals(id),
  position integer not null default 0
);

create table comm.activity (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create trigger payees_touch before update on comm.payees for each row execute function comm.touch();
create trigger plans_touch before update on comm.plans for each row execute function comm.touch();
create trigger assignments_touch before update on comm.assignments for each row execute function comm.touch();
create trigger periods_touch before update on comm.periods for each row execute function comm.touch();
create trigger deals_touch before update on comm.deals for each row execute function comm.touch();
create trigger disputes_touch before update on comm.disputes for each row execute function comm.touch();

-- Pay records stay for seven years (Fair Work Act 2009 s535). Frozen statements cannot
-- be edited or deleted; only the super payment fields may be filled in afterwards.
create or replace function comm.guard_payouts() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payout records are kept for seven years and cannot be deleted';
  end if;
  if row(new.payee_id, new.period_id, new.currency, new.quota_cents, new.credited_cents, new.commission_cents, new.adjustments_cents, new.total_cents, new.super_due_cents)
     is distinct from row(old.payee_id, old.period_id, old.currency, old.quota_cents, old.credited_cents, old.commission_cents, old.adjustments_cents, old.total_cents, old.super_due_cents) then
    raise exception 'A locked payout cannot change: record an adjustment in the next open period';
  end if;
  return new;
end $$;
create trigger payouts_guard before update or delete on comm.payouts for each row execute function comm.guard_payouts();

create or replace function comm.guard_lines() returns trigger language plpgsql as $$
begin
  raise exception 'Payout statement lines are frozen once written';
end $$;
create trigger payout_lines_guard before update or delete on comm.payout_lines for each row execute function comm.guard_lines();

-- Adjustments and credits cannot land in a period that is already locked.
create or replace function comm.guard_open_period() returns trigger language plpgsql as $$
declare st text;
begin
  select status into st from comm.periods where id = new.period_id;
  if st <> 'open' then
    raise exception 'Period is % : put this in the next open period', st;
  end if;
  return new;
end $$;
create trigger adjustments_open before insert or update on comm.adjustments for each row execute function comm.guard_open_period();

-- ---------------------------------------------------------------- views

-- The assignment in force for each payee in each period (latest start wins).
create view comm.period_assignment as
select distinct on (p.id, a.payee_id)
  p.id as period_id, a.payee_id, a.id as assignment_id, a.plan_id, a.monthly_quota_cents, a.accepted_on
from comm.periods p
join comm.assignments a on a.starts_on <= p.ends_on and (a.ends_on is null or a.ends_on >= p.starts_on)
order by p.id, a.payee_id, a.starts_on desc;

-- Credited value per payee per period: won deals closed in the period, at the payee's
-- split, in the payee's currency, excluding deals cancelled inside the same period.
create view comm.credit_lines as
select p.id as period_id, c.payee_id, d.id as deal_id, d.name as deal, d.customer, d.closed_on, d.term_months,
  round(d.amount_cents * c.split_pct / 100)::bigint as credited_cents, c.split_pct
from comm.deals d
join comm.credits c on c.deal_id = d.id
join comm.payees y on y.id = c.payee_id and y.currency = d.currency
join comm.periods p on d.closed_on between p.starts_on and p.ends_on
where d.cancelled_on is null or d.cancelled_on > p.ends_on;

create view comm.period_credit as
select period_id, payee_id, sum(credited_cents)::bigint as credited_cents, count(*)::int as deals
from comm.credit_lines group by period_id, payee_id;

-- Earnings per band: the part of credited value inside each band times the band rate.
create view comm.band_earnings as
select pa.period_id, pa.payee_id, t.floor_pct, t.ceiling_pct, t.rate_pct,
  greatest(0, least(coalesce(pc.credited_cents, 0), coalesce(round(pa.monthly_quota_cents * t.ceiling_pct / 100), coalesce(pc.credited_cents, 0)))
    - round(pa.monthly_quota_cents * t.floor_pct / 100))::bigint as basis_cents
from comm.period_assignment pa
join comm.plan_tiers t on t.plan_id = pa.plan_id
left join comm.period_credit pc on pc.period_id = pa.period_id and pc.payee_id = pa.payee_id;

create view comm.period_commission as
select pr.id as period_id, pr.name as period, pr.status, y.id as payee_id, y.name as payee, y.team, y.currency,
  pl.name as plan, pa.monthly_quota_cents as quota_cents,
  coalesce(pc.credited_cents, 0)::bigint as credited_cents, coalesce(pc.deals, 0) as deals,
  round(100.0 * coalesce(pc.credited_cents, 0) / pa.monthly_quota_cents, 1) as attainment_pct,
  coalesce((select sum(round(b.basis_cents * b.rate_pct / 100)) from comm.band_earnings b where b.period_id = pr.id and b.payee_id = y.id), 0)::bigint as commission_cents,
  coalesce((select sum(a.amount_cents) from comm.adjustments a where a.period_id = pr.id and a.payee_id = y.id), 0)::bigint as adjustments_cents,
  pa.accepted_on
from comm.periods pr
join comm.period_assignment pa on pa.period_id = pr.id
join comm.payees y on y.id = pa.payee_id
join comm.plans pl on pl.id = pa.plan_id
left join comm.period_credit pc on pc.period_id = pr.id and pc.payee_id = y.id;

-- What the commission admin must fix before a period can be locked.
create view comm.close_issues as
select p.id as period_id, p.name as period, 'Deal has no payee credited' as issue, d.name as item, d.customer as detail
from comm.periods p join comm.deals d on d.closed_on between p.starts_on and p.ends_on
where p.status = 'open' and d.cancelled_on is null and not exists (select 1 from comm.credits c where c.deal_id = d.id)
union all
select p.id, p.name, 'Deal splits do not add to 100%', d.name, trim_scale((select sum(split_pct) from comm.credits c where c.deal_id = d.id))::text || '% credited'
from comm.periods p join comm.deals d on d.closed_on between p.starts_on and p.ends_on
where p.status = 'open' and d.cancelled_on is null and exists (select 1 from comm.credits c where c.deal_id = d.id)
  and (select sum(split_pct) from comm.credits c where c.deal_id = d.id) <> 100
union all
select p.id, p.name, 'Payee credited but no plan in force', y.name, d.name
from comm.periods p join comm.deals d on d.closed_on between p.starts_on and p.ends_on
join comm.credits c on c.deal_id = d.id join comm.payees y on y.id = c.payee_id
where p.status = 'open' and not exists (select 1 from comm.period_assignment pa where pa.period_id = p.id and pa.payee_id = y.id)
union all
select p.id, p.name, 'Deal currency differs from payee currency', y.name, d.name || ' (' || d.currency || ' vs ' || y.currency || ')'
from comm.periods p join comm.deals d on d.closed_on between p.starts_on and p.ends_on
join comm.credits c on c.deal_id = d.id join comm.payees y on y.id = c.payee_id
where p.status = 'open' and d.currency <> y.currency
union all
select p.id, p.name, 'Plan not accepted by payee', y.name, pl.name
from comm.periods p join comm.period_assignment pa on pa.period_id = p.id
join comm.payees y on y.id = pa.payee_id join comm.plans pl on pl.id = pa.plan_id
where p.status = 'open' and pa.accepted_on is null
union all
select p.id, p.name, 'Open dispute', y.name, s.detail
from comm.periods p join comm.disputes s on s.period_id = p.id and s.status = 'open'
join comm.payees y on y.id = s.payee_id
where p.status = 'open';

-- Commission already paid on a deal that was then cancelled inside the plan's clawback
-- window, and not yet clawed back. Amount is the deal's share at that payout's effective rate.
create view comm.clawback_queue as
select d.id as deal_id, d.name as deal, d.customer, d.closed_on, d.cancelled_on, (d.cancelled_on - d.closed_on) as days_live,
  y.id as payee_id, y.name as payee, y.currency, pr.name as paid_period, pl.clawback_days,
  round(cl.credited_cents * (po.commission_cents::numeric / nullif(po.credited_cents, 0)))::bigint as clawback_cents
from comm.deals d
join comm.credit_lines cl on cl.deal_id = d.id
join comm.periods pr on pr.id = cl.period_id and pr.status in ('locked', 'paid')
join comm.payouts po on po.period_id = pr.id and po.payee_id = cl.payee_id
join comm.payees y on y.id = cl.payee_id
join comm.period_assignment pa on pa.period_id = pr.id and pa.payee_id = y.id
join comm.plans pl on pl.id = pa.plan_id
where d.cancelled_on is not null and d.cancelled_on > pr.ends_on
  and d.cancelled_on - d.closed_on <= pl.clawback_days
  and not exists (select 1 from comm.adjustments a where a.kind = 'clawback' and a.deal_id = d.id and a.payee_id = y.id);

-- Business days (Mon to Fri) after payday. Public holidays are not modelled.
create or replace function comm.business_days_between(a date, b date) returns integer language sql immutable as $$
  select count(*)::int from generate_series(a + 1, b, interval '1 day') g(d) where extract(isodow from g.d) < 6
$$;

create view comm.compliance_findings as
select 'AU super on commission (SG Act s6, SGR 2009/2)' as rule, y.name as payee, pr.name as period,
  'No super recorded on a paid commission of ' || po.currency || ' ' || to_char(po.total_cents / 100.0, 'FM999G999G990D00') as finding,
  case when comm.business_days_between(pr.paid_on, current_date) > 7 then 'breached' else 'due' end as severity
from comm.payouts po join comm.payees y on y.id = po.payee_id join comm.periods pr on pr.id = po.period_id
where y.country = 'AU' and y.employment = 'employee' and pr.status = 'paid' and po.total_cents > 0 and po.super_paid_on is null
  and pr.paid_on >= date '2026-07-01'
union all
select 'AU Payday Super: fund receives super within 7 business days', y.name, pr.name,
  'Super reached the fund ' || comm.business_days_between(pr.paid_on, po.super_paid_on) || ' business days after payday', 'breached'
from comm.payouts po join comm.payees y on y.id = po.payee_id join comm.periods pr on pr.id = po.period_id
where y.country = 'AU' and y.employment = 'employee' and po.super_paid_on is not null and pr.paid_on >= date '2026-07-01'
  and comm.business_days_between(pr.paid_on, po.super_paid_on) > 7
union all
select 'AU super rate on commission is 12%', y.name, null,
  'Payee super rate is ' || y.retirement_rate_pct || '%', 'breached'
from comm.payees y where y.country = 'AU' and y.employment = 'employee' and y.retirement_rate_pct < 12 and y.ends_on is null
union all
select 'NZ Holidays Act 2003: commission is gross earnings', y.name, pr.name,
  'Commission paid with no payroll reference, so holiday pay may miss it', 'breached'
from comm.payouts po join comm.payees y on y.id = po.payee_id join comm.periods pr on pr.id = po.period_id
where y.country = 'NZ' and y.employment = 'employee' and pr.status = 'paid' and po.total_cents <> 0 and coalesce(btrim(pr.payroll_ref), '') = ''
union all
select 'Fair Work Regulations 2009 reg 3.33: pay record shows how commission was worked out', y.name, pr.name,
  'Payout has no statement lines', 'breached'
from comm.payouts po join comm.payees y on y.id = po.payee_id join comm.periods pr on pr.id = po.period_id
where y.country = 'AU' and not exists (select 1 from comm.payout_lines l where l.payout_id = po.id)
union all
select 'Local rule: written plan accepted before pay', y.name, pr.name,
  'Paying against a plan the payee has not accepted', case when pr.ends_on < current_date then 'breached' else 'due' end
from comm.period_commission pc join comm.payees y on y.id = pc.payee_id join comm.periods pr on pr.id = pc.period_id
where pc.accepted_on is null and pr.status = 'open';

alter table comm.payees enable row level security;
alter table comm.plans enable row level security;
alter table comm.plan_tiers enable row level security;
alter table comm.assignments enable row level security;
alter table comm.periods enable row level security;
alter table comm.deals enable row level security;
alter table comm.credits enable row level security;
alter table comm.adjustments enable row level security;
alter table comm.disputes enable row level security;
alter table comm.payouts enable row level security;
alter table comm.payout_lines enable row level security;
alter table comm.activity enable row level security;
