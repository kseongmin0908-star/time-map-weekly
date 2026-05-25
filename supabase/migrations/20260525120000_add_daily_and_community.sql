-- ============================================
-- 시간의 지도 — 일일 목표, 회고, 커뮤니티, 프로필
-- ============================================

-- 1) daily_goals: 일일 목표
create table if not exists public.daily_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  goal_date date not null,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, goal_date)
);

-- 2) daily_retrospectives: 일일 회고
create table if not exists public.daily_retrospectives (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  retro_date date not null,
  score int not null check (score >= 1 and score <= 10),
  went_well text not null default '',
  to_improve text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, retro_date)
);

-- 3) user_profiles: 프로필 및 공유 설정
create table if not exists public.user_profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  display_name text not null default '',
  avatar_url text not null default '',
  share_weekly boolean not null default false,
  share_daily boolean not null default false,
  share_retro boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- 4) community_feed: 커뮤니티 공유 피드
create table if not exists public.community_feed (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  feed_type text not null check (feed_type in ('weekly','daily','retro','ai_analysis')),
  content jsonb not null default '{}'::jsonb,
  display_name text not null default '',
  avatar_url text not null default '',
  shared_at timestamptz default now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

alter table public.daily_goals enable row level security;
alter table public.daily_retrospectives enable row level security;
alter table public.user_profiles enable row level security;
alter table public.community_feed enable row level security;

-- daily_goals
create policy "Users can view own daily goals"
  on public.daily_goals for select using (auth.uid() = user_id);
create policy "Users can insert own daily goals"
  on public.daily_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own daily goals"
  on public.daily_goals for update using (auth.uid() = user_id);
create policy "Users can delete own daily goals"
  on public.daily_goals for delete using (auth.uid() = user_id);

-- daily_retrospectives
create policy "Users can view own retrospectives"
  on public.daily_retrospectives for select using (auth.uid() = user_id);
create policy "Users can insert own retrospectives"
  on public.daily_retrospectives for insert with check (auth.uid() = user_id);
create policy "Users can update own retrospectives"
  on public.daily_retrospectives for update using (auth.uid() = user_id);
create policy "Users can delete own retrospectives"
  on public.daily_retrospectives for delete using (auth.uid() = user_id);

-- user_profiles (본인 CRUD + 전체 SELECT)
create policy "Anyone can view profiles"
  on public.user_profiles for select using (true);
create policy "Users can insert own profile"
  on public.user_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = user_id);
create policy "Users can delete own profile"
  on public.user_profiles for delete using (auth.uid() = user_id);

-- community_feed (전체 SELECT + 본인 INSERT/UPDATE/DELETE)
create policy "Anyone can view community feed"
  on public.community_feed for select using (true);
create policy "Users can insert own feed items"
  on public.community_feed for insert with check (auth.uid() = user_id);
create policy "Users can update own feed items"
  on public.community_feed for update using (auth.uid() = user_id);
create policy "Users can delete own feed items"
  on public.community_feed for delete using (auth.uid() = user_id);

-- ============================================
-- updated_at triggers (기존 handle_updated_at 재사용)
-- ============================================

create trigger set_updated_at before update on public.daily_goals
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.daily_retrospectives
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.user_profiles
  for each row execute function public.handle_updated_at();

-- ============================================
-- Realtime 활성화 (community_feed)
-- ============================================

alter publication supabase_realtime add table community_feed;
