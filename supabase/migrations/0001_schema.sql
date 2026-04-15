-- =====================================================================
-- CarScout schema migration
-- Creates the carscout schema and all tables with constraints + indexes.
-- =====================================================================

create schema if not exists carscout;

-- Allow Supabase auth + service roles to use the schema.
grant usage on schema carscout to anon, authenticated, service_role;

-- =====================================================================
-- Tables
-- =====================================================================

create table if not exists carscout.users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id) on delete cascade,
  email text unique not null,
  name text,
  company text,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','business')),
  plan_expires_at timestamptz,
  searches_limit integer not null default 3,
  telegram_chat_id text,
  onboarded boolean not null default false,
  stripe_customer_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_auth_id_idx on carscout.users(auth_id);

create table if not exists carscout.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references carscout.users(id) on delete cascade,
  name text not null,
  makes text[] not null default '{}',
  models text[] not null default '{}',
  year_from integer,
  year_to integer,
  price_max integer,
  km_max integer,
  fuel_types text[] not null default '{}',
  platforms text[] not null default '{2dehands,autoscout24}',
  countries text[] not null default '{BE}',
  min_score integer not null default 70,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists searches_user_id_idx on carscout.searches(user_id);
create index if not exists searches_active_idx on carscout.searches(active);

create table if not exists carscout.listings (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  platform text not null,
  url text not null,
  title text,
  make text,
  model text,
  variant text,
  year integer,
  price_eur integer,
  km integer,
  fuel_type text,
  transmission text,
  power_kw integer,
  body_type text,
  color text,
  city text,
  country text default 'BE',
  seller_type text,
  seller_name text,
  btw_mention boolean default false,
  images text[] not null default '{}',
  description text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  sold boolean not null default false,
  sold_at timestamptz,
  raw_data jsonb,
  unique(external_id, platform)
);

create index if not exists listings_make_model_idx on carscout.listings(make, model);
create index if not exists listings_first_seen_idx on carscout.listings(first_seen desc);
create index if not exists listings_sold_idx on carscout.listings(sold);

create table if not exists carscout.analyses (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references carscout.listings(id) on delete cascade,
  search_id uuid references carscout.searches(id) on delete set null,
  market_value_eur integer,
  price_vs_market integer,
  price_vs_market_pct numeric,
  btw_regime text check (btw_regime in ('marge','normaal')),
  max_bid_eur integer,
  expected_sell_price integer,
  expected_margin integer,
  transport_cost integer not null default 250,
  repair_cost integer not null default 0,
  inspection_cost integer not null default 150,
  buying_fee integer not null default 0,
  price_score integer,
  km_score integer,
  age_score integer,
  demand_score integer,
  total_score integer,
  recommendation text check (recommendation in ('KOPEN','TWIJFEL','NEGEREN')),
  reasoning text,
  created_at timestamptz not null default now(),
  unique(listing_id, search_id)
);

create index if not exists analyses_listing_id_idx on carscout.analyses(listing_id);
create index if not exists analyses_total_score_idx on carscout.analyses(total_score desc);

create table if not exists carscout.alerts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references carscout.listings(id) on delete cascade,
  search_id uuid references carscout.searches(id) on delete set null,
  user_id uuid not null references carscout.users(id) on delete cascade,
  telegram_message_id text,
  status text not null default 'sent',
  sent_at timestamptz not null default now()
);

create index if not exists alerts_user_id_idx on carscout.alerts(user_id);
create unique index if not exists alerts_user_listing_uniq on carscout.alerts(user_id, listing_id);

create table if not exists carscout.ad_drafts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references carscout.listings(id) on delete cascade,
  user_id uuid not null references carscout.users(id) on delete cascade,
  title_nl text,
  title_fr text,
  description_nl text,
  description_fr text,
  asking_price_eur integer,
  platform_targets text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','published','rejected')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ad_drafts_user_id_idx on carscout.ad_drafts(user_id);

create table if not exists carscout.saved_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references carscout.users(id) on delete cascade,
  listing_id uuid not null references carscout.listings(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique(user_id, listing_id)
);

create table if not exists carscout.market_data (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  year_from integer,
  year_to integer,
  avg_price_eur integer,
  avg_days_to_sell integer,
  nr_listings integer,
  nr_sold integer,
  mds_score numeric,
  week date not null,
  unique(make, model, week)
);

create index if not exists market_data_week_idx on carscout.market_data(week desc);

create table if not exists carscout.price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references carscout.listings(id) on delete cascade,
  price_eur integer not null,
  recorded_at timestamptz not null default now()
);

create index if not exists price_history_listing_idx on carscout.price_history(listing_id, recorded_at desc);

create table if not exists carscout.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  search_id uuid,
  listing_id uuid,
  status text not null default 'running',
  input jsonb,
  output jsonb,
  error text,
  duration_ms integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_runs_agent_idx on carscout.agent_runs(agent, started_at desc);
create index if not exists agent_runs_status_idx on carscout.agent_runs(status);

create table if not exists carscout.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references carscout.users(id) on delete cascade,
  type text,
  title text,
  message text,
  listing_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx on carscout.notifications(user_id, read, created_at desc);

create table if not exists carscout.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references carscout.users(id) on delete cascade,
  key_hash text unique not null,
  name text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Auth trigger: create carscout.users row when an auth user is created.
-- =====================================================================

create or replace function carscout.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, carscout
as $$
begin
  insert into carscout.users (auth_id, email, name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function carscout.handle_new_auth_user();

-- =====================================================================
-- updated_at trigger
-- =====================================================================

create or replace function carscout.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on carscout.users;
create trigger users_set_updated_at
before update on carscout.users
for each row execute function carscout.set_updated_at();
