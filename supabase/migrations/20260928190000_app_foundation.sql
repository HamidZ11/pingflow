-- Pingflow application foundation.
--
-- Tenancy
--   Every row belongs to one business. A business has exactly one owner
--   (solo service businesses; teams are out of scope), recorded as
--   businesses.owner_id. Row level security limits every table to the
--   businesses the signed-in user owns.
--
--   Child rows reference their parents through composite (business_id, id)
--   foreign keys, so a row can never point at another business's customer,
--   booking or conversation, even though foreign key checks bypass RLS.
--
-- Functions
--   The functions at the end group multi-row changes into one transaction.
--   They are SECURITY INVOKER: they run as the caller, so the same RLS
--   policies apply inside them. None of them can reach data the caller could
--   not already read or change directly.
--
-- Time
--   Instants are timestamptz (stored in UTC). Working hours and series times
--   are wall-clock `time` values in the business's IANA time zone; the
--   application converts them with that zone, so clock changes are handled
--   there.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.business_type as enum (
  'driving_instructor',
  'tutor',
  'personal_trainer',
  'cleaner',
  'beauty',
  'dog_groomer',
  'photographer',
  'other'
);

create type public.booking_status as enum ('confirmed', 'cancelled');

create type public.contact_relationship as enum (
  'self',
  'parent',
  'guardian',
  'partner',
  'other'
);

create type public.message_direction as enum ('inbound', 'outbound');

create type public.message_author as enum ('contact', 'pingflow', 'owner');

-- 'simulated': an outbound message Pingflow recorded but could not send,
-- because WhatsApp is not connected yet.
create type public.message_delivery as enum (
  'received',
  'simulated',
  'sent',
  'failed'
);

create type public.pending_action_kind as enum (
  'reschedule_request',
  'booking_request',
  'cancellation_request',
  'reply_needed',
  'failure'
);

create type public.pending_action_status as enum (
  'open',
  'approved',
  'declined',
  'taken_over',
  'dismissed'
);

create type public.reminder_status as enum (
  'scheduled',
  'sent',
  'cancelled',
  'failed'
);

create type public.activity_actor as enum ('contact', 'pingflow', 'owner');

create type public.activity_kind as enum (
  'message_received',
  'request_understood',
  'time_proposed',
  'approval_requested',
  'owner_approved',
  'owner_declined',
  'owner_took_over',
  'request_closed',
  'booking_created',
  'booking_moved',
  'booking_cancelled',
  'confirmation_sent',
  'reply_sent',
  'reminder_scheduled',
  'reminder_rescheduled',
  'reminder_cancelled',
  'time_blocked',
  'block_removed',
  'customer_added',
  'automation_resumed'
);

-- ---------------------------------------------------------------------------
-- Shared trigger
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Businesses and setup
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text check (name is null or char_length(btrim(name)) between 1 and 120),
  business_type public.business_type not null default 'other',
  timezone text not null default 'Europe/London',
  -- Null until WhatsApp Business is connected (not built yet).
  whatsapp_connected_at timestamptz,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_touch before update on public.businesses
  for each row execute function private.touch_updated_at();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  duration_minutes integer not null check (duration_minutes between 5 and 720),
  -- Time needed after this service before the next appointment can start.
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create index services_business_idx on public.services (business_id, position);

-- Weekly opening pattern. Several rows per weekday allow split days.
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: 1 = Monday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  unique (business_id, weekday, start_time)
);

create table public.automation_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  reminders_enabled boolean not null default true,
  reminder_lead_minutes integer not null default 1440
    check (reminder_lead_minutes in (120, 1440, 2880)),
  confirmations_enabled boolean not null default true,
  availability_replies_enabled boolean not null default true,
  booking_time_replies_enabled boolean not null default true,
  cancellation_acknowledgements_enabled boolean not null default true,
  -- Booking changes (new, moved, cancelled) always wait for the owner. That
  -- rule is not a setting, so it has no column.
  updated_at timestamptz not null default now()
);

create trigger automation_settings_touch before update on public.automation_settings
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- People: a contact messages the business; a customer receives the service.
-- A parent (contact) can manage a learner (customer), and one contact can
-- manage several customers.
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The name as the contact appears in WhatsApp.
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 120),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, phone_e164)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create index customers_business_idx on public.customers (business_id, full_name);

create table public.customer_contacts (
  business_id uuid not null,
  customer_id uuid not null,
  contact_id uuid not null,
  relationship public.contact_relationship not null default 'self',
  created_at timestamptz not null default now(),
  primary key (customer_id, contact_id),
  foreign key (business_id, customer_id)
    references public.customers (business_id, id) on delete cascade,
  foreign key (business_id, contact_id)
    references public.contacts (business_id, id) on delete cascade
);

create index customer_contacts_contact_idx on public.customer_contacts (contact_id);
create index customer_contacts_business_idx on public.customer_contacts (business_id);

-- ---------------------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------------------

-- A recurring booking ("every Tuesday at 16:00"). Occurrences are stored as
-- ordinary bookings, so one occurrence can move without touching the series.
create table public.booking_series (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  interval_weeks smallint not null default 1 check (interval_weeks between 1 and 8),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, service_id) references public.services (business_id, id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  series_id uuid,
  -- For a series occurrence: the slot the series originally put it in, so a
  -- moved occurrence is still recognised as that week's occurrence.
  occurrence_starts_at timestamptz,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Copied from the service when booked, so later service edits don't
  -- change existing appointments.
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  status public.booking_status not null default 'confirmed',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((series_id is null) = (occurrence_starts_at is null)),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  unique (business_id, id),
  unique (series_id, occurrence_starts_at),
  foreign key (business_id, customer_id) references public.customers (business_id, id),
  foreign key (business_id, service_id) references public.services (business_id, id),
  foreign key (business_id, series_id) references public.booking_series (business_id, id),
  -- Last line of defence against double booking. Buffers are checked by the
  -- availability engine before any write.
  constraint bookings_no_overlap exclude using gist (
    business_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed')
);

create index bookings_business_time_idx on public.bookings (business_id, starts_at);
create index bookings_customer_idx on public.bookings (customer_id, starts_at);

create trigger bookings_touch before update on public.bookings
  for each row execute function private.touch_updated_at();

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text check (label is null or char_length(btrim(label)) between 1 and 80),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (business_id, id)
);

create index schedule_blocks_business_time_idx on public.schedule_blocks (business_id, starts_at);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  booking_id uuid not null,
  send_at timestamptz not null,
  status public.reminder_status not null default 'scheduled',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (business_id, booking_id)
    references public.bookings (business_id, id) on delete cascade
);

-- One live reminder per booking.
create unique index reminders_one_scheduled_idx on public.reminders (booking_id)
  where status = 'scheduled';
create index reminders_business_send_idx on public.reminders (business_id, send_at);

create trigger reminders_touch before update on public.reminders
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  contact_id uuid not null,
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  -- Set when the owner takes over; Pingflow stays out of the conversation
  -- until it is cleared.
  automation_paused_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, contact_id, channel),
  foreign key (business_id, contact_id)
    references public.contacts (business_id, id) on delete cascade
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  conversation_id uuid not null,
  direction public.message_direction not null,
  author public.message_author not null,
  body text not null check (char_length(body) between 1 and 4096),
  delivery public.message_delivery not null,
  sent_at timestamptz not null default now(),
  unique (business_id, id),
  check ((direction = 'inbound') = (author = 'contact')),
  check ((direction = 'inbound') = (delivery = 'received')),
  foreign key (business_id, conversation_id)
    references public.conversations (business_id, id) on delete cascade
);

create index messages_conversation_idx on public.messages (conversation_id, sent_at);

-- ---------------------------------------------------------------------------
-- Attention: things Pingflow needs the owner for.
-- ---------------------------------------------------------------------------

create table public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.pending_action_kind not null,
  status public.pending_action_status not null default 'open',
  conversation_id uuid,
  customer_id uuid,
  booking_id uuid,
  source_message_id uuid,
  -- What Pingflow understood, as structured data. For a reschedule:
  -- {"intent": "reschedule", "preferred_date": "2026-10-02", "earliest_time": "16:00"}
  understood jsonb not null default '{}',
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution jsonb,
  check ((status = 'open') = (resolved_at is null)),
  check ((proposed_starts_at is null) = (proposed_ends_at is null)),
  check (proposed_ends_at is null or proposed_ends_at > proposed_starts_at),
  unique (business_id, id),
  foreign key (business_id, conversation_id)
    references public.conversations (business_id, id) on delete set null (conversation_id),
  foreign key (business_id, customer_id)
    references public.customers (business_id, id) on delete set null (customer_id),
  foreign key (business_id, booking_id)
    references public.bookings (business_id, id) on delete set null (booking_id),
  foreign key (business_id, source_message_id)
    references public.messages (business_id, id) on delete set null (source_message_id)
);

create index pending_actions_open_idx on public.pending_actions (business_id, created_at)
  where status = 'open';
-- A booking has at most one open request at a time.
create unique index pending_actions_one_open_per_booking_idx
  on public.pending_actions (booking_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Activity: an append-only audit trail. Rows hold structured facts; the
-- application turns them into sentences so wording and time formatting live
-- in one place.
-- ---------------------------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  -- Orders events that share a timestamp (one transaction writes several).
  seq bigint generated always as identity,
  business_id uuid not null references public.businesses (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  kind public.activity_kind not null,
  actor public.activity_actor not null,
  customer_id uuid,
  booking_id uuid,
  pending_action_id uuid,
  message_id uuid,
  details jsonb not null default '{}',
  foreign key (business_id, customer_id)
    references public.customers (business_id, id) on delete set null (customer_id),
  foreign key (business_id, booking_id)
    references public.bookings (business_id, id) on delete set null (booking_id),
  foreign key (business_id, pending_action_id)
    references public.pending_actions (business_id, id) on delete set null (pending_action_id),
  foreign key (business_id, message_id)
    references public.messages (business_id, id) on delete set null (message_id)
);

create index activity_events_business_time_idx
  on public.activity_events (business_id, occurred_at desc, seq desc);
create index activity_events_customer_idx on public.activity_events (customer_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.services enable row level security;
alter table public.working_hours enable row level security;
alter table public.automation_settings enable row level security;
alter table public.contacts enable row level security;
alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.booking_series enable row level security;
alter table public.bookings enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.reminders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.pending_actions enable row level security;
alter table public.activity_events enable row level security;

-- Signed-out visitors get nothing. Signed-in users get table privileges
-- below, and the policies narrow those to their own business.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

create policy "Owners read their business" on public.businesses
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners create their business" on public.businesses
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners update their business" on public.businesses
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Every other table: rows of a business the caller owns. `(select auth.uid())`
-- is evaluated once per statement rather than once per row.
create policy "Owners manage services" on public.services
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage working hours" on public.working_hours
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage automation settings" on public.automation_settings
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage contacts" on public.contacts
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage customers" on public.customers
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage customer contacts" on public.customer_contacts
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage booking series" on public.booking_series
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage bookings" on public.bookings
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage schedule blocks" on public.schedule_blocks
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage reminders" on public.reminders
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage conversations" on public.conversations
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners manage pending actions" on public.pending_actions
  for all to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())))
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

-- Messages and activity are records of what happened: read and append only.
create policy "Owners read messages" on public.messages
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners record messages" on public.messages
  for insert to authenticated
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners read activity" on public.activity_events
  for select to authenticated
  using (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

create policy "Owners record activity" on public.activity_events
  for insert to authenticated
  with check (business_id in (select id from public.businesses where owner_id = (select auth.uid())));

revoke update, delete, truncate on public.messages from authenticated;
revoke update, delete, truncate on public.activity_events from authenticated;
revoke delete, truncate on public.businesses from authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: Attention refreshes when a request arrives or is resolved.
-- Realtime applies the select policy above, so owners only hear about their
-- own business.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.pending_actions;

-- ---------------------------------------------------------------------------
-- Functions
--
-- Conventions for every function below:
--   * SECURITY INVOKER, so RLS applies to every statement.
--   * An empty search_path; every name is schema-qualified.
--   * Explicit ownership checks that state the rule RLS also enforces.
--   * Errors use SQLSTATE P0001 with a machine-readable HINT the app maps to
--     plain English. Overlaps raise the exclusion constraint's 23P01.
--   * Executable by signed-in users only.
-- ---------------------------------------------------------------------------

-- The caller's business, or an error.
create function private.owned_business_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  select id into v_id from public.businesses where owner_id = (select auth.uid());
  if v_id is null then
    raise exception 'No business' using errcode = 'P0001', hint = 'no_business';
  end if;
  return v_id;
end;
$$;

-- Onboarding: create (or finish) the caller's business with its services,
-- working hours and automation preferences in one step.
--
-- p_setup: {
--   "name": text | null,
--   "business_type": business_type,
--   "timezone": text,
--   "services": [{"name", "duration_minutes", "buffer_minutes"}],        -- 1..20
--   "working_hours": [{"weekday", "start_time", "end_time"}],             -- 1..21
--   "automation": {"reminders_enabled", "reminder_lead_minutes",
--                  "availability_replies_enabled"}
-- }
create function public.complete_onboarding(p_setup jsonb)
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
  if jsonb_typeof(v_hours) <> 'array' or jsonb_array_length(v_hours) not between 1 and 21 then
    raise exception 'Add your working hours' using errcode = 'P0001', hint = 'invalid_hours';
  end if;

  insert into public.businesses (owner_id, name, business_type, timezone, onboarding_completed_at)
  values (
    v_owner,
    nullif(btrim(p_setup ->> 'name'), ''),
    (p_setup ->> 'business_type')::public.business_type,
    coalesce(p_setup ->> 'timezone', 'Europe/London'),
    now()
  )
  on conflict (owner_id) do update set
    name = excluded.name,
    business_type = excluded.business_type,
    timezone = excluded.timezone,
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

-- Settings: replace the weekly working hours in one step.
-- p_hours: [{"weekday", "start_time", "end_time"}]
create function public.set_working_hours(p_hours jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
begin
  if jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 21 then
    raise exception 'Invalid working hours' using errcode = 'P0001', hint = 'invalid_hours';
  end if;

  delete from public.working_hours where business_id = v_business_id;

  insert into public.working_hours (business_id, weekday, start_time, end_time)
  select
    v_business_id,
    (h ->> 'weekday')::smallint,
    (h ->> 'start_time')::time,
    (h ->> 'end_time')::time
  from jsonb_array_elements(p_hours) as t (h);
end;
$$;

-- Attention: the owner's answer to a reschedule request, applied atomically.
--
--   'approve'   Moves the booking to p_starts_at (the proposal, or another
--               free time the owner picked), keeping its length. Cancels the
--               old reminder and schedules p_reminder_send_at, if given.
--               Records p_reply_body as the confirmation to the customer.
--   'decline'   Leaves the booking alone and records p_reply_body as the
--               reply to the customer.
--   'take_over' Leaves the booking alone, sends nothing and pauses Pingflow
--               in that conversation so the owner can reply personally.
--
-- Whoever acts first wins: the request row is locked and must still be open.
-- Message wording and reminder timing come from the application's domain
-- layer; this function only applies them.
create function public.resolve_reschedule_request(
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
  v_booking public.bookings%rowtype;
  v_new_ends_at timestamptz;
  v_old_reminder_at timestamptz;
  v_new_reminder boolean := false;
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
  if v_action.kind <> 'reschedule_request' then
    raise exception 'Not a reschedule request' using errcode = 'P0001', hint = 'wrong_kind';
  end if;
  if v_action.status <> 'open' then
    raise exception 'Request already handled' using errcode = 'P0001', hint = 'already_resolved';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_action.booking_id and business_id = v_action.business_id
  for update;

  if p_decision = 'approve' then
    if not found or v_booking.status <> 'confirmed' then
      raise exception 'Booking no longer active' using errcode = 'P0001', hint = 'booking_inactive';
    end if;
    if p_starts_at is null then
      raise exception 'A new time is required' using errcode = 'P0001', hint = 'missing_time';
    end if;
    if p_reply_body is null and exists (
      select 1 from public.automation_settings
      where business_id = v_action.business_id and confirmations_enabled
    ) then
      raise exception 'Confirmation missing' using errcode = 'P0001', hint = 'missing_reply';
    end if;

    v_new_ends_at := p_starts_at + (v_booking.ends_at - v_booking.starts_at);

    -- Raises 23P01 if the new time overlaps another confirmed booking.
    update public.bookings
    set starts_at = p_starts_at, ends_at = v_new_ends_at
    where id = v_booking.id;

    update public.reminders
    set status = 'cancelled'
    where booking_id = v_booking.id and status = 'scheduled'
    returning send_at into v_old_reminder_at;

    if p_reminder_send_at is not null then
      if p_reminder_send_at >= p_starts_at then
        raise exception 'Reminder after booking' using errcode = 'P0001', hint = 'invalid_reminder';
      end if;
      insert into public.reminders (business_id, booking_id, send_at)
      values (v_action.business_id, v_booking.id, p_reminder_send_at);
      v_new_reminder := true;
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
    update public.conversations
    set automation_paused_at = now()
    where id = v_action.conversation_id
      and business_id = v_action.business_id
      and automation_paused_at is null;
    v_status := 'taken_over';
  end if;

  if p_reply_body is not null then
    if v_action.conversation_id is null then
      raise exception 'No conversation to reply in' using errcode = 'P0001', hint = 'no_conversation';
    end if;
    insert into public.messages (business_id, conversation_id, direction, author, body, delivery)
    values (v_action.business_id, v_action.conversation_id, 'outbound', 'pingflow', p_reply_body, 'simulated')
    returning id into v_message_id;

    update public.conversations
    set last_message_at = now()
    where id = v_action.conversation_id and business_id = v_action.business_id;
  end if;

  update public.pending_actions
  set
    status = v_status,
    resolved_at = now(),
    resolved_by = v_owner,
    resolution = jsonb_strip_nulls(jsonb_build_object(
      'decision', p_decision,
      'starts_at', p_starts_at,
      'ends_at', v_new_ends_at,
      'matched_proposal', case when p_decision = 'approve'
        then p_starts_at = v_action.proposed_starts_at end
    ))
  where id = v_action.id;

  -- Activity, in the order it happened.
  if p_decision = 'approve' then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (
      v_action.business_id, 'owner_approved', 'owner', v_action.customer_id, v_booking.id, v_action.id,
      jsonb_build_object(
        'starts_at', p_starts_at,
        'proposed_starts_at', v_action.proposed_starts_at
      )
    );

    -- The audit record of the change: where the booking was, and where it is.
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (
      v_action.business_id, 'booking_moved', 'pingflow', v_action.customer_id, v_booking.id, v_action.id,
      jsonb_build_object(
        'from_starts_at', v_booking.starts_at,
        'from_ends_at', v_booking.ends_at,
        'to_starts_at', p_starts_at,
        'to_ends_at', v_new_ends_at
      )
    );

    if v_message_id is not null then
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, message_id, details)
      values (
        v_action.business_id, 'confirmation_sent', 'pingflow', v_action.customer_id, v_booking.id, v_action.id,
        v_message_id, jsonb_build_object('delivery', 'simulated')
      );
    end if;

    if v_new_reminder then
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
      values (
        v_action.business_id,
        case when v_old_reminder_at is null then 'reminder_scheduled' else 'reminder_rescheduled' end::public.activity_kind,
        'pingflow', v_action.customer_id, v_booking.id,
        jsonb_strip_nulls(jsonb_build_object('from_send_at', v_old_reminder_at, 'send_at', p_reminder_send_at))
      );
    elsif v_old_reminder_at is not null then
      insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
      values (
        v_action.business_id, 'reminder_cancelled', 'pingflow', v_action.customer_id, v_booking.id,
        jsonb_build_object('send_at', v_old_reminder_at)
      );
    end if;
  elsif p_decision = 'decline' then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (v_action.business_id, 'owner_declined', 'owner', v_action.customer_id, v_action.booking_id, v_action.id, '{}');

    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, message_id, details)
    values (
      v_action.business_id, 'reply_sent', 'pingflow', v_action.customer_id, v_action.booking_id, v_action.id,
      v_message_id, jsonb_build_object('delivery', 'simulated')
    );
  else
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (v_action.business_id, 'owner_took_over', 'owner', v_action.customer_id, v_action.booking_id, v_action.id, '{}');
  end if;
end;
$$;

-- Attention: mark a non-booking item (a reply the owner has sent
-- personally, a failure they've dealt with) as handled. Booking requests go
-- through resolve_reschedule_request instead.
create function public.dismiss_pending_action(p_action_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_action public.pending_actions%rowtype;
begin
  if v_owner is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select pa.* into v_action
  from public.pending_actions pa
  join public.businesses b on b.id = pa.business_id
  where pa.id = p_action_id and b.owner_id = v_owner
  for update of pa;

  if not found then
    raise exception 'Request not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_action.kind not in ('reply_needed', 'failure') then
    raise exception 'Answer booking requests instead' using errcode = 'P0001', hint = 'wrong_kind';
  end if;
  if v_action.status <> 'open' then
    raise exception 'Request already handled' using errcode = 'P0001', hint = 'already_resolved';
  end if;

  update public.pending_actions
  set status = 'dismissed', resolved_at = now(), resolved_by = v_owner,
      resolution = jsonb_build_object('reason', 'handled_by_owner')
  where id = v_action.id;

  insert into public.activity_events (business_id, kind, actor, customer_id, pending_action_id, details)
  values (v_action.business_id, 'request_closed', 'owner', v_action.customer_id, v_action.id,
          jsonb_build_object('reason', 'handled_by_owner'));
end;
$$;

-- Closes any open request about a booking the owner has just changed
-- directly, so Attention never offers to act on a stale booking.
create function private.close_requests_for_booking(p_booking_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action public.pending_actions%rowtype;
begin
  for v_action in
    update public.pending_actions
    set status = 'dismissed',
        resolved_at = now(),
        resolved_by = (select auth.uid()),
        resolution = jsonb_build_object('reason', p_reason)
    where booking_id = p_booking_id and status = 'open'
    returning *
  loop
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, pending_action_id, details)
    values (v_action.business_id, 'request_closed', 'owner', v_action.customer_id, p_booking_id, v_action.id,
            jsonb_build_object('reason', p_reason));
  end loop;
end;
$$;

-- Schedule: add a one-off booking. The length and buffer come from the
-- service; the application has already checked the time is free.
create function public.create_booking(
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

  return v_booking_id;
end;
$$;

-- Schedule: move one booking (one occurrence, for a series), keeping its
-- length, and move its reminder with it.
create function public.move_booking(
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
  v_booking public.bookings%rowtype;
  v_ends_at timestamptz;
  v_old_reminder_at timestamptz;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and business_id = v_business_id
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
  values (v_business_id, 'booking_moved', 'owner', v_booking.customer_id, p_booking_id,
          jsonb_build_object(
            'from_starts_at', v_booking.starts_at,
            'from_ends_at', v_booking.ends_at,
            'to_starts_at', p_starts_at,
            'to_ends_at', v_ends_at
          ));

  update public.reminders
  set status = 'cancelled'
  where booking_id = p_booking_id and status = 'scheduled'
  returning send_at into v_old_reminder_at;

  if p_reminder_send_at is not null then
    insert into public.reminders (business_id, booking_id, send_at)
    values (v_business_id, p_booking_id, p_reminder_send_at);

    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (v_business_id,
            case when v_old_reminder_at is null then 'reminder_scheduled' else 'reminder_rescheduled' end::public.activity_kind,
            'pingflow', v_booking.customer_id, p_booking_id,
            jsonb_strip_nulls(jsonb_build_object('from_send_at', v_old_reminder_at, 'send_at', p_reminder_send_at)));
  elsif v_old_reminder_at is not null then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (v_business_id, 'reminder_cancelled', 'pingflow', v_booking.customer_id, p_booking_id,
            jsonb_build_object('send_at', v_old_reminder_at));
  end if;
end;
$$;

-- Schedule: cancel one booking. It stays on record as cancelled.
create function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_booking public.bookings%rowtype;
  v_old_reminder_at timestamptz;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and business_id = v_business_id
  for update;
  if not found or v_booking.status <> 'confirmed' then
    raise exception 'Booking no longer active' using errcode = 'P0001', hint = 'booking_inactive';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;

  perform private.close_requests_for_booking(p_booking_id, 'booking_cancelled');

  insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
  values (v_business_id, 'booking_cancelled', 'owner', v_booking.customer_id, p_booking_id,
          jsonb_build_object('starts_at', v_booking.starts_at, 'ends_at', v_booking.ends_at));

  update public.reminders
  set status = 'cancelled'
  where booking_id = p_booking_id and status = 'scheduled'
  returning send_at into v_old_reminder_at;

  if v_old_reminder_at is not null then
    insert into public.activity_events (business_id, kind, actor, customer_id, booking_id, details)
    values (v_business_id, 'reminder_cancelled', 'pingflow', v_booking.customer_id, p_booking_id,
            jsonb_build_object('send_at', v_old_reminder_at));
  end if;
end;
$$;

-- Schedule: block time off. The application has already checked it doesn't
-- cover a booking.
create function public.add_schedule_block(
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
  v_block_id uuid;
begin
  insert into public.schedule_blocks (business_id, starts_at, ends_at, label)
  values (v_business_id, p_starts_at, p_ends_at, nullif(btrim(p_label), ''))
  returning id into v_block_id;

  insert into public.activity_events (business_id, kind, actor, details)
  values (v_business_id, 'time_blocked', 'owner',
          jsonb_strip_nulls(jsonb_build_object('starts_at', p_starts_at, 'ends_at', p_ends_at, 'label', nullif(btrim(p_label), ''))));

  return v_block_id;
end;
$$;

create function public.remove_schedule_block(p_block_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_block public.schedule_blocks%rowtype;
begin
  delete from public.schedule_blocks
  where id = p_block_id and business_id = v_business_id
  returning * into v_block;
  if not found then
    raise exception 'Blocked time not found' using errcode = 'P0001', hint = 'not_found';
  end if;

  insert into public.activity_events (business_id, kind, actor, details)
  values (v_business_id, 'block_removed', 'owner',
          jsonb_strip_nulls(jsonb_build_object('starts_at', v_block.starts_at, 'ends_at', v_block.ends_at, 'label', v_block.label)));
end;
$$;

-- Customers: add a customer and, optionally, the WhatsApp contact who
-- messages on their behalf (themselves, or a parent). An existing contact
-- with the same number is reused.
create function public.create_customer(
  p_full_name text,
  p_phone_e164 text default null,
  p_relationship public.contact_relationship default 'self',
  p_contact_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_customer_id uuid;
  v_contact_id uuid;
begin
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

  insert into public.activity_events (business_id, kind, actor, customer_id, details)
  values (v_business_id, 'customer_added', 'owner', v_customer_id, '{}');

  return v_customer_id;
end;
$$;

-- Customers: let Pingflow back into a conversation the owner took over.
create function public.resume_conversation(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id uuid := private.owned_business_id();
  v_customer_id uuid;
begin
  update public.conversations
  set automation_paused_at = null
  where id = p_conversation_id and business_id = v_business_id and automation_paused_at is not null;
  if not found then
    raise exception 'Conversation not paused' using errcode = 'P0001', hint = 'not_found';
  end if;

  select cc.customer_id into v_customer_id
  from public.conversations c
  join public.customer_contacts cc on cc.contact_id = c.contact_id
  where c.id = p_conversation_id
  limit 1;

  insert into public.activity_events (business_id, kind, actor, customer_id, details)
  values (v_business_id, 'automation_resumed', 'owner', v_customer_id, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: signed-in users only. Internal helpers stay private.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon;
revoke all on schema private from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.owned_business_id() to authenticated;
grant execute on function private.close_requests_for_booking(uuid, text) to authenticated;
grant execute on function private.touch_updated_at() to authenticated;

grant execute on function public.complete_onboarding(jsonb) to authenticated;
grant execute on function public.set_working_hours(jsonb) to authenticated;
grant execute on function public.resolve_reschedule_request(uuid, text, timestamptz, text, timestamptz) to authenticated;
grant execute on function public.dismiss_pending_action(uuid) to authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.move_booking(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.add_schedule_block(timestamptz, timestamptz, text) to authenticated;
grant execute on function public.remove_schedule_block(uuid) to authenticated;
grant execute on function public.create_customer(text, text, public.contact_relationship, text) to authenticated;
grant execute on function public.resume_conversation(uuid) to authenticated;
