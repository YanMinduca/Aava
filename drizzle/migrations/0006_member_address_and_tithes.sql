-- Endereço, igreja do batismo e dízimos/ofertas ligados a membros. Pode rodar mais de uma vez.

-- 1) Novos campos no cadastro do membro
alter table public.members
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists zip_code text,
  add column if not exists baptism_church text;

-- 2) Receita (Dízimos/Ofertas) pode ser ligada a um membro
alter table public.financial_transactions
  add column if not exists member_id uuid references public.members(id) on delete set null;
create index if not exists financial_transactions_member_idx
  on public.financial_transactions (member_id) where member_id is not null;

-- O próprio membro enxerga apenas as receitas ligadas a ele (dízimos/ofertas dele)
drop policy if exists "financial own contributions read" on public.financial_transactions;
create policy "financial own contributions read" on public.financial_transactions
  for select to authenticated
  using (
    kind = 'entrada' and member_id is not null
    and exists (select 1 from public.members m where m.id = financial_transactions.member_id and m.user_id = auth.uid())
  );

-- 3) Versão anterior tinha uma tabela "tithes": passa os registros para o Financeiro e remove a tabela
do $$
begin
  if to_regclass('public.tithes') is not null then
    insert into public.financial_transactions
      (kind, category, amount, occurred_on, description, payment_method, notes, member_id, created_by, created_at)
    select 'entrada', 'Dízimos', t.amount, t.paid_on,
           case when t.reference_month is not null then 'Referente a ' || to_char(t.reference_month, 'MM/YYYY') end,
           t.payment_method, t.notes, t.member_id, t.created_by, t.created_at
    from public.tithes t;
    drop table public.tithes;
  end if;
end $$;
