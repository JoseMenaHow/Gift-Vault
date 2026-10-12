-- Routes all vault-content writes through one revision-guarded transaction.
-- Apply after 20261012000100_add_cloud_backup_restore.sql.

create or replace function public.apply_gift_vault_sync(
  p_expected_revision bigint,
  p_changes jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_owner_id uuid := auth.uid();
  current_revision bigint;
  entry jsonb;
begin
  if vault_owner_id is null then
    raise exception 'Gift Vault cloud sync requires an authenticated user';
  end if;

  if p_expected_revision is null
    or jsonb_typeof(p_changes) <> 'object'
    or jsonb_typeof(p_changes -> 'people') <> 'object'
    or jsonb_typeof(p_changes -> 'gifts') <> 'object'
    or jsonb_typeof(p_changes -> 'memories') <> 'object'
    or jsonb_typeof(p_changes -> 'people' -> 'create') <> 'array'
    or jsonb_typeof(p_changes -> 'people' -> 'update') <> 'array'
    or jsonb_typeof(p_changes -> 'people' -> 'delete') <> 'array'
    or jsonb_typeof(p_changes -> 'gifts' -> 'create') <> 'array'
    or jsonb_typeof(p_changes -> 'gifts' -> 'update') <> 'array'
    or jsonb_typeof(p_changes -> 'gifts' -> 'delete') <> 'array'
    or jsonb_typeof(p_changes -> 'memories' -> 'create') <> 'array'
    or jsonb_typeof(p_changes -> 'memories' -> 'update') <> 'array'
    or jsonb_typeof(p_changes -> 'memories' -> 'delete') <> 'array' then
    raise exception 'Gift Vault cloud sync payload is invalid';
  end if;

  insert into public.gift_vault_vault_revisions (owner_id, revision)
  values (vault_owner_id, 0)
  on conflict (owner_id) do nothing;

  select revision
    into current_revision
    from public.gift_vault_vault_revisions
    where owner_id = vault_owner_id
    for update;

  if current_revision <> p_expected_revision then
    raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
  end if;

  -- Media is uploaded separately under storage RLS. A row can only reference a
  -- file in this account's folder, including retained restore-stage media.
  if exists (
    select 1
    from jsonb_array_elements(p_changes -> 'people' -> 'create') as change(value)
    where coalesce(change.value ->> 'photoStoragePath', '') <> ''
      and change.value ->> 'photoStoragePath' not like vault_owner_id::text || '/%'
  ) or exists (
    select 1
    from jsonb_array_elements(p_changes -> 'people' -> 'update') as change(value)
    where coalesce(change.value ->> 'photoStoragePath', '') <> ''
      and change.value ->> 'photoStoragePath' not like vault_owner_id::text || '/%'
  ) or exists (
    select 1
    from jsonb_array_elements(p_changes -> 'gifts' -> 'create') as change(value)
    where coalesce(change.value ->> 'imageStoragePath', '') <> ''
      and change.value ->> 'imageStoragePath' not like vault_owner_id::text || '/%'
  ) or exists (
    select 1
    from jsonb_array_elements(p_changes -> 'gifts' -> 'update') as change(value)
    where coalesce(change.value ->> 'imageStoragePath', '') <> ''
      and change.value ->> 'imageStoragePath' not like vault_owner_id::text || '/%'
  ) then
    raise exception 'Gift Vault cloud sync has invalid media paths';
  end if;

  for entry in select value from jsonb_array_elements(p_changes -> 'people' -> 'create') loop
    insert into public.gift_vault_people (
      owner_id, id, name, tags, photo_url, photo_storage_path, emoji, label_text,
      birthday, import_source_id
    ) values (
      vault_owner_id,
      entry ->> 'id',
      entry ->> 'name',
      coalesce(array(select jsonb_array_elements_text(entry -> 'tags')), '{}'::text[]),
      nullif(entry ->> 'photoUrl', ''),
      nullif(entry ->> 'photoStoragePath', ''),
      nullif(entry ->> 'emoji', ''),
      nullif(entry ->> 'labelText', ''),
      nullif(entry ->> 'birthday', ''),
      coalesce(nullif(entry ->> 'importSourceId', ''), 'sync')
    );
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'people' -> 'update') loop
    update public.gift_vault_people
      set name = entry ->> 'name',
          tags = coalesce(array(select jsonb_array_elements_text(entry -> 'tags')), '{}'::text[]),
          photo_url = nullif(entry ->> 'photoUrl', ''),
          photo_storage_path = nullif(entry ->> 'photoStoragePath', ''),
          emoji = nullif(entry ->> 'emoji', ''),
          label_text = nullif(entry ->> 'labelText', ''),
          birthday = nullif(entry ->> 'birthday', '')
      where owner_id = vault_owner_id
        and id = entry ->> 'id'
        and updated_at = (entry ->> 'expectedUpdatedAt')::timestamptz
        and deleted_at is null;
    if not found then
      raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
    end if;
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'gifts' -> 'create') loop
    insert into public.gift_vault_gifts (
      owner_id, id, person_id, title, description, links, occasion_tags, image_url,
      image_storage_path, created_at, gifted_at, import_source_id
    ) values (
      vault_owner_id,
      entry ->> 'id',
      entry ->> 'personId',
      entry ->> 'title',
      nullif(entry ->> 'description', ''),
      coalesce(array(select jsonb_array_elements_text(entry -> 'links')), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(entry -> 'occasionTags')), '{}'::text[]),
      nullif(entry ->> 'imageUrl', ''),
      nullif(entry ->> 'imageStoragePath', ''),
      (entry ->> 'createdAt')::timestamptz,
      nullif(entry ->> 'giftedAt', '')::timestamptz,
      coalesce(nullif(entry ->> 'importSourceId', ''), 'sync')
    );
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'gifts' -> 'update') loop
    update public.gift_vault_gifts
      set person_id = entry ->> 'personId',
          title = entry ->> 'title',
          description = nullif(entry ->> 'description', ''),
          links = coalesce(array(select jsonb_array_elements_text(entry -> 'links')), '{}'::text[]),
          occasion_tags = coalesce(array(select jsonb_array_elements_text(entry -> 'occasionTags')), '{}'::text[]),
          image_url = nullif(entry ->> 'imageUrl', ''),
          image_storage_path = nullif(entry ->> 'imageStoragePath', ''),
          gifted_at = nullif(entry ->> 'giftedAt', '')::timestamptz
      where owner_id = vault_owner_id
        and id = entry ->> 'id'
        and updated_at = (entry ->> 'expectedUpdatedAt')::timestamptz
        and deleted_at is null;
    if not found then
      raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
    end if;
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'memories' -> 'create') loop
    insert into public.gift_vault_memories (
      owner_id, id, person_id, text, created_at, import_source_id
    ) values (
      vault_owner_id,
      entry ->> 'id',
      entry ->> 'personId',
      entry ->> 'text',
      (entry ->> 'createdAt')::timestamptz,
      coalesce(nullif(entry ->> 'importSourceId', ''), 'sync')
    );
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'memories' -> 'update') loop
    update public.gift_vault_memories
      set person_id = entry ->> 'personId',
          text = entry ->> 'text'
      where owner_id = vault_owner_id
        and id = entry ->> 'id'
        and updated_at = (entry ->> 'expectedUpdatedAt')::timestamptz
        and deleted_at is null;
    if not found then
      raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
    end if;
  end loop;

  -- Tombstones remain available to later snapshots. Delete dependents first,
  -- then people, matching the normal client sync order.
  for entry in select value from jsonb_array_elements(p_changes -> 'gifts' -> 'delete') loop
    update public.gift_vault_gifts
      set deleted_at = now()
      where owner_id = vault_owner_id
        and id = entry ->> 'id'
        and updated_at = (entry ->> 'expectedUpdatedAt')::timestamptz
        and deleted_at is null;
    if not found then
      raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
    end if;
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'memories' -> 'delete') loop
    update public.gift_vault_memories
      set deleted_at = now()
      where owner_id = vault_owner_id
        and id = entry ->> 'id'
        and updated_at = (entry ->> 'expectedUpdatedAt')::timestamptz
        and deleted_at is null;
    if not found then
      raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
    end if;
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'people' -> 'delete') loop
    update public.gift_vault_people
      set deleted_at = now()
      where owner_id = vault_owner_id
        and id = entry ->> 'id'
        and updated_at = (entry ->> 'expectedUpdatedAt')::timestamptz
        and deleted_at is null;
    if not found then
      raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
    end if;
  end loop;

  select revision
    into current_revision
    from public.gift_vault_vault_revisions
    where owner_id = vault_owner_id;
  return current_revision;
end;
$$;

revoke all on function public.apply_gift_vault_sync(bigint, jsonb) from public;
grant execute on function public.apply_gift_vault_sync(bigint, jsonb) to authenticated;

-- Do this only after the RPC exists. Older direct-write clients retain local
-- changes but cannot recreate cloud records after a vault replacement.
revoke insert, update, delete on public.gift_vault_people from authenticated;
revoke insert, update, delete on public.gift_vault_gifts from authenticated;
revoke insert, update, delete on public.gift_vault_memories from authenticated;
