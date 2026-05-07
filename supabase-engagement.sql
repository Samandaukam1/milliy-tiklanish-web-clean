-- ============================================================
-- Milliy Gazeta — Engagement System Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ── Denormalized counter columns on articles ─────────────────
-- Add these if the articles table doesn't already have them.
alter table articles add column if not exists likes_count    int not null default 0;
alter table articles add column if not exists comments_count int not null default 0;
-- view_count is assumed to already exist; add it if missing:
alter table articles add column if not exists view_count     int not null default 0;

-- Backfill existing counts from the engagement tables (run once after adding columns):
-- update articles a set likes_count    = (select count(*) from article_likes    where article_id = a.id);
-- update articles a set comments_count = (select count(*) from article_comments where article_id = a.id);
-- update articles a set view_count     = (select count(*) from article_views     where article_id = a.id);

-- ── article_likes ────────────────────────────────────────────
create table if not exists article_likes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  article_id  uuid        not null references articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, article_id)
);

alter table article_likes enable row level security;
create policy "anyone can read likes"   on article_likes for select using (true);
create policy "anyone can insert likes" on article_likes for insert with check (true);
create policy "anyone can delete likes" on article_likes for delete using (true);

-- Trigger: maintain articles.likes_count
create or replace function _tgfn_article_likes_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update articles
       set likes_count = coalesce(likes_count, 0) + 1
     where id = NEW.article_id;
  elsif TG_OP = 'DELETE' then
    update articles
       set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
     where id = OLD.article_id;
  end if;
  return null;
end;
$$;

drop trigger if exists tg_article_likes_count on article_likes;
create trigger tg_article_likes_count
  after insert or delete on article_likes
  for each row execute function _tgfn_article_likes_count();

-- ── article_comments ─────────────────────────────────────────
create table if not exists article_comments (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  article_id  uuid        not null,
  content     text        not null,
  author_name text,
  parent_id   uuid        references article_comments(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists article_comments_article_id_idx
  on article_comments(article_id, created_at desc);

alter table article_comments enable row level security;
create policy "anyone can read comments"   on article_comments for select using (true);
create policy "anyone can insert comments" on article_comments for insert with check (true);

-- Trigger: maintain articles.comments_count
create or replace function _tgfn_article_comments_count()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update articles
       set comments_count = coalesce(comments_count, 0) + 1
     where id = NEW.article_id;
  elsif TG_OP = 'DELETE' then
    update articles
       set comments_count = greatest(0, coalesce(comments_count, 0) - 1)
     where id = OLD.article_id;
  end if;
  return null;
end;
$$;

drop trigger if exists tg_article_comments_count on article_comments;
create trigger tg_article_comments_count
  after insert or delete on article_comments
  for each row execute function _tgfn_article_comments_count();

-- ── user_interests ────────────────────────────────────────────
-- Tracks per-user category affinity score (incremented on view/like)
create table if not exists user_interests (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  category    text not null,
  score       int  not null default 1,
  unique (user_id, category)
);

alter table user_interests enable row level security;
-- Service role has full access; anon users interact only via server-side functions
create policy "service role full access" on user_interests using (true) with check (true);

-- ── saved_articles ───────────────────────────────────────────
-- Optional today, but ready for syncing saved items beyond AsyncStorage.
create table if not exists saved_articles (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  article_id  uuid not null references articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, article_id)
);

create index if not exists saved_articles_user_id_idx
  on saved_articles(user_id, created_at desc);

alter table saved_articles enable row level security;
create policy "service role full access on saved articles" on saved_articles using (true) with check (true);

-- ── article_views ─────────────────────────────────────────────
create table if not exists article_views (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  article_id  uuid        not null,
  duration    int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists article_views_user_id_idx
  on article_views(user_id, created_at desc);

alter table article_views enable row level security;
create policy "anyone can insert views" on article_views for insert with check (true);
create policy "anyone can read views"   on article_views for select using (true);

-- Trigger: maintain articles.view_count
create or replace function _tgfn_article_view_count()
returns trigger language plpgsql as $$
begin
  update articles
     set view_count = coalesce(view_count, 0) + 1
   where id = NEW.article_id;
  return null;
end;
$$;

drop trigger if exists tg_article_view_count on article_views;
create trigger tg_article_view_count
  after insert on article_views
  for each row execute function _tgfn_article_view_count();

-- ── profiles ──────────────────────────────────────────────────
create table if not exists profiles (
  id                    uuid        primary key default gen_random_uuid(),
  phone                 text        unique,
  login                 text,
  password_hash         text,
  phone_verified        boolean     not null default false,
  telegram_verified     boolean     not null default false,
  telegram_verified_at  timestamptz,
  telegram_gateway_verified_at timestamptz,
  telegram_id           text,
  telegram_username     text,
  full_name             text,
  first_name            text,
  last_name             text,
  birth_date            date,
  name                  text,
  email                 text,
  avatar_url            text,
  provider              text        not null default 'telegram',
  subscription          text        not null default 'free',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table profiles alter column phone drop not null;
alter table profiles add column if not exists telegram_verified boolean not null default false;
alter table profiles add column if not exists telegram_id text;
alter table profiles add column if not exists telegram_username text;
alter table profiles add column if not exists full_name text;
alter table profiles add column if not exists first_name text;
alter table profiles add column if not exists last_name text;
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists login text;
alter table profiles add column if not exists password_hash text;
alter table profiles add column if not exists email text;
alter table profiles add column if not exists provider text not null default 'telegram';
alter table profiles add column if not exists telegram_gateway_verified_at timestamptz;
create unique index if not exists profiles_email_idx on profiles(email) where email is not null;
create unique index if not exists profiles_telegram_id_idx on profiles(telegram_id) where telegram_id is not null;
create unique index if not exists profiles_login_idx on profiles(login) where login is not null;

alter table profiles enable row level security;
drop policy if exists "public read profiles" on profiles;
create policy "service role upsert"   on profiles for insert with check (true);
create policy "service role update"   on profiles for update using (true);

-- ── subscriptions ───────────────────────────────────────────
create table if not exists subscriptions (
  user_id     text primary key,
  plan        text        not null default 'free',
  status      text        not null default 'active',
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,
  payment_id  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists subscriptions_status_idx
  on subscriptions(status, expires_at desc);

alter table subscriptions enable row level security;
create policy "service role full access on subscriptions" on subscriptions using (true) with check (true);

-- ── phone_verification_sessions ──────────────────────────────
create table if not exists phone_verification_sessions (
  id           uuid        primary key default gen_random_uuid(),
  phone        text        not null,
  request_id   text        not null unique,
  purpose      text        not null default 'signup',
  status       text        not null default 'pending',
  expires_at   timestamptz not null,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists phone_verification_sessions_phone_idx
  on phone_verification_sessions(phone, created_at desc);

-- Make code_hash nullable so Telegram Gateway sessions (which have no local code) can insert.
-- Run this if the column was added via a separate migration with NOT NULL:
alter table phone_verification_sessions alter column code_hash drop not null;

alter table phone_verification_sessions disable row level security;
