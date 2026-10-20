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
    // O banco remove a liderança automaticamente se quem sai era líder do departamento.
    const { error: e } = await supabase.from("department_members").delete().eq("member_id", memberId).in("department_id", toRemove);
    if (e) throw e;
  }
}

/**
 * Marca/desmarca o membro como líder nos departamentos escolhidos.
 * `currentLeaders` = departamento -> ids dos líderes atuais (do department_overview).
 * Um departamento pode ter vários líderes (opcional); aqui só entra/sai este membro.
 * Só mexe nos departamentos em que o membro continua vinculado.
 */
export async function syncDepartmentLeadership(
  memberId: string,
  departmentIds: string[],
  leaderOf: string[],
  currentLeaders: Record<string, string[]>,
) {
  for (const deptId of departmentIds) {
    const isLeaderNow = (currentLeaders[deptId] ?? []).includes(memberId);
    const shouldLead = leaderOf.includes(deptId);
    if (shouldLead === isLeaderNow) continue;
    const { error } = shouldLead
      ? await supabase.from("department_leaders").insert({ department_id: deptId, member_id: memberId })
      : await supabase.from("department_leaders").delete().eq("department_id", deptId).eq("member_id", memberId);
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
  currentLeaders: Record<string, string[]>;
}) {
  await syncMemberDepartments(args.memberId, args.departmentIds);
  await syncDepartmentLeadership(
    args.memberId,
    args.departmentIds,
    args.isLeadershipRole ? args.leaderDepartmentIds : [],
    args.currentLeaders,
  );
}

/** Traduz erros do banco ao salvar um membro. */
export function memberSaveError(e: { message: string }) {
  return e.message.includes("members_registration_number_key") ? "Já existe um membro com esta matrícula." : e.message;
}
