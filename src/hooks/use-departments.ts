import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { LEADER_DEPT_PERMISSIONS } from "@/lib/church";

/** Departamentos visíveis para o usuário (com líderes e total de voluntários). */
export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("department_overview");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Cargos criados (Voluntário, Líder, ...). */
export function useChurchRoles() {
  return useQuery({
    queryKey: ["church-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("church_roles").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Departamentos liberados para cada cargo de alcance "selected": Map<role_id, department_id[]>. */
export function useRoleDepartments() {
  return useQuery({
    queryKey: ["role-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("church_role_departments").select("role_id, department_id");
      if (error) throw error;
      const map = new Map<string, string[]>();
      for (const r of data ?? []) map.set(r.role_id, [...(map.get(r.role_id) ?? []), r.department_id]);
      return map;
    },
  });
}

/** Departamentos de cada membro: Map<member_id, {id, name}[]>. Só para quem vê membros/departamentos. */
export function useMemberDepartments(enabled = true) {
  return useQuery({
    queryKey: ["member-departments"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_departments");
      if (error) throw error;
      const map = new Map<string, { id: string; name: string }[]>();
      for (const r of data ?? []) {
        const list = map.get(r.member_id) ?? [];
        list.push({ id: r.department_id, name: r.department_name });
        map.set(r.member_id, list);
      }
      return map;
    },
  });
}

/**
 * Permissões por departamento no navegador (só para esconder botões).
 * Quem de fato autoriza é o banco (RLS + funções), então isto nunca é a barreira de segurança.
 * Regra espelhada do banco: o cargo do membro vale em todos os departamentos (scope "all"),
 * só nos escolhidos ("selected") ou só nos que a pessoa participa ("linked").
 */
export function useDeptAccess() {
  const { can, isFullAccess, data: access } = useAccess();
  const uid = access?.uid;
  const departments = useDepartments();
  const mine = useQuery({
    queryKey: ["my-dept-roles", uid],
    enabled: !!uid,
    queryFn: async () => {
      const empty = { memberId: null as string | null, permissions: [] as string[], scope: "linked", selected: [] as string[], linked: [] as string[] };
      const { data: m } = await supabase.from("members").select("id, church_role_id").eq("user_id", uid!).maybeSingle();
      if (!m) return empty;
      const [links, role] = await Promise.all([
        supabase.from("department_members").select("department_id").eq("member_id", m.id),
        m.church_role_id ? supabase.from("church_roles").select("permissions, scope").eq("id", m.church_role_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const selected = m.church_role_id
        ? ((await supabase.from("church_role_departments").select("department_id").eq("role_id", m.church_role_id)).data ?? []).map((r) => r.department_id)
        : [];
      return {
        memberId: m.id as string | null,
        permissions: role.data?.permissions ?? [],
        scope: role.data?.scope ?? "linked",
        selected,
        linked: (links.data ?? []).map((r) => r.department_id),
      };
    },
  });

  const manageAll = isFullAccess || can("manage_departments");
  const canIn = (deptId: string, perm: string) => {
    if (manageAll) return true;
    const dept = departments.data?.find((d) => d.id === deptId);
    if (mine.data?.memberId && dept?.leader_member_ids?.includes(mine.data.memberId) && LEADER_DEPT_PERMISSIONS.includes(perm)) return true;
    const r = mine.data;
    if (!r || !r.permissions.includes(perm)) return false;
    return r.scope === "all" || (r.scope === "selected" && r.selected.includes(deptId)) || (r.scope === "linked" && r.linked.includes(deptId));
  };
  const canViewPage = manageAll || can("view_departments") || (departments.data?.length ?? 0) > 0;
  return { canIn, manageAll, canViewPage, isLoading: departments.isLoading || mine.isLoading };
}
