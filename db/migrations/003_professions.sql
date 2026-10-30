-- ============================================================
-- 003_professions.sql — skills (woodcutting, mining, fishing, cooking), shop prices
-- The item catalog itself is synced from shared/src/data/items.ts on server start.
-- ============================================================

create table character_skills (
  character_id uuid not null references characters(id) on delete cascade,
  skill        text not null,
  xp           int  not null default 0 check (xp >= 0),
  primary key (character_id, skill)
);

alter table items add column sell_value int not null default 0 check (sell_value >= 0);
