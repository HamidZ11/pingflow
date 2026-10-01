-- APP 06: customer automation depth.
--
-- The request loop already works end to end (the pipeline raises requests,
-- the owner answers them in one transaction, the slot guard re-checks the
-- time as it's written, and the owner's own moves and cancellations close
-- requests about that booking). Two gaps close here:
--
--   1. complete_message_run: a newer booking request from the same customer
--      replaces their older one ("Actually 6 would be better"), as newer
--      requests about the same booking already did. The older request is
--      kept, closed, with superseded_by pointing at its replacement.
--   2. create_booking: when the owner books a customer themselves, that
--      customer's booking request still waiting in Attention closes
--      (booked_by_owner), so approving it later can't book them twice.
--
-- Both keep their signatures, grants and security invoker.

-- ---------------------------------------------------------------------------
-- 1. Superseding requests
-- ---------------------------------------------------------------------------

create or replace function public.complete_message_run(
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
  v_superseded_ids uuid[] := array[]::uuid[];
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
    -- A newer request replaces the older one it revises, so the owner never
    -- has two versions to answer: any request about the same booking, and
    -- a booking request from the same customer (a different time or day).
    -- The older one stays on record, closed, and says what replaced it.
    for v_superseded in
      update public.pending_actions
      set status = 'dismissed', resolved_at = now(), resolution = jsonb_build_object('reason', 'superseded')
      where business_id = v_run.business_id
        and status = 'open'
        and (
          (v_approval ->> 'booking_id' is not null
            and booking_id = (v_approval ->> 'booking_id')::uuid)
          or (v_approval ->> 'kind' = 'booking_request'
            and kind = 'booking_request'
            and customer_id = (v_approval ->> 'customer_id')::uuid)
        )
      returning *
    loop
      v_superseded_ids := v_superseded_ids || v_superseded.id;
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
      values (v_run.business_id, 'request_closed', 'pingflow', v_superseded.customer_id,
              v_superseded.booking_id, v_superseded.id, jsonb_build_object('reason', 'superseded'));
    end loop;

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

    update public.pending_actions
    set resolution = resolution || jsonb_build_object('superseded_by', v_action_id)
    where id = any (v_superseded_ids);
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
-- 2. The owner booking a customer themselves
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(
  p_customer_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_reminder_send_at timestamptz default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_service public.services%rowtype;
  v_booking_id uuid;
  v_ends_at timestamptz;
  v_action public.pending_actions%rowtype;
begin
  select * into v_service
  from public.services
  where id = p_service_id and business_id = v_business_id and archived_at is null;
  if not found then
    raise exception 'Service not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if not exists (select 1 from public.customers where id = p_customer_id and business_id = v_business_id) then
    raise exception 'Customer not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if p_reminder_send_at is not null and p_reminder_send_at >= p_starts_at then
    raise exception 'Reminder after booking' using errcode = 'P0001', hint = 'invalid_reminder';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);

  insert into public.bookings (business_id, customer_id, service_id, starts_at, ends_at, buffer_minutes)
  values (v_business_id, p_customer_id, p_service_id, p_starts_at, v_ends_at, v_service.buffer_minutes)
  returning id into v_booking_id;

  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
  values (v_business_id, 'booking_created', 'owner', p_customer_id, v_booking_id,
          jsonb_build_object('starts_at', p_starts_at, 'ends_at', v_ends_at, 'service', v_service.name));

  if p_reminder_send_at is not null then
    insert into public.reminders (business_id, booking_id, send_at)
    values (v_business_id, v_booking_id, p_reminder_send_at);

    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (v_business_id, 'reminder_scheduled', 'pingflow', p_customer_id, v_booking_id,
            jsonb_build_object('send_at', p_reminder_send_at));
  end if;

  -- The owner has booked this customer themselves. A booking request of
  -- theirs still waiting in Attention is answered by that: it closes,
  -- rather than offering to book them a second time.
  for v_action in
    update public.pending_actions
    set status = 'dismissed',
        resolved_at = now(),
        resolved_by = (select auth.uid()),
        resolution = jsonb_build_object('reason', 'booked_by_owner', 'booking_id', v_booking_id)
    where business_id = v_business_id
      and customer_id = p_customer_id
      and kind = 'booking_request'
      and status = 'open'
    returning *
  loop
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (v_business_id, 'request_closed', 'owner', p_customer_id, v_booking_id, v_action.id,
            jsonb_build_object('reason', 'booked_by_owner'));
  end loop;

  return v_booking_id;
end;
$$;
