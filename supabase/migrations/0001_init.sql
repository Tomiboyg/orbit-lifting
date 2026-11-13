-- Orbit Lifting — initial schema
-- Security model: every table has RLS. All policies scope rows to
-- user_id = (select auth.uid()) with both USING and WITH CHECK (spec 12.4).
-- Primary keys for workouts / exercises-in-workout / sets are client-generated
-- UUIDs so offline-first upserts are idempotent (spec 11.5).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  week_start_day smallint not null default 1 check (week_start_day between 0 and 6), -- 0 = Sunday, 1 = Monday
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (id = (select auth.uid()));
create policy "profiles: insert own" on public.profiles
  for insert with check (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: delete own" on public.profiles
  for delete using (id = (select auth.uid()));

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- exercises (global catalogue rows have user_id null; custom rows are user-owned)
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = global, read-only
  name text not null,
  category text,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  secondary_weight numeric not null default 0.5 check (secondary_weight between 0 and 1),
  created_at timestamptz not null default now()
);

create unique index exercises_global_name_idx on public.exercises (lower(name)) where user_id is null;
create unique index exercises_user_name_idx on public.exercises (user_id, lower(name)) where user_id is not null;
create index exercises_user_id_idx on public.exercises (user_id);

alter table public.exercises enable row level security;

-- Global rows are readable by everyone, user rows only by their owner.
create policy "exercises: read global + own" on public.exercises
  for select using (user_id is null or user_id = (select auth.uid()));
create policy "exercises: insert own" on public.exercises
  for insert with check (user_id = (select auth.uid()));
create policy "exercises: update own" on public.exercises
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "exercises: delete own" on public.exercises
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- routines
-- ---------------------------------------------------------------------------

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  definition jsonb not null default '[]'::jsonb, -- ordered list of exercise ids
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routines_user_id_idx on public.routines (user_id);

alter table public.routines enable row level security;

create policy "routines: select own" on public.routines
  for select using (user_id = (select auth.uid()));
create policy "routines: insert own" on public.routines
  for insert with check (user_id = (select auth.uid()));
create policy "routines: update own" on public.routines
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "routines: delete own" on public.routines
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- workouts (client-generated id = idempotent offline upserts, spec 11.5)
-- ---------------------------------------------------------------------------

create table public.workouts (
  id uuid primary key, -- client-generated UUID
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid,
  title text,
  notes text,
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_user_started_idx on public.workouts (user_id, started_at desc);

alter table public.workouts enable row level security;

create policy "workouts: select own" on public.workouts
  for select using (user_id = (select auth.uid()));
create policy "workouts: insert own" on public.workouts
  for insert with check (user_id = (select auth.uid()));
create policy "workouts: update own" on public.workouts
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workouts: delete own" on public.workouts
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- workout_exercises (one row per exercise instance inside a workout)
-- ---------------------------------------------------------------------------

create table public.workout_exercises (
  id uuid primary key, -- client-generated UUID
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  name text not null, -- snapshot at log time
  position integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_user_idx on public.workout_exercises (user_id);

alter table public.workout_exercises enable row level security;

create policy "workout_exercises: select own" on public.workout_exercises
  for select using (user_id = (select auth.uid()));
create policy "workout_exercises: insert own" on public.workout_exercises
  for insert with check (user_id = (select auth.uid()));
create policy "workout_exercises: update own" on public.workout_exercises
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "workout_exercises: delete own" on public.workout_exercises
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- sets (last-write-wins per set via id upsert, spec 13.1)
-- ---------------------------------------------------------------------------

create table public.sets (
  id uuid primary key, -- client-generated UUID
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  weight numeric,
  reps integer,
  rpe numeric,
  set_type text not null default 'working'
    check (set_type in ('warm-up', 'working', 'drop', 'failure')),
  completed boolean not null default false,
  performed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sets_workout_idx on public.sets (workout_id);
create index sets_user_performed_idx on public.sets (user_id, performed_at desc);
create index sets_user_exercise_idx on public.sets (user_id, exercise_id, performed_at desc);

alter table public.sets enable row level security;

create policy "sets: select own" on public.sets
  for select using (user_id = (select auth.uid()));
create policy "sets: insert own" on public.sets
  for insert with check (user_id = (select auth.uid()));
create policy "sets: update own" on public.sets
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sets: delete own" on public.sets
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings: select own" on public.user_settings
  for select using (user_id = (select auth.uid()));
create policy "user_settings: insert own" on public.user_settings
  for insert with check (user_id = (select auth.uid()));
create policy "user_settings: update own" on public.user_settings
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_settings: delete own" on public.user_settings
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- recommendations history (spec 10.9)
-- ---------------------------------------------------------------------------

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  type smallint not null check (type between 1 and 5),
  rule_id text not null,
  rule_version integer not null default 1,
  inputs jsonb not null default '{}'::jsonb, -- metric snapshot the rule fired on
  thresholds jsonb not null default '{}'::jsonb,
  explanation text not null,
  status text not null default 'active' check (status in ('active', 'dismissed')),
  dismissed_at timestamptz,
  dismiss_reason text,
  created_at timestamptz not null default now()
);

create index recommendations_user_week_idx on public.recommendations (user_id, week_start desc);

alter table public.recommendations enable row level security;

create policy "recommendations: select own" on public.recommendations
  for select using (user_id = (select auth.uid()));
create policy "recommendations: insert own" on public.recommendations
  for insert with check (user_id = (select auth.uid()));
create policy "recommendations: update own" on public.recommendations
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "recommendations: delete own" on public.recommendations
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger workouts_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();
create trigger routines_updated_at before update on public.routines
  for each row execute function public.set_updated_at();
create trigger sets_updated_at before update on public.sets
  for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- security_invoker view: weekly volume per muscle group (spec 12.4)
-- Counts working/drop/failure sets; warm-ups excluded (spec 10.4).
-- ---------------------------------------------------------------------------

create view public.weekly_set_volume
with (security_invoker = true) as
select
  s.user_id,
  date_trunc('week', coalesce(s.performed_at, s.created_at)) as week_start,
  se.name as exercise_name,
  s.exercise_id,
  m.muscle,
  count(*) filter (where m.role = 'primary') as direct_sets,
  sum(
    case
      when m.role = 'primary' then 1.0
      when m.role = 'secondary' then coalesce(se.secondary_weight, 0.5)
      else 0
    end
  ) as weighted_sets
from public.sets s
join public.workout_exercises we on we.id = s.workout_exercise_id
left join public.exercises se on se.id = s.exercise_id
cross join lateral (
  select muscle, 'primary' as role from unnest(coalesce(se.primary_muscles, '{}')) as muscle
  union all
  select muscle, 'secondary' as role from unnest(coalesce(se.secondary_muscles, '{}')) as muscle
) m
where s.completed = true
  and s.set_type in ('working', 'drop', 'failure')
group by s.user_id, date_trunc('week', coalesce(s.performed_at, s.created_at)), se.name, s.exercise_id, m.muscle;
