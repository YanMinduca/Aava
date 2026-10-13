import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR } from "@/lib/church";

/** Dízimos e ofertas do próprio membro (somente leitura). */
export function MyContributions({ memberId }: { memberId: string }) {
  const q = useQuery({
    queryKey: ["transactions", "mine", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id, category, amount, occurred_on, payment_method")
        .eq("member_id", memberId)
        .eq("kind", "entrada")
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = q.data ?? [];
  const year = String(new Date().getFullYear());
  const totalYear = rows
    .filter((t) => t.occurred_on.startsWith(year))
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl text-foreground">Meus dízimos e ofertas</h2>
        <p className="text-sm text-muted-foreground">
          Total em {year}: <span className="font-semibold text-foreground">{brl(totalYear)}</span>
        </p>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">Data</th>
              <th className="p-4 font-medium">Categoria</th>
              <th className="p-4 font-medium">Forma</th>
              <th className="p-4 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Nenhum registro ainda.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="whitespace-nowrap p-4 text-foreground">{dateBR(t.occurred_on)}</td>
                <td className="p-4 text-foreground">{t.category}</td>
                <td className="p-4 text-muted-foreground">{t.payment_method ?? "—"}</td>
                <td className="whitespace-nowrap p-4 text-right font-medium text-foreground">
                  {brl(Number(t.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
