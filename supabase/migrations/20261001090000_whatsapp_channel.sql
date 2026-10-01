-- The WhatsApp channel: a transport around the message pipeline.
--
--   whatsapp_connections   a business's WhatsApp Business number (one live)
--   whatsapp_events        the webhook inbox: every verified provider event,
--                          stored once, then processed by the worker
--   message_deliveries     the outbox: one row per outbound message that
--                          goes to WhatsApp, with dispatch bookkeeping
--   whatsapp_templates     approved templates for messages sent outside the
--                          24-hour customer service window
--
-- Outbound messages keep being created exactly where they are today, in the
-- same transaction as the booking change they report. A trigger decides the
-- route: with a live connection and a conversation that came in on WhatsApp
-- the message is queued for the worker; otherwise it's recorded as before.
-- The worker sends after commit, so a slow or failing provider never holds
-- a booking change open or rolls one back.
--
-- Internal tables are for the server (secret key) only. Owners see their
-- connection's status and number, and each message's delivery state.

-- ---------------------------------------------------------------------------
-- 1. Enum values
-- ---------------------------------------------------------------------------

-- queued: waiting for the worker; accepted: WhatsApp took it; then sent,
-- delivered and read from status webhooks. blocked: not allowed to send
-- (for example outside the service window without a template).
alter type public.message_delivery add value if not exists 'queued';
alter type public.message_delivery add value if not exists 'accepted';
alter type public.message_delivery add value if not exists 'delivered';
alter type public.message_delivery add value if not exists 'read';
alter type public.message_delivery add value if not exists 'blocked';

alter type public.reminder_status add value if not exists 'not_sent';

alter type public.activity_kind add value if not exists 'message_not_sent';
alter type public.activity_kind add value if not exists 'reminder_sent';
alter type public.activity_kind add value if not exists 'reminder_not_sent';

-- ---------------------------------------------------------------------------
-- 2. Connections
-- ---------------------------------------------------------------------------

create type public.whatsapp_connection_status as enum (
  'connecting',
  'connected',
  'needs_attention',
  'disconnected'
);

-- developer: credentials from the server's environment (one number, for
-- building and testing). embedded_signup: a customer's own number, through
-- Meta's onboarding (not available until Pingflow is a Tech Provider).
create type public.whatsapp_connection_mode as enum ('developer', 'embedded_signup');

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  mode public.whatsapp_connection_mode not null,
  status public.whatsapp_connection_status not null default 'connecting',
  waba_id text check (waba_id is null or waba_id ~ '^[0-9]{1,32}$'),
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{1,32}$'),
  display_phone_number text
    check (display_phone_number is null or display_phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  verified_name text check (verified_name is null or char_length(verified_name) <= 200),
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_webhook_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_error_category text
    check (last_error_category is null or last_error_category ~ '^[a-z_]{1,40}$'),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

-- One live connection per business, and a number routes to one business.
create unique index whatsapp_connections_live_business
  on public.whatsapp_connections (business_id) where status <> 'disconnected';
create unique index whatsapp_connections_live_number
  on public.whatsapp_connections (phone_number_id) where status <> 'disconnected';

create trigger whatsapp_connections_touch before update on public.whatsapp_connections
  for each row execute function private.touch_updated_at();

alter table public.whatsapp_connections enable row level security;
revoke all on public.whatsapp_connections from anon, authenticated;

-- Owners read what Settings shows. Meta's account and number IDs stay on
-- the server.
grant select (
  id, business_id, mode, status, display_phone_number, verified_name,
  connected_at, disconnected_at, last_inbound_at, last_outbound_at,
  last_error_category, last_error_at
) on public.whatsapp_connections to authenticated;
-- ...and may disconnect (a guard below allows nothing else).
grant update (status, disconnected_at) on public.whatsapp_connections to authenticated;

create policy "Owners see their WhatsApp connection" on public.whatsapp_connections
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners disconnect their WhatsApp connection" on public.whatsapp_connections
  for update to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create function private.guard_whatsapp_connection_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Signed-in owners can only disconnect; connecting goes through the server.
  if (select auth.role()) = 'authenticated'
     and not (new.status = 'disconnected' and old.status <> 'disconnected') then
    raise exception 'Only disconnecting is allowed here'
      using errcode = 'P0001', hint = 'not_allowed';
  end if;
  return new;
end;
$$;

create trigger whatsapp_connections_guard before update on public.whatsapp_connections
  for each row execute function private.guard_whatsapp_connection_update();

-- ---------------------------------------------------------------------------
-- 3. Messages: content type, and the delivery route
-- ---------------------------------------------------------------------------

-- What arrived. Only text is read; anything else goes to the owner.
alter table public.messages
  add column content_type text not null default 'text'
    check (content_type in (
      'text', 'image', 'audio', 'video', 'document', 'location', 'contacts',
      'interactive', 'unknown'
    ));

-- ---------------------------------------------------------------------------
-- 4. The outbox
-- ---------------------------------------------------------------------------

create type public.dispatch_state as enum ('queued', 'sending', 'done');

create table public.message_deliveries (
  message_id uuid primary key,
  business_id uuid not null,
  connection_id uuid not null,
  dispatch public.dispatch_state not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_message_id text
    check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  sent_via text check (sent_via is null or sent_via in ('text', 'template')),
  template_name text,
  error_category text check (error_category is null or error_category ~ '^[a-z_]{1,40}$'),
  error_code integer,
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, message_id)
    references public.messages (business_id, id) on delete cascade,
  foreign key (business_id, connection_id)
    references public.whatsapp_connections (business_id, id) on delete cascade
);

create unique index message_deliveries_provider_id
  on public.message_deliveries (connection_id, provider_message_id)
  where provider_message_id is not null;
create index message_deliveries_due
  on public.message_deliveries (next_attempt_at) where dispatch = 'queued';
create index message_deliveries_sending
  on public.message_deliveries (claimed_at) where dispatch = 'sending';

create trigger message_deliveries_touch before update on public.message_deliveries
  for each row execute function private.touch_updated_at();

alter table public.message_deliveries enable row level security;
revoke all on public.message_deliveries from anon, authenticated;

-- The route for a new outbound message. Runs as whoever inserts it (an
-- owner's approval, or the server), reading only what owners may read.
--   no live connection            recorded, not sent (as before)
--   last inbound came on WhatsApp queued for WhatsApp
--   last inbound came from the    recorded, not sent: a development
--   simulator                     message never reaches a real number
--   they've never messaged        blocked: nothing proactive to numbers
--                                 that haven't contacted this business
create function private.route_outbound_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_live boolean;
  v_source public.message_source;
begin
  if new.direction <> 'outbound' or new.delivery <> 'simulated' then
    return new;
  end if;
  select exists (
    select 1 from public.whatsapp_connections
    where business_id = new.business_id and status in ('connected', 'needs_attention')
  ) into v_live;
  if not v_live then
    return new;
  end if;
  select source into v_source
  from public.messages
  where conversation_id = new.conversation_id and direction = 'inbound'
  order by sent_at desc
  limit 1;
  if v_source = 'whatsapp' then
    new.delivery := 'queued';
  elsif v_source is null then
    new.delivery := 'blocked';
  end if;
  return new;
end;
$$;

create trigger messages_route_outbound before insert on public.messages
  for each row execute function private.route_outbound_message();

-- Queues the outbox row. Security definer because an owner's approval
-- inserts the message but must not be able to write the outbox itself; it
-- does exactly one thing, for exactly the row being inserted.
create function private.enqueue_whatsapp_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
begin
  if new.delivery::text <> 'queued' then
    return new;
  end if;
  select id into v_connection_id
  from public.whatsapp_connections
  where business_id = new.business_id and status in ('connected', 'needs_attention');
  if v_connection_id is not null then
    insert into public.message_deliveries (message_id, business_id, connection_id)
    values (new.id, new.business_id, v_connection_id)
    on conflict (message_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger messages_enqueue_whatsapp after insert on public.messages
  for each row execute function private.enqueue_whatsapp_delivery();

-- ---------------------------------------------------------------------------
-- 5. The webhook inbox
-- ---------------------------------------------------------------------------

create type public.whatsapp_event_kind as enum ('message', 'status', 'other');
create type public.whatsapp_event_status as enum (
  'pending', 'processing', 'done', 'ignored', 'unroutable', 'failed'
);

create table public.whatsapp_events (
  id uuid primary key default gen_random_uuid(),
  -- "message:<wamid>", "status:<wamid>:<status>", "other:<field>:<hash>".
  -- A retried delivery has the same key and is stored once.
  event_key text not null unique check (char_length(event_key) between 1 and 300),
  kind public.whatsapp_event_kind not null,
  phone_number_id text,
  connection_id uuid references public.whatsapp_connections (id) on delete set null,
  business_id uuid references public.businesses (id) on delete cascade,
  wa_message_id text,
  -- The customer's WhatsApp ID (their number, as digits), for ordering.
  sender text,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- The few fields processing needs. A message's text is removed once it
  -- has been stored as a Pingflow message.
  payload jsonb not null default '{}',
  status public.whatsapp_event_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  processed_at timestamptz,
  message_id uuid,
  error_category text check (error_category is null or error_category ~ '^[a-z_]{1,40}$')
);

create index whatsapp_events_pending on public.whatsapp_events (occurred_at)
  where status in ('pending', 'processing');
create index whatsapp_events_business on public.whatsapp_events (business_id, received_at desc);

alter table public.whatsapp_events enable row level security;
revoke all on public.whatsapp_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Templates
-- ---------------------------------------------------------------------------

create type public.template_purpose as enum (
  'booking_confirmation',
  'cancellation_confirmation',
  'appointment_reminder'
);

create table public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  connection_id uuid not null,
  purpose public.template_purpose not null,
  -- The template's name and language in WhatsApp Manager.
  name text not null check (char_length(name) <= 512 and name ~ '^[a-z0-9_]+$'),
  language text not null check (language ~ '^[a-z]{2,3}(_[A-Za-z]{2,4})?$'),
  -- Body parameters, in order, from Pingflow's fields (see
  -- src/domain/channel/templates.ts).
  parameters text[] not null default '{}',
  -- As WhatsApp last reported it: APPROVED, PENDING, REJECTED, PAUSED,
  -- DISABLED. Only APPROVED is ever sent. A send that WhatsApp refuses
  -- sets it to UNUSABLE until the next sync.
  provider_status text not null default 'UNKNOWN'
    check (provider_status ~ '^[A-Z_]{1,30}$'),
  status_checked_at timestamptz,
  last_error_code integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, purpose),
  foreign key (business_id, connection_id)
    references public.whatsapp_connections (business_id, id) on delete cascade
);

create trigger whatsapp_templates_touch before update on public.whatsapp_templates
  for each row execute function private.touch_updated_at();

alter table public.whatsapp_templates enable row level security;
revoke all on public.whatsapp_templates from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reminders link to the message that carried them
-- ---------------------------------------------------------------------------

alter table public.reminders add column message_id uuid;
alter table public.reminders
  add constraint reminders_message_fkey
  foreign key (business_id, message_id)
  references public.messages (business_id, id)
  on delete set null (message_id);
create unique index reminders_message_id on public.reminders (message_id)
  where message_id is not null;

-- ---------------------------------------------------------------------------
-- 8. Inbound: the pipeline's ingest, now with the content type
-- ---------------------------------------------------------------------------

drop function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source);

create function public.ingest_inbound_message(
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
-- 9. Inbox processing (server only)
-- ---------------------------------------------------------------------------

-- Takes the next event. A customer's messages are taken oldest first, one
-- at a time; an abandoned claim is taken again after the lease.
create function public.claim_whatsapp_event(p_lease_seconds integer default 120)
returns setof public.whatsapp_events
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update public.whatsapp_events e
  set status = 'processing', attempts = e.attempts + 1, claimed_at = now()
  where e.id = (
    select c.id
    from public.whatsapp_events c
    where (
        (c.status = 'pending' and (c.next_attempt_at is null or c.next_attempt_at <= now()))
        or (c.status = 'processing' and c.claimed_at < now() - make_interval(secs => p_lease_seconds))
      )
      and not exists (
        select 1 from public.whatsapp_events earlier
        where c.kind = 'message'
          and earlier.kind = 'message'
          and earlier.id <> c.id
          and earlier.connection_id is not distinct from c.connection_id
          and earlier.sender = c.sender
          and earlier.occurred_at < c.occurred_at
          and (
            earlier.status = 'pending'
            or (earlier.status = 'processing'
                and earlier.claimed_at >= now() - make_interval(secs => p_lease_seconds))
          )
      )
    order by c.occurred_at, c.received_at
    for update skip locked
    limit 1
  )
  returning e.*;
end;
$$;

create function public.finish_whatsapp_event(
  p_event_id uuid,
  p_attempt integer,
  p_status public.whatsapp_event_status,
  p_message_id uuid default null,
  p_error_category text default null,
  p_retry_at timestamptz default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.whatsapp_events
  set status = case when p_retry_at is not null then 'pending' else p_status end,
      next_attempt_at = p_retry_at,
      claimed_at = null,
      processed_at = case when p_retry_at is null then now() end,
      message_id = coalesce(p_message_id, message_id),
      error_category = p_error_category,
      -- The text now lives on the Pingflow message; don't keep a copy.
      payload = case when p_status = 'done' and p_retry_at is null then payload - 'text' else payload end
  where id = p_event_id and attempts = p_attempt and status = 'processing';
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Outbox dispatch (server only)
-- ---------------------------------------------------------------------------

-- Why a message exists, from the record: a reminder, a confirmation of a
-- change the owner approved, the owner's own reply, or Pingflow's reply.
create function private.message_purpose(p_message_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_booking_id uuid;
  v_author public.message_author;
begin
  select booking_id into v_booking_id from public.reminders where message_id = p_message_id;
  if found then
    return jsonb_build_object('purpose', 'reminder', 'booking_id', v_booking_id);
  end if;
  select booking_id into v_booking_id
  from public.activity_events
  where message_id = p_message_id and kind = 'confirmation_sent'
  limit 1;
  if found then
    return jsonb_build_object('purpose', 'confirmation', 'booking_id', v_booking_id);
  end if;
  select author into v_author from public.messages where id = p_message_id;
  return jsonb_build_object(
    'purpose', case when v_author = 'owner' then 'owner_reply' else 'reply' end,
    'booking_id', null
  );
end;
$$;

-- The customer this message is to, when the number has exactly one.
create function private.message_customer(p_message_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select b.customer_id
       from public.reminders r join public.bookings b on b.id = r.booking_id
      where r.message_id = p_message_id),
    (select min(cc.customer_id::text)::uuid
       from public.messages m
       join public.conversations c on c.id = m.conversation_id
       join public.customer_contacts cc on cc.contact_id = c.contact_id
      where m.id = p_message_id
     having count(*) = 1)
  );
$$;

-- Records that a message wasn't sent, once: in Activity always, and in
-- Attention when the owner can do something about it. A reminder is
-- routine: Activity only, and the reminder says so.
create function public.note_message_not_sent(
  p_message_id uuid,
  p_outcome text,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_purpose jsonb := private.message_purpose(p_message_id);
  v_customer_id uuid := private.message_customer(p_message_id);
  v_reminder public.reminders%rowtype;
begin
  select * into v_message from public.messages where id = p_message_id;
  if not found then
    return;
  end if;

  update public.reminders
  set status = case when p_outcome = 'failed' then 'failed' else 'not_sent' end::public.reminder_status
  where message_id = p_message_id and status = 'scheduled'
  returning * into v_reminder;
  if found then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, message_id, details)
    values (v_message.business_id, 'reminder_not_sent', 'pingflow', v_customer_id, v_reminder.booking_id,
            p_message_id, jsonb_build_object('reason', p_reason));
    return;
  end if;
  if v_purpose ->> 'purpose' = 'reminder' then
    return;
  end if;

  if exists (
    select 1 from public.activity_events
    where message_id = p_message_id and kind = 'message_not_sent'
  ) then
    return;
  end if;

  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, message_id, details)
  values (v_message.business_id, 'message_not_sent', 'pingflow', v_customer_id,
          (v_purpose ->> 'booking_id')::uuid, p_message_id,
          jsonb_build_object('purpose', v_purpose ->> 'purpose', 'reason', p_reason));

  insert into public.pending_actions (
    business_id, kind, conversation_id, customer_id, source_message_id, understood
  )
  select v_message.business_id, 'failure', v_message.conversation_id, v_customer_id, p_message_id,
         jsonb_build_object('reason', 'message_not_sent', 'purpose', v_purpose ->> 'purpose', 'cause', p_reason)
  where not exists (
    select 1 from public.pending_actions
    where source_message_id = p_message_id and status = 'open'
  );
end;
$$;

-- A send that was started but never finished (the worker stopped mid-way)
-- may or may not have reached WhatsApp, and WhatsApp has no way to ask.
-- It is never sent again automatically: the owner is told instead.
create function public.recover_stale_deliveries(p_lease_seconds integer default 120)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_count integer := 0;
begin
  for v_message_id in
    update public.message_deliveries
    set dispatch = 'done', claimed_at = null, error_category = 'outcome_unknown', failed_at = now()
    where dispatch = 'sending' and claimed_at < now() - make_interval(secs => p_lease_seconds)
    returning message_id
  loop
    update public.messages set delivery = 'failed' where id = v_message_id and delivery = 'queued';
    perform public.note_message_not_sent(v_message_id, 'failed', 'outcome_unknown');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Takes the next due outbound message and returns everything needed to
-- send it: text, purpose, recipient, the service window and connection.
create function public.claim_outbound_delivery()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.message_deliveries%rowtype;
  v_message public.messages%rowtype;
  v_purpose jsonb;
  v_booking jsonb;
begin
  update public.message_deliveries d
  set dispatch = 'sending', attempts = d.attempts + 1, claimed_at = now()
  where d.message_id = (
    select q.message_id from public.message_deliveries q
    where q.dispatch = 'queued' and q.next_attempt_at <= now()
    order by q.next_attempt_at, q.created_at
    for update skip locked
    limit 1
  )
  returning d.* into v_delivery;
  if not found then
    return null;
  end if;

  select * into v_message from public.messages where id = v_delivery.message_id;
  v_purpose := private.message_purpose(v_delivery.message_id);

  if v_purpose ->> 'booking_id' is not null then
    select jsonb_build_object(
      'id', b.id,
      'status', b.status,
      'starts_at', b.starts_at,
      'customer_name', cu.full_name,
      'service_name', s.name
    ) into v_booking
    from public.bookings b
    join public.customers cu on cu.id = b.customer_id
    left join public.services s on s.id = b.service_id
    where b.id = (v_purpose ->> 'booking_id')::uuid;
  end if;

  return jsonb_build_object(
    'message_id', v_message.id,
    'business_id', v_message.business_id,
    'attempt', v_delivery.attempts,
    'body', v_message.body,
    'author', v_message.author,
    'purpose', v_purpose ->> 'purpose',
    'booking', v_booking,
    'time_zone', (select timezone from public.businesses where id = v_message.business_id),
    'business_name', (select name from public.businesses where id = v_message.business_id),
    'to', (select ct.phone_e164 from public.conversations c
             join public.contacts ct on ct.id = c.contact_id
            where c.id = v_message.conversation_id),
    'last_inbound_at', (select max(sent_at) from public.messages
                         where conversation_id = v_message.conversation_id
                           and direction = 'inbound' and source = 'whatsapp'),
    'connection', (select jsonb_build_object(
                     'id', wc.id, 'status', wc.status, 'mode', wc.mode,
                     'phone_number_id', wc.phone_number_id, 'waba_id', wc.waba_id)
                   from public.whatsapp_connections wc where wc.id = v_delivery.connection_id)
  );
end;
$$;

-- Records what happened to one send attempt:
--   accepted   WhatsApp took it: provider ID stored, never sent again
--   retry      a temporary failure: back in the queue at p_result.retry_at
--   failed     WhatsApp refused it, or it gave up after retries
--   blocked    it wasn't allowed to be sent (window, template, connection)
create function public.record_delivery_result(
  p_message_id uuid,
  p_attempt integer,
  p_result jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.message_deliveries%rowtype;
  v_outcome text := p_result ->> 'outcome';
  v_reminder public.reminders%rowtype;
begin
  select * into v_delivery from public.message_deliveries
  where message_id = p_message_id for update;
  -- Only the claimant of this attempt may record it.
  if not found or v_delivery.dispatch <> 'sending' or v_delivery.attempts <> p_attempt then
    return false;
  end if;

  if v_outcome = 'accepted' then
    update public.message_deliveries
    set dispatch = 'done', claimed_at = null,
        provider_message_id = p_result ->> 'provider_message_id',
        sent_via = p_result ->> 'sent_via',
        template_name = p_result ->> 'template_name',
        accepted_at = now(), error_category = null, error_code = null
    where message_id = p_message_id;
    update public.messages set delivery = 'accepted'
    where id = p_message_id and delivery = 'queued';
    update public.whatsapp_connections set last_outbound_at = now()
    where id = v_delivery.connection_id;

    update public.reminders set status = 'sent', sent_at = now()
    where message_id = p_message_id and status = 'scheduled'
    returning * into v_reminder;
    if found then
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, message_id, details)
      values (v_reminder.business_id, 'reminder_sent', 'pingflow',
              private.message_customer(p_message_id), v_reminder.booking_id, p_message_id,
              jsonb_build_object('sent_via', p_result ->> 'sent_via'));
    end if;
    return true;
  end if;

  if v_outcome = 'retry' then
    update public.message_deliveries
    set dispatch = 'queued', claimed_at = null,
        next_attempt_at = (p_result ->> 'retry_at')::timestamptz,
        error_category = p_result ->> 'error_category',
        error_code = (p_result ->> 'error_code')::integer
    where message_id = p_message_id;
    return true;
  end if;

  if v_outcome not in ('failed', 'blocked') then
    raise exception 'Unknown outcome' using errcode = 'P0001', hint = 'invalid_outcome';
  end if;
  update public.message_deliveries
  set dispatch = 'done', claimed_at = null,
      error_category = p_result ->> 'error_category',
      error_code = (p_result ->> 'error_code')::integer,
      failed_at = now()
  where message_id = p_message_id;
  update public.messages set delivery = v_outcome::public.message_delivery
  where id = p_message_id and delivery = 'queued';
  perform public.note_message_not_sent(p_message_id, v_outcome, p_result ->> 'error_category');
  return true;
end;
$$;

-- A status from WhatsApp. States only move forward (accepted, sent,
-- delivered, read), however late or often a status arrives; failed never
-- overrides delivered or read.
create function public.apply_whatsapp_status(
  p_connection_id uuid,
  p_provider_message_id text,
  p_status text,
  p_at timestamptz,
  p_error_code integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery public.message_deliveries%rowtype;
  v_current public.message_delivery;
  v_rank_current integer;
  v_rank_new integer;
  v_next public.message_delivery;
  v_newly_failed boolean := false;
begin
  select * into v_delivery from public.message_deliveries
  where connection_id = p_connection_id and provider_message_id = p_provider_message_id
  for update;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select delivery into v_current from public.messages where id = v_delivery.message_id;

  update public.message_deliveries
  set sent_at = case when p_status = 'sent' then coalesce(sent_at, p_at) else sent_at end,
      delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, p_at) else delivered_at end,
      read_at = case when p_status = 'read' then coalesce(read_at, p_at) else read_at end,
      failed_at = case when p_status = 'failed' then coalesce(failed_at, p_at) else failed_at end,
      error_code = case when p_status = 'failed' then p_error_code else error_code end,
      error_category = case when p_status = 'failed' then 'provider_failed' else error_category end
  where message_id = v_delivery.message_id;

  v_rank_current := case v_current::text
    when 'queued' then 0 when 'accepted' then 1 when 'sent' then 2
    when 'delivered' then 3 when 'read' then 4 when 'failed' then 1 else 0 end;
  v_rank_new := case p_status
    when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else null end;

  if v_rank_new is not null and v_rank_new > v_rank_current then
    v_next := p_status::public.message_delivery;
  elsif p_status = 'failed' and v_current::text in ('queued', 'accepted', 'sent') then
    v_next := 'failed';
    v_newly_failed := true;
  end if;

  if v_next is not null then
    update public.messages set delivery = v_next where id = v_delivery.message_id;
  end if;
  if v_newly_failed then
    perform public.note_message_not_sent(v_delivery.message_id, 'failed', 'provider_failed');
  end if;

  return jsonb_build_object(
    'found', true,
    'message_id', v_delivery.message_id,
    'business_id', v_delivery.business_id,
    'delivery', coalesce(v_next, v_current),
    'changed', v_next is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Reminders through WhatsApp (server only)
-- ---------------------------------------------------------------------------

-- Turns one due reminder into an outbound message (the worker writes the
-- text). The route trigger decides whether it can go on WhatsApp; if it
-- can't, the reminder says so and Activity records why.
create function public.queue_reminder(p_reminder_id uuid, p_body text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reminder public.reminders%rowtype;
  v_booking public.bookings%rowtype;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_delivery public.message_delivery;
  v_reason text;
begin
  select * into v_reminder from public.reminders where id = p_reminder_id for update;
  if not found or v_reminder.status <> 'scheduled' or v_reminder.message_id is not null then
    return 'skipped';
  end if;
  select * into v_booking from public.bookings where id = v_reminder.booking_id;

  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then
    v_reason := 'too_late';
  else
    -- The customer's own number first, then whoever books for them.
    select cc.contact_id into v_contact_id
    from public.customer_contacts cc
    where cc.customer_id = v_booking.customer_id
    order by (cc.relationship = 'self') desc, cc.created_at
    limit 1;
    if v_contact_id is null then
      v_reason := 'no_number';
    end if;
  end if;

  if v_reason is null then
    insert into public.conversations (business_id, contact_id)
    values (v_reminder.business_id, v_contact_id)
    on conflict (business_id, contact_id, channel) do update set channel = excluded.channel
    returning id into v_conversation_id;

    insert into public.messages (business_id, conversation_id, direction, author, body, delivery)
    values (v_reminder.business_id, v_conversation_id, 'outbound', 'pingflow', p_body, 'simulated')
    returning id, delivery into v_message_id, v_delivery;

    update public.reminders set message_id = v_message_id where id = p_reminder_id;

    if v_delivery::text = 'queued' then
      return 'queued';
    end if;
    -- Recorded rather than sent: a simulator conversation, unless the
    -- connection went in the meantime.
    v_reason := case
      when v_delivery::text = 'blocked' then 'not_on_whatsapp'
      when exists (
        select 1 from public.whatsapp_connections
        where business_id = v_reminder.business_id and status in ('connected', 'needs_attention')
      ) then 'simulated'
      else 'not_connected'
    end;
  end if;

  update public.reminders set status = 'not_sent' where id = p_reminder_id;
  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, message_id, details)
  values (v_reminder.business_id, 'reminder_not_sent', 'pingflow', v_booking.customer_id,
          v_booking.id, v_message_id, jsonb_build_object('reason', v_reason));
  return v_reason;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Owners: disconnect
-- ---------------------------------------------------------------------------

create function public.disconnect_whatsapp()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
begin
  update public.whatsapp_connections
  set status = 'disconnected', disconnected_at = now()
  where business_id = v_business_id and status <> 'disconnected';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon;

revoke all on function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source, text) from authenticated;
revoke all on function public.claim_whatsapp_event(integer) from authenticated;
revoke all on function public.finish_whatsapp_event(uuid, integer, public.whatsapp_event_status, uuid, text, timestamptz) from authenticated;
revoke all on function public.note_message_not_sent(uuid, text, text) from authenticated;
revoke all on function public.recover_stale_deliveries(integer) from authenticated;
revoke all on function public.claim_outbound_delivery() from authenticated;
revoke all on function public.record_delivery_result(uuid, integer, jsonb) from authenticated;
revoke all on function public.apply_whatsapp_status(uuid, text, text, timestamptz, integer) from authenticated;
revoke all on function public.queue_reminder(uuid, text) from authenticated;
revoke all on function private.message_purpose(uuid) from authenticated;
revoke all on function private.message_customer(uuid) from authenticated;

grant execute on function public.ingest_inbound_message(uuid, text, text, timestamptz, text, public.message_source, text) to service_role;
grant execute on function public.claim_whatsapp_event(integer) to service_role;
grant execute on function public.finish_whatsapp_event(uuid, integer, public.whatsapp_event_status, uuid, text, timestamptz) to service_role;
grant execute on function public.note_message_not_sent(uuid, text, text) to service_role;
grant execute on function public.recover_stale_deliveries(integer) to service_role;
grant execute on function public.claim_outbound_delivery() to service_role;
grant execute on function public.record_delivery_result(uuid, integer, jsonb) to service_role;
grant execute on function public.apply_whatsapp_status(uuid, text, text, timestamptz, integer) to service_role;
grant execute on function public.queue_reminder(uuid, text) to service_role;
grant execute on function private.message_purpose(uuid) to service_role;
grant execute on function private.message_customer(uuid) to service_role;

-- Owners' approvals insert messages, which runs the route trigger.
grant execute on function private.route_outbound_message() to authenticated, service_role;
-- A trigger function can't be called directly; this only lets the trigger fire.
grant execute on function private.enqueue_whatsapp_delivery() to authenticated, service_role;
grant execute on function private.guard_whatsapp_connection_update() to authenticated, service_role;
grant execute on function public.disconnect_whatsapp() to authenticated;
