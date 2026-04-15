// =====================================================================
// market-agent
//
// A Claude Managed Agent. Computes weekly Market Days Supply (MDS) per
// make+model, marks vanished listings as sold, detects price drops.
// =====================================================================

import { runAgentLoop } from '../_shared/agent-loop.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { AnthropicTool } from '../_shared/anthropic.ts';

const SYSTEM_PROMPT = `Je bent de CarScout Markt Intelligence Agent.
Voer een volledige wekelijkse marktanalyse uit.

Verwerk alle beschikbare listing data.
Bereken voor elke make/model combinatie de MDS score.
Markeer listings die waarschijnlijk verkocht zijn.
Detecteer significante prijsdalingen (>5%).
Sla alle marktdata op per week voor historische vergelijking.`;

const tools: AnthropicTool[] = [
  {
    name: 'get_listings_for_period',
    description:
      'Haal alle listings op die in de afgelopen N dagen actief waren of als verkocht ' +
      'gemarkeerd zijn.',
    input_schema: {
      type: 'object',
      properties: { days_back: { type: 'integer', description: 'Aantal dagen terug' } },
      required: ['days_back'],
    },
  },
  {
    name: 'group_by_make_model',
    description:
      'Groepeert listings per make+model en geeft per groep aantallen actief en verkocht.',
    input_schema: {
      type: 'object',
      properties: { listings: { type: 'array', items: { type: 'object' } } },
      required: ['listings'],
    },
  },
  {
    name: 'calculate_mds',
    description:
      'Bereken MDS = active_listings / (sold_per_month / 30). ' +
      '<30 = snel, 30-60 = normaal, >60 = traag.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        active_count: { type: 'integer' },
        sold_count: { type: 'integer' },
        period_days: { type: 'integer' },
      },
      required: ['make', 'model', 'active_count', 'sold_count', 'period_days'],
    },
  },
  {
    name: 'get_avg_price',
    description: 'Gemiddelde prijs van actieve listings voor merk + model in een jaarrange.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year_from: { type: 'integer' },
        year_to: { type: 'integer' },
      },
      required: ['make', 'model'],
    },
  },
  {
    name: 'detect_price_drops',
    description:
      'Vind listings waarbij de prijs is gedaald t.o.v. een vorige prijspunt in price_history. ' +
      'Geeft listings met >5% daling terug.',
    input_schema: {
      type: 'object',
      properties: { days_back: { type: 'integer' } },
      required: ['days_back'],
    },
  },
  {
    name: 'save_market_data',
    description:
      'Sla het wekelijks marktrapport per make+model op (UPSERT op make+model+week).',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        mds_score: { type: 'number' },
        avg_price_eur: { type: 'integer' },
        nr_listings: { type: 'integer' },
        nr_sold: { type: 'integer' },
        avg_days_to_sell: { type: 'integer' },
      },
      required: ['make', 'model', 'mds_score'],
    },
  },
  {
    name: 'mark_sold_listings',
    description:
      'Markeer listings als verkocht (sold=true, sold_at=now()) wanneer hun last_seen ' +
      'ouder is dan threshold dagen en ze nog niet als verkocht gemarkeerd zijn.',
    input_schema: {
      type: 'object',
      properties: { not_seen_for_days: { type: 'integer' } },
      required: ['not_seen_for_days'],
    },
  },
];

function startOfWeekIso(d = new Date()): string {
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const supabase = getServiceClient();

  switch (name) {
    case 'get_listings_for_period': {
      const days = input.days_back as number;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('listings')
        .select('id, make, model, year, price_eur, first_seen, last_seen, sold, sold_at')
        .gte('first_seen', since)
        .limit(5000);
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, listings: data ?? [] };
    }

    case 'group_by_make_model': {
      const listings = (input.listings as Array<Record<string, unknown>>) ?? [];
      const groups = new Map<
        string,
        { make: string; model: string; active: number; sold: number; sample_prices: number[] }
      >();
      for (const l of listings) {
        const make = (l.make as string) ?? 'Onbekend';
        const model = (l.model as string) ?? 'Onbekend';
        const key = `${make}::${model}`;
        const g = groups.get(key) ?? {
          make,
          model,
          active: 0,
          sold: 0,
          sample_prices: [],
        };
        if (l.sold) g.sold++;
        else g.active++;
        if (typeof l.price_eur === 'number') g.sample_prices.push(l.price_eur);
        groups.set(key, g);
      }
      return { count: groups.size, groups: Array.from(groups.values()) };
    }

    case 'calculate_mds': {
      const active = input.active_count as number;
      const sold = input.sold_count as number;
      const period = input.period_days as number;
      const soldPerMonth = sold * (30 / Math.max(1, period));
      const mds = soldPerMonth > 0 ? active / (soldPerMonth / 30) : 999;
      return {
        make: input.make,
        model: input.model,
        mds_score: Number(mds.toFixed(1)),
        velocity:
          mds < 30 ? 'snel' : mds < 60 ? 'normaal' : 'traag',
      };
    }

    case 'get_avg_price': {
      let q = supabase
        .from('listings')
        .select('price_eur')
        .ilike('make', input.make as string)
        .ilike('model', input.model as string)
        .not('price_eur', 'is', null);
      if (input.year_from) q = q.gte('year', input.year_from as number);
      if (input.year_to) q = q.lte('year', input.year_to as number);

      const { data, error } = await q.limit(200);
      if (error) return { error: error.message };
      const prices = (data ?? []).map((d) => d.price_eur).filter((p): p is number => !!p);
      const avg = prices.length
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;
      return { avg_price: avg, n: prices.length };
    }

    case 'detect_price_drops': {
      const days = input.days_back as number;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('price_history')
        .select('listing_id, price_eur, recorded_at')
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: true });
      if (error) return { error: error.message };

      const byListing = new Map<string, { first: number; last: number }>();
      for (const row of data ?? []) {
        const cur = byListing.get(row.listing_id);
        if (!cur) byListing.set(row.listing_id, { first: row.price_eur, last: row.price_eur });
        else byListing.set(row.listing_id, { first: cur.first, last: row.price_eur });
      }

      const drops: Array<{ listing_id: string; pct: number }> = [];
      for (const [id, { first, last }] of byListing) {
        if (first <= 0) continue;
        const pct = ((last - first) / first) * 100;
        if (pct < -5) drops.push({ listing_id: id, pct: Number(pct.toFixed(1)) });
      }
      return { drops };
    }

    case 'save_market_data': {
      const { error } = await supabase.from('market_data').upsert(
        {
          make: input.make as string,
          model: input.model as string,
          mds_score: input.mds_score as number,
          avg_price_eur: (input.avg_price_eur as number) ?? null,
          nr_listings: (input.nr_listings as number) ?? null,
          nr_sold: (input.nr_sold as number) ?? null,
          avg_days_to_sell: (input.avg_days_to_sell as number) ?? null,
          week: startOfWeekIso(),
        },
        { onConflict: 'make,model,week' },
      );
      if (error) return { error: error.message };
      return { success: true };
    }

    case 'mark_sold_listings': {
      const days = input.not_seen_for_days as number;
      const threshold = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('listings')
        .update({ sold: true, sold_at: new Date().toISOString() })
        .lt('last_seen', threshold)
        .eq('sold', false)
        .select('id');
      if (error) return { error: error.message };
      return { marked_sold: data?.length ?? 0 };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const userPrompt =
    'Voer de wekelijkse marktanalyse uit. Haal listings op van de laatste 30 dagen, ' +
    'markeer listings als verkocht wanneer ze >7 dagen niet meer gezien zijn, ' +
    'groepeer per merk+model, bereken voor de top groepen de MDS score, ' +
    'haal gemiddelde prijzen op, detecteer prijsdalingen, en bewaar het rapport ' +
    'per make+model in market_data voor deze week.';

  const result = await runAgentLoop({
    agent: 'market-agent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    tools,
    executeTool,
    maxIterations: 50,
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
