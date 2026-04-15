-- =====================================================================
-- pg_cron jobs that hit the Edge Functions over HTTP.
-- Requires the pg_cron and pg_net extensions to be enabled in Supabase.
--
-- Replace ${SUPABASE_URL} and ${SUPABASE_SERVICE_ROLE_KEY} placeholders
-- with real values when running this migration. This file is meant to
-- be applied via the Supabase SQL editor or a templated runner.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Scout every 5 minutes
select cron.schedule(
  'carscout-scout-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scout-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Market intelligence every Sunday at 03:00
select cron.schedule(
  'carscout-market-weekly',
  '0 3 * * 0',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/market-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Daily cleanup of old agent_runs at 04:00
select cron.schedule(
  'carscout-cleanup-agent-runs',
  '0 4 * * *',
  $$
  delete from carscout.agent_runs where started_at < now() - interval '7 days';
  $$
);
