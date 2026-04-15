// =====================================================================
// ad-agent
//
// A Claude Managed Agent. Drafts a sales advertisement (NL + FR) for a
// listing the dealer wants to publish. Saves to ad_drafts as 'draft' so
// the dealer can approve.
// =====================================================================

import { runAgentLoop } from '../_shared/agent-loop.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { AnthropicTool } from '../_shared/anthropic.ts';

interface RequestBody {
  listing_id: string;
  user_id: string;
}

const SYSTEM_PROMPT = `Je bent de CarScout Advertentie Agent. Maak professionele
verkoopsadvertenties voor de Belgische automarkt.

Schrijf altijd in het Nederlands EN Frans.
Toon: zakelijk maar toegankelijk. Geen reclametaal.
Bepaal een realistische vraagprijs op basis van marktdata.
Kies de beste platforms voor dit type auto.
De dealer beoordeelt en keurt goed voor publicatie.

Werkwijze: data ophalen -> marktpositie checken -> titels maken (NL+FR) ->
beschrijvingen maken (NL+FR) -> vraagprijs berekenen -> platforms kiezen -> opslaan.`;

const tools: AnthropicTool[] = [
  {
    name: 'get_listing_and_analysis',
    description:
      'Haal de listing op samen met de meest recente analyse (marktwaarde, scores, ' +
      'verwachte verkoopprijs).',
    input_schema: {
      type: 'object',
      properties: { listing_id: { type: 'string' } },
      required: ['listing_id'],
    },
  },
  {
    name: 'get_market_positioning',
    description:
      'Geeft gemiddelde prijs en aantal vergelijkbare actieve listings voor merk + model + jaar.',
    input_schema: {
      type: 'object',
      properties: {
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'integer' },
        km: { type: 'integer' },
      },
      required: ['make', 'model'],
    },
  },
  {
    name: 'draft_title',
    description:
      'Genereer en valideer een aantrekkelijke, precieze titel (max 60 karakters). ' +
      'Bevat merk/model/jaar/brandstof. Roep aan voor zowel "nl" als "fr".',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Voorgestelde titel' },
        language: { type: 'string', enum: ['nl', 'fr'] },
      },
      required: ['title', 'language'],
    },
  },
  {
    name: 'draft_description',
    description:
      'Valideer een professionele beschrijving (150-250 woorden). Sterke punten vooraan, ' +
      'eerlijk over aandachtspunten, geen overdrijving.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        language: { type: 'string', enum: ['nl', 'fr'] },
      },
      required: ['description', 'language'],
    },
  },
  {
    name: 'calculate_asking_price',
    description:
      'Stel een realistische vraagprijs voor op basis van marktwaarde en verwachte ' +
      'verkoopprijs. Marktwaarde + 5-8%. Niet te hoog, niet te laag.',
    input_schema: {
      type: 'object',
      properties: {
        market_value: { type: 'integer' },
        expected_sell_price: { type: 'integer' },
        km: { type: 'integer' },
        year: { type: 'integer' },
      },
      required: ['market_value'],
    },
  },
  {
    name: 'recommend_platforms',
    description:
      'Geef een aanbeveling van platforms (2dehands, autoscout24, facebook_marketplace) ' +
      'op basis van prijsklasse, type auto, regio.',
    input_schema: {
      type: 'object',
      properties: {
        price: { type: 'integer' },
        body_type: { type: 'string' },
        country: { type: 'string' },
      },
      required: ['price'],
    },
  },
  {
    name: 'save_ad_draft',
    description:
      'Bewaar het volledige draft. Status komt op "draft" zodat de dealer kan goedkeuren.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string' },
        user_id: { type: 'string' },
        title_nl: { type: 'string' },
        title_fr: { type: 'string' },
        description_nl: { type: 'string' },
        description_fr: { type: 'string' },
        asking_price_eur: { type: 'integer' },
        platform_targets: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'listing_id',
        'user_id',
        'title_nl',
        'title_fr',
        'description_nl',
        'description_fr',
        'asking_price_eur',
      ],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const supabase = getServiceClient();

  switch (name) {
    case 'get_listing_and_analysis': {
      const { data: listing, error: lErr } = await supabase
        .from('listings')
        .select('*')
        .eq('id', input.listing_id as string)
        .single();
      if (lErr) return { error: lErr.message };

      const { data: analysis, error: aErr } = await supabase
        .from('analyses')
        .select('*')
        .eq('listing_id', input.listing_id as string)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (aErr) return { error: aErr.message };

      return { listing, analysis };
    }

    case 'get_market_positioning': {
      const make = input.make as string;
      const model = input.model as string;
      const year = (input.year as number) ?? null;

      let query = supabase
        .from('listings')
        .select('price_eur, km, year')
        .ilike('make', make)
        .ilike('model', model)
        .not('price_eur', 'is', null);

      if (year) {
        query = query.gte('year', year - 2).lte('year', year + 2);
      }

      const { data, error } = await query.limit(50);
      if (error) return { error: error.message };

      const prices = (data ?? []).map((d) => d.price_eur).filter((p): p is number => !!p);
      const avg = prices.length
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;

      return { avg_price: avg, count: prices.length };
    }

    case 'draft_title': {
      const title = input.title as string;
      const lang = input.language as string;
      return {
        ok: title.length <= 60,
        length: title.length,
        title,
        language: lang,
        warning: title.length > 60 ? 'Titel langer dan 60 karakters' : null,
      };
    }

    case 'draft_description': {
      const desc = input.description as string;
      const wc = desc.trim().split(/\s+/).length;
      return {
        ok: wc >= 150 && wc <= 250,
        word_count: wc,
        language: input.language as string,
        warning:
          wc < 150 ? 'Te kort, minimaal 150 woorden' :
          wc > 250 ? 'Te lang, maximaal 250 woorden' : null,
      };
    }

    case 'calculate_asking_price': {
      const market = input.market_value as number;
      const expected = (input.expected_sell_price as number) ?? Math.round(market * 1.05);
      const asking = Math.round((market * 1.07 + expected) / 2);
      return {
        market_value: market,
        suggested_asking_price: asking,
        margin_pct: Number((((asking - market) / market) * 100).toFixed(1)),
      };
    }

    case 'recommend_platforms': {
      const price = input.price as number;
      const platforms = ['2dehands', 'autoscout24'];
      if (price < 15000) platforms.push('facebook_marketplace');
      return { platforms };
    }

    case 'save_ad_draft': {
      const { data, error } = await supabase
        .from('ad_drafts')
        .insert({
          listing_id: input.listing_id as string,
          user_id: input.user_id as string,
          title_nl: input.title_nl as string,
          title_fr: input.title_fr as string,
          description_nl: input.description_nl as string,
          description_fr: input.description_fr as string,
          asking_price_eur: input.asking_price_eur as number,
          platform_targets: (input.platform_targets as string[]) ?? [],
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) return { error: error.message };
      return { success: true, ad_draft_id: data.id };
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

  if (!body.listing_id || !body.user_id) {
    return new Response(
      JSON.stringify({ error: 'listing_id and user_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const userPrompt =
    `Maak een verkoopsadvertentie draft voor listing ${body.listing_id}, ` +
    `eigenaar user ${body.user_id}. Lever titels en beschrijvingen in NL en FR, ` +
    `een realistische vraagprijs en een platform aanbeveling. Sla alles op als draft.`;

  const result = await runAgentLoop({
    agent: 'ad-agent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    tools,
    executeTool,
    listingId: body.listing_id,
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
