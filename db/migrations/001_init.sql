-- ============================================================
-- 001_init.sql — D&D Web schema for Neon Postgres
-- Users live in Neon Auth (neon_auth."user"); the game server authorizes every
-- action itself, so no row-level security policies are needed here.
-- ============================================================

create extension if not exists "pgcrypto";

create type race_enum as enum (
  'human', 'elf', 'dwarf', 'halfling', 'half_elf', 'gnome', 'orc', 'tiefling', 'dragonborn'
);
create type class_enum   as enum ('fighter', 'rogue', 'wizard', 'cleric');
create type turn_enum    as enum ('player', 'enemy');
create type enc_status   as enum ('active', 'won', 'lost', 'fled');
create type quest_type   as enum ('kill_N', 'explore', 'survive');
create type quest_status as enum ('active', 'completed', 'claimed', 'expired');
create type item_type    as enum ('weapon', 'armor', 'consumable');
create type tx_type      as enum ('combat_reward', 'quest_reward', 'purchase', 'repair');
create type zone_event_type as enum (
  'entered_zone', 'leveled_up', 'won_combat',
  'found_item', 'quest_completed', 'purchased'
);

create table zones (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text not null,
  exits          jsonb not null default '{}',
  is_combat_zone bool not null default false
);

create table characters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references neon_auth."user"(id) on delete cascade,
  name       text not null check (length(name) between 2 and 32),
  race       race_enum  not null,
  class      class_enum not null,
  level      int  not null default 1  check (level >= 1),
  xp         int  not null default 0  check (xp >= 0),
  hp         int  not null            check (hp >= 0),
  max_hp     int  not null            check (max_hp > 0),
  str        int  not null check (str  between 3 and 24),
  dex        int  not null check (dex  between 3 and 24),
  con        int  not null check (con  between 3 and 24),
  int        int  not null check (int  between 3 and 24),
  wis        int  not null check (wis  between 3 and 24),
  cha        int  not null check (cha  between 3 and 24),
  currency   int  not null default 0  check (currency >= 0),
  zone_id    uuid not null references zones(id),
  created_at timestamptz not null default now()
);
create unique index characters_user_id_idx on characters(user_id); -- 1 character per account for now

create table zone_events (
  id           uuid primary key default gen_random_uuid(),
  zone_id      uuid not null references zones(id) on delete cascade,
  character_id uuid references characters(id) on delete set null,
  type         zone_event_type not null,
  payload      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index zone_events_zone_created_idx on zone_events(zone_id, created_at desc);

create table enemy_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  hp              int  not null check (hp > 0),
  str             int  not null,
  dex             int  not null,
  con             int  not null,
  ac              int  not null,
  attack_damage   text not null,
  xp_reward       int  not null check (xp_reward >= 0),
  currency_min    int  not null check (currency_min >= 0),
  currency_max    int  not null check (currency_max >= currency_min)
);

create table encounters (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references zones(id),
  character_id  uuid not null references characters(id) on delete cascade,
  enemy_type    text not null,
  enemy_hp      int  not null check (enemy_hp >= 0),
  enemy_max_hp  int  not null check (enemy_max_hp > 0),
  grid_state    jsonb not null,
  turn          turn_enum not null default 'player',
  round         int not null default 1 check (round >= 1),
  status        enc_status not null default 'active',
  combat_log    jsonb not null default '[]',
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create index encounters_character_status_idx on encounters(character_id, status);

create table quests (
  id               uuid primary key default gen_random_uuid(),
  character_id     uuid not null references characters(id) on delete cascade,
  type             quest_type   not null,
  description      text not null,
  target_count     int  not null check (target_count > 0),
  progress         int  not null default 0 check (progress >= 0),
  reward_xp        int  not null check (reward_xp >= 0),
  reward_currency  int  not null check (reward_currency >= 0),
  status           quest_status not null default 'active',
  quest_date       date not null,
  expires_at       timestamptz not null
);
create unique index quests_character_date_idx
  on quests(character_id, quest_date)
  where status in ('active', 'completed', 'claimed');

create table items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  type        item_type not null,
  description text not null,
  stats       jsonb not null default '{}',
  cost        int  not null check (cost >= 0),
  single_use  bool not null default false
);

create table inventory_items (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  item_id      uuid not null references items(id),
  quantity     int  not null default 1 check (quantity > 0),
  equipped     bool not null default false
);
create unique index inventory_character_item_idx on inventory_items(character_id, item_id);

create table transactions (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references characters(id) on delete cascade,
  type         tx_type not null,
  amount       int not null,
  description  text not null,
  created_at   timestamptz not null default now()
);
create index transactions_character_idx on transactions(character_id, created_at desc);

-- ── Seed data ───────────────────────────────────────────────
insert into zones (id, name, description, exits, is_combat_zone) values
  ('a1000000-0000-0000-0000-000000000001', 'La Taberna del Grifo',
   'Una taberna de madera oscura y vigas ennegrecidas por el humo. El olor a cerveza barata y estofado llena el aire.',
   '{}', false);

insert into enemy_templates (name, hp, str, dex, con, ac, attack_damage, xp_reward, currency_min, currency_max) values
  ('Goblin', 12, 8, 14, 10, 11, '1d4+1', 30, 20, 35),
  ('Esqueleto', 14, 10, 10, 12, 12, '1d6', 35, 18, 32),
  ('Lobo', 10, 11, 15, 11, 12, '1d4+2', 32, 16, 30);

insert into items (name, type, description, stats, cost, single_use) values
  ('Poción de Curación', 'consumable',
   'Un líquido rojizo que huele a hierbas silvestres. Restaura 2d6 puntos de golpe al beberla.',
   '{"heal": "2d6"}', 25, true);
