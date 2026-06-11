create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Core payment intent table used by /api/payme/create-payment.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'payme',
  user_id text not null,
  type text not null check (type in ('subscription', 'article')),
  tier text,
  article_id text,
  amount numeric(12, 2) not null,
  amount_tiyin bigint not null,
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
alter table public.payments add column if not exists provider text not null default 'payme';
alter table public.payments add column if not exists amount_tiyin bigint;
alter table public.payments add column if not exists description text;
alter table public.payments add column if not exists return_url text;
alter table public.payments add column if not exists checkout_url text;
alter table public.payments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists external_transaction_id text;
alter table public.payments add column if not exists external_receipt_id text;
alter table public.payments add column if not exists cancelled_at timestamptz;
alter table public.payments add column if not exists cancel_reason integer;
alter table public.payments add column if not exists created_at timestamptz not null default now();
alter table public.payments add column if not exists updated_at timestamptz not null default now();

update public.payments
set amount_tiyin = round(amount * 100)::bigint
where amount_tiyin is null and amount is not null;

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_provider_idx on public.payments (provider);
create index if not exists payments_external_transaction_idx on public.payments (external_transaction_id);

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- Merchant API transaction ledger. Payme's id is external_transaction_id.
create table if not exists public.payme_transactions (
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

alter table public.payme_transactions add column if not exists provider text not null default 'payme';
alter table public.payme_transactions add column if not exists external_receipt_id text;
alter table public.payme_transactions add column if not exists account jsonb not null default '{}'::jsonb;
alter table public.payme_transactions add column if not exists raw_request jsonb not null default '{}'::jsonb;
alter table public.payme_transactions add column if not exists created_at timestamptz not null default now();
alter table public.payme_transactions add column if not exists updated_at timestamptz not null default now();

create index if not exists payme_transactions_payment_id_idx on public.payme_transactions (payment_id);
create index if not exists payme_transactions_payme_time_idx on public.payme_transactions (payme_time);
create index if not exists payme_transactions_state_idx on public.payme_transactions (state);

drop trigger if exists payme_transactions_set_updated_at on public.payme_transactions;
create trigger payme_transactions_set_updated_at
before update on public.payme_transactions
for each row execute function public.set_updated_at();

-- One row per Merchant API request/response for support and reconciliation.
create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'payme',
  event text not null,
  method text,
  request_id text,
  external_transaction_id text,
  state integer,
  status text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_code integer,
  error_message jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_logs_payment_id_idx on public.payment_logs (payment_id);
create index if not exists payment_logs_provider_method_idx on public.payment_logs (provider, method, created_at desc);
create index if not exists payment_logs_external_transaction_idx on public.payment_logs (external_transaction_id);

-- Premium subscription source of truth for server APIs.
create table if not exists public.subscriptions (
  user_id text primary key,
  plan text not null default 'free' check (plan in ('free', 'premium', 'pro')),
  tier text,
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists tier text;
alter table public.subscriptions add column if not exists payment_id text;
alter table public.subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.subscriptions add column if not exists updated_at timestamptz not null default now();

create index if not exists subscriptions_status_idx on public.subscriptions (status, expires_at desc);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- This app's public user table is profiles. If you also have public.users,
-- the API updates both when the table exists.
alter table if exists public.profiles add column if not exists subscription text not null default 'free';
alter table if exists public.profiles add column if not exists subscription_starts_at timestamptz;
alter table if exists public.profiles add column if not exists subscription_expires_at timestamptz;
alter table if exists public.profiles add column if not exists updated_at timestamptz not null default now();

alter table if exists public.users add column if not exists subscription text not null default 'free';
alter table if exists public.users add column if not exists subscription_starts_at timestamptz;
alter table if exists public.users add column if not exists subscription_expires_at timestamptz;
alter table if exists public.users add column if not exists updated_at timestamptz not null default now();

-- Optional compatibility: migrate old payment_transactions rows if that table exists.
do $$
begin
  if to_regclass('public.payment_transactions') is not null then
    insert into public.payme_transactions (
      payment_id,
      provider,
      external_transaction_id,
      external_receipt_id,
      account,
      amount_tiyin,
      state,
      reason,
      payme_time,
      create_time,
      perform_time,
      cancel_time,
      raw_request,
      created_at,
      updated_at
    )
    select
      payment_id,
      coalesce(provider, 'payme'),
      external_transaction_id,
      external_receipt_id,
      coalesce(account, '{}'::jsonb),
      amount_tiyin,
      state,
      reason,
      payme_time,
      create_time,
      coalesce(perform_time, 0),
      coalesce(cancel_time, 0),
      coalesce(raw_request, '{}'::jsonb),
      coalesce(created_at, now()),
      coalesce(updated_at, now())
    from public.payment_transactions
    on conflict (external_transaction_id) do nothing;
  end if;
end;
$$;

alter table public.payments enable row level security;
alter table public.payme_transactions enable row level security;
alter table public.payment_logs enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "service role full access on payments" on public.payments;
create policy "service role full access on payments"
  on public.payments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role full access on payme_transactions" on public.payme_transactions;
create policy "service role full access on payme_transactions"
  on public.payme_transactions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role full access on payment_logs" on public.payment_logs;
create policy "service role full access on payment_logs"
  on public.payment_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service role full access on subscriptions" on public.subscriptions;
create policy "service role full access on subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
