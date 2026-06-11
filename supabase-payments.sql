create extension if not exists pgcrypto;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'click',
  user_id text not null,
  type text not null,
  tier text,
  article_id text,
  amount numeric(12, 2) not null,
  amount_tiyin bigint,
  status text not null default 'pending',
  description text,
  return_url text,
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  click_trans_id text,
  click_paydoc_id text,
  external_transaction_id text,
  external_receipt_id text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.payments
  alter column article_id type text using article_id::text;

alter table public.payments add column if not exists provider text default 'click';
alter table public.payments add column if not exists amount_tiyin bigint;
alter table public.payments add column if not exists description text;
alter table public.payments add column if not exists return_url text;
alter table public.payments add column if not exists checkout_url text;
alter table public.payments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists external_transaction_id text;
alter table public.payments add column if not exists external_receipt_id text;
alter table public.payments add column if not exists cancelled_at timestamptz;
alter table public.payments add column if not exists cancel_reason integer;

update public.payments
set provider = coalesce(provider, case when click_trans_id is not null or click_paydoc_id is not null then 'click' else 'payme' end)
where provider is null;

update public.payments
set amount_tiyin = round(amount * 100)::bigint
where amount_tiyin is null and amount is not null;

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_provider_idx on public.payments (provider);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider text not null default 'payme',
  external_transaction_id text not null unique,
  external_receipt_id text,
  account jsonb not null default '{}'::jsonb,
  amount_tiyin bigint not null,
  state integer not null,
  reason integer,
  payme_time bigint not null,
  create_time bigint not null,
  perform_time bigint not null default 0,
  cancel_time bigint not null default 0,
  raw_request jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_transactions add column if not exists provider text not null default 'payme';
alter table public.payment_transactions add column if not exists external_receipt_id text;
alter table public.payment_transactions add column if not exists account jsonb not null default '{}'::jsonb;
alter table public.payment_transactions add column if not exists raw_request jsonb not null default '{}'::jsonb;
alter table public.payment_transactions add column if not exists updated_at timestamptz not null default now();

create index if not exists payment_transactions_payment_id_idx on public.payment_transactions (payment_id);
create index if not exists payment_transactions_payme_time_idx on public.payment_transactions (payme_time);

create table if not exists public.user_subscriptions (
  user_id text primary key,
  plan text not null default 'free',
  status text not null default 'active',
  starts_at timestamptz,
  expires_at timestamptz,
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions add column if not exists plan text not null default 'free';
alter table public.user_subscriptions add column if not exists tier text;
alter table public.user_subscriptions add column if not exists status text not null default 'active';
alter table public.user_subscriptions add column if not exists starts_at timestamptz;
alter table public.user_subscriptions add column if not exists expires_at timestamptz;
alter table public.user_subscriptions add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.user_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.user_subscriptions add column if not exists updated_at timestamptz not null default now();

create table if not exists public.article_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  article_id text not null,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'payme',
  status text not null default 'active',
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.article_purchases
  alter column article_id type text using article_id::text;

alter table public.article_purchases add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.article_purchases add column if not exists provider text not null default 'payme';
alter table public.article_purchases add column if not exists status text not null default 'active';
alter table public.article_purchases add column if not exists purchased_at timestamptz not null default now();
alter table public.article_purchases add column if not exists updated_at timestamptz not null default now();

create index if not exists article_purchases_user_id_idx on public.article_purchases (user_id);
create index if not exists article_purchases_article_id_idx on public.article_purchases (article_id);
create unique index if not exists article_purchases_user_article_uidx on public.article_purchases (user_id, article_id);
