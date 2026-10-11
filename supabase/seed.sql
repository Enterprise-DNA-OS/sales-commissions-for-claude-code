-- Demo data: Kōwhai Distribution, a fictional NZ and AU wholesaler with five people on
-- commission. Dates are relative to today so the demo always has a period overdue to
-- lock, an open dispute, an unaccepted plan, a clawback waiting and a late super payment.
-- Safe to run more than once. scripts/seed.mjs locks and pays the two older months.

create or replace function pg_temp.d(months_back int, day int) returns date language sql as $$
  select (date_trunc('month', current_date) - make_interval(months => months_back))::date + (day - 1)
$$;

insert into comm.plans (id, name, clawback_days, notes) values
  ('a0000000-0000-4000-8000-000000000001', 'Account Executive 2026', 90, 'Monthly quota. 4% to half of quota, 8% to quota, 12% above quota.'),
  ('a0000000-0000-4000-8000-000000000002', 'Channel Partner Referral', 60, 'Flat 10% of referred deal value. No quota accelerator.')
on conflict (id) do nothing;

insert into comm.plan_tiers (plan_id, floor_pct, ceiling_pct, rate_pct) values
  ('a0000000-0000-4000-8000-000000000001', 0, 50, 4),
  ('a0000000-0000-4000-8000-000000000001', 50, 100, 8),
  ('a0000000-0000-4000-8000-000000000001', 100, null, 12),
  ('a0000000-0000-4000-8000-000000000002', 0, null, 10)
on conflict (plan_id, floor_pct) do nothing;

insert into comm.payees (id, name, email, role, team, manager, country, currency, employment, retirement_rate_pct, starts_on) values
  ('b0000000-0000-4000-8000-000000000001', 'Aroha Ngata', 'aroha@kowhai.example', 'Account executive', 'NZ Sales', 'Grant Hollis', 'NZ', 'NZD', 'employee', 3.5, pg_temp.d(14, 1)),
  ('b0000000-0000-4000-8000-000000000002', 'Ben Carter', 'ben@kowhai.example', 'Account executive', 'AU Sales', 'Leah Moore', 'AU', 'AUD', 'employee', 12, pg_temp.d(20, 1)),
  ('b0000000-0000-4000-8000-000000000003', 'Priya Shah', 'priya@kowhai.example', 'Account executive', 'AU Sales', 'Leah Moore', 'AU', 'AUD', 'employee', 11.5, pg_temp.d(9, 1)),
  ('b0000000-0000-4000-8000-000000000004', 'Tom Whitley', 'tom@whitleyagencies.example', 'Channel partner', 'Partners', 'Grant Hollis', 'NZ', 'NZD', 'contractor', 0, pg_temp.d(30, 1)),
  ('b0000000-0000-4000-8000-000000000005', 'Mia Rossi', 'mia@kowhai.example', 'Account executive', 'NZ Sales', 'Grant Hollis', 'NZ', 'NZD', 'employee', 3.5, pg_temp.d(1, 1))
on conflict (id) do nothing;

insert into comm.assignments (id, name, payee_id, plan_id, monthly_quota_cents, starts_on, accepted_on, acceptance_evidence) values
  ('c0000000-0000-4000-8000-000000000001', 'Aroha Ngata: Account Executive 2026', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 6000000, pg_temp.d(6, 1), pg_temp.d(6, 3), 'Signed plan letter, filed in HR'),
  ('c0000000-0000-4000-8000-000000000002', 'Ben Carter: Account Executive 2026', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 8000000, pg_temp.d(6, 1), pg_temp.d(6, 2), 'Accepted by email'),
  ('c0000000-0000-4000-8000-000000000003', 'Priya Shah: Account Executive 2026', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 7000000, pg_temp.d(6, 1), pg_temp.d(6, 4), 'Signed plan letter, filed in HR'),
  ('c0000000-0000-4000-8000-000000000004', 'Tom Whitley: Channel Partner Referral', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 1000000, pg_temp.d(6, 1), pg_temp.d(6, 1), 'Referral agreement clause 4'),
  ('c0000000-0000-4000-8000-000000000005', 'Mia Rossi: Account Executive 2026', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 4000000, pg_temp.d(1, 1), null, null)
on conflict (id) do nothing;

insert into comm.periods (id, name, starts_on, ends_on)
select ('d0000000-0000-4000-8000-00000000000' || (4 - m))::uuid, to_char(pg_temp.d(m, 1), 'YYYY-MM'), pg_temp.d(m, 1), (pg_temp.d(m, 1) + interval '1 month' - interval '1 day')::date
from generate_series(0, 3) m
on conflict (id) do nothing;

insert into comm.deals (id, name, customer, closed_on, amount_cents, currency, term_months, product, cancelled_on, cancel_reason) values
  -- three months back
  ('e0000000-0000-4000-8000-000000000001', 'Harbourside Cafes supply 2026', 'Harbourside Cafes', pg_temp.d(3, 6), 2800000, 'NZD', 12, 'Coffee and dry goods', null, null),
  ('e0000000-0000-4000-8000-000000000002', 'Ponsonby Grocer range refresh', 'Ponsonby Grocer', pg_temp.d(3, 19), 2200000, 'NZD', 12, 'Chilled range', null, null),
  ('e0000000-0000-4000-8000-000000000003', 'Bondi Pantry national listing', 'Bondi Pantry', pg_temp.d(3, 11), 9500000, 'AUD', 24, 'Full range', null, null),
  ('e0000000-0000-4000-8000-000000000004', 'Fitzroy Deli starter order', 'Fitzroy Deli', pg_temp.d(3, 23), 3100000, 'AUD', 12, 'Dry goods', null, null),
  ('e0000000-0000-4000-8000-000000000005', 'Waikato Farm Stores referral', 'Waikato Farm Stores', pg_temp.d(3, 14), 1800000, 'NZD', 12, 'Animal feed', null, null),
  -- two months back
  ('e0000000-0000-4000-8000-000000000006', 'Kapiti Coast Markets three-year supply', 'Kapiti Coast Markets', pg_temp.d(2, 4), 7400000, 'NZD', 36, 'Full range', null, null),
  ('e0000000-0000-4000-8000-000000000007', 'Mt Eden Organics trial', 'Mt Eden Organics', pg_temp.d(2, 21), 1200000, 'NZD', 12, 'Organic range', pg_temp.d(1, 9), 'Customer closed the store'),
  ('e0000000-0000-4000-8000-000000000008', 'Manly Wharf Kiosk supply', 'Manly Wharf Kiosk', pg_temp.d(2, 8), 4600000, 'AUD', 12, 'Snacks and drinks', null, null),
  ('e0000000-0000-4000-8000-000000000009', 'Geelong Foodhall regional deal', 'Geelong Foodhall', pg_temp.d(2, 17), 6200000, 'AUD', 12, 'Full range', null, null),
  ('e0000000-0000-4000-8000-000000000010', 'Carlton Grocer joint pitch', 'Carlton Grocer', pg_temp.d(2, 26), 5000000, 'AUD', 18, 'Chilled range', null, null),
  -- last month (still open, overdue to lock)
  ('e0000000-0000-4000-8000-000000000011', 'Devonport Providores renewal', 'Devonport Providores', pg_temp.d(1, 7), 3900000, 'NZD', 12, 'Dry goods', null, null),
  ('e0000000-0000-4000-8000-000000000012', 'Newtown Bulk Bins launch', 'Newtown Bulk Bins', pg_temp.d(1, 15), 2600000, 'NZD', 12, 'Bulk range', null, null),
  ('e0000000-0000-4000-8000-000000000013', 'Surry Hills Larder supply', 'Surry Hills Larder', pg_temp.d(1, 12), 8800000, 'AUD', 12, 'Full range', null, null),
  ('e0000000-0000-4000-8000-000000000014', 'Brunswick Co-op listing', 'Brunswick Co-op', pg_temp.d(1, 20), 4100000, 'AUD', 12, 'Organic range', null, null),
  ('e0000000-0000-4000-8000-000000000015', 'Taupo Lakeside Store order', 'Taupo Lakeside Store', pg_temp.d(1, 24), 900000, 'NZD', 12, 'Snacks and drinks', null, null),
  ('e0000000-0000-4000-8000-000000000016', 'Rotorua Bakehouse flour contract', 'Rotorua Bakehouse', pg_temp.d(1, 27), 1500000, 'NZD', 12, 'Baking supplies', null, null),
  -- this month
  ('e0000000-0000-4000-8000-000000000017', 'Grey Lynn Wholefoods supply', 'Grey Lynn Wholefoods', pg_temp.d(0, 3), 3300000, 'NZD', 12, 'Organic range', null, null),
  ('e0000000-0000-4000-8000-000000000018', 'Parramatta Mart listing', 'Parramatta Mart', pg_temp.d(0, 2), 2700000, 'AUD', 12, 'Dry goods', null, null)
on conflict (id) do nothing;

insert into comm.credits (deal_id, payee_id, split_pct) values
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 100),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 100),
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 100),
  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 100),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000004', 100),
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 100),
  ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 100),
  ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000002', 100),
  ('e0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000003', 100),
  ('e0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002', 50),
  ('e0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000003', 50),
  ('e0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', 100),
  ('e0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000005', 100),
  ('e0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000002', 60),
  ('e0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000003', 30),
  ('e0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000003', 100),
  ('e0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000004', 100),
  ('e0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000001', 100),
  ('e0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000002', 100)
on conflict (deal_id, payee_id) do nothing;

-- Deal 15 (Taupo) has nobody credited and deal 13 (Surry Hills) is credited 90%: both
-- block last month's lock until someone fixes them.

insert into comm.disputes (id, name, payee_id, period_id, deal_id, raised_on, detail, owner) values
  ('f0000000-0000-4000-8000-000000000001', 'Priya Shah: Surry Hills split',
   'b0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000013',
   pg_temp.d(0, 1) - 18, 'Surry Hills Larder was my account for two years. Ben joined the last meeting. I expected a 70/30 split my way, not 30%.', 'Leah Moore')
on conflict (id) do nothing;

insert into comm.activity (actor, action, detail)
select 'Seed', 'seed', 'Kōwhai Distribution demo data loaded'
where not exists (select 1 from comm.activity where action = 'seed');
