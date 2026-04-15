// =====================================================================
// analyse-agent
//
// A Claude Managed Agent. Claude decides which tools to call and in what
// order to analyse a single listing. Triggered by scout-agent for every
// newly stored listing.
//
// Input: { listing_id: string, search_id?: string }
// Output: { success: boolean, analysis_id?: string, score?: number }
// =====================================================================

import { runAgentLoop } from '../_shared/agent-loop.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { AnthropicTool } from '../_shared/anthropic.ts';

interface RequestBody {
  listing_id: string;
  search_id?: string;
}

const SYSTEM_PROMPT = `Je bent de CarScout Analyse Agent. Analyseer de gegeven listing
grondig en objectief.

Stap 1: haal de listing op en lees alle details
Stap 2: detecteer het BTW-regime op basis van verkopertype en tekst
Stap 3: zoek vergelijkbare listings om de marktwaarde te bepalen
Stap 4: bereken alle financiele metrics inclusief max bod
Stap 5: haal de MDS score op voor vraagsnelheid
Stap 6: bereken de totaalscore (price 40%, demand 30%, km 20%, age 10%)
Stap 7: schrijf een redenering in het Nederlands (3-5 zinnen)
  - Benoem concrete cijfers
  - Leg BTW-regime uit
  - Geef aanbeveling KOPEN/TWIJFEL/NEGEREN
Stap 8: sla de analyse op
Stap 9: trigger alert als score hoog genoeg

Werk deze stappen systematisch af. Roep elke tool slechts aan wanneer je
de output ervan nodig hebt. Na opslaan: stop.`;

const tools: AnthropicTool[] = [
  {
    name: 'get_listing',
    description:
      'Haal alle gegevens op van een listing aan de hand van zijn UUID. ' +
      'Gebruik deze tool als allereerste stap.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string', description: 'UUID van de listing' },
      },
      required: ['listing_id'],
    },
  },
  {
    name: 'get_comparable_listings',
    description:
      'Zoek vergelijkbare listings (zelfde merk + model, vergelijkbaar bouwjaar en km) ' +
      'om de marktwaarde te bepalen. Gebruik deze tool nadat je de listing kent.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year_from: { type: 'integer' },
        year_to: { type: 'integer' },
        km_max: { type: 'integer' },
        limit: { type: 'integer', description: 'Max aantal vergelijkingen, default 20' },
      },
      required: ['make', 'model'],
    },
  },
  {
    name: 'detect_btw_regime',
    description:
      'Bepaal het BTW-regime (marge of normaal). Particulier zonder BTW-vermelding = marge. ' +
      'Dealer of expliciete BTW/TVA/21% in tekst = normaal.',
    input_schema: {
      type: 'object',
      properties: {
        seller_type: { type: 'string' },
        btw_mention: { type: 'boolean' },
        description: { type: 'string' },
        price_eur: { type: 'integer' },
      },
      required: [],
    },
  },
  {
    name: 'calculate_financials',
    description:
      'Bereken alle financiele metrics: kosten, max bod, verwachte verkoopprijs, marge ' +
      'en de individuele scores (price/km/age). Roep deze tool aan zodra je marktwaarde ' +
      'en BTW-regime kent.',
    input_schema: {
      type: 'object',
      properties: {
        listing_price: { type: 'integer' },
        market_value: { type: 'integer' },
        btw_regime: { type: 'string', enum: ['marge', 'normaal'] },
        km: { type: 'integer' },
        year: { type: 'integer' },
        repair_estimate: { type: 'integer' },
        transport_estimate: { type: 'integer' },
      },
      required: ['listing_price', 'market_value', 'btw_regime'],
    },
  },
  {
    name: 'get_market_data',
    description:
      'Haal de meest recente MDS score en gemiddelde verkooptijd op voor een merk + model. ' +
      'Gebruik dit voor de demand_score component.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['make', 'model'],
    },
  },
  {
    name: 'save_analysis',
    description:
      'Bewaar de volledige analyse in de database. Voer dit pas uit als alle scores ' +
      'en de redenering compleet zijn.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string' },
        search_id: { type: 'string' },
        market_value_eur: { type: 'integer' },
        price_vs_market: { type: 'integer' },
        price_vs_market_pct: { type: 'number' },
        btw_regime: { type: 'string', enum: ['marge', 'normaal'] },
        max_bid_eur: { type: 'integer' },
        expected_sell_price: { type: 'integer' },
        expected_margin: { type: 'integer' },
        transport_cost: { type: 'integer' },
        repair_cost: { type: 'integer' },
        inspection_cost: { type: 'integer' },
        buying_fee: { type: 'integer' },
        price_score: { type: 'integer' },
        km_score: { type: 'integer' },
        age_score: { type: 'integer' },
        demand_score: { type: 'integer' },
        total_score: { type: 'integer' },
        recommendation: { type: 'string', enum: ['KOPEN', 'TWIJFEL', 'NEGEREN'] },
        reasoning: { type: 'string' },
      },
      required: [
        'listing_id',
        'market_value_eur',
        'btw_regime',
        'total_score',
        'recommendation',
        'reasoning',
      ],
    },
  },
  {
    name: 'get_search_min_score',
    description:
      'Haal de min_score van een specifieke search op. Gebruik dit voor je beslist of een ' +
      'alert getriggered moet worden.',
    input_schema: {
      type: 'object',
      properties: { search_id: { type: 'string' } },
      required: ['search_id'],
    },
  },
  {
    name: 'trigger_alert_agent',
    description:
      'Trigger de alert-agent edge function. Doe dit alleen als total_score >= ' +
      'min_score van de search.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string' },
        search_id: { type: 'string' },
        total_score: { type: 'integer' },
      },
      required: ['listing_id', 'search_id', 'total_score'],
    },
  },
];

interface FinancialInput {
  listing_price: number;
  market_value: number;
  btw_regime: 'marge' | 'normaal';
  km?: number;
  year?: number;
  repair_estimate?: number;
  transport_estimate?: number;
}

function calculateFinancials(input: FinancialInput) {
  const transport = input.transport_estimate ?? 250;
  const inspection = 150;
  const repair = input.repair_estimate ?? 0;
  const totalCosts = transport + inspection + repair;

  const expectedSellPrice = Math.round(input.market_value * 1.05);

  let maxBid: number;
  if (input.btw_regime === 'marge') {
    maxBid = Math.round(expectedSellPrice * 0.85 - totalCosts);
  } else {
    maxBid = Math.round((expectedSellPrice / 1.21) * 0.85 - totalCosts);
  }

  const expectedMargin = expectedSellPrice - input.listing_price - totalCosts;
  const priceVsMarket = input.listing_price - input.market_value;
  const priceVsMarketPct =
    input.market_value > 0 ? (priceVsMarket / input.market_value) * 100 : 0;

  const priceScore = Math.min(100, Math.max(0, Math.round(50 + -priceVsMarketPct * 2)));
  const kmScore = input.km
    ? Math.max(0, Math.min(100, Math.round(100 - input.km / 2000)))
    : 50;

  const currentYear = new Date().getFullYear();
  const age = input.year ? currentYear - input.year : 10;
  const ageScore = Math.max(0, Math.min(100, 100 - age * 6));

  return {
    transport_cost: transport,
    repair_cost: repair,
    inspection_cost: inspection,
    buying_fee: 0,
    expected_sell_price: expectedSellPrice,
    max_bid_eur: maxBid,
    expected_margin: expectedMargin,
    price_vs_market: priceVsMarket,
    price_vs_market_pct: Number(priceVsMarketPct.toFixed(2)),
    price_score: priceScore,
    km_score: kmScore,
    age_score: ageScore,
  };
}

function detectBtwRegime(input: {
  seller_type?: string;
  btw_mention?: boolean;
  description?: string;
  price_eur?: number;
}) {
  const desc = (input.description ?? '').toLowerCase();
  const explicitNormal =
    input.btw_mention === true ||
    /(\bbtw\b|\btva\b|\b21\s?%|incl\.?\s*btw|aftrekbaar)/.test(desc);

  if (explicitNormal) {
    return {
      regime: 'normaal' as const,
      reason:
        'Verkoper of advertentie vermeldt expliciet BTW / TVA / 21% / aftrekbaar.',
    };
  }

  if (input.seller_type && /particulier|private|individual/i.test(input.seller_type)) {
    return {
      regime: 'marge' as const,
      reason: 'Particuliere verkoper zonder BTW-vermelding.',
    };
  }

  if (input.seller_type && /dealer|garage|professional|trader/i.test(input.seller_type)) {
    return {
      regime: 'normaal' as const,
      reason: 'Professionele verkoper zonder expliciete margevermelding.',
    };
  }

  return {
    regime: 'marge' as const,
    reason: 'Onbekend verkopertype, geen BTW-signaal: standaard marge regime.',
  };
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const supabase = getServiceClient();

  switch (name) {
    case 'get_listing': {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', input.listing_id as string)
        .single();
      if (error) return { error: error.message };
      return data;
    }

    case 'get_comparable_listings': {
      const make = input.make as string;
      const model = input.model as string;
      const limit = (input.limit as number) ?? 20;
      const yearFrom = (input.year_from as number) ?? 1990;
      const yearTo = (input.year_to as number) ?? new Date().getFullYear() + 1;
      const kmMax = (input.km_max as number) ?? 1_000_000;

      const { data, error } = await supabase
        .from('listings')
        .select('id, price_eur, year, km, sold')
        .ilike('make', make)
        .ilike('model', model)
        .gte('year', yearFrom)
        .lte('year', yearTo)
        .lte('km', kmMax)
        .not('price_eur', 'is', null)
        .order('first_seen', { ascending: false })
        .limit(limit);

      if (error) return { error: error.message };

      const prices = (data ?? []).map((d) => d.price_eur).filter((p): p is number => !!p);
      const avg = prices.length
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;
      const median = (() => {
        if (!prices.length) return null;
        const sorted = [...prices].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      })();

      return { count: data?.length ?? 0, avg_price: avg, median_price: median, sample: data };
    }

    case 'detect_btw_regime': {
      return detectBtwRegime(input as Parameters<typeof detectBtwRegime>[0]);
    }

    case 'calculate_financials': {
      return calculateFinancials(input as unknown as FinancialInput);
    }

    case 'get_market_data': {
      const { data, error } = await supabase
        .from('market_data')
        .select('*')
        .ilike('make', input.make as string)
        .ilike('model', input.model as string)
        .order('week', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return { error: error.message };
      if (!data) {
        // Fallback so Claude can still calculate a demand score.
        return {
          mds_score: null,
          avg_days_to_sell: null,
          demand_score: 50,
          note: 'Geen marktdata beschikbaar, default demand_score=50.',
        };
      }

      let demandScore = 50;
      if (typeof data.mds_score === 'number') {
        if (data.mds_score < 30) demandScore = 90;
        else if (data.mds_score < 60) demandScore = 65;
        else demandScore = 30;
      }

      return { ...data, demand_score: demandScore };
    }

    case 'save_analysis': {
      const payload = {
        listing_id: input.listing_id as string,
        search_id: (input.search_id as string) ?? null,
        market_value_eur: input.market_value_eur as number,
        price_vs_market: (input.price_vs_market as number) ?? null,
        price_vs_market_pct: (input.price_vs_market_pct as number) ?? null,
        btw_regime: input.btw_regime as string,
        max_bid_eur: (input.max_bid_eur as number) ?? null,
        expected_sell_price: (input.expected_sell_price as number) ?? null,
        expected_margin: (input.expected_margin as number) ?? null,
        transport_cost: (input.transport_cost as number) ?? 250,
        repair_cost: (input.repair_cost as number) ?? 0,
        inspection_cost: (input.inspection_cost as number) ?? 150,
        buying_fee: (input.buying_fee as number) ?? 0,
        price_score: (input.price_score as number) ?? null,
        km_score: (input.km_score as number) ?? null,
        age_score: (input.age_score as number) ?? null,
        demand_score: (input.demand_score as number) ?? null,
        total_score: input.total_score as number,
        recommendation: input.recommendation as string,
        reasoning: input.reasoning as string,
      };

      const { data, error } = await supabase
        .from('analyses')
        .upsert(payload, { onConflict: 'listing_id,search_id' })
        .select('id')
        .single();

      if (error) return { error: error.message };
      return { success: true, analysis_id: data.id };
    }

    case 'get_search_min_score': {
      const { data, error } = await supabase
        .from('searches')
        .select('min_score')
        .eq('id', input.search_id as string)
        .single();
      if (error) return { error: error.message };
      return data;
    }

    case 'trigger_alert_agent': {
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/alert-agent`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      // Fire and forget but await initial response so we know it accepted.
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          listing_id: input.listing_id,
          search_id: input.search_id,
        }),
      });
      return { triggered: res.ok, status: res.status };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.listing_id) {
    return new Response(JSON.stringify({ error: 'listing_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userPrompt =
    `Analyseer listing ${body.listing_id}` +
    (body.search_id ? ` voor search ${body.search_id}.` : '.') +
    `\n\nVolg de stappen uit het systeem prompt. Roep tools aan in de juiste volgorde, ` +
    `bewaar de uiteindelijke analyse, en trigger indien nodig de alert-agent.`;

  const result = await runAgentLoop({
    agent: 'analyse-agent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    tools,
    executeTool,
    listingId: body.listing_id,
    searchId: body.search_id ?? null,
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
