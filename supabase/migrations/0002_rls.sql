-- =====================================================================
-- Row Level Security policies for the carscout schema.
-- Every table has RLS enabled. Service-role bypasses RLS by default.
-- =====================================================================

alter table carscout.users enable row level security;
alter table carscout.searches enable row level security;
alter table carscout.listings enable row level security;
alter table carscout.analyses enable row level security;
alter table carscout.alerts enable row level security;
alter table carscout.ad_drafts enable row level security;
alter table carscout.saved_listings enable row level security;
alter table carscout.market_data enable row level security;
alter table carscout.price_history enable row level security;
alter table carscout.agent_runs enable row level security;
alter table carscout.notifications enable row level security;
alter table carscout.api_keys enable row level security;

-- Helper: returns the carscout.users.id of the currently authenticated user.
create or replace function carscout.current_user_id()
returns uuid
language sql
stable
as $$
  select id from carscout.users where auth_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
drop policy if exists users_self_select on carscout.users;
create policy users_self_select on carscout.users
  for select to authenticated
  using (auth_id = auth.uid());

drop policy if exists users_self_update on carscout.users;
create policy users_self_update on carscout.users
  for update to authenticated
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- ---------------------------------------------------------------------
-- searches
-- ---------------------------------------------------------------------
drop policy if exists searches_owner_all on carscout.searches;
create policy searches_owner_all on carscout.searches
  for all to authenticated
  using (user_id = carscout.current_user_id())
  with check (user_id = carscout.current_user_id());

-- ---------------------------------------------------------------------
-- listings (read for any authenticated user)
-- ---------------------------------------------------------------------
drop policy if exists listings_select on carscout.listings;
create policy listings_select on carscout.listings
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- analyses (via search ownership; also visible if no search attached)
-- ---------------------------------------------------------------------
drop policy if exists analyses_select on carscout.analyses;
create policy analyses_select on carscout.analyses
  for select to authenticated
  using (
    search_id is null
    or search_id in (select id from carscout.searches where user_id = carscout.current_user_id())
  );

-- ---------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------
drop policy if exists alerts_owner on carscout.alerts;
create policy alerts_owner on carscout.alerts
  for all to authenticated
  using (user_id = carscout.current_user_id())
  with check (user_id = carscout.current_user_id());

-- ---------------------------------------------------------------------
-- ad_drafts
-- ---------------------------------------------------------------------
drop policy if exists ad_drafts_owner on carscout.ad_drafts;
create policy ad_drafts_owner on carscout.ad_drafts
  for all to authenticated
  using (user_id = carscout.current_user_id())
  with check (user_id = carscout.current_user_id());

-- ---------------------------------------------------------------------
-- saved_listings
-- ---------------------------------------------------------------------
drop policy if exists saved_owner on carscout.saved_listings;
create policy saved_owner on carscout.saved_listings
  for all to authenticated
  using (user_id = carscout.current_user_id())
  with check (user_id = carscout.current_user_id());

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
drop policy if exists notifications_owner on carscout.notifications;
create policy notifications_owner on carscout.notifications
  for all to authenticated
  using (user_id = carscout.current_user_id())
  with check (user_id = carscout.current_user_id());

-- ---------------------------------------------------------------------
-- market_data (public read)
-- ---------------------------------------------------------------------
drop policy if exists market_data_select on carscout.market_data;
create policy market_data_select on carscout.market_data
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- price_history (read tied to listing visibility = all authenticated)
-- ---------------------------------------------------------------------
drop policy if exists price_history_select on carscout.price_history;
create policy price_history_select on carscout.price_history
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- agent_runs (read for any authenticated user)
-- ---------------------------------------------------------------------
drop policy if exists agent_runs_select on carscout.agent_runs;
create policy agent_runs_select on carscout.agent_runs
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- api_keys
-- ---------------------------------------------------------------------
drop policy if exists api_keys_owner on carscout.api_keys;
create policy api_keys_owner on carscout.api_keys
  for all to authenticated
  using (user_id = carscout.current_user_id())
  with check (user_id = carscout.current_user_id());
