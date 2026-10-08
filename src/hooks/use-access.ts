import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasFullAccess } from '@/lib/access-rules';

export function useAccess() {
  const q = useQuery({
    queryKey: ["access"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return { uid: null, roles: [] as string[], perms: [] as string[], email: "" };
      const [r, p] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_permissions").select("permission").eq("user_id", uid),
      ]);
      return {
        uid,
        email: u.user?.email ?? "",
        roles: (r.data ?? []).map((x) => x.role as string),
        perms: (p.data ?? []).map((x) => x.permission),
      };
    },
  });
  const roles = q.data?.roles ?? [];
  const isCeo = roles.includes("ceo");
  const isFullAccess = hasFullAccess(roles);
  const can = (perm: string) => isFullAccess || (q.data?.perms ?? []).includes(perm);
  return { ...q, roles, isCeo, isFullAccess, can, email: q.data?.email ?? "" };
}
