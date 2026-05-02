create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  question_key text not null,
  opposition_id text not null,
  topic_id text not null,
  mode text not null check (mode in ('practice', 'exam')),
  selected_option_id text,
  correct_option_id text not null,
  is_correct boolean not null,
  score numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists attempts_profile_created_idx
  on public.attempts(profile_id, created_at desc);

create index if not exists attempts_profile_question_idx
  on public.attempts(profile_id, question_key);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opposition_id text not null,
  topic_id text,
  total integer not null,
  correct integer not null,
  wrong integer not null,
  blank integer not null,
  score numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists exam_sessions_profile_created_idx
  on public.exam_sessions(profile_id, created_at desc);
