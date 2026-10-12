-- Stages an authenticated user's backup before replacing their cloud vault.
-- Media uploads happen before this record is created. The RPC below replaces
-- records in one database transaction, so a failed replacement keeps the
-- existing people, gifts, and memories intact.

create table if not exists public.gift_vault_restore_stages (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  payload jsonb not null,
  status text not null check (status in ('staged', 'applied')) default 'staged',
  expected_people integer not null check (expected_people >= 0),
  expected_gifts integer not null check (expected_gifts >= 0),
  expected_memories integer not null check (expected_memories >= 0),
  base_revision bigint not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  primary key (owner_id, id)
);

create index if not exists gift_vault_restore_stages_owner_created_idx
  on public.gift_vault_restore_stages (owner_id, created_at desc);

create table if not exists public.gift_vault_vault_revisions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.gift_vault_restore_stages enable row level security;
alter table public.gift_vault_vault_revisions enable row level security;

revoke all on public.gift_vault_restore_stages from public;
revoke all on public.gift_vault_vault_revisions from public;
grant select, insert on public.gift_vault_restore_stages to authenticated;
grant select on public.gift_vault_vault_revisions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_restore_stages'
      and policyname = 'Gift Vault restore stages are readable by their owner'
  ) then
    create policy "Gift Vault restore stages are readable by their owner"
      on public.gift_vault_restore_stages
      for select to authenticated
      using ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_restore_stages'
      and policyname = 'Gift Vault restore stages are created by their owner'
  ) then
    create policy "Gift Vault restore stages are created by their owner"
      on public.gift_vault_restore_stages
      for insert to authenticated
      with check ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'gift_vault_vault_revisions'
      and policyname = 'Gift Vault revisions are private'
  ) then
    create policy "Gift Vault revisions are private"
      on public.gift_vault_vault_revisions
      for select to authenticated
      using ((select auth.uid()) is not null and owner_id = (select auth.uid()));
  end if;
end
$$;

create or replace function public.touch_gift_vault_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_owner_id uuid;
begin
  if tg_op = 'DELETE' then
    vault_owner_id := old.owner_id;
  else
    vault_owner_id := new.owner_id;
  end if;

  insert into public.gift_vault_vault_revisions (owner_id, revision, updated_at)
  values (vault_owner_id, 1, now())
  on conflict (owner_id) do update
    set revision = public.gift_vault_vault_revisions.revision + 1,
        updated_at = now();
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'gift_vault_people_touch_revision') then
    create trigger gift_vault_people_touch_revision
      after insert or update or delete on public.gift_vault_people
      for each row execute function public.touch_gift_vault_revision();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gift_vault_gifts_touch_revision') then
    create trigger gift_vault_gifts_touch_revision
      after insert or update or delete on public.gift_vault_gifts
      for each row execute function public.touch_gift_vault_revision();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'gift_vault_memories_touch_revision') then
    create trigger gift_vault_memories_touch_revision
      after insert or update or delete on public.gift_vault_memories
      for each row execute function public.touch_gift_vault_revision();
  end if;
end
$$;

create or replace function public.replace_gift_vault_from_restore_stage(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stage_payload jsonb;
  stage_status text;
  stage_base_revision bigint;
  stage_expected_people integer;
  stage_expected_gifts integer;
  stage_expected_memories integer;
  current_revision bigint;
  stage_source text := 'restore:' || p_stage_id::text;
begin
  if auth.uid() is null then
    raise exception 'Gift Vault restore requires an authenticated user';
  end if;

  select payload, status, base_revision, expected_people, expected_gifts, expected_memories
    into stage_payload, stage_status, stage_base_revision,
      stage_expected_people, stage_expected_gifts, stage_expected_memories
    from public.gift_vault_restore_stages
    where owner_id = auth.uid() and id = p_stage_id
    for update;

  if not found then
    raise exception 'Gift Vault restore stage was not found';
  end if;

  if stage_status <> 'staged' then
    raise exception 'Gift Vault restore stage has already been applied';
  end if;

  insert into public.gift_vault_vault_revisions (owner_id, revision)
  values (auth.uid(), 0)
  on conflict (owner_id) do nothing;

  select revision
    into current_revision
    from public.gift_vault_vault_revisions
    where owner_id = auth.uid()
    for update;

  if current_revision <> stage_base_revision then
    raise exception 'Gift Vault cloud data changed while this backup was being prepared';
  end if;

  if jsonb_typeof(stage_payload -> 'people') <> 'array'
    or jsonb_typeof(stage_payload -> 'ideas') <> 'array'
    or jsonb_typeof(stage_payload -> 'memories') <> 'array' then
    raise exception 'Gift Vault restore stage is invalid';
  end if;

  if jsonb_array_length(stage_payload -> 'people') <> stage_expected_people
    or jsonb_array_length(stage_payload -> 'ideas') <> stage_expected_gifts
    or jsonb_array_length(stage_payload -> 'memories') <> stage_expected_memories then
    raise exception 'Gift Vault restore stage record counts do not match';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(stage_payload -> 'people') as person(value)
    where coalesce(person.value ->> 'photoStoragePath', '') <> ''
      and person.value ->> 'photoStoragePath' not like
        auth.uid()::text || '/restore-staging/' || p_stage_id::text || '/%'
  ) or exists (
    select 1
    from jsonb_array_elements(stage_payload -> 'ideas') as gift(value)
    where coalesce(gift.value ->> 'imageStoragePath', '') <> ''
      and gift.value ->> 'imageStoragePath' not like
        auth.uid()::text || '/restore-staging/' || p_stage_id::text || '/%'
  ) then
    raise exception 'Gift Vault restore stage has invalid media paths';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(stage_payload -> 'ideas') as gift(value)
    where not exists (
      select 1
      from jsonb_array_elements(stage_payload -> 'people') as person(value)
      where person.value ->> 'id' = gift.value ->> 'personId'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(stage_payload -> 'memories') as memory(value)
    where not exists (
      select 1
      from jsonb_array_elements(stage_payload -> 'people') as person(value)
      where person.value ->> 'id' = memory.value ->> 'personId'
    )
  ) then
    raise exception 'Gift Vault restore stage has orphaned records';
  end if;

  -- Cascade deletes remove dependent gifts and memories. This runs in the same
  -- transaction as all inserts below, so a validation or insert failure rolls it back.
  delete from public.gift_vault_people where owner_id = auth.uid();

  insert into public.gift_vault_people (
    owner_id, id, name, tags, photo_url, photo_storage_path, emoji, label_text,
    birthday, import_source_id
  )
  select
    auth.uid(),
    person.value ->> 'id',
    person.value ->> 'name',
    coalesce(array(select jsonb_array_elements_text(person.value -> 'tags')), '{}'::text[]),
    nullif(person.value ->> 'photoUrl', ''),
    nullif(person.value ->> 'photoStoragePath', ''),
    nullif(person.value ->> 'emoji', ''),
    nullif(person.value ->> 'labelText', ''),
    nullif(person.value ->> 'birthday', ''),
    stage_source
  from jsonb_array_elements(stage_payload -> 'people') as person(value);

  insert into public.gift_vault_gifts (
    owner_id, id, person_id, title, description, links, occasion_tags, image_url,
    image_storage_path, created_at, gifted_at, import_source_id
  )
  select
    auth.uid(),
    gift.value ->> 'id',
    gift.value ->> 'personId',
    gift.value ->> 'title',
    nullif(gift.value ->> 'description', ''),
    coalesce(array(select jsonb_array_elements_text(gift.value -> 'links')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(gift.value -> 'occasionTags')), '{}'::text[]),
    nullif(gift.value ->> 'imageUrl', ''),
    nullif(gift.value ->> 'imageStoragePath', ''),
    (gift.value ->> 'createdAt')::timestamptz,
    nullif(gift.value ->> 'giftedAt', '')::timestamptz,
    stage_source
  from jsonb_array_elements(stage_payload -> 'ideas') as gift(value);

  insert into public.gift_vault_memories (
    owner_id, id, person_id, text, created_at, import_source_id
  )
  select
    auth.uid(),
    memory.value ->> 'id',
    memory.value ->> 'personId',
    memory.value ->> 'text',
    (memory.value ->> 'createdAt')::timestamptz,
    stage_source
  from jsonb_array_elements(stage_payload -> 'memories') as memory(value);

  update public.gift_vault_restore_stages
    set status = 'applied', applied_at = now()
    where owner_id = auth.uid() and id = p_stage_id and status = 'staged';
end;
$$;

revoke all on function public.replace_gift_vault_from_restore_stage(uuid) from public;
grant execute on function public.replace_gift_vault_from_restore_stage(uuid) to authenticated;
revoke all on function public.touch_gift_vault_revision() from public;
