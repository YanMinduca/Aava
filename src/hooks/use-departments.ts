import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { LEADER_DEPT_PERMISSIONS } from "@/lib/church";

/** Departamentos visíveis para o usuário (com líder e total de voluntários). */
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
 */
export function useDeptAccess() {
  const { can, isFullAccess, data: access } = useAccess();
  const uid = access?.uid;
  const departments = useDepartments();
  const mine = useQuery({
    queryKey: ["my-dept-roles", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: m } = await supabase.from("members").select("id").eq("user_id", uid!).maybeSingle();
      if (!m) return { memberId: null as string | null, rows: [] as { department_id: string; permissions: string[] }[] };
      const { data } = await supabase
        .from("department_members")
        .select("department_id, church_roles(permissions)")
        .eq("member_id", m.id);
      return {
        memberId: m.id as string | null,
        rows: (data ?? []).map((r) => ({ department_id: r.department_id, permissions: r.church_roles?.permissions ?? [] })),
      };
    },
  });

  const manageAll = isFullAccess || can("manage_departments");
  const canIn = (deptId: string, perm: string) => {
    if (manageAll) return true;
    const dept = departments.data?.find((d) => d.id === deptId);
    if (dept?.leader_member_id && dept.leader_member_id === mine.data?.memberId && LEADER_DEPT_PERMISSIONS.includes(perm)) return true;
    return (mine.data?.rows ?? []).some((r) => r.department_id === deptId && r.permissions.includes(perm));
  };
  const canViewPage = manageAll || can("view_departments") || (departments.data?.length ?? 0) > 0;
  return { canIn, manageAll, canViewPage, isLoading: departments.isLoading || mine.isLoading };
}
