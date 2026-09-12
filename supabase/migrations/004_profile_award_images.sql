-- Store optional award/exhibition images for the personal introduction page.
alter table public.profiles
  add column if not exists "awardImageKeys" jsonb not null default '[]'::jsonb;
