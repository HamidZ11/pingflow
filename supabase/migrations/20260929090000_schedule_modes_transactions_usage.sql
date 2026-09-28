-- Schedule modes, write-time availability, atomic service and customer
-- changes, and an internal usage ledger.
--
-- Follows 20260928190000_app_foundation.sql and keeps its conventions:
-- functions are SECURITY INVOKER (row level security applies inside them),
-- use an empty search_path, state ownership explicitly, and raise P0001 with
-- a machine-readable HINT the app turns into plain English.

-- ---------------------------------------------------------------------------
-- 1. Schedule mode
--
-- regular:  bookable inside the weekly working hours.
-- flexible: bookable any time that's free, within the app's bookable day
--           (FLEXIBLE_BOOKABLE_DAY in src/domain/availability/engine.ts).
-- The weekly hours are kept in flexible mode, so switching back to regular
-- restores them. The mode is explicit rather than inferred from "no working
-- hours", which would be ambiguous.
-- ---------------------------------------------------------------------------

create type public.schedule_mode as enum ('regular', 'flexible');

alter table public.businesses
  add column schedule_mode public.schedule_mode not null default 'regular';

-- ---------------------------------------------------------------------------
-- 2. Write-time availability guard
--
-- The availability engine decides which times to offer. Between offering a
-- time and saving it, someone else (another tab, a future WhatsApp flow) can
-- take it. These triggers re-check at write time, for every write path, with
-- the same collision rules as the engine:
--   * a booking occupies [start, end + its buffer);
--   * a confirmed booking can't overlap another booking's occupied time, and
--     its own buffer can't run into another booking;
--   * a confirmed booking can't overlap blocked time;
--   * blocked time can't cover a confirmed booking.
-- Working hours and the flexible bookable day are configuration, checked by
-- the engine before writing. A per-business advisory lock makes the check
-- and the write happen one at a time.
-- ---------------------------------------------------------------------------

create function private.lock_business_schedule(p_business_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('pingflow.schedule:' || p_business_id::text, 0));
$$;

create function private.guard_booking_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  perform private.lock_business_schedule(new.business_id);

  if exists (
    select 1
    from public.bookings b
    where b.business_id = new.business_id
      and b.status = 'confirmed'
      and b.id <> new.id
      and b.starts_at < new.ends_at + make_interval(mins => new.buffer_minutes)
      and new.starts_at < b.ends_at + make_interval(mins => b.buffer_minutes)
  ) or exists (
    select 1
    from public.schedule_blocks k
    where k.business_id = new.business_id
      and k.starts_at < new.ends_at
      and new.starts_at < k.ends_at
  ) then
    raise exception 'That time is no longer free'
      using errcode = 'P0001', hint = 'slot_unavailable';
  end if;

  return new;
end;
$$;

create trigger bookings_guard_slot
  before insert or update of starts_at, ends_at, buffer_minutes, status
  on public.bookings
  for each row execute function private.guard_booking_slot();

create function private.guard_block_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.lock_business_schedule(new.business_id);

  if exists (
    select 1
    from public.bookings b
    where b.business_id = new.business_id
      and b.status = 'confirmed'
      and b.starts_at < new.ends_at
      and new.starts_at < b.ends_at
  ) then
    raise exception 'That time has a booking'
      using errcode = 'P0001', hint = 'block_covers_booking';
  end if;

  return new;
end;
$$;

create trigger schedule_blocks_guard_slot
  before insert or update of starts_at, ends_at
  on public.schedule_blocks
  for each row execute function private.guard_block_slot();

-- ---------------------------------------------------------------------------
-- 3. Onboarding and Settings: schedule mode with the weekly hours
-- ---------------------------------------------------------------------------

-- Replaces the version in the first migration: adds schedule_mode, and lets
-- a flexible business start without weekly hours.
create or replace function public.complete_onboarding(p_setup jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_business_id uuid;
  v_services jsonb := coalesce(p_setup -> 'services', '[]'::jsonb);
  v_hours jsonb := coalesce(p_setup -> 'working_hours', '[]'::jsonb);
  v_automation jsonb := coalesce(p_setup -> 'automation', '{}'::jsonb);
  v_mode public.schedule_mode := coalesce(p_setup ->> 'schedule_mode', 'regular')::public.schedule_mode;
begin
  if v_owner is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if exists (
    select 1 from public.businesses
    where owner_id = v_owner and onboarding_completed_at is not null
  ) then
    raise exception 'Already set up' using errcode = 'P0001', hint = 'already_set_up';
  end if;

  if jsonb_typeof(v_services) <> 'array' or jsonb_array_length(v_services) not between 1 and 20 then
    raise exception 'Add at least one service' using errcode = 'P0001', hint = 'invalid_services';
  end if;
  if jsonb_typeof(v_hours) <> 'array'
     or jsonb_array_length(v_hours) > 21
     or (v_mode = 'regular' and jsonb_array_length(v_hours) = 0) then
    raise exception 'Add your working hours' using errcode = 'P0001', hint = 'invalid_hours';
  end if;

  insert into public.businesses (owner_id, name, business_type, timezone, schedule_mode, onboarding_completed_at)
  values (
    v_owner,
    nullif(btrim(p_setup ->> 'name'), ''),
    (p_setup ->> 'business_type')::public.business_type,
    coalesce(p_setup ->> 'timezone', 'Europe/London'),
    v_mode,
    now()
  )
  on conflict (owner_id) do update set
    name = excluded.name,
    business_type = excluded.business_type,
    timezone = excluded.timezone,
    schedule_mode = excluded.schedule_mode,
    onboarding_completed_at = excluded.onboarding_completed_at
  returning id into v_business_id;

  -- A half-finished earlier attempt is replaced, not merged.
  delete from public.services where business_id = v_business_id;
  delete from public.working_hours where business_id = v_business_id;

  insert into public.services (business_id, name, duration_minutes, buffer_minutes, position)
  select
    v_business_id,
    btrim(s ->> 'name'),
    (s ->> 'duration_minutes')::integer,
    coalesce((s ->> 'buffer_minutes')::integer, 0),
    (ord - 1)::integer
  from jsonb_array_elements(v_services) with ordinality as t (s, ord);

  insert into public.working_hours (business_id, weekday, start_time, end_time)
  select
    v_business_id,
    (h ->> 'weekday')::smallint,
    (h ->> 'start_time')::time,
    (h ->> 'end_time')::time
  from jsonb_array_elements(v_hours) as t (h);

  insert into public.automation_settings (
    business_id,
    reminders_enabled,
    reminder_lead_minutes,
    availability_replies_enabled
  )
  values (
    v_business_id,
    coalesce((v_automation ->> 'reminders_enabled')::boolean, true),
    coalesce((v_automation ->> 'reminder_lead_minutes')::integer, 1440),
    coalesce((v_automation ->> 'availability_replies_enabled')::boolean, true)
  )
  on conflict (business_id) do update set
    reminders_enabled = excluded.reminders_enabled,
    reminder_lead_minutes = excluded.reminder_lead_minutes,
    availability_replies_enabled = excluded.availability_replies_enabled;

  return v_business_id;
end;
$$;

-- Settings → Working hours. Regular mode needs at least one working day and
-- replaces the weekly hours. Flexible mode keeps the stored weekly hours
-- unless new ones are sent, so switching back later restores them.
-- p_hours: [{"weekday", "start_time", "end_time"}] or null.
drop function public.set_working_hours(jsonb);

create function public.set_schedule(
  p_mode public.schedule_mode,
  p_hours jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
begin
  if p_mode is null then
    raise exception 'Choose how you work' using errcode = 'P0001', hint = 'invalid_hours';
  end if;
  if p_hours is not null and (jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 21) then
    raise exception 'Invalid working hours' using errcode = 'P0001', hint = 'invalid_hours';
  end if;
  if p_mode = 'regular' and (p_hours is null or jsonb_array_length(p_hours) = 0) then
    raise exception 'Choose at least one working day' using errcode = 'P0001', hint = 'invalid_hours';
  end if;

  if p_hours is not null then
    delete from public.working_hours where business_id = v_business_id;
    insert into public.working_hours (business_id, weekday, start_time, end_time)
    select
      v_business_id,
      (h ->> 'weekday')::smallint,
      (h ->> 'start_time')::time,
      (h ->> 'end_time')::time
    from jsonb_array_elements(p_hours) as t (h);
  end if;

  update public.businesses set schedule_mode = p_mode where id = v_business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. New customer and their first booking, together
--
-- One transaction: the customer, the WhatsApp contact (reused if the number
-- is already known), the link between them, the booking, its reminder and
-- the activity records. If any part fails (most often: the time was taken a
-- moment ago), none of it is saved.
-- ---------------------------------------------------------------------------

create function public.create_customer_booking(
  p_full_name text,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_phone_e164 text default null,
  p_relationship public.contact_relationship default 'self',
  p_contact_name text default null,
  p_reminder_send_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_service public.services%rowtype;
  v_customer_id uuid;
  v_contact_id uuid;
  v_booking_id uuid;
  v_ends_at timestamptz;
begin
  if p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 120 then
    raise exception 'Customer name missing' using errcode = 'P0001', hint = 'invalid_customer';
  end if;
  if p_starts_at is null then
    raise exception 'A time is required' using errcode = 'P0001', hint = 'missing_time';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id and business_id = v_business_id and archived_at is null;
  if not found then
    raise exception 'Service not found' using errcode = 'P0001', hint = 'service_not_found';
  end if;
  if p_reminder_send_at is not null and p_reminder_send_at >= p_starts_at then
    raise exception 'Reminder after booking' using errcode = 'P0001', hint = 'invalid_reminder';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

  insert into public.customers (business_id, full_name)
  values (v_business_id, btrim(p_full_name))
  returning id into v_customer_id;

  if p_phone_e164 is not null then
    insert into public.contacts (business_id, phone_e164, display_name)
    values (
      v_business_id,
      p_phone_e164,
      coalesce(nullif(btrim(p_contact_name), ''), case when p_relationship = 'self' then btrim(p_full_name) end)
    )
    on conflict (business_id, phone_e164) do update
      set display_name = coalesce(public.contacts.display_name, excluded.display_name)
    returning id into v_contact_id;

    insert into public.customer_contacts (business_id, customer_id, contact_id, relationship)
    values (v_business_id, v_customer_id, v_contact_id, p_relationship);
  end if;

  -- The slot guard re-checks availability here; a clash undoes everything.
  insert into public.bookings (business_id, customer_id, service_id, starts_at, ends_at, buffer_minutes)
  values (v_business_id, v_customer_id, v_service.id, p_starts_at, v_ends_at, v_service.buffer_minutes)
  returning id into v_booking_id;

  insert into public.activity_events (business_id, kind, actor, customer_id, details)
  values (v_business_id, 'customer_added', 'owner', v_customer_id, '{}');

  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
  values (v_business_id, 'booking_created', 'owner', v_customer_id, v_booking_id,
          jsonb_build_object('starts_at', p_starts_at, 'ends_at', v_ends_at, 'service', v_service.name));

  if p_reminder_send_at is not null then
    insert into public.reminders (business_id, booking_id, send_at)
    values (v_business_id, v_booking_id, p_reminder_send_at);

    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (v_business_id, 'reminder_scheduled', 'pingflow', v_customer_id, v_booking_id,
            jsonb_build_object('send_at', p_reminder_send_at));
  end if;

  return jsonb_build_object('customer_id', v_customer_id, 'booking_id', v_booking_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Settings → Services, saved as one list
--
-- p_services is the complete list the owner wants, in order:
--   [{"id": uuid | null, "name", "duration_minutes", "buffer_minutes"}]
-- Rows with an id update that service; rows without one are new; active
-- services missing from the list are removed. Removed services are archived,
-- not deleted, so past bookings keep their service. A service with upcoming
-- bookings can't be removed. Everything is checked before anything changes,
-- and it all happens in one transaction.
-- ---------------------------------------------------------------------------

-- The submitted list as rows, in order. Invalid values (a non-number
-- length, a malformed id) raise here, so nothing after it runs.
create function private.parse_service_list(p_services jsonb)
returns table (
  id uuid,
  name text,
  duration_minutes integer,
  buffer_minutes integer,
  "position" integer
)
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    nullif(item ->> 'id', '')::uuid,
    btrim(item ->> 'name'),
    (item ->> 'duration_minutes')::integer,
    coalesce((item ->> 'buffer_minutes')::integer, 0),
    (ord - 1)::integer
  from jsonb_array_elements(p_services) with ordinality as t (item, ord);
$$;

create function public.save_services(p_services jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_ids uuid[];
  v_blocking text;
begin
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) not between 1 and 20 then
    raise exception 'Keep between 1 and 20 services' using errcode = 'P0001', hint = 'invalid_services';
  end if;

  if exists (
    select 1 from private.parse_service_list(p_services) x
    where x.name is null or char_length(x.name) not between 1 and 80
  ) then
    raise exception 'Every service needs a name' using errcode = 'P0001', hint = 'invalid_service_name';
  end if;
  if exists (
    select 1 from private.parse_service_list(p_services) x
    where x.duration_minutes is null or x.duration_minutes not between 5 and 720
       or x.buffer_minutes not between 0 and 240
  ) then
    raise exception 'Check the service lengths' using errcode = 'P0001', hint = 'invalid_service_length';
  end if;
  if (select count(x.id) <> count(distinct x.id) from private.parse_service_list(p_services) x) then
    raise exception 'A service appears twice' using errcode = 'P0001', hint = 'duplicate_service';
  end if;
  if (select count(*) <> count(distinct lower(x.name)) from private.parse_service_list(p_services) x) then
    raise exception 'Two services have the same name' using errcode = 'P0001', hint = 'duplicate_service_name';
  end if;
  -- Only this business's active services can be updated.
  if exists (
    select 1 from private.parse_service_list(p_services) x
    where x.id is not null
      and not exists (
        select 1 from public.services s
        where s.id = x.id and s.business_id = v_business_id and s.archived_at is null
      )
  ) then
    raise exception 'Unknown service' using errcode = 'P0001', hint = 'unknown_service';
  end if;

  select coalesce(array_agg(x.id) filter (where x.id is not null), '{}') into v_ids
  from private.parse_service_list(p_services) x;

  select s.name into v_blocking
  from public.services s
  where s.business_id = v_business_id
    and s.archived_at is null
    and s.id <> all (v_ids)
    and exists (
      select 1 from public.bookings b
      where b.business_id = v_business_id
        and b.service_id = s.id
        and b.status = 'confirmed'
        and b.ends_at > now()
    )
  order by s.position
  limit 1;
  if v_blocking is not null then
    raise exception 'Service has upcoming bookings'
      using errcode = 'P0001', hint = 'service_has_future_bookings', detail = v_blocking;
  end if;

  update public.services
  set archived_at = now()
  where business_id = v_business_id
    and archived_at is null
    and id <> all (v_ids);

  update public.services s
  set name = x.name,
      duration_minutes = x.duration_minutes,
      buffer_minutes = x.buffer_minutes,
      position = x.position
  from private.parse_service_list(p_services) x
  where s.id = x.id and s.business_id = v_business_id;

  insert into public.services (business_id, name, duration_minutes, buffer_minutes, position)
  select v_business_id, x.name, x.duration_minutes, x.buffer_minutes, x.position
  from private.parse_service_list(p_services) x
  where x.id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Usage ledger (internal)
--
-- One row per billable or measurable thing Pingflow does for a business: a
-- model call, a WhatsApp message, an email. It exists so real unit costs
-- can be answered later ("what did this business cost us this month?")
-- without digging through logs. Nothing writes to it yet; it is filled by
-- server-side integration code through src/lib/usage.
--
-- Costs are stored in micro-units (millionths of the currency) because a
-- single model call can cost a fraction of a penny. Raw quantities (tokens,
-- message category, destination) are kept so costs can be recomputed if
-- prices change.
--
-- Owners can't read or write it: it holds our costs, not theirs. Row level
-- security is on with no policies for signed-in users, and table privileges
-- are revoked; only the server's secret key can use it.
-- ---------------------------------------------------------------------------

create type public.usage_category as enum ('ai', 'whatsapp', 'email', 'other');

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  category public.usage_category not null,
  -- e.g. "openai", "meta", "resend"
  provider text not null check (provider ~ '^[a-z0-9_.-]{1,40}$'),
  -- e.g. "interpret_message", "send_template"
  operation text not null check (operation ~ '^[a-z0-9_.-]{1,60}$'),
  quantity numeric(14, 4) not null default 1 check (quantity >= 0),
  -- e.g. "request", "message", "email"
  unit text not null default 'event' check (unit ~ '^[a-z_]{1,20}$'),
  -- AI
  model text check (model is null or char_length(model) between 1 and 100),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens >= 0),
  -- Messaging
  message_category text check (message_category is null or char_length(message_category) between 1 and 40),
  destination_country char(2) check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),
  billable boolean,
  -- Cost, as estimated when recorded (null when unknown)
  estimated_cost_micros bigint check (estimated_cost_micros >= 0),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- The provider's own ID for the request or message
  external_reference text check (external_reference is null or char_length(external_reference) between 1 and 200),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check ((estimated_cost_micros is null) or (currency is not null)),
  -- A provider event recorded twice (webhooks retry) is stored once. Rows
  -- without a reference are never considered duplicates.
  constraint usage_events_external_reference_key unique (provider, operation, external_reference)
);

create index usage_events_business_time_idx on public.usage_events (business_id, occurred_at);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges for the new functions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon;

grant execute on function private.lock_business_schedule(uuid) to authenticated;
grant execute on function private.guard_booking_slot() to authenticated;
grant execute on function private.guard_block_slot() to authenticated;
grant execute on function private.parse_service_list(jsonb) to authenticated;

-- Server-side code with the secret key (the demo seed now; integrations
-- later) writes bookings too, so the guards must run for it as well.
grant usage on schema private to service_role;
grant execute on function private.lock_business_schedule(uuid) to service_role;
grant execute on function private.guard_booking_slot() to service_role;
grant execute on function private.guard_block_slot() to service_role;
grant execute on function private.touch_updated_at() to service_role;

grant execute on function public.set_schedule(public.schedule_mode, jsonb) to authenticated;
grant execute on function public.create_customer_booking(text, uuid, timestamptz, text, public.contact_relationship, text, timestamptz) to authenticated;
grant execute on function public.save_services(jsonb) to authenticated;
