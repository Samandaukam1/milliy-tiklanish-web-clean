-- ============================================================
-- Milliy Tiklanish — Comments & View Count SQL
-- Compatible with existing Supabase schema
-- ============================================================

-- ─── 1. article_comments table ───────────────────────────────────────────────

create table if not exists public.article_comments (
  id           uuid primary key default gen_random_uuid(),
  article_id   text not null,
  user_id      text not null,
  author_name  text not null default 'Foydalanuvchi',
  content      text not null check (char_length(content) between 1 and 2000),
  parent_id    uuid references public.article_comments(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── 2. Indexes ──────────────────────────────────────────────────────────────

-- Most common query: fetch top-level comments for an article, newest first
create index if not exists idx_article_comments_article_created
  on public.article_comments (article_id, created_at desc)
  where parent_id is null;

-- Fetching replies grouped by parent
create index if not exists idx_article_comments_parent
  on public.article_comments (parent_id)
  where parent_id is not null;

-- Index for user's own comments (profile / moderation use)
create index if not exists idx_article_comments_user
  on public.article_comments (user_id);

-- ─── 3. Auto-update updated_at ───────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_article_comments_updated_at on public.article_comments;
create trigger trg_article_comments_updated_at
  before update on public.article_comments
  for each row execute function public.set_updated_at();

-- ─── 4. RLS (Row Level Security) ─────────────────────────────────────────────

alter table public.article_comments enable row level security;

-- Anyone (including unauthenticated guests) can read all comments
create policy "comments_select_public"
  on public.article_comments for select
  using (true);

-- Only authenticated users can insert their own comments
-- user_id is stored as text (matches auth.users.id cast to text)
create policy "comments_insert_auth"
  on public.article_comments for insert
  to authenticated
  with check (user_id = auth.uid()::text);

-- Users can only delete their own comments; admins can delete any
create policy "comments_delete_own"
  on public.article_comments for delete
  to authenticated
  using (user_id = auth.uid()::text);

-- ─── 5. Denormalized comments_count on articles ──────────────────────────────
-- Keep articles.comments_count in sync via triggers for fast reads.

-- Ensure the column exists (safe to run if it already exists)
alter table public.articles
  add column if not exists comments_count integer not null default 0;

-- Function: increment article comments_count on insert
create or replace function public.increment_article_comments_count()
returns trigger language plpgsql as $$
begin
  update public.articles
  set comments_count = coalesce(comments_count, 0) + 1
  where id = new.article_id::bigint
     or id::text = new.article_id;
  return new;
end;
$$;

-- Function: decrement article comments_count on delete
create or replace function public.decrement_article_comments_count()
returns trigger language plpgsql as $$
begin
  update public.articles
  set comments_count = greatest(0, coalesce(comments_count, 0) - 1)
  where id = old.article_id::bigint
     or id::text = old.article_id;
  return old;
end;
$$;

drop trigger if exists trg_comments_inc on public.article_comments;
create trigger trg_comments_inc
  after insert on public.article_comments
  for each row execute function public.increment_article_comments_count();

drop trigger if exists trg_comments_dec on public.article_comments;
create trigger trg_comments_dec
  after delete on public.article_comments
  for each row execute function public.decrement_article_comments_count();

-- ─── 6. view_count increment function ────────────────────────────────────────
-- Used by the app via supabase.rpc("increment_view_count", { article_id: "..." })
-- Safe to re-run if function already exists.

create or replace function public.increment_view_count(article_id text)
returns void language plpgsql
security definer
set search_path = public
as $$
begin
  update public.articles
  set view_count = coalesce(view_count, 0) + 1
  where id::text = $1;
end;
$$;

-- Ensure view_count column exists
alter table public.articles
  add column if not exists view_count integer not null default 0;

create index if not exists idx_articles_view_count
  on public.articles (view_count desc nulls last);

-- ─── 7. Realtime — enable for article_comments ───────────────────────────────
-- Run in Supabase Dashboard → Database → Replication, or via SQL:

begin;
  -- publication for realtime (insert only to avoid flooding)
  drop publication if exists supabase_realtime cascade;
  create publication supabase_realtime for table public.article_comments, public.articles;
commit;

-- ─── 8. Grant usage (if using service_role) ──────────────────────────────────
grant select, insert, delete on public.article_comments to authenticated;
grant select on public.article_comments to anon;
