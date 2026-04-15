// =====================================================================
// scout-agent
//
// A Claude Managed Agent. Claude orchestrates the scraping of 2dehands.be
// and AutoScout24.be for every active search, deduplicates listings, stores
// them, and triggers the analyse-agent for new ones.
// =====================================================================

import { runAgentLoop } from '../_shared/agent-loop.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { AnthropicTool } from '../_shared/anthropic.ts';

const SYSTEM_PROMPT = `Je bent de CarScout Scout Agent. Je taak is het systematisch
doorzoeken van autoplatforms op basis van actieve zoekopdrachten.

Werk elke zoekopdracht volledig af voor je naar de volgende gaat.
Controleer altijd op duplicaten voor je opslaat.
Trigger de analyse agent voor elke nieuw opgeslagen listing.
Als een platform scrape faalt, ga door met de volgende.
Rapporteer hoeveel nieuwe listings je gevonden hebt.`;

const tools: AnthropicTool[] = [
  {
    name: 'get_active_searches',
    description:
      'Geef alle actieve zoekopdrachten terug met al hun filters. Roep deze tool ' +
      'als allereerste stap om te bepalen wat je moet scrapen.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'scrape_2dehands',
    description:
      'Scrape 2dehands.be voor een specifieke zoekopdracht. Geeft een array van genormaliseerde ' +
      'listings terug. Faalt nooit hard: geeft { error } terug bij netwerkproblemen.',
    input_schema: {
      type: 'object',
      properties: {
        search_id: { type: 'string' },
        makes: { type: 'array', items: { type: 'string' } },
        models: { type: 'array', items: { type: 'string' } },
        price_max: { type: 'integer' },
        year_from: { type: 'integer' },
        km_max: { type: 'integer' },
        fuel_types: { type: 'array', items: { type: 'string' } },
      },
      required: ['search_id'],
    },
  },
  {
    name: 'scrape_autoscout24',
    description:
      'Scrape AutoScout24 via de Apify actor. Pollt tot resultaten klaar zijn. ' +
      'Geeft array van genormaliseerde listings terug.',
    input_schema: {
      type: 'object',
      properties: {
        search_id: { type: 'string' },
        makes: { type: 'array', items: { type: 'string' } },
        models: { type: 'array', items: { type: 'string' } },
        price_max: { type: 'integer' },
        year_from: { type: 'integer' },
        km_max: { type: 'integer' },
        countries: { type: 'array', items: { type: 'string' } },
      },
      required: ['search_id'],
    },
  },
  {
    name: 'check_listing_exists',
    description:
      'Controleer of een listing al in de database staat (op basis van external_id + platform).',
    input_schema: {
      type: 'object',
      properties: {
        external_id: { type: 'string' },
        platform: { type: 'string' },
      },
      required: ['external_id', 'platform'],
    },
  },
  {
    name: 'save_listing',
    description:
      'Bewaar een nieuwe listing. Gebruikt INSERT ... ON CONFLICT DO NOTHING ' +
      'op (external_id, platform). Geeft de listing_id terug bij succes.',
    input_schema: {
      type: 'object',
      properties: {
        external_id: { type: 'string' },
        platform: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        make: { type: 'string' },
        model: { type: 'string' },
        variant: { type: 'string' },
        year: { type: 'integer' },
        price_eur: { type: 'integer' },
        km: { type: 'integer' },
        fuel_type: { type: 'string' },
        transmission: { type: 'string' },
        power_kw: { type: 'integer' },
        body_type: { type: 'string' },
        color: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        seller_type: { type: 'string' },
        seller_name: { type: 'string' },
        btw_mention: { type: 'boolean' },
        images: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
        raw_data: { type: 'object' },
      },
      required: ['external_id', 'platform', 'url'],
    },
  },
  {
    name: 'update_listing_last_seen',
    description: 'Update last_seen=now() voor een bestaande listing.',
    input_schema: {
      type: 'object',
      properties: { listing_id: { type: 'string' } },
      required: ['listing_id'],
    },
  },
  {
    name: 'log_price_change',
    description:
      'Log een prijswijziging in price_history en update de prijs in listings. ' +
      'Roep alleen aan als de nieuwe prijs verschilt van de oude.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string' },
        old_price: { type: 'integer' },
        new_price: { type: 'integer' },
      },
      required: ['listing_id', 'new_price'],
    },
  },
  {
    name: 'trigger_analyse_agent',
    description:
      'Trigger de analyse-agent edge function voor een nieuwe listing. Doe dit voor ' +
      'iedere succesvol opgeslagen nieuwe listing.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string' },
        search_id: { type: 'string' },
      },
      required: ['listing_id', 'search_id'],
    },
  },
];

// ---------- helpers ----------

interface NormalisedListing {
  external_id: string;
  platform: string;
  url: string;
  title?: string;
  make?: string;
  model?: string;
  variant?: string;
  year?: number;
  price_eur?: number;
  km?: number;
  fuel_type?: string;
  city?: string;
  country?: string;
  seller_type?: string;
  seller_name?: string;
  btw_mention?: boolean;
  images?: string[];
  description?: string;
  raw_data?: unknown;
}

async function scrape2dehands(input: Record<string, unknown>): Promise<NormalisedListing[]> {
  const params = new URLSearchParams();
  params.set('l1CategoryId', '91'); // Auto's
  params.set('size', '30');
  if (input.price_max) params.set('priceCentsTo', String((input.price_max as number) * 100));
  if (input.year_from) params.set('firstRegistrationYearMin', String(input.year_from));
  if (input.km_max) params.set('mileageMax', String(input.km_max));

  const makes = (input.makes as string[]) ?? [];
  const models = (input.models as string[]) ?? [];
  if (makes[0]) params.set('attributesByKey[]', `make:${makes[0]}`);
  if (models[0]) params.append('attributesByKey[]', `model:${models[0]}`);

  const url = `https://www.2dehands.be/lrp/api/search?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; CarScout/1.0; +https://carscout.app)',
        Accept: 'application/json',
      },
    });
  } catch (err) {
    throw new Error(`2dehands fetch failed: ${(err as Error).message}`);
  }

  if (!res.ok) throw new Error(`2dehands HTTP ${res.status}`);
  const json = (await res.json()) as { listings?: Array<Record<string, unknown>> };
  const listings = json.listings ?? [];

  return listings.map((l): NormalisedListing => {
    const attrs = (l.attributes as Array<{ key: string; value: string }>) ?? [];
    const attr = (k: string) => attrs.find((a) => a.key === k)?.value;
    const price =
      typeof l.priceInfo === 'object' && l.priceInfo
        ? Math.round((l.priceInfo as { priceCents?: number }).priceCents! / 100)
        : undefined;
    return {
      external_id: String(l.itemId ?? l.id ?? crypto.randomUUID()),
      platform: '2dehands',
      url: `https://www.2dehands.be${l.vipUrl ?? ''}`,
      title: l.title as string,
      make: attr('make'),
      model: attr('model'),
      year: attr('constructionYear') ? Number(attr('constructionYear')) : undefined,
      price_eur: price,
      km: attr('mileage') ? Number(attr('mileage')) : undefined,
      fuel_type: attr('fuel'),
      city: l.location ? (l.location as { cityName?: string }).cityName : undefined,
      country: 'BE',
      seller_type: l.sellerInformation
        ? (l.sellerInformation as { showSoiUrl?: boolean }).showSoiUrl
          ? 'dealer'
          : 'particulier'
        : undefined,
      seller_name: l.sellerInformation
        ? (l.sellerInformation as { sellerName?: string }).sellerName
        : undefined,
      images: l.pictures
        ? (l.pictures as Array<{ extraExtraLargeUrl?: string }>)
            .map((p) => p.extraExtraLargeUrl)
            .filter((x): x is string => !!x)
        : [],
      description: l.description as string,
      raw_data: l,
    };
  });
}

async function scrapeAutoscout24(input: Record<string, unknown>): Promise<NormalisedListing[]> {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) throw new Error('APIFY_TOKEN missing');

  const actorId = 'ivanvs~autoscout-scraper';
  const runUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`;

  const startBody = {
    startUrls: [
      {
        url: buildAutoscout24Url(input),
      },
    ],
    maxItems: 30,
  };

  const startRes = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(startBody),
  });
  if (!startRes.ok) throw new Error(`Apify start failed: ${startRes.status}`);
  const startJson = (await startRes.json()) as { data: { id: string; defaultDatasetId: string } };
  const datasetId = startJson.data.defaultDatasetId;

  // Wait once and then poll for up to ~60s in 5s steps.
  await new Promise((r) => setTimeout(r, 15000));
  let items: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 10; i++) {
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=30`,
    );
    if (itemsRes.ok) {
      items = (await itemsRes.json()) as Array<Record<string, unknown>>;
      if (items.length > 0) break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  return items.map((it): NormalisedListing => ({
    external_id: String(it.id ?? it.url ?? crypto.randomUUID()),
    platform: 'autoscout24',
    url: it.url as string,
    title: (it.title as string) ?? `${it.make} ${it.model}`,
    make: it.make as string,
    model: it.model as string,
    variant: it.variant as string,
    year: it.year ? Number(it.year) : undefined,
    price_eur: it.price ? Number(it.price) : undefined,
    km: it.mileage ? Number(it.mileage) : undefined,
    fuel_type: it.fuel as string,
    transmission: it.transmission as string,
    power_kw: it.powerKw ? Number(it.powerKw) : undefined,
    body_type: it.bodyType as string,
    color: it.color as string,
    city: it.city as string,
    country: (it.country as string) ?? 'BE',
    seller_type: it.sellerType as string,
    seller_name: it.sellerName as string,
    images: (it.images as string[]) ?? [],
    description: it.description as string,
    raw_data: it,
  } as NormalisedListing);
}

function buildAutoscout24Url(input: Record<string, unknown>): string {
  const base = 'https://www.autoscout24.be/lst';
  const segments: string[] = [];
  const makes = (input.makes as string[]) ?? [];
  const models = (input.models as string[]) ?? [];
  if (makes[0]) segments.push(makes[0].toLowerCase());
  if (models[0]) segments.push(models[0].toLowerCase());
  const path = segments.length ? `/${segments.join('/')}` : '';

  const params = new URLSearchParams();
  if (input.price_max) params.set('priceto', String(input.price_max));
  if (input.year_from) params.set('fregfrom', String(input.year_from));
  if (input.km_max) params.set('kmto', String(input.km_max));
  const countries = (input.countries as string[]) ?? ['BE'];
  params.set('cy', countries.join(','));
  params.set('atype', 'C');

  return `${base}${path}?${params.toString()}`;
}

// ---------- tool dispatcher ----------

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const supabase = getServiceClient();

  switch (name) {
    case 'get_active_searches': {
      const { data, error } = await supabase
        .from('searches')
        .select('*')
        .eq('active', true);
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, searches: data ?? [] };
    }

    case 'scrape_2dehands': {
      try {
        const listings = await scrape2dehands(input);
        return { count: listings.length, listings };
      } catch (err) {
        return { error: (err as Error).message, listings: [] };
      }
    }

    case 'scrape_autoscout24': {
      try {
        const listings = await scrapeAutoscout24(input);
        return { count: listings.length, listings };
      } catch (err) {
        return { error: (err as Error).message, listings: [] };
      }
    }

    case 'check_listing_exists': {
      const { data, error } = await supabase
        .from('listings')
        .select('id, price_eur')
        .eq('external_id', input.external_id as string)
        .eq('platform', input.platform as string)
        .maybeSingle();
      if (error) return { error: error.message };
      return { exists: !!data, id: data?.id, current_price: data?.price_eur };
    }

    case 'save_listing': {
      const payload = {
        external_id: input.external_id as string,
        platform: input.platform as string,
        url: input.url as string,
        title: input.title as string | undefined,
        make: input.make as string | undefined,
        model: input.model as string | undefined,
        variant: input.variant as string | undefined,
        year: input.year as number | undefined,
        price_eur: input.price_eur as number | undefined,
        km: input.km as number | undefined,
        fuel_type: input.fuel_type as string | undefined,
        transmission: input.transmission as string | undefined,
        power_kw: input.power_kw as number | undefined,
        body_type: input.body_type as string | undefined,
        color: input.color as string | undefined,
        city: input.city as string | undefined,
        country: (input.country as string) ?? 'BE',
        seller_type: input.seller_type as string | undefined,
        seller_name: input.seller_name as string | undefined,
        btw_mention: input.btw_mention as boolean | undefined,
        images: (input.images as string[]) ?? [],
        description: input.description as string | undefined,
        raw_data: input.raw_data ?? null,
      };

      const { data, error } = await supabase
        .from('listings')
        .upsert(payload, { onConflict: 'external_id,platform', ignoreDuplicates: false })
        .select('id')
        .single();

      if (error) return { error: error.message };
      return { success: true, listing_id: data.id };
    }

    case 'update_listing_last_seen': {
      const { error } = await supabase
        .from('listings')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', input.listing_id as string);
      if (error) return { error: error.message };
      return { success: true };
    }

    case 'log_price_change': {
      const newPrice = input.new_price as number;
      const { error: histErr } = await supabase
        .from('price_history')
        .insert({ listing_id: input.listing_id, price_eur: newPrice });
      if (histErr) return { error: histErr.message };
      const { error: updErr } = await supabase
        .from('listings')
        .update({ price_eur: newPrice })
        .eq('id', input.listing_id as string);
      if (updErr) return { error: updErr.message };
      return { success: true };
    }

    case 'trigger_analyse_agent': {
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/analyse-agent`;
      const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

  const userPrompt =
    'Voer een volledige scout cyclus uit. ' +
    'Begin met het ophalen van alle actieve zoekopdrachten. ' +
    'Voor elke zoekopdracht: scrape de geconfigureerde platforms, controleer ' +
    'op duplicaten, sla nieuwe listings op en trigger de analyse-agent. ' +
    'Update last_seen voor reeds bestaande listings, en log prijswijzigingen ' +
    'wanneer de prijs veranderd is. Sluit af met een korte rapportage.';

  const result = await runAgentLoop({
    agent: 'scout-agent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    tools,
    executeTool,
    maxIterations: 40,
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
