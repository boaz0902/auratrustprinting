begin;

alter table public.orders
  alter column estimated_total drop not null,
  alter column gcash_ref drop not null,
  alter column receipt_path drop not null,
  add column if not exists contact_method text,
  add column if not exists contact_handle text,
  add column if not exists preferred_pickup_date date,
  add column if not exists customer_notes text,
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists final_total numeric(12, 2),
  add column if not exists internal_note text,
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists files_deleted_at timestamptz;

alter table public.orders alter column status set default 'New';

do $$
declare
  status_check record;
begin
  for status_check in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
      and (
        pg_get_constraintdef(oid) ilike '%received%'
        or pg_get_constraintdef(oid) ilike '%payment checking%'
        or pg_get_constraintdef(oid) ilike '%ready for pickup%'
      )
  loop
    execute format('alter table public.orders drop constraint %I', status_check.conname);
  end loop;
end;
$$;

update public.orders
set status = case status
  when 'Received' then 'New'
  when 'Payment Checking' then 'Awaiting payment'
  when 'Ready for Pickup' then 'Ready for pickup'
  else status
end
where status in ('Received', 'Payment Checking', 'Ready for Pickup');

create table if not exists public.order_reference_counters (
  year integer primary key,
  last_value bigint not null default 0
);

revoke all on public.order_reference_counters from public, anon, authenticated;

insert into public.order_reference_counters as existing_counter (year, last_value)
select split_part(order_number, '-', 2)::integer, max(split_part(order_number, '-', 3)::bigint)
from public.orders
where order_number ~ '^AT-[0-9]{4}-[0-9]+$'
group by split_part(order_number, '-', 2)::integer
on conflict (year) do update
set last_value = greatest(existing_counter.last_value, excluded.last_value);

create index if not exists orders_reference_mobile_idx
  on public.orders (order_number, mobile);
create index if not exists orders_cleanup_idx
  on public.orders (status, status_changed_at)
  where files_deleted_at is null;

create or replace function public.touch_order_status_changed_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, now());
  elsif new.status is distinct from old.status then
    new.status_changed_at := now();
    new.files_deleted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_touch_status_changed_at on public.orders;
create trigger orders_touch_status_changed_at
before insert or update of status on public.orders
for each row execute function public.touch_order_status_changed_at();

create or replace function public.create_quote_order(
  p_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_mobile text,
  p_contact_method text,
  p_contact_handle text,
  p_pickup_or_delivery text,
  p_preferred_pickup_date date,
  p_customer_notes text,
  p_estimated_total numeric,
  p_terms_accepted_at timestamptz,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_year integer := extract(year from timezone('UTC', now()))::integer;
  next_value bigint;
  next_reference text;
  result_order public.orders%rowtype;
  existing_order public.orders%rowtype;
  item_count integer;
  declared_size bigint;
  actual_file_count integer;
  actual_total_size bigint;
begin
  if auth.uid() is null or auth.uid() <> p_customer_id then
    raise exception 'A valid customer session is required.';
  end if;
  if p_id is null or p_customer_name is null or length(trim(p_customer_name)) not between 2 and 120 then
    raise exception 'Enter a valid customer name.';
  end if;
  if p_mobile is null or p_mobile !~ '^09[0-9]{9}$' then
    raise exception 'Enter a valid Philippine mobile number.';
  end if;
  if p_contact_method is null or p_contact_method not in ('Messenger', 'Viber', 'WhatsApp', 'SMS', 'Email') then
    raise exception 'Choose a valid contact method.';
  end if;
  if p_pickup_or_delivery is null or p_pickup_or_delivery not in ('Pickup', 'Delivery') then
    raise exception 'Choose pickup or delivery.';
  end if;
  if length(coalesce(p_contact_handle, '')) > 160
     or length(coalesce(p_customer_notes, '')) > 1000
     or (p_estimated_total is not null and p_estimated_total < 0) then
    raise exception 'Some quote details exceed the allowed limits.';
  end if;
  if p_terms_accepted_at is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Consent and uploaded files are required.';
  end if;

  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 10 then
    raise exception 'The request must include between 1 and 10 files.';
  end if;
  if (
    select count(distinct entry.item->>'storagePath')
    from jsonb_array_elements(p_items) as entry(item)
  ) <> item_count then
    raise exception 'Each uploaded file must have a unique storage reference.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    where coalesce(entry.item->>'storagePath', '') not like p_customer_id::text || '/' || p_id::text || '/%'
       or coalesce(entry.item->>'size', '') !~ '^[0-9]+$'
       or (entry.item->>'size')::bigint > 10485760
       or coalesce(jsonb_typeof(entry.item->'selections'), '') <> 'array'
       or length(coalesce(entry.item->>'notes', '')) > 500
  ) then
    raise exception 'One or more uploaded file references are invalid.';
  end if;
  select coalesce(sum((entry.item->>'size')::bigint), 0)
  into declared_size
  from jsonb_array_elements(p_items) as entry(item);
  if declared_size > 41943040 then
    raise exception 'The request exceeds the 40 MB total upload limit.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    where not exists (
      select 1 from storage.objects as stored
      where stored.bucket_id = 'order-files'
        and stored.name = entry.item->>'storagePath'
    )
  ) then
    raise exception 'One or more uploaded files could not be verified.';
  end if;
  if exists (
    select 1
    from storage.objects as stored
    join jsonb_array_elements(p_items) as entry(item)
      on stored.name = entry.item->>'storagePath'
    where stored.bucket_id = 'order-files'
      and coalesce(stored.metadata->>'size', '') !~ '^[0-9]+$'
  ) then
    raise exception 'One or more uploaded file sizes could not be verified.';
  end if;
  select count(distinct stored.name), coalesce(sum((stored.metadata->>'size')::bigint), 0)
  into actual_file_count, actual_total_size
  from jsonb_array_elements(p_items) as entry(item)
  join storage.objects as stored
    on stored.name = entry.item->>'storagePath'
   and stored.bucket_id = 'order-files';
  if actual_file_count <> item_count or actual_total_size > 41943040 then
    raise exception 'The uploaded file count or total size does not match the request limits.';
  end if;

  select * into existing_order from public.orders where id = p_id;
  if found then
    if existing_order.customer_id <> p_customer_id then
      raise exception 'This request reference is already in use.';
    end if;
    return jsonb_build_object('id', existing_order.id, 'order_number', existing_order.order_number, 'status', existing_order.status);
  end if;

  insert into public.order_reference_counters as counter (year, last_value)
  values (current_year, 1)
  on conflict (year) do update
  set last_value = counter.last_value + 1
  returning last_value into next_value;
  next_reference := format('AT-%s-%s', current_year, lpad(next_value::text, 4, '0'));

  insert into public.orders (
    id, order_number, customer_id, customer_name, mobile, contact_method,
    contact_handle, pickup_or_delivery, preferred_pickup_date, customer_notes,
    items, estimated_total, final_total, internal_note, gcash_ref, receipt_path,
    status, terms_accepted_at, consent_accepted_at, created_at, status_changed_at
  ) values (
    p_id, next_reference, p_customer_id, trim(p_customer_name), p_mobile, p_contact_method,
    nullif(trim(p_contact_handle), ''), p_pickup_or_delivery, p_preferred_pickup_date,
    nullif(trim(p_customer_notes), ''), p_items, p_estimated_total, null, null, null, null,
    'New', p_terms_accepted_at, p_terms_accepted_at, now(), now()
  )
  on conflict (id) do nothing
  returning * into result_order;

  if result_order.id is null then
    select * into existing_order from public.orders where id = p_id;
    if existing_order.id is null or existing_order.customer_id <> p_customer_id then
      raise exception 'The quote request could not be saved.';
    end if;
    result_order := existing_order;
  end if;

  return jsonb_build_object(
    'id', result_order.id,
    'order_number', result_order.order_number,
    'status', result_order.status
  );
end;
$$;

revoke all on function public.create_quote_order(uuid, uuid, text, text, text, text, text, date, text, numeric, timestamptz, jsonb) from public;
grant execute on function public.create_quote_order(uuid, uuid, text, text, text, text, text, date, text, numeric, timestamptz, jsonb) to anon, authenticated;

create or replace function public.track_order_details(p_order_number text, p_mobile text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'final_total', o.final_total,
    'estimated_total', o.estimated_total,
    'customer_notes', o.customer_notes,
    'items', coalesce((
      select jsonb_agg(item - 'storagePath')
      from jsonb_array_elements(
        case when jsonb_typeof(o.items) = 'array' then o.items else '[]'::jsonb end
      ) as item
    ), '[]'::jsonb)
  )
  from public.orders as o
  where o.order_number = trim(p_order_number)
    and regexp_replace(o.mobile, '\D', '', 'g') = regexp_replace(trim(p_mobile), '\D', '', 'g')
  limit 1;
$$;

revoke all on function public.track_order_details(text, text) from public;
grant execute on function public.track_order_details(text, text) to anon, authenticated;

update storage.buckets
set file_size_limit = 10485760, allowed_mime_types = null
where id = 'order-files';

commit;
