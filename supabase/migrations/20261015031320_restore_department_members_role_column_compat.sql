-- Compatibilidade: a versão anterior do site ainda grava este campo. Ele deixa de ser usado para permissões.
alter table public.department_members
  add column if not exists church_role_id uuid references public.church_roles(id) on delete set null;
comment on column public.department_members.church_role_id is 'DEPRECATED: o cargo agora fica em members.church_role_id';
