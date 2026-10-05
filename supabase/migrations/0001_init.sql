-- One row per room. The whole room (seats, game state incl. card decks) is a JSON document
-- owned by the Vercel API (service role). Clients never read this table.
create table public.rooms (
  code text primary key,
  doc jsonb not null,
  rev integer not null default 0, -- optimistic lock, bumped on every write
  updated_at timestamptz not null default now()
);

create index rooms_updated_at_idx on public.rooms (updated_at);

-- RLS on, no policies: anon/authenticated get nothing; the service role bypasses RLS.
alter table public.rooms enable row level security;

-- Realtime: clients may only RECEIVE broadcasts on private `room:*` channels.
-- No insert policy, so clients cannot send (spoof) room updates; the API sends with the service role.
create policy "clients receive room broadcasts"
  on realtime.messages
  for select
  to anon, authenticated
  using (realtime.messages.extension = 'broadcast' and realtime.topic() like 'room:%');

-- Abandoned rooms are never deleted by the API. With pg_cron enabled, schedule:
-- select cron.schedule('cleanup-rooms', '0 * * * *', $$delete from public.rooms where updated_at < now() - interval '1 day'$$);
