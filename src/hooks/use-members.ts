import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Todos os cadastros (membros e visitantes). As telas separam os dois com splitVisitors. */
export function useAllMembers(enabled = true) {
  return useQuery({
    queryKey: ["members"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });
}
