-- ============================================
-- 시간의 지도 — 나의 한 해  |  Database Schema
-- ============================================

-- 1) 주간 목표 (weekly goals)
create table if not exists public.weekly_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  year int not null,
  week int not null,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, year, week)
);

-- 2) 연간 목표 (yearly goals)
create table if not exists public.yearly_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  year int not null,
  goal_text text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, year)
);

-- 3) 인생 목표 (life goal badge)
create table if not exists public.life_goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  amount text not null default '₩ 100억',
  label text not null default '자산 목표',
  target_date date not null default '2030-12-31',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- 4) 포모도로 세션 (pomodoro)
create table if not exists public.pomodoro_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  today_date text not null,
  sessions_today int not null default 0,
  total_sessions int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- 5) 무의식 리프레이밍 (unconscious reframing entries)
create table if not exists public.unconscious_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  from_pattern text not null,
  to_pattern text not null,
  trigger_text text not null default '',
  catches int not null default 0,
  stage int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

alter table public.weekly_goals enable row level security;
alter table public.yearly_goals enable row level security;
alter table public.life_goals enable row level security;
alter table public.pomodoro_sessions enable row level security;
alter table public.unconscious_entries enable row level security;

-- weekly_goals
create policy "Users can view own weekly goals"
  on public.weekly_goals for select using (auth.uid() = user_id);
create policy "Users can insert own weekly goals"
  on public.weekly_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own weekly goals"
  on public.weekly_goals for update using (auth.uid() = user_id);
create policy "Users can delete own weekly goals"
  on public.weekly_goals for delete using (auth.uid() = user_id);

-- yearly_goals
create policy "Users can view own yearly goals"
  on public.yearly_goals for select using (auth.uid() = user_id);
create policy "Users can insert own yearly goals"
  on public.yearly_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own yearly goals"
  on public.yearly_goals for update using (auth.uid() = user_id);
create policy "Users can delete own yearly goals"
  on public.yearly_goals for delete using (auth.uid() = user_id);

-- life_goals
create policy "Users can view own life goals"
  on public.life_goals for select using (auth.uid() = user_id);
create policy "Users can insert own life goals"
  on public.life_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own life goals"
  on public.life_goals for update using (auth.uid() = user_id);
create policy "Users can delete own life goals"
  on public.life_goals for delete using (auth.uid() = user_id);

-- pomodoro_sessions
create policy "Users can view own pomodoro"
  on public.pomodoro_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own pomodoro"
  on public.pomodoro_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own pomodoro"
  on public.pomodoro_sessions for update using (auth.uid() = user_id);
create policy "Users can delete own pomodoro"
  on public.pomodoro_sessions for delete using (auth.uid() = user_id);

-- unconscious_entries
create policy "Users can view own entries"
  on public.unconscious_entries for select using (auth.uid() = user_id);
create policy "Users can insert own entries"
  on public.unconscious_entries for insert with check (auth.uid() = user_id);
create policy "Users can update own entries"
  on public.unconscious_entries for update using (auth.uid() = user_id);
create policy "Users can delete own entries"
  on public.unconscious_entries for delete using (auth.uid() = user_id);

-- ============================================
-- updated_at 자동 갱신 트리거
-- ============================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.weekly_goals
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.yearly_goals
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.life_goals
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.pomodoro_sessions
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.unconscious_entries
  for each row execute function public.handle_updated_at();
