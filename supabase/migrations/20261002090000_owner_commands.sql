-- Owner commands over WhatsApp: the owner messages their own business number
-- ("Who have I got tomorrow?", "Move Sarah to Friday at 4") and Pingflow
-- answers or acts.
--
--   owner_channel_identities   the one address, per channel, that is the
--                              owner. Set by the server only; nothing is
--                              inferred from names or wording.
--   private.*_as_owner         the owner's booking and block changes, for a
--                              given business: the same code the web app
--                              runs (its functions now call these)
--   complete_owner_command     applies an owner command exactly once, with
--                              the reply, re-checking the booking as it goes

-- ---------------------------------------------------------------------------
-- 1. Owner identity
-- ---------------------------------------------------------------------------

create table public.owner_channel_identities (
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  address_e164 text not null check (address_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, channel)
);

create trigger owner_channel_identities_touch before update on public.owner_channel_identities
  for each row execute function private.touch_updated_at();

alter table public.owner_channel_identities enable row level security;
revoke all on public.owner_channel_identities from anon, authenticated;

-- Owners can see it (Settings says whether it's set up); only the server
-- sets it, because whoever it names can change the schedule.
grant select on public.owner_channel_identities to authenticated;
create policy "Owners see their own identity" on public.owner_channel_identities
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- 2. The owner's schedule changes, for a given business
--
-- Bodies moved from move_booking, cancel_booking and add_schedule_block,
-- which now call these with the signed-in owner's business. p_via says
-- where the owner made the change ('whatsapp'); the app passes null.
-- ---------------------------------------------------------------------------

create function private.move_booking_as_owner(
  p_business_id uuid,
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_reminder_send_at timestamptz,
  p_via text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_ends_at timestamptz;
  v_old_reminder_at timestamptz;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and business_id = p_business_id
  for update;
  if not found or v_booking.status <> 'confirmed' then
    raise exception 'Booking no longer active' using errcode = 'P0001', hint = 'booking_inactive';
  end if;
  if p_reminder_send_at is not null and p_reminder_send_at >= p_starts_at then
    raise exception 'Reminder after booking' using errcode = 'P0001', hint = 'invalid_reminder';
  end if;

  v_ends_at := p_starts_at + (v_booking.ends_at - v_booking.starts_at);

  update public.bookings set starts_at = p_starts_at, ends_at = v_ends_at where id = p_booking_id;

  perform private.close_requests_for_booking(p_booking_id, 'booking_moved');

  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
  values (p_business_id, 'booking_moved', 'owner', v_booking.customer_id, p_booking_id,
          jsonb_strip_nulls(jsonb_build_object(
            'from_starts_at', v_booking.starts_at,
            'from_ends_at', v_booking.ends_at,
            'to_starts_at', p_starts_at,
            'to_ends_at', v_ends_at,
            'via', p_via
          )));

  update public.reminders
  set status = 'cancelled'
  where booking_id = p_booking_id and status = 'scheduled'
  returning send_at into v_old_reminder_at;

  if p_reminder_send_at is not null then
    insert into public.reminders (business_id, booking_id, send_at)
    values (p_business_id, p_booking_id, p_reminder_send_at);

    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (p_business_id,
            case when v_old_reminder_at is null then 'reminder_scheduled' else 'reminder_rescheduled' end::public.activity_kind,
            'pingflow', v_booking.customer_id, p_booking_id,
            jsonb_strip_nulls(jsonb_build_object('from_send_at', v_old_reminder_at, 'send_at', p_reminder_send_at)));
  elsif v_old_reminder_at is not null then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (p_business_id, 'reminder_cancelled', 'pingflow', v_booking.customer_id, p_booking_id,
            jsonb_build_object('send_at', v_old_reminder_at));
  end if;
end;
$$;

create function private.cancel_booking_as_owner(
  p_business_id uuid,
  p_booking_id uuid,
  p_via text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_old_reminder_at timestamptz;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and business_id = p_business_id
  for update;
  if not found or v_booking.status <> 'confirmed' then
    raise exception 'Booking no longer active' using errcode = 'P0001', hint = 'booking_inactive';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;

  perform private.close_requests_for_booking(p_booking_id, 'booking_cancelled');

  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
  values (p_business_id, 'booking_cancelled', 'owner', v_booking.customer_id, p_booking_id,
          jsonb_strip_nulls(jsonb_build_object(
            'starts_at', v_booking.starts_at, 'ends_at', v_booking.ends_at, 'via', p_via)));

  update public.reminders
  set status = 'cancelled'
  where booking_id = p_booking_id and status = 'scheduled'
  returning send_at into v_old_reminder_at;

  if v_old_reminder_at is not null then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (p_business_id, 'reminder_cancelled', 'pingflow', v_booking.customer_id, p_booking_id,
            jsonb_build_object('send_at', v_old_reminder_at));
  end if;
end;
$$;

create function private.add_schedule_block_as_owner(
  p_business_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_label text,
  p_via text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_block_id uuid;
begin
  -- The block guard refuses one that covers a booking.
  insert into public.schedule_blocks (business_id, starts_at, ends_at, label)
  values (p_business_id, p_starts_at, p_ends_at, nullif(btrim(p_label), ''))
  returning id into v_block_id;

  insert into public.activity_events (business_id, kind, actor, details)
  values (p_business_id, 'time_blocked', 'owner',
          jsonb_strip_nulls(jsonb_build_object(
            'starts_at', p_starts_at, 'ends_at', p_ends_at,
            'label', nullif(btrim(p_label), ''), 'via', p_via)));

  return v_block_id;
end;
$$;

create or replace function public.move_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_reminder_send_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
begin
  perform private.move_booking_as_owner(v_business_id, p_booking_id, p_starts_at, p_reminder_send_at, null);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
begin
  perform private.cancel_booking_as_owner(v_business_id, p_booking_id, null);
end;
$$;

create or replace function public.add_schedule_block(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_label text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
begin
  return private.add_schedule_block_as_owner(v_business_id, p_starts_at, p_ends_at, p_label, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ingest: the owner's own messages aren't customer activity
-- ---------------------------------------------------------------------------

create or replace function public.ingest_inbound_message(
  p_business_id uuid,
  p_phone_e164 text,
  p_body text,
  p_received_at timestamptz,
  p_external_id text,
  p_source public.message_source default 'whatsapp',
  p_content_type text default 'text'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_run public.message_processing_runs%rowtype;
  v_created boolean := false;
  v_customer_id uuid;
  v_from_owner boolean;
begin
  if p_external_id is null or p_body is null or btrim(p_body) = '' then
    raise exception 'A message needs a body and an external ID'
      using errcode = 'P0001', hint = 'invalid_message';
  end if;

  -- The same delivery twice: return what's already there.
  select id, conversation_id into v_message_id, v_conversation_id
  from public.messages
  where business_id = p_business_id and external_id = p_external_id;

  if v_message_id is null then
    -- An unknown number still gets a contact, so the conversation has a
    -- home; it just isn't linked to any customer.
    insert into public.contacts (business_id, phone_e164)
    values (p_business_id, p_phone_e164)
    on conflict (business_id, phone_e164) do update set phone_e164 = excluded.phone_e164
    returning id into v_contact_id;

    insert into public.conversations (business_id, contact_id)
    values (p_business_id, v_contact_id)
    on conflict (business_id, contact_id, channel) do update set channel = excluded.channel
    returning id into v_conversation_id;

    insert into public.messages (
      business_id, conversation_id, direction, author, body, delivery,
      sent_at, source, external_id, content_type
    )
    values (
      p_business_id, v_conversation_id, 'inbound', 'contact', p_body, 'received',
      coalesce(p_received_at, now()), p_source, p_external_id, coalesce(p_content_type, 'text')
    )
    on conflict (business_id, external_id) where external_id is not null do nothing
    returning id into v_message_id;

    if v_message_id is null then
      -- Lost a race with the same delivery.
      select id, conversation_id into v_message_id, v_conversation_id
      from public.messages
      where business_id = p_business_id and external_id = p_external_id;
    else
      v_created := true;
      update public.conversations
      set last_message_at = greatest(coalesce(last_message_at, 'epoch'), coalesce(p_received_at, now()))
      where id = v_conversation_id;

      select exists (
        select 1 from public.owner_channel_identities
        where business_id = p_business_id and channel = 'whatsapp' and address_e164 = p_phone_e164
      ) into v_from_owner;

      -- The owner talking to Pingflow isn't a customer message.
      if not v_from_owner then
        -- Attribute it to the customer when the number has exactly one.
        select min(cc.customer_id::text)::uuid into v_customer_id
        from public.customer_contacts cc
        where cc.contact_id = v_contact_id
        having count(*) = 1;

        insert into public.activity_events (business_id, occurred_at, kind, actor, customer_id, message_id, details)
        values (p_business_id, coalesce(p_received_at, now()), 'message_received', 'contact',
                v_customer_id, v_message_id,
                jsonb_build_object('source', p_source, 'content_type', coalesce(p_content_type, 'text')));
      end if;
    end if;
  end if;

  insert into public.message_processing_runs (business_id, message_id, conversation_id)
  values (p_business_id, v_message_id, v_conversation_id)
  on conflict (message_id) do nothing;

  select * into v_run from public.message_processing_runs where message_id = v_message_id;

  return jsonb_build_object(
    'message_id', v_message_id,
    'conversation_id', v_conversation_id,
    'run_id', v_run.id,
    'run_status', v_run.status,
    'created', v_created
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Completing an owner command (server only)
--
-- p_result: {
--   interpreter, model, prompt_version, interpretation, decision,
--   decision_detail,
--   reply:          the answer, or the confirmation if a change succeeds,
--   conflict_reply: what to say if the change can no longer be made,
--   mutation:       null
--                 | {kind: 'reschedule', booking_id, expected_starts_at, starts_at, reminder_send_at}
--                 | {kind: 'cancel', booking_id, expected_starts_at}
--                 | {kind: 'block', starts_at, ends_at, label},
--   clarification:  {"set": {...}} | {"clear": true} | null
-- }
--
-- The change runs here, inside the run's own transaction: a repeated
-- webhook finds the run completed and changes nothing. The booking must
-- still be where it was when the owner asked; the booking and block guards
-- re-check the time as it's written. If either fails, nothing changes and
-- the owner is told.
-- ---------------------------------------------------------------------------

create function public.complete_owner_command(
  p_run_id uuid,
  p_attempt integer,
  p_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.message_processing_runs%rowtype;
  v_message public.messages%rowtype;
  v_mutation jsonb := p_result -> 'mutation';
  v_booking public.bookings%rowtype;
  v_outcome text := 'answered';
  v_error text;
  v_reply text;
  v_reply_id uuid;
  v_created jsonb;
begin
  select * into v_run from public.message_processing_runs where id = p_run_id for update;
  if not found then
    raise exception 'Run not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_run.status = 'completed' then
    return v_run.decision_detail -> 'created';
  end if;
  if v_run.status <> 'processing' or v_run.attempts <> p_attempt then
    raise exception 'Run was taken over' using errcode = 'P0001', hint = 'stale_attempt';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pingflow.conversation:' || v_run.conversation_id::text, 0));
  select * into v_message from public.messages where id = v_run.message_id;

  if v_mutation is not null and jsonb_typeof(v_mutation) = 'object' then
    begin
      if v_mutation ->> 'kind' in ('reschedule', 'cancel') then
        select * into v_booking from public.bookings
        where id = (v_mutation ->> 'booking_id')::uuid and business_id = v_run.business_id
        for update;
        if not found
           or v_booking.status <> 'confirmed'
           or v_booking.starts_at <> (v_mutation ->> 'expected_starts_at')::timestamptz then
          v_outcome := 'stale';
        end if;
      end if;

      if v_outcome = 'answered' then
        case v_mutation ->> 'kind'
          when 'reschedule' then
            perform private.move_booking_as_owner(
              v_run.business_id,
              (v_mutation ->> 'booking_id')::uuid,
              (v_mutation ->> 'starts_at')::timestamptz,
              (v_mutation ->> 'reminder_send_at')::timestamptz,
              'whatsapp');
          when 'cancel' then
            perform private.cancel_booking_as_owner(
              v_run.business_id, (v_mutation ->> 'booking_id')::uuid, 'whatsapp');
          when 'block' then
            perform private.add_schedule_block_as_owner(
              v_run.business_id,
              (v_mutation ->> 'starts_at')::timestamptz,
              (v_mutation ->> 'ends_at')::timestamptz,
              v_mutation ->> 'label',
              'whatsapp');
          else
            raise exception 'Unknown change' using errcode = 'P0001', hint = 'invalid_mutation';
        end case;
        v_outcome := 'changed';
      end if;
    exception
      -- The time was taken or the booking changed since Pingflow checked:
      -- the change is undone, and the owner is told nothing changed.
      when exclusion_violation or raise_exception then
        get stacked diagnostics v_error = pg_exception_hint;
        if v_error = 'invalid_mutation' then
          raise;
        end if;
        v_outcome := 'conflict';
    end;
  end if;

  v_reply := case when v_outcome in ('stale', 'conflict')
                  then p_result ->> 'conflict_reply'
                  else p_result ->> 'reply' end;

  if v_reply is not null and btrim(v_reply) <> '' then
    insert into public.messages (
      business_id, conversation_id, direction, author, body, delivery, source, processing_run_id
    )
    values (
      v_run.business_id, v_run.conversation_id, 'outbound', 'pingflow', v_reply,
      'simulated', v_message.source, v_run.id
    )
    returning id into v_reply_id;
    update public.conversations set last_message_at = now() where id = v_run.conversation_id;
  end if;

  if v_outcome in ('stale', 'conflict') or p_result -> 'clarification' ? 'clear' then
    update public.conversations set clarification = null where id = v_run.conversation_id;
  elsif p_result -> 'clarification' ? 'set' then
    update public.conversations
    set clarification = p_result -> 'clarification' -> 'set'
    where id = v_run.conversation_id;
  end if;

  v_created := jsonb_strip_nulls(jsonb_build_object(
    'reply_message_id', v_reply_id,
    'outcome', v_outcome
  ));

  update public.message_processing_runs
  set status = 'completed',
      completed_at = now(),
      interpreter = p_result ->> 'interpreter',
      model = p_result ->> 'model',
      prompt_version = p_result ->> 'prompt_version',
      interpretation = p_result -> 'interpretation',
      decision = p_result ->> 'decision',
      decision_detail = coalesce(p_result -> 'decision_detail', '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object('created', v_created, 'error', v_error)),
      error_category = null
  where id = v_run.id;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon;

-- The app's functions call the cores as the signed-in owner (row level
-- security still applies inside them); the server calls them for commands.
grant execute on function private.move_booking_as_owner(uuid, uuid, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function private.cancel_booking_as_owner(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.add_schedule_block_as_owner(uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
-- Moving or cancelling closes any open request for that booking.
grant execute on function private.close_requests_for_booking(uuid, text) to service_role;

revoke all on function public.complete_owner_command(uuid, integer, jsonb) from authenticated;
grant execute on function public.complete_owner_command(uuid, integer, jsonb) to service_role;
revoke all on function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source, text) from authenticated;
grant execute on function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source, text) to service_role;
