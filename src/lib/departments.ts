import { supabase } from "@/integrations/supabase/client";

/** Deixa o membro exatamente nos departamentos escolhidos (novos entram como Voluntário). */
export async function syncMemberDepartments(memberId: string, wanted: string[]) {
  const { data: current, error } = await supabase
    .from("department_members")
    .select("department_id")
    .eq("member_id", memberId);
  if (error) throw error;
  const have = (current ?? []).map((r) => r.department_id);
  const toAdd = wanted.filter((id) => !have.includes(id));
  const toRemove = have.filter((id) => !wanted.includes(id));

  if (toAdd.length) {
    const { data: vol } = await supabase.from("church_roles").select("id").eq("code", "volunteer").maybeSingle();
    const { error: e } = await supabase
      .from("department_members")
      .insert(toAdd.map((department_id) => ({ department_id, member_id: memberId, church_role_id: vol?.id ?? null })));
    if (e) throw e;
  }
  if (toRemove.length) {
    const { error: e } = await supabase
      .from("department_members")
      .delete()
      .eq("member_id", memberId)
      .in("department_id", toRemove);
    if (e) throw e;
  }
}
