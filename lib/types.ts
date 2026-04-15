// Domain types used across the frontend. Mirrors the carscout schema.

export type Plan = 'trial' | 'starter' | 'pro' | 'business';

export interface CarscoutUser {
  id: string;
  auth_id: string | null;
  email: string;
  name: string | null;
  company: string | null;
  plan: Plan;
  plan_expires_at: string | null;
  searches_limit: number;
  telegram_chat_id: string | null;
  onboarded: boolean;
  stripe_customer_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Search {
  id: string;
  user_id: string;
  name: string;
  makes: string[];
  models: string[];
  year_from: number | null;
  year_to: number | null;
  price_max: number | null;
  km_max: number | null;
  fuel_types: string[];
  platforms: string[];
  countries: string[];
  min_score: number;
  active: boolean;
  created_at: string;
}

export interface Listing {
  id: string;
  external_id: string;
  platform: string;
  url: string;
  title: string | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  price_eur: number | null;
  km: number | null;
  fuel_type: string | null;
  transmission: string | null;
  power_kw: number | null;
  body_type: string | null;
  color: string | null;
  city: string | null;
  country: string | null;
  seller_type: string | null;
  seller_name: string | null;
  btw_mention: boolean;
  images: string[];
  description: string | null;
  first_seen: string;
  last_seen: string;
  sold: boolean;
  sold_at: string | null;
}

export interface Analysis {
  id: string;
  listing_id: string;
  search_id: string | null;
  market_value_eur: number | null;
  price_vs_market: number | null;
  price_vs_market_pct: number | null;
  btw_regime: 'marge' | 'normaal' | null;
  max_bid_eur: number | null;
  expected_sell_price: number | null;
  expected_margin: number | null;
  transport_cost: number;
  repair_cost: number;
  inspection_cost: number;
  buying_fee: number;
  price_score: number | null;
  km_score: number | null;
  age_score: number | null;
  demand_score: number | null;
  total_score: number | null;
  recommendation: 'KOPEN' | 'TWIJFEL' | 'NEGEREN' | null;
  reasoning: string | null;
  created_at: string;
}

export interface Alert {
  id: string;
  listing_id: string;
  search_id: string | null;
  user_id: string;
  telegram_message_id: string | null;
  status: string;
  sent_at: string;
}

export interface AdDraft {
  id: string;
  listing_id: string;
  user_id: string;
  title_nl: string | null;
  title_fr: string | null;
  description_nl: string | null;
  description_fr: string | null;
  asking_price_eur: number | null;
  platform_targets: string[];
  status: 'draft' | 'approved' | 'published' | 'rejected';
  approved_at: string | null;
  created_at: string;
}

export interface MarketRow {
  id: string;
  make: string;
  model: string;
  avg_price_eur: number | null;
  avg_days_to_sell: number | null;
  nr_listings: number | null;
  nr_sold: number | null;
  mds_score: number | null;
  week: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  listing_id: string | null;
  read: boolean;
  created_at: string;
}
