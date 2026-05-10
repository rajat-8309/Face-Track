-- ============================================================
--  FaceTrack Pro v3 — Supabase Schema
--  Run this entire file once in:
--  Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── Students ──────────────────────────────────────────────
create table if not exists students (
  id            bigint generated always as identity primary key,
  "studentId"   text unique not null,
  name          text not null,
  branch        text not null,
  semester      integer not null,
  section       text    default '',
  email         text    default '',
  phone         text    default '',
  guardian      text    default '',
  descriptors   jsonb   not null default '[]',
  "photoThumb"  text    default '',
  "registeredAt" timestamptz default now()
);

-- ── Sessions ──────────────────────────────────────────────
create table if not exists sessions (
  id             bigint generated always as identity primary key,
  branch         text    not null,
  semester       integer not null,
  subject        text    not null,
  "timeSlot"     text    default '',
  date           text    not null,
  "startTime"    text    not null,
  "endTime"      text,
  active         boolean default true,
  "totalPresent" integer default 0,
  "totalAbsent"  integer default 0,
  "totalUnknown" integer default 0,
  "createdAt"    timestamptz default now()
);

-- ── Attendance ────────────────────────────────────────────
create table if not exists attendance (
  id            bigint generated always as identity primary key,
  "studentDbId" bigint,
  "studentId"   text    not null,
  name          text    not null,
  branch        text    not null,
  semester      integer not null,
  section       text    default '',
  subject       text    not null,
  "sessionId"   bigint,
  date          text    not null,
  time          text    not null,
  timestamp     timestamptz default now(),
  status        text    not null,
  confidence    text    default '',
  distance      real,
  "confPct"     integer default 0,
  "liveSnap"    text    default '',
  "autoMarked"  boolean default false
);

-- ── Unknown Faces ─────────────────────────────────────────
create table if not exists "unknownFaces" (
  id          bigint generated always as identity primary key,
  snap        text    default '',
  "sessionId" bigint,
  branch      text,
  semester    integer,
  date        text,
  time        text,
  timestamp   timestamptz default now()
);

-- ── Branch Auth ───────────────────────────────────────────
create table if not exists "branchAuth" (
  branch text primary key,
  hash   text not null
);

-- ── Row Level Security ────────────────────────────────────
-- The app handles its own branch-level authentication.
-- These permissive policies let the anon key read/write everything.
-- You can tighten these later once you add Supabase Auth.
alter table students       enable row level security;
alter table sessions       enable row level security;
alter table attendance     enable row level security;
alter table "unknownFaces" enable row level security;
alter table "branchAuth"   enable row level security;

create policy "public_access" on students       for all using (true) with check (true);
create policy "public_access" on sessions       for all using (true) with check (true);
create policy "public_access" on attendance     for all using (true) with check (true);
create policy "public_access" on "unknownFaces" for all using (true) with check (true);
create policy "public_access" on "branchAuth"   for all using (true) with check (true);

-- ── Indexes for common queries ────────────────────────────
create index if not exists idx_students_branch    on students (branch);
create index if not exists idx_sessions_branch    on sessions (branch);
create index if not exists idx_sessions_active    on sessions (active);
create index if not exists idx_attendance_session on attendance ("sessionId");
create index if not exists idx_attendance_branch  on attendance (branch);
create index if not exists idx_unk_session        on "unknownFaces" ("sessionId");
