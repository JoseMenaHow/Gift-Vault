-- Adds per-occurrence birthday gift tracking without changing the existing
-- revision guard or cloud-restore transaction boundaries.

begin;

alter table public.gift_vault_people
  add column if not exists birthday_gift_bought_for date;

-- Preserve the reviewed revision-guarded implementation, then wrap it so the
-- new field is written atomically with the rest of each sync payload.
do $$
begin
  if to_regprocedure('public.apply_gift_vault_sync_without_birthday_status(bigint,jsonb)') is null then
    alter function public.apply_gift_vault_sync(bigint, jsonb)
      rename to apply_gift_vault_sync_without_birthday_status;
  end if;
end
$$;

revoke all on function public.apply_gift_vault_sync_without_birthday_status(bigint, jsonb) from public;
revoke all on function public.apply_gift_vault_sync_without_birthday_status(bigint, jsonb) from authenticated;

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
  entry jsonb;
  resulting_revision bigint;
begin
  if vault_owner_id is null then
    raise exception 'Gift Vault cloud sync requires an authenticated user';
  end if;

  -- This function performs the revision check and all existing writes. Because
  -- it runs inside this call's transaction, any later error rolls everything back.
  perform public.apply_gift_vault_sync_without_birthday_status(
    p_expected_revision,
    p_changes
  );

  for entry in select value from jsonb_array_elements(p_changes -> 'people' -> 'create') loop
    if entry ? 'birthdayGiftBoughtFor' then
      update public.gift_vault_people
        set birthday_gift_bought_for = nullif(entry ->> 'birthdayGiftBoughtFor', '')::date
        where owner_id = vault_owner_id
          and id = entry ->> 'id'
          and deleted_at is null;
      if not found then
        raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
      end if;
    end if;
  end loop;

  for entry in select value from jsonb_array_elements(p_changes -> 'people' -> 'update') loop
    if entry ? 'birthdayGiftBoughtFor' then
      update public.gift_vault_people
        set birthday_gift_bought_for = nullif(entry ->> 'birthdayGiftBoughtFor', '')::date
        where owner_id = vault_owner_id
          and id = entry ->> 'id'
          and deleted_at is null;
      if not found then
        raise exception 'Gift Vault stale cloud sync' using errcode = '40001';
      end if;
    end if;
  end loop;

  select revision
    into resulting_revision
    from public.gift_vault_vault_revisions
    where owner_id = vault_owner_id;

  return resulting_revision;
end;
$$;

revoke all on function public.apply_gift_vault_sync(bigint, jsonb) from public;
grant execute on function public.apply_gift_vault_sync(bigint, jsonb) to authenticated;

-- Apply the same field inside the existing all-or-nothing cloud restore. Older
-- backups omit it and therefore restore with the default null value.
do $$
begin
  if to_regprocedure('public.replace_gift_vault_from_restore_stage_without_birthday_status(uuid)') is null then
    alter function public.replace_gift_vault_from_restore_stage(uuid)
      rename to replace_gift_vault_from_restore_stage_without_birthday_status;
  end if;
end
$$;

revoke all on function public.replace_gift_vault_from_restore_stage_without_birthday_status(uuid) from public;
revoke all on function public.replace_gift_vault_from_restore_stage_without_birthday_status(uuid) from authenticated;

create or replace function public.replace_gift_vault_from_restore_stage(p_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_owner_id uuid := auth.uid();
  stage_payload jsonb;
  person_entry jsonb;
begin
  if vault_owner_id is null then
    raise exception 'Gift Vault restore requires an authenticated user';
  end if;

  select payload
    into stage_payload
    from public.gift_vault_restore_stages
    where owner_id = vault_owner_id
      and id = p_stage_id;

  if not found then
    raise exception 'Gift Vault restore stage was not found';
  end if;

  perform public.replace_gift_vault_from_restore_stage_without_birthday_status(p_stage_id);

  for person_entry in select value from jsonb_array_elements(stage_payload -> 'people') loop
    if person_entry ? 'birthdayGiftBoughtFor' then
      update public.gift_vault_people
        set birthday_gift_bought_for = nullif(person_entry ->> 'birthdayGiftBoughtFor', '')::date
        where owner_id = vault_owner_id
          and id = person_entry ->> 'id';
      if not found then
        raise exception 'Gift Vault restored birthday status could not be verified';
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.replace_gift_vault_from_restore_stage(uuid) from public;
grant execute on function public.replace_gift_vault_from_restore_stage(uuid) to authenticated;

commit;
