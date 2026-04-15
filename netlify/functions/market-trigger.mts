import type { Config } from '@netlify/functions';

// Weekly market-agent backup trigger.
export default async (_req: Request) => {
  const url = `${process.env.SUPABASE_URL}/functions/v1/market-agent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  return new Response(await res.text(), { status: res.ok ? 200 : 500 });
};

export const config: Config = {
  schedule: '0 3 * * 0',
};
