import { supabase } from "@/integrations/supabase/client";

/** Deixa o membro exatamente nos departamentos escolhidos. */
export async function syncMemberDepartments(memberId: string, wanted: string[]) {
  const { data: current, error } = await supabase.from("department_members").select("department_id").eq("member_id", memberId);
  if (error) throw error;
  const have = (current ?? []).map((r) => r.department_id);
  const toAdd = wanted.filter((id) => !have.includes(id));
  const toRemove = have.filter((id) => !wanted.includes(id));

  if (toAdd.length) {
    const { error: e } = await supabase
      .from("department_members")
      .insert(toAdd.map((department_id) => ({ department_id, member_id: memberId })));
    if (e) throw e;
  }
  if (toRemove.length) {
    // O banco limpa o líder automaticamente se quem sai era o líder.
    const { error: e } = await supabase.from("department_members").delete().eq("member_id", memberId).in("department_id", toRemove);
    if (e) throw e;
  }
}

/**
 * Marca/desmarca o membro como líder nos departamentos escolhidos.
 * `currentLeaders` = departamento -> id do líder atual (do department_overview).
 * Só mexe nos departamentos em que o membro continua vinculado.
 */
export async function syncDepartmentLeadership(
  memberId: string,
  departmentIds: string[],
  leaderOf: string[],
  currentLeaders: Record<string, string | null>,
) {
  for (const deptId of departmentIds) {
    const isLeaderNow = currentLeaders[deptId] === memberId;
    const shouldLead = leaderOf.includes(deptId);
    if (shouldLead === isLeaderNow) continue;
    const { error } = await supabase
      .from("departments")
      .update({ leader_member_id: shouldLead ? memberId : null })
      .eq("id", deptId);
    if (error) throw error;
  }
}

/**
 * Salva os departamentos do membro e a liderança de cada um.
 * Se o cargo não for de liderança, ele deixa de ser líder dos departamentos em que está.
 */
export async function saveMemberDepartmentLinks(args: {
  memberId: string;
  departmentIds: string[];
  leaderDepartmentIds: string[];
  isLeadershipRole: boolean;
  currentLeaders: Record<string, string | null>;
}) {
  await syncMemberDepartments(args.memberId, args.departmentIds);
  await syncDepartmentLeadership(
    args.memberId,
    args.departmentIds,
    args.isLeadershipRole ? args.leaderDepartmentIds : [],
    args.currentLeaders,
  );
}
