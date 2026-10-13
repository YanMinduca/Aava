import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/church";
import { TitheTable } from "./TitheTable";
import type { TitheRow } from "./TitheDialog";

/** Histórico de dízimos do próprio membro (somente leitura). */
export function MyTithes({ memberId }: { memberId: string }) {
  const q = useQuery({
    queryKey: ["tithes", "mine", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tithes")
        .select("*")
        .eq("member_id", memberId)
        .order("paid_on", { ascending: false });
      if (error) throw error;
      return data as TitheRow[];
    },
  });
  const rows = q.data ?? [];
  const year = String(new Date().getFullYear());
  const totalYear = rows
    .filter((t) => t.paid_on.startsWith(year))
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl text-foreground">Meus dízimos</h2>
        <p className="text-sm text-muted-foreground">
          Total em {year}: <span className="font-semibold text-foreground">{brl(totalYear)}</span>
        </p>
      </div>
      <div className="mt-4">
        <TitheTable rows={rows} loading={q.isLoading} />
      </div>
    </section>
  );
}
