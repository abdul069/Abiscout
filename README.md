# CarScout

Een verkoopbare SaaS voor Belgische autohandelaars. CarScout scant
2dehands.be en AutoScout24 elke 5 minuten op winstgevende auto's,
analyseert elke advertentie op marktwaarde + BTW-regime + verwachte
marge, en stuurt goede deals via Telegram.

Het hart van het systeem zijn **5 Claude Managed Agents** — autonome
loops waarin Claude zelf beslist welke tools (DB queries, externe
APIs, berekeningen) te gebruiken tot een taak afgerond is.

```
scout-agent      → vindt nieuwe listings (elke 5 min)
analyse-agent    → marktwaarde, BTW-regime, score 0-100
alert-agent      → Telegram + in-app notificatie
ad-agent         → schrijft NL+FR verkoopsadvertentie
market-agent     → wekelijkse MDS / marktintelligentie
```

## Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind
- **Auth + DB**: Supabase (PostgreSQL, schema `carscout`, RLS overal)
- **Backend**: Supabase Edge Functions (Deno)
- **AI**: Anthropic `claude-sonnet-4-20250514` met tool_use loops
- **Scrapers**: directe fetch (2dehands API) + Apify (AutoScout24)
- **Alerts**: Telegram Bot API
- **Scheduling**: pg_cron + Netlify Scheduled Functions als backup
- **Hosting**: Netlify
- **Betalingen**: Stripe Subscriptions

## Repo layout

```
app/                     Next.js pagina's en API routes
components/              UI componenten (Sidebar, DashboardLayout, …)
lib/                     Supabase clients, types, formatters, auth helpers
middleware.ts            Auth bescherming en onboarding redirect
supabase/
  migrations/            SQL: schema (0001), RLS (0002), pg_cron (0003)
  functions/
    _shared/             Anthropic wrapper, agent loop, supabase client
    scout-agent/         Claude managed agent (8 tools)
    analyse-agent/       Claude managed agent (8 tools)
    alert-agent/         Claude managed agent (7 tools)
    ad-agent/            Claude managed agent (7 tools)
    market-agent/        Claude managed agent (7 tools)
    create-checkout-session/   Stripe checkout
    stripe-webhook/      Subscription lifecycle handler
netlify/
  functions/             Backup schedulers voor scout + market
```

## Setup

1. **Supabase project**

   ```bash
   supabase link --project-ref YOUR-REF
   supabase db push   # past 0001_schema.sql, 0002_rls.sql en 0003_cron.sql toe
   ```

   Voor `0003_cron.sql` moet je in de Supabase SQL editor eerst zetten:

   ```sql
   alter database postgres set "app.settings.supabase_url" = 'https://YOUR-PROJECT.supabase.co';
   alter database postgres set "app.settings.service_role_key" = 'eyJ...';
   ```

2. **Env vars**

   Kopieer `.env.example` naar `.env.local` (frontend) en zet ook
   dezelfde server-only secrets in de Supabase Dashboard onder
   *Project Settings → Edge Functions → Secrets*:

   - `ANTHROPIC_API_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `APIFY_TOKEN`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

3. **Edge Functions deployen**

   ```bash
   supabase functions deploy scout-agent
   supabase functions deploy analyse-agent
   supabase functions deploy alert-agent
   supabase functions deploy ad-agent
   supabase functions deploy market-agent
   supabase functions deploy create-checkout-session
   supabase functions deploy stripe-webhook
   ```

4. **Stripe webhook**

   Wijs `https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook`
   aan in Stripe en abonneer op `checkout.session.completed`,
   `invoice.payment_succeeded`, `invoice.payment_failed`,
   `customer.subscription.deleted`.

5. **Frontend**

   ```bash
   npm install
   npm run dev
   ```

6. **Deploy naar Netlify**

   ```bash
   netlify deploy --build --prod
   ```

   Stel dezelfde env vars in onder *Site settings → Environment variables*.
   De scheduled functions in `netlify/functions/` triggeren automatisch.

## Hoe een Claude Managed Agent werkt

Elke agent volgt dezelfde structuur (zie
`supabase/functions/_shared/agent-loop.ts`):

1. Definieer tools als `Anthropic.Tool[]`
2. Stuur de gebruiker-prompt + tools naar Claude
3. Voeg het assistant antwoord toe aan de berichten
4. Als `stop_reason === 'end_turn'` → klaar
5. Als `stop_reason === 'tool_use'` → voer de gevraagde tools uit,
   stuur de resultaten terug, ga naar stap 2
6. Maximale iteraties als veiligheidsnet
7. Log start + einde naar `carscout.agent_runs`

Claude kiest zelf de volgorde, kan fouten herstellen door andere
tools te kiezen en stopt pas wanneer de taak echt klaar is. Tools
geven `{ error: ... }` terug bij mislukking zodat Claude kan beslissen
wat te doen.

## Testen van een agent

```bash
curl -X POST 'https://YOUR-PROJECT.supabase.co/functions/v1/scout-agent' \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Bekijk daarna de tabel `carscout.agent_runs` voor de status, het
aantal iteraties en de tool calls die Claude heeft gedaan.

## Plan limits

| Plan      | Prijs/mo | Searches |
|-----------|---------:|---------:|
| trial     |       €0 |        3 |
| starter   |      €49 |        5 |
| pro       |     €149 |       25 |
| business  |     €399 |      100 |

De Stripe webhook update `users.plan` en `users.searches_limit`. Het
aanmaken van een nieuwe search blokkeert client-side wanneer de
limiet bereikt is.
