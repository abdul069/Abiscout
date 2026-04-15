import type { Config } from '@netlify/functions';

// Backup scheduler for the scout-agent. Triggers it every 5 minutes from
// Netlify in case pg_cron is paused or unavailable.
export default async (_req: Request) => {
  const url = `${process.env.SUPABASE_URL}/functions/v1/scout-agent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const text = await res.text();
  console.log('Scout triggered:', res.status, text);
  return new Response(text, { status: res.ok ? 200 : 500 });
};

export const config: Config = {
  schedule: '*/5 * * * *',
};
