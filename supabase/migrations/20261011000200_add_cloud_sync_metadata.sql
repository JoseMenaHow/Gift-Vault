-- Adds the revision and tombstone metadata needed for safe pull-before-push sync.
-- Existing Gift Vault content is preserved; this migration only adds metadata.

alter table public.gift_vault_people
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.gift_vault_gifts
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.gift_vault_memories
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists gift_vault_people_sync_idx
  on public.gift_vault_people (owner_id, updated_at desc);
create index if not exists gift_vault_gifts_sync_idx
  on public.gift_vault_gifts (owner_id, updated_at desc);
create index if not exists gift_vault_memories_sync_idx
  on public.gift_vault_memories (owner_id, updated_at desc);

create or replace function public.set_gift_vault_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger gift_vault_people_set_updated_at
  before update on public.gift_vault_people
  for each row execute function public.set_gift_vault_updated_at();

create trigger gift_vault_gifts_set_updated_at
  before update on public.gift_vault_gifts
  for each row execute function public.set_gift_vault_updated_at();

create trigger gift_vault_memories_set_updated_at
  before update on public.gift_vault_memories
  for each row execute function public.set_gift_vault_updated_at();
