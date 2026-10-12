-- First-phase cloud import for Gift Vault.
-- This migration is intentionally additive: it never touches browser-local data.

create table if not exists public.gift_vault_people (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  tags text[] not null default '{}',
  photo_url text,
  photo_storage_path text,
  emoji text,
  label_text text,
  birthday text,
  import_source_id text not null,
  imported_at timestamptz not null default now(),
  primary key (owner_id, id),
  unique (owner_id, id)
);

create table if not exists public.gift_vault_gifts (
  owner_id uuid not null,
  id text not null,
  person_id text not null,
  title text not null,
  description text,
  links text[] not null default '{}',
  occasion_tags text[] not null default '{}',
  image_url text,
  image_storage_path text,
  created_at timestamptz not null,
  gifted_at timestamptz,
  import_source_id text not null,
  imported_at timestamptz not null default now(),
  primary key (owner_id, id),
  foreign key (owner_id, person_id)
    references public.gift_vault_people (owner_id, id)
    on delete cascade
);

create table if not exists public.gift_vault_memories (
  owner_id uuid not null,
  id text not null,
  person_id text not null,
  text text not null,
  created_at timestamptz not null,
  import_source_id text not null,
  imported_at timestamptz not null default now(),
  primary key (owner_id, id),
  foreign key (owner_id, person_id)
    references public.gift_vault_people (owner_id, id)
    on delete cascade
);

-- A single account-level record makes interrupted imports resumable without
-- accepting a second local dataset over an existing cloud vault.
create table if not exists public.gift_vault_imports (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  source_id text not null,
  status text not null check (status in ('in_progress', 'completed')),
  expected_people integer not null check (expected_people >= 0),
  expected_gifts integer not null check (expected_gifts >= 0),
  expected_memories integer not null check (expected_memories >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists gift_vault_gifts_person_idx
  on public.gift_vault_gifts (owner_id, person_id);
create index if not exists gift_vault_memories_person_idx
  on public.gift_vault_memories (owner_id, person_id);
create index if not exists gift_vault_people_import_idx
  on public.gift_vault_people (owner_id, import_source_id);
create index if not exists gift_vault_gifts_import_idx
  on public.gift_vault_gifts (owner_id, import_source_id);
create index if not exists gift_vault_memories_import_idx
  on public.gift_vault_memories (owner_id, import_source_id);

alter table public.gift_vault_people enable row level security;
alter table public.gift_vault_gifts enable row level security;
alter table public.gift_vault_memories enable row level security;
alter table public.gift_vault_imports enable row level security;

revoke all on public.gift_vault_people from anon;
revoke all on public.gift_vault_gifts from anon;
revoke all on public.gift_vault_memories from anon;
revoke all on public.gift_vault_imports from anon;
grant select, insert, update, delete on public.gift_vault_people to authenticated;
grant select, insert, update, delete on public.gift_vault_gifts to authenticated;
grant select, insert, update, delete on public.gift_vault_memories to authenticated;
grant select, insert, update, delete on public.gift_vault_imports to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_people'
      and policyname = 'Gift Vault people are private'
  ) then
    create policy "Gift Vault people are private"
      on public.gift_vault_people
      for all to authenticated
      using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
      with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_gifts'
      and policyname = 'Gift Vault gifts are private'
  ) then
    create policy "Gift Vault gifts are private"
      on public.gift_vault_gifts
      for all to authenticated
      using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
      with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_memories'
      and policyname = 'Gift Vault memories are private'
  ) then
    create policy "Gift Vault memories are private"
      on public.gift_vault_memories
      for all to authenticated
      using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
      with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_imports'
      and policyname = 'Gift Vault imports are private'
  ) then
    create policy "Gift Vault imports are private"
      on public.gift_vault_imports
      for all to authenticated
      using ((select auth.uid()) is not null and owner_id = (select auth.uid()))
      with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;
end
$$;

-- Uploaded browser-local media stays private. The first folder is always the
-- authenticated user's UUID, so every read and write is constrained to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-vault-media',
  'gift-vault-media',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/tiff',
    'image/svg+xml'
  ]
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Gift Vault media is private'
  ) then
    create policy "Gift Vault media is private"
      on storage.objects
      for select to authenticated
      using (
        bucket_id = 'gift-vault-media'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Gift Vault users can upload media'
  ) then
    create policy "Gift Vault users can upload media"
      on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'gift-vault-media'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Gift Vault users can update media'
  ) then
    create policy "Gift Vault users can update media"
      on storage.objects
      for update to authenticated
      using (
        bucket_id = 'gift-vault-media'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
      with check (
        bucket_id = 'gift-vault-media'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Gift Vault users can delete media'
  ) then
    create policy "Gift Vault users can delete media"
      on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'gift-vault-media'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );
  end if;
end
$$;
