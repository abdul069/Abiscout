// =====================================================================
// alert-agent
//
// A Claude Managed Agent. Decides which users to notify on Telegram for a
// given listing+search, formats the message, sends it, and logs results.
// =====================================================================

import { runAgentLoop } from '../_shared/agent-loop.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { AnthropicTool } from '../_shared/anthropic.ts';

interface RequestBody {
  listing_id: string;
  search_id: string;
}

const SYSTEM_PROMPT = `Je bent de CarScout Alert Agent. Stuur een Telegram alert naar
alle relevante gebruikers voor deze listing.

Controleer altijd eerst of de gebruiker al gealerteerd werd.
Schrijf een beknopt maar informatief bericht met alle kerncijfers.
Log elke verstuurde alert. Maak ook een notificatie aan in het systeem.

Werk per gebruiker: dedup-check -> format -> send -> log -> notify.`;

const tools: AnthropicTool[] = [
  {
    name: 'get_listing_with_analysis',
    description:
      'Haal de listing en zijn meest recente analyse op (JOIN). Roep eerst aan om alle ' +
      'gegevens te krijgen die je nodig hebt voor het bericht.',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string' },
        search_id: { type: 'string' },
      },
      required: ['listing_id', 'search_id'],
    },
  },
  {
    name: 'get_users_for_search',
    description:
      'Geef alle gebruikers terug die deze search bezitten en die een telegram_chat_id hebben.',
    input_schema: {
      type: 'object',
      properties: { search_id: { type: 'string' } },
      required: ['search_id'],
    },
  },
  {
    name: 'check_already_alerted',
    description:
      'Controleer of een gebruiker reeds een alert heeft ontvangen voor deze listing. ' +
      'Voorkomt dubbele berichten.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        listing_id: { type: 'string' },
      },
      required: ['user_id', 'listing_id'],
    },
  },
  {
    name: 'format_telegram_message',
    description:
      'Formatteer een Markdown bericht met emojis, prijs, max bod, marge, BTW, score, ' +
      'link en een korte AI redenering.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        url: { type: 'string' },
        price_eur: { type: 'integer' },
        max_bid_eur: { type: 'integer' },
        expected_margin: { type: 'integer' },
        btw_regime: { type: 'string' },
        total_score: { type: 'integer' },
        recommendation: { type: 'string' },
        reasoning: { type: 'string' },
        km: { type: 'integer' },
        year: { type: 'integer' },
        platform: { type: 'string' },
      },
      required: ['title', 'url', 'price_eur', 'total_score', 'recommendation'],
    },
  },
  {
    name: 'send_telegram',
    description:
      'Stuur een Markdown bericht via de Telegram Bot API naar een specifieke chat. ' +
      'Geeft de message_id terug bij succes.',
    input_schema: {
      type: 'object',
      properties: {
        telegram_chat_id: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['telegram_chat_id', 'message'],
    },
  },
  {
    name: 'log_alert',
    description:
      'Log een verstuurde alert in de alerts tabel. Roep aan na succesvol verzenden.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        listing_id: { type: 'string' },
        search_id: { type: 'string' },
        telegram_message_id: { type: 'string' },
      },
      required: ['user_id', 'listing_id', 'search_id'],
    },
  },
  {
    name: 'create_notification',
    description:
      'Maak een in-app notificatie aan voor de gebruiker (verschijnt in de bell-icoon).',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        listing_id: { type: 'string' },
        title: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['user_id', 'title', 'message'],
    },
  },
];

function formatTelegramMessage(input: Record<string, unknown>): string {
  const recoEmoji =
    input.recommendation === 'KOPEN' ? '🟢' :
    input.recommendation === 'TWIJFEL' ? '🟠' : '🔴';
  const platformEmoji = input.platform === '2dehands' ? '🟧' : '🟦';
  const fmt = (n: unknown) =>
    typeof n === 'number' ? `€${n.toLocaleString('nl-BE')}` : '—';

  return [
    `${recoEmoji} *${input.recommendation}* — Score ${input.total_score}/100`,
    `${platformEmoji} *${input.title}*`,
    '',
    `💶 Vraagprijs: *${fmt(input.price_eur)}*`,
    `🎯 Max bod: *${fmt(input.max_bid_eur)}*`,
    `📈 Verwachte marge: *${fmt(input.expected_margin)}*`,
    `🧾 BTW: ${input.btw_regime === 'normaal' ? 'Normaal (21%)' : 'Marge'}`,
    input.year ? `📅 ${input.year}` : '',
    input.km ? `🛣️ ${(input.km as number).toLocaleString('nl-BE')} km` : '',
    '',
    input.reasoning ? `_${input.reasoning}_` : '',
    '',
    `🔗 [Open advertentie](${input.url})`,
  ].filter(Boolean).join('\n');
}

async function executeTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const supabase = getServiceClient();

  switch (name) {
    case 'get_listing_with_analysis': {
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
        .eq('search_id', input.search_id as string)
        .maybeSingle();
      if (aErr) return { error: aErr.message };

      return { listing, analysis };
    }

    case 'get_users_for_search': {
      const { data: search, error: sErr } = await supabase
        .from('searches')
        .select('user_id')
        .eq('id', input.search_id as string)
        .single();
      if (sErr) return { error: sErr.message };

      const { data: user, error: uErr } = await supabase
        .from('users')
        .select('id, telegram_chat_id, name, plan, active')
        .eq('id', search.user_id)
        .single();
      if (uErr) return { error: uErr.message };

      const users =
        user && user.telegram_chat_id && user.active ? [user] : [];
      return { count: users.length, users };
    }

    case 'check_already_alerted': {
      const { data, error } = await supabase
        .from('alerts')
        .select('id')
        .eq('user_id', input.user_id as string)
        .eq('listing_id', input.listing_id as string)
        .maybeSingle();
      if (error) return { error: error.message };
      return { alerted: !!data };
    }

    case 'format_telegram_message': {
      return { message: formatTelegramMessage(input) };
    }

    case 'send_telegram': {
      const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
      if (!token) return { error: 'TELEGRAM_BOT_TOKEN missing' };

      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.telegram_chat_id,
          text: input.message,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };
      if (!json.ok) return { error: json.description ?? 'Telegram error' };
      return { success: true, telegram_message_id: String(json.result?.message_id) };
    }

    case 'log_alert': {
      const { data, error } = await supabase
        .from('alerts')
        .upsert(
          {
            user_id: input.user_id as string,
            listing_id: input.listing_id as string,
            search_id: input.search_id as string,
            telegram_message_id: (input.telegram_message_id as string) ?? null,
            status: 'sent',
          },
          { onConflict: 'user_id,listing_id', ignoreDuplicates: false },
        )
        .select('id')
        .single();
      if (error) return { error: error.message };
      return { success: true, alert_id: data.id };
    }

    case 'create_notification': {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_id: input.user_id as string,
          listing_id: (input.listing_id as string) ?? null,
          type: 'alert',
          title: input.title as string,
          message: input.message as string,
        })
        .select('id')
        .single();
      if (error) return { error: error.message };
      return { success: true, notification_id: data.id };
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

  if (!body.listing_id || !body.search_id) {
    return new Response(
      JSON.stringify({ error: 'listing_id and search_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const userPrompt =
    `Stuur Telegram alerts voor listing ${body.listing_id} (search ${body.search_id}).\n\n` +
    'Werk de volgende stappen af: haal listing+analyse, vind alle gebruikers met telegram, ' +
    'check per gebruiker of die al gealerteerd werd, format het bericht, verzend, log de ' +
    'alert en maak een in-app notificatie. Stop wanneer alles klaar is.';

  const result = await runAgentLoop({
    agent: 'alert-agent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    tools,
    executeTool,
    listingId: body.listing_id,
    searchId: body.search_id,
  });

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
