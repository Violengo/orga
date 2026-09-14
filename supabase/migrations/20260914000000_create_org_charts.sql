create table public.org_charts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name text not null,
  title text not null,
  chart jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_charts_file_name_not_blank check (length(btrim(file_name)) > 0),
  constraint org_charts_title_not_blank check (length(btrim(title)) > 0),
  constraint org_charts_chart_is_object check (jsonb_typeof(chart) = 'object')
);

create index org_charts_owner_updated_idx
  on public.org_charts (owner_id, updated_at desc);

alter table public.org_charts enable row level security;

create policy "Owners can read their org charts"
  on public.org_charts for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can create their org charts"
  on public.org_charts for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Owners can update their org charts"
  on public.org_charts for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can delete their org charts"
  on public.org_charts for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on table public.org_charts to authenticated;

create or replace function public.set_org_chart_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_org_chart_updated_at() from public, anon;
grant execute on function public.set_org_chart_updated_at() to authenticated;

create trigger set_org_charts_updated_at
before update on public.org_charts
for each row execute function public.set_org_chart_updated_at();
