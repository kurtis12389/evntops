-- EVNTOPS kit tracker: phase 1 schema

-- People ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'pending' check (role in ('admin','staff','viewer','pending')),
  created_at timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','staff') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','staff','viewer') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- First person to sign up becomes admin; everyone after waits as 'pending' until an admin approves them.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sites ------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Items -------------------------------------------------------------------
create sequence public.item_label_seq start 1;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  label_code text not null unique default ('EVN-' || lpad(nextval('public.item_label_seq')::text, 4, '0')),
  name text not null,
  category text not null default 'General',
  serial text,
  value_gbp numeric(10,2),
  is_bulk boolean not null default false,
  quantity integer not null default 1 check (quantity >= 0),
  status text not null default 'available' check (status in ('available','repair','missing','retired')),
  shelf text,
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);
create index on public.items (site_id);

-- Orders ------------------------------------------------------------------
create sequence public.order_ref_seq start 1;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('ORD-' || lpad(nextval('public.order_ref_seq')::text, 4, '0')),
  site_id uuid not null references public.sites(id),
  title text not null,
  venue text,
  out_date date not null,
  due_date date not null,
  status text not null default 'picking' check (status in ('picking','ready','collected','returned','checked','cancelled')),
  collected_by text,
  collected_at timestamptz,
  returned_at timestamptz,
  checked_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (due_date >= out_date)
);
create index on public.orders (site_id, status);

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  qty integer not null default 1 check (qty > 0),
  picked_qty integer not null default 0 check (picked_qty >= 0),
  returned_qty integer not null default 0 check (returned_qty >= 0),
  damaged boolean not null default false,
  resolved boolean not null default false,
  unique (order_id, item_id)
);
create index on public.order_lines (item_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  user_id uuid references public.profiles(id) default auth.uid(),
  at timestamptz not null default now()
);
create index on public.order_events (order_id);

create table public.scans (
  id bigint generated always as identity primary key,
  client_id uuid not null unique,
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.items(id),
  kind text not null check (kind in ('pick','return')),
  qty integer not null default 1,
  user_id uuid references public.profiles(id) default auth.uid(),
  scanned_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table public.item_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  body text not null,
  photo_path text,
  user_id uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.item_notes (item_id);

-- Availability --------------------------------------------------------------
-- booked = on an order being picked or ready; out = collected or returned but not yet checked.
create or replace view public.item_availability with (security_invoker = true) as
select i.id as item_id,
  coalesce(sum(l.qty) filter (where o.status in ('picking','ready')), 0)::int as booked_qty,
  coalesce(sum(greatest(l.picked_qty - l.returned_qty, 0)) filter (where o.status in ('collected','returned')), 0)::int as out_qty,
  coalesce(sum(l.qty - l.returned_qty) filter (where o.status = 'checked' and l.returned_qty < l.qty and not l.resolved), 0)::int as missing_qty
from public.items i
left join public.order_lines l on l.item_id = i.id
left join public.orders o on o.id = l.order_id
group by i.id;

-- Order stage changes -------------------------------------------------------
create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, from_status, to_status, user_id) values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, from_status, to_status, user_id) values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;

create trigger orders_status_log after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- Move an order to its next stage, enforcing the order of stages.
create or replace function public.set_order_status(p_order uuid, p_status text, p_collected_by text default null)
returns public.orders
language plpgsql security invoker set search_path = public as $$
declare
  o public.orders;
  allowed text[];
begin
  if not public.is_staff() then raise exception 'Only staff can change an order'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;

  allowed := case o.status
    when 'picking'   then array['ready','cancelled']
    when 'ready'     then array['picking','collected','cancelled']
    when 'collected' then array['returned']
    when 'returned'  then array['checked','collected']
    else array[]::text[] end;
  if public.is_admin() and p_status <> o.status then
    allowed := allowed || array['picking','ready','collected','returned','checked','cancelled'];
  end if;
  if not (p_status = any(allowed)) then
    raise exception 'Cannot move % order to %', o.status, p_status;
  end if;

  if p_status = 'ready' and exists (select 1 from public.order_lines where order_id = p_order and picked_qty < qty) and not public.is_admin() then
    raise exception 'Some items have not been picked yet';
  end if;

  update public.orders set
    status = p_status,
    collected_by = case when p_status = 'collected' then coalesce(nullif(p_collected_by, ''), collected_by) else collected_by end,
    collected_at = case when p_status = 'collected' then now() else collected_at end,
    returned_at  = case when p_status = 'returned'  then now() else returned_at end,
    checked_at   = case when p_status = 'checked'   then now() else checked_at end
  where id = p_order
  returning * into o;

  -- When checked: damaged items go to repair; unreturned single items are flagged missing.
  if p_status = 'checked' then
    update public.items i set status = 'repair'
      from public.order_lines l
      where l.order_id = p_order and l.item_id = i.id and l.damaged and i.status = 'available';
    update public.items i set status = 'missing'
      from public.order_lines l
      where l.order_id = p_order and l.item_id = i.id and not i.is_bulk and l.returned_qty < l.qty and i.status = 'available';
  end if;
  return o;
end $$;

-- Record a scan. Idempotent on client_id so offline scans can be retried safely.
create or replace function public.record_scan(p_client_id uuid, p_order uuid, p_label text, p_kind text, p_qty integer default 1, p_scanned_at timestamptz default now())
returns json
language plpgsql security invoker set search_path = public as $$
declare
  it public.items;
  ln public.order_lines;
  o public.orders;
begin
  if not public.is_staff() then raise exception 'Only staff can scan'; end if;
  if exists (select 1 from public.scans where client_id = p_client_id) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;
  select * into o from public.orders where id = p_order;
  if not found then raise exception 'Order not found'; end if;
  select * into it from public.items where upper(label_code) = upper(trim(p_label));
  if not found then raise exception 'No item with label %', p_label; end if;

  select * into ln from public.order_lines where order_id = p_order and item_id = it.id;
  if not found then
    if p_kind = 'pick' and o.status in ('picking','ready') then
      insert into public.order_lines (order_id, item_id, qty, picked_qty) values (p_order, it.id, greatest(p_qty,1), 0) returning * into ln;
    else
      raise exception '% is not on order %', it.label_code, o.ref;
    end if;
  end if;

  insert into public.scans (client_id, order_id, item_id, kind, qty, scanned_at)
    values (p_client_id, p_order, it.id, p_kind, p_qty, p_scanned_at);

  if p_kind = 'pick' then
    update public.order_lines set picked_qty = least(picked_qty + p_qty, qty) where id = ln.id returning * into ln;
  else
    update public.order_lines set returned_qty = least(returned_qty + p_qty, greatest(picked_qty, qty)) where id = ln.id returning * into ln;
  end if;
  return json_build_object('ok', true, 'item', it.name, 'label', it.label_code, 'picked', ln.picked_qty, 'returned', ln.returned_qty, 'qty', ln.qty);
end $$;

-- Row level security ----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.items enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.scans enable row level security;
alter table public.item_notes enable row level security;

-- Approved members can read everything (viewers see availability and order stages).
create policy "read profiles" on public.profiles for select to authenticated using (public.is_member() or id = auth.uid());
create policy "read sites" on public.sites for select to authenticated using (public.is_member());
create policy "read items" on public.items for select to authenticated using (public.is_member());
create policy "read orders" on public.orders for select to authenticated using (public.is_member());
create policy "read lines" on public.order_lines for select to authenticated using (public.is_member());
create policy "read events" on public.order_events for select to authenticated using (public.is_member());
create policy "read scans" on public.scans for select to authenticated using (public.is_member());
create policy "read notes" on public.item_notes for select to authenticated using (public.is_member());

-- Profiles: you can rename yourself; only admins change roles.
create policy "update own name" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());
create policy "admin manages profiles" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admin manages sites" on public.sites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "staff add items" on public.items for insert to authenticated with check (public.is_staff());
create policy "staff edit items" on public.items for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete items" on public.items for delete to authenticated using (public.is_admin());

create policy "staff add orders" on public.orders for insert to authenticated with check (public.is_staff());
create policy "staff edit orders" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin delete orders" on public.orders for delete to authenticated using (public.is_admin());

create policy "staff manage lines" on public.order_lines for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy "staff add scans" on public.scans for insert to authenticated with check (public.is_staff());
create policy "staff add notes" on public.item_notes for insert to authenticated with check (public.is_staff());
create policy "admin delete notes" on public.item_notes for delete to authenticated using (public.is_admin());

-- Photos -------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;
create policy "read photos" on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_member());
create policy "staff upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_staff());

-- Starting sites -------------------------------------------------------------------
insert into public.sites (name, code, active) values
  ('BTR production container', 'BTR', true),
  ('Hire warehouse', 'WH', false);
