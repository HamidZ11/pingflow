-- Inbound message processing.
--
-- A customer's message is handled in phases, so the slow part (reading the
-- language) never sits inside a database transaction:
--
--   1. ingest_inbound_message    store the message (once per external ID)
--                                and open a processing run for it
--   2. claim_message_run         take the run to work on it
--   3. (outside the database)    interpret the message, decide what to do
--   4. complete_message_run      apply the decision in one transaction:
--                                reply, approval or owner task, the
--                                clarification state, activity
--      fail_message_run          or record that it couldn't be read, and
--                                hand the message to the owner
--
-- These run as the server (the service role), not as an owner: a future
-- WhatsApp webhook has no signed-in user. They are granted to service_role
-- only, take the business explicitly, and every row they touch is tied to
-- it by composite foreign keys.
--
-- Idempotency: a message's external ID (the provider's message ID, or a
-- simulation ID) is unique per business, a run is unique per message, a run
-- completes once, a run sends at most one reply, and a message raises at
-- most one open Attention item.
--
-- Concurrency: runs for one conversation are handled one at a time, oldest
-- message first. Different conversations never wait for each other.

-- ---------------------------------------------------------------------------
-- Messages: where they came from, and which run replied
-- ---------------------------------------------------------------------------

create type public.message_source as enum ('whatsapp', 'simulator');

alter table public.messages
  add column source public.message_source not null default 'whatsapp',
  add column external_id text
    check (external_id is null or char_length(external_id) between 1 and 200),
  add column processing_run_id uuid;

create unique index messages_external_id_key
  on public.messages (business_id, external_id)
  where external_id is not null;

-- ---------------------------------------------------------------------------
-- Conversations: an open clarifying question
-- {"intent", "topic", "question", "message_id", "customer_id", "turns"}
-- ---------------------------------------------------------------------------

alter table public.conversations add column clarification jsonb;

-- ---------------------------------------------------------------------------
-- Processing runs (internal)
-- ---------------------------------------------------------------------------

create type public.processing_status as enum ('pending', 'processing', 'completed', 'failed');

create table public.message_processing_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  message_id uuid not null,
  conversation_id uuid not null,
  status public.processing_status not null default 'pending',
  attempts integer not null default 0,
  claimed_at timestamptz,
  -- Which interpreter read it, and how. The message text itself stays in
  -- messages; it isn't copied here.
  interpreter text,
  model text,
  prompt_version text,
  interpretation jsonb,
  decision text,
  decision_detail jsonb,
  error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (message_id),
  unique (business_id, id),
  foreign key (business_id, message_id)
    references public.messages (business_id, id) on delete cascade,
  foreign key (business_id, conversation_id)
    references public.conversations (business_id, id) on delete cascade
);

create index message_processing_runs_conversation_idx
  on public.message_processing_runs (conversation_id, status);
create index message_processing_runs_business_idx
  on public.message_processing_runs (business_id, created_at desc);

create trigger message_processing_runs_touch before update on public.message_processing_runs
  for each row execute function private.touch_updated_at();

-- Owners don't see processing internals (interpreter, model, raw
-- interpretation); what they need is on the message, the Attention item
-- and Activity.
alter table public.message_processing_runs enable row level security;
revoke all on public.message_processing_runs from anon, authenticated;

alter table public.messages
  add constraint messages_processing_run_fkey
  foreign key (business_id, processing_run_id)
  references public.message_processing_runs (business_id, id)
  on delete set null (processing_run_id);

-- At most one automatic reply per run.
create unique index messages_one_reply_per_run
  on public.messages (processing_run_id)
  where processing_run_id is not null;

-- A message raises at most one open Attention item.
create unique index pending_actions_one_open_per_message
  on public.pending_actions (source_message_id)
  where source_message_id is not null and status = 'open';

-- ---------------------------------------------------------------------------
-- Activity: an owner's attention needed on a message
-- ---------------------------------------------------------------------------

alter type public.activity_kind add value if not exists 'reply_needed';

-- ---------------------------------------------------------------------------
-- 1. Ingest
-- ---------------------------------------------------------------------------

create function public.ingest_inbound_message(
  p_business_id uuid,
  p_phone_e164 text,
  p_body text,
  p_received_at timestamptz,
  p_external_id text,
  p_source public.message_source default 'whatsapp'
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
      sent_at, source, external_id
    )
    values (
      p_business_id, v_conversation_id, 'inbound', 'contact', p_body, 'received',
      coalesce(p_received_at, now()), p_source, p_external_id
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

      -- Attribute it to the customer when the number has exactly one.
      select min(cc.customer_id::text)::uuid into v_customer_id
      from public.customer_contacts cc
      where cc.contact_id = v_contact_id
      having count(*) = 1;

      insert into public.activity_events (business_id, occurred_at, kind, actor, customer_id, message_id, details)
      values (p_business_id, coalesce(p_received_at, now()), 'message_received', 'contact',
              v_customer_id, v_message_id, jsonb_build_object('source', p_source));
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
-- 2. Claim
--
-- Returns the attempt number, or null if the run can't be worked on now:
-- it's done, someone else is working on it, or an earlier message in the
-- same conversation hasn't been handled yet. A run whose worker vanished
-- (claimed more than two minutes ago) can be claimed again.
-- ---------------------------------------------------------------------------

create function public.claim_message_run(p_run_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.message_processing_runs%rowtype;
  v_sent_at timestamptz;
  v_stale interval := interval '2 minutes';
begin
  select * into v_run from public.message_processing_runs where id = p_run_id for update;
  if not found or v_run.status = 'completed' then
    return null;
  end if;
  if v_run.status = 'processing' and v_run.claimed_at > now() - v_stale then
    return null;
  end if;

  select sent_at into v_sent_at from public.messages where id = v_run.message_id;
  if exists (
    select 1
    from public.message_processing_runs r
    join public.messages m on m.id = r.message_id
    where r.conversation_id = v_run.conversation_id
      and r.id <> v_run.id
      and m.sent_at < v_sent_at
      and (r.status = 'pending' or (r.status = 'processing' and r.claimed_at > now() - v_stale))
  ) then
    return null;
  end if;

  update public.message_processing_runs
  set status = 'processing', attempts = attempts + 1, claimed_at = now(), error_category = null
  where id = p_run_id
  returning attempts into v_run.attempts;

  return v_run.attempts;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Complete
--
-- p_result: {
--   interpreter, model, prompt_version, interpretation, decision,
--   decision_detail,
--   customer_id,
--   reply:          {kind, body} | null,
--   approval:       {kind, booking_id, customer_id, understood,
--                    proposed_starts_at, proposed_ends_at} | null,
--   owner_task:     {reason, intent, draft} | null,
--   clarification:  {"set": {...}} | {"clear": true} | null,
--   activity:       [{kind, actor, details, customer_id, booking_id, link}]
-- }
-- ---------------------------------------------------------------------------

create function public.complete_message_run(
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
  v_reply_id uuid;
  v_action_id uuid;
  v_task_id uuid;
  v_superseded public.pending_actions%rowtype;
  v_item jsonb;
  v_approval jsonb := p_result -> 'approval';
  v_task jsonb := p_result -> 'owner_task';
  v_reply jsonb := p_result -> 'reply';
  v_created jsonb;
begin
  select * into v_run from public.message_processing_runs where id = p_run_id for update;
  if not found then
    raise exception 'Run not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  -- Already done (a retry after a lost response): nothing happens twice.
  if v_run.status = 'completed' then
    return v_run.decision_detail -> 'created';
  end if;
  if v_run.status <> 'processing' or v_run.attempts <> p_attempt then
    raise exception 'Run was taken over' using errcode = 'P0001', hint = 'stale_attempt';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pingflow.conversation:' || v_run.conversation_id::text, 0));
  select * into v_message from public.messages where id = v_run.message_id;

  -- A retried run replaces what an earlier failed attempt raised.
  update public.pending_actions
  set status = 'dismissed', resolved_at = now(), resolution = jsonb_build_object('reason', 'reprocessed')
  where source_message_id = v_run.message_id and status = 'open';

  if v_reply is not null and jsonb_typeof(v_reply) = 'object' then
    insert into public.messages (
      business_id, conversation_id, direction, author, body, delivery, source, processing_run_id
    )
    values (
      v_run.business_id, v_run.conversation_id, 'outbound', 'pingflow', v_reply ->> 'body',
      'simulated', v_message.source, v_run.id
    )
    returning id into v_reply_id;
    update public.conversations set last_message_at = now() where id = v_run.conversation_id;
  end if;

  if v_approval is not null and jsonb_typeof(v_approval) = 'object' then
    -- A newer request about the same booking replaces the older one.
    if v_approval ->> 'booking_id' is not null then
      for v_superseded in
        update public.pending_actions
        set status = 'dismissed', resolved_at = now(), resolution = jsonb_build_object('reason', 'superseded')
        where business_id = v_run.business_id
          and booking_id = (v_approval ->> 'booking_id')::uuid
          and status = 'open'
        returning *
      loop
        insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
        values (v_run.business_id, 'request_closed', 'pingflow', v_superseded.customer_id,
                v_superseded.booking_id, v_superseded.id, jsonb_build_object('reason', 'superseded'));
      end loop;
    end if;

    insert into public.pending_actions (
      business_id, kind, conversation_id, customer_id, booking_id, source_message_id,
      understood, proposed_starts_at, proposed_ends_at, created_at
    )
    values (
      v_run.business_id,
      (v_approval ->> 'kind')::public.pending_action_kind,
      v_run.conversation_id,
      (v_approval ->> 'customer_id')::uuid,
      (v_approval ->> 'booking_id')::uuid,
      v_run.message_id,
      coalesce(v_approval -> 'understood', '{}'::jsonb),
      (v_approval ->> 'proposed_starts_at')::timestamptz,
      (v_approval ->> 'proposed_ends_at')::timestamptz,
      v_message.sent_at
    )
    returning id into v_action_id;
  end if;

  if v_task is not null and jsonb_typeof(v_task) = 'object' then
    insert into public.pending_actions (
      business_id, kind, conversation_id, customer_id, source_message_id, understood, created_at
    )
    values (
      v_run.business_id, 'reply_needed', v_run.conversation_id,
      (p_result ->> 'customer_id')::uuid, v_run.message_id, v_task, v_message.sent_at
    )
    returning id into v_task_id;
  end if;

  if p_result -> 'clarification' ? 'set' then
    update public.conversations
    set clarification = p_result -> 'clarification' -> 'set'
    where id = v_run.conversation_id;
  elsif p_result -> 'clarification' ? 'clear' then
    update public.conversations set clarification = null where id = v_run.conversation_id;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_result -> 'activity', '[]'::jsonb))
  loop
    insert into public.activity_events (
      business_id, occurred_at, kind, actor, customer_id, booking_id,
      pending_action_id, message_id, details
    )
    values (
      v_run.business_id,
      v_message.sent_at,
      (v_item ->> 'kind')::public.activity_kind,
      (v_item ->> 'actor')::public.activity_actor,
      (v_item ->> 'customer_id')::uuid,
      (v_item ->> 'booking_id')::uuid,
      case v_item ->> 'link' when 'approval' then v_action_id when 'task' then v_task_id end,
      case when v_item ->> 'link' = 'reply' then v_reply_id end,
      coalesce(v_item -> 'details', '{}'::jsonb)
    );
  end loop;

  v_created := jsonb_strip_nulls(jsonb_build_object(
    'reply_message_id', v_reply_id,
    'pending_action_id', coalesce(v_action_id, v_task_id)
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
        || jsonb_build_object('created', v_created),
      error_category = null
  where id = v_run.id;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Fail: the message couldn't be read. It stays stored; the owner gets it.
-- ---------------------------------------------------------------------------

create function public.fail_message_run(
  p_run_id uuid,
  p_attempt integer,
  p_error_category text,
  p_interpreter text default null,
  p_model text default null,
  p_prompt_version text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.message_processing_runs%rowtype;
  v_message public.messages%rowtype;
  v_customer_id uuid;
  v_task_id uuid;
begin
  select * into v_run from public.message_processing_runs where id = p_run_id for update;
  if not found or v_run.status <> 'processing' or v_run.attempts <> p_attempt then
    return null;
  end if;
  select * into v_message from public.messages where id = v_run.message_id;

  select min(cc.customer_id::text)::uuid into v_customer_id
  from public.conversations c
  join public.customer_contacts cc on cc.contact_id = c.contact_id
  where c.id = v_run.conversation_id
  having count(*) = 1;

  -- One Attention item per message, however many attempts fail.
  select id into v_task_id
  from public.pending_actions
  where source_message_id = v_run.message_id and status = 'open';

  if v_task_id is null then
    insert into public.pending_actions (
      business_id, kind, conversation_id, customer_id, source_message_id, understood, created_at
    )
    values (
      v_run.business_id, 'reply_needed', v_run.conversation_id, v_customer_id, v_run.message_id,
      jsonb_build_object('reason', 'interpreter_unavailable'), v_message.sent_at
    )
    returning id into v_task_id;

    insert into public.activity_events (business_id, occurred_at, kind, actor, customer_id, pending_action_id, details)
    values (v_run.business_id, v_message.sent_at, 'reply_needed', 'pingflow', v_customer_id, v_task_id,
            jsonb_build_object('reason', 'interpreter_unavailable'));
  end if;

  update public.message_processing_runs
  set status = 'failed',
      error_category = p_error_category,
      interpreter = coalesce(p_interpreter, interpreter),
      model = coalesce(p_model, model),
      prompt_version = coalesce(p_prompt_version, prompt_version)
  where id = v_run.id;

  return jsonb_build_object('pending_action_id', v_task_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner answers to new booking and cancellation requests (like
-- resolve_reschedule_request, and with the same safeguards: signed-in
-- owner, row level security, the request must still be open).
-- ---------------------------------------------------------------------------

create function public.resolve_booking_request(
  p_action_id uuid,
  p_decision text,
  p_starts_at timestamptz default null,
  p_reply_body text default null,
  p_reminder_send_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_action public.pending_actions%rowtype;
  v_service public.services%rowtype;
  v_booking_id uuid;
  v_ends_at timestamptz;
  v_message_id uuid;
  v_status public.pending_action_status;
begin
  if v_owner is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_decision is null or p_decision not in ('approve', 'decline', 'take_over') then
    raise exception 'Unknown decision' using errcode = 'P0001', hint = 'invalid_decision';
  end if;

  select pa.* into v_action
  from public.pending_actions pa
  join public.businesses b on b.id = pa.business_id
  where pa.id = p_action_id and b.owner_id = v_owner
  for update of pa;
  if not found then
    raise exception 'Request not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_action.kind <> 'booking_request' then
    raise exception 'Not a booking request' using errcode = 'P0001', hint = 'wrong_kind';
  end if;
  if v_action.status <> 'open' then
    raise exception 'Request already handled' using errcode = 'P0001', hint = 'already_resolved';
  end if;

  if p_decision = 'approve' then
    if p_starts_at is null then
      raise exception 'A time is required' using errcode = 'P0001', hint = 'missing_time';
    end if;
    select * into v_service
    from public.services
    where id = (v_action.understood ->> 'service_id')::uuid
      and business_id = v_action.business_id
      and archived_at is null;
    if not found then
      raise exception 'Service not found' using errcode = 'P0001', hint = 'service_not_found';
    end if;
    if p_reminder_send_at is not null and p_reminder_send_at >= p_starts_at then
      raise exception 'Reminder after booking' using errcode = 'P0001', hint = 'invalid_reminder';
    end if;
    v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

    -- The slot guard re-checks the time as it's written.
    insert into public.bookings (business_id, customer_id, service_id, starts_at, ends_at, buffer_minutes)
    values (v_action.business_id, v_action.customer_id, v_service.id, p_starts_at, v_ends_at, v_service.buffer_minutes)
    returning id into v_booking_id;

    if p_reminder_send_at is not null then
      insert into public.reminders (business_id, booking_id, send_at)
      values (v_action.business_id, v_booking_id, p_reminder_send_at);
    end if;
    v_status := 'approved';
  elsif p_decision = 'decline' then
    if p_reply_body is null then
      raise exception 'Reply missing' using errcode = 'P0001', hint = 'missing_reply';
    end if;
    v_status := 'declined';
  else
    if p_reply_body is not null then
      raise exception 'Taking over sends nothing' using errcode = 'P0001', hint = 'unexpected_reply';
    end if;
    update public.conversations set automation_paused_at = now()
    where id = v_action.conversation_id and automation_paused_at is null;
    v_status := 'taken_over';
  end if;

  if p_reply_body is not null then
    insert into public.messages (business_id, conversation_id, direction, author, body, delivery)
    values (v_action.business_id, v_action.conversation_id, 'outbound', 'pingflow', p_reply_body, 'simulated')
    returning id into v_message_id;
  end if;

  update public.pending_actions
  set status = v_status, resolved_at = now(), resolved_by = v_owner,
      booking_id = coalesce(v_booking_id, booking_id),
      resolution = jsonb_strip_nulls(jsonb_build_object('decision', p_decision, 'starts_at', p_starts_at))
  where id = v_action.id;

  if p_decision = 'approve' then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values
      (v_action.business_id, 'owner_approved', 'owner', v_action.customer_id, v_booking_id, v_action.id,
       jsonb_build_object('starts_at', p_starts_at, 'proposed_starts_at', v_action.proposed_starts_at, 'request_kind', 'booking_request')),
      (v_action.business_id, 'booking_created', 'pingflow', v_action.customer_id, v_booking_id, v_action.id,
       jsonb_build_object('starts_at', p_starts_at, 'ends_at', v_ends_at, 'service', v_service.name));
    if p_reminder_send_at is not null then
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
      values (v_action.business_id, 'reminder_scheduled', 'pingflow', v_action.customer_id, v_booking_id,
              jsonb_build_object('send_at', p_reminder_send_at));
    end if;
  elsif p_decision = 'decline' then
    insert into public.activity_events (business_id, kind, actor, customer_id, pending_action_id, details)
    values (v_action.business_id, 'owner_declined', 'owner', v_action.customer_id, v_action.id, '{}');
  else
    insert into public.activity_events (business_id, kind, actor, customer_id, pending_action_id, details)
    values (v_action.business_id, 'owner_took_over', 'owner', v_action.customer_id, v_action.id, '{}');
  end if;
  if v_message_id is not null then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, message_id, details)
    values (v_action.business_id,
            case when p_decision = 'approve' then 'confirmation_sent' else 'reply_sent' end::public.activity_kind,
            'pingflow', v_action.customer_id, v_booking_id, v_action.id, v_message_id,
            jsonb_build_object('delivery', 'simulated'));
  end if;
end;
$$;

create function public.resolve_cancellation_request(
  p_action_id uuid,
  p_decision text,
  p_reply_body text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_action public.pending_actions%rowtype;
  v_booking public.bookings%rowtype;
  v_message_id uuid;
  v_status public.pending_action_status;
  v_old_reminder_at timestamptz;
begin
  if v_owner is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_decision is null or p_decision not in ('approve', 'decline', 'take_over') then
    raise exception 'Unknown decision' using errcode = 'P0001', hint = 'invalid_decision';
  end if;

  select pa.* into v_action
  from public.pending_actions pa
  join public.businesses b on b.id = pa.business_id
  where pa.id = p_action_id and b.owner_id = v_owner
  for update of pa;
  if not found then
    raise exception 'Request not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_action.kind <> 'cancellation_request' then
    raise exception 'Not a cancellation request' using errcode = 'P0001', hint = 'wrong_kind';
  end if;
  if v_action.status <> 'open' then
    raise exception 'Request already handled' using errcode = 'P0001', hint = 'already_resolved';
  end if;

  if p_decision = 'approve' then
    select * into v_booking
    from public.bookings
    where id = v_action.booking_id and business_id = v_action.business_id
    for update;
    if not found or v_booking.status <> 'confirmed' then
      raise exception 'Booking no longer active' using errcode = 'P0001', hint = 'booking_inactive';
    end if;
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_booking.id;
    update public.reminders set status = 'cancelled'
    where booking_id = v_booking.id and status = 'scheduled'
    returning send_at into v_old_reminder_at;
    v_status := 'approved';
  elsif p_decision = 'decline' then
    if p_reply_body is null then
      raise exception 'Reply missing' using errcode = 'P0001', hint = 'missing_reply';
    end if;
    v_status := 'declined';
  else
    if p_reply_body is not null then
      raise exception 'Taking over sends nothing' using errcode = 'P0001', hint = 'unexpected_reply';
    end if;
    update public.conversations set automation_paused_at = now()
    where id = v_action.conversation_id and automation_paused_at is null;
    v_status := 'taken_over';
  end if;

  if p_reply_body is not null then
    insert into public.messages (business_id, conversation_id, direction, author, body, delivery)
    values (v_action.business_id, v_action.conversation_id, 'outbound', 'pingflow', p_reply_body, 'simulated')
    returning id into v_message_id;
  end if;

  update public.pending_actions
  set status = v_status, resolved_at = now(), resolved_by = v_owner,
      resolution = jsonb_build_object('decision', p_decision)
  where id = v_action.id;

  if p_decision = 'approve' then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values
      (v_action.business_id, 'owner_approved', 'owner', v_action.customer_id, v_booking.id, v_action.id,
       jsonb_build_object('request_kind', 'cancellation_request')),
      (v_action.business_id, 'booking_cancelled', 'pingflow', v_action.customer_id, v_booking.id, v_action.id,
       jsonb_build_object('starts_at', v_booking.starts_at, 'ends_at', v_booking.ends_at));
    if v_old_reminder_at is not null then
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
      values (v_action.business_id, 'reminder_cancelled', 'pingflow', v_action.customer_id, v_booking.id,
              jsonb_build_object('send_at', v_old_reminder_at));
    end if;
  elsif p_decision = 'decline' then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (v_action.business_id, 'owner_declined', 'owner', v_action.customer_id, v_action.booking_id, v_action.id, '{}');
  else
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (v_action.business_id, 'owner_took_over', 'owner', v_action.customer_id, v_action.booking_id, v_action.id, '{}');
  end if;
  if v_message_id is not null then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, message_id, details)
    values (v_action.business_id,
            case when p_decision = 'approve' then 'confirmation_sent' else 'reply_sent' end::public.activity_kind,
            'pingflow', v_action.customer_id, v_action.booking_id, v_action.id, v_message_id,
            jsonb_build_object('delivery', 'simulated'));
  end if;
end;
$$;

-- The owner answers a message themselves ("Reply" on a Needs-a-reply item).
-- Recorded as their reply (simulated until WhatsApp is connected), and the
-- item is done.
create function public.reply_to_pending_action(p_action_id uuid, p_body text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_action public.pending_actions%rowtype;
  v_message_id uuid;
begin
  if v_owner is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4096 then
    raise exception 'Write a reply' using errcode = 'P0001', hint = 'missing_reply';
  end if;

  select pa.* into v_action
  from public.pending_actions pa
  join public.businesses b on b.id = pa.business_id
  where pa.id = p_action_id and b.owner_id = v_owner
  for update of pa;
  if not found then
    raise exception 'Request not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_action.status <> 'open' then
    raise exception 'Request already handled' using errcode = 'P0001', hint = 'already_resolved';
  end if;
  if v_action.conversation_id is null then
    raise exception 'No conversation to reply in' using errcode = 'P0001', hint = 'no_conversation';
  end if;

  insert into public.messages (business_id, conversation_id, direction, author, body, delivery)
  values (v_action.business_id, v_action.conversation_id, 'outbound', 'owner', btrim(p_body), 'simulated')
  returning id into v_message_id;
  update public.conversations set last_message_at = now() where id = v_action.conversation_id;

  update public.pending_actions
  set status = 'dismissed', resolved_at = now(), resolved_by = v_owner,
      resolution = jsonb_build_object('reason', 'owner_replied')
  where id = v_action.id;

  insert into public.activity_events (business_id, kind, actor, customer_id, pending_action_id, message_id, details)
  values (v_action.business_id, 'reply_sent', 'owner', v_action.customer_id, v_action.id, v_message_id,
          jsonb_build_object('delivery', 'simulated'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;

-- Message processing: the server only.
revoke all on function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source) from authenticated;
revoke all on function public.claim_message_run(uuid) from authenticated;
revoke all on function public.complete_message_run(uuid, integer, jsonb) from authenticated;
revoke all on function public.fail_message_run(uuid, integer, text, text, text, text) from authenticated;
grant execute on function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source) to service_role;
grant execute on function public.claim_message_run(uuid) to service_role;
grant execute on function public.complete_message_run(uuid, integer, jsonb) to service_role;
grant execute on function public.fail_message_run(uuid, integer, text, text, text, text) to service_role;

-- Owner answers.
grant execute on function public.resolve_booking_request(uuid, text, timestamptz, text, timestamptz) to authenticated;
grant execute on function public.resolve_cancellation_request(uuid, text, text) to authenticated;
grant execute on function public.reply_to_pending_action(uuid, text) to authenticated;
