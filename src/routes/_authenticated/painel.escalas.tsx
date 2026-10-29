import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { siteMeta } from "@/lib/site-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeptSchedule } from "@/components/shifts/DeptSchedule";
import { MyShiftActions, useMyShifts } from "@/components/shifts/MyShifts";
import { useAccess } from "@/hooks/use-access";
import { fmtShiftLong, fmtShiftTime } from "@/lib/shifts";

export const Route = createFileRoute("/_authenticated/painel/escalas")({
  validateSearch: (s: Record<string, unknown>): { dept?: string } => (typeof s["dept"] === "string" ? { dept: s["dept"] } : {}),
  head: () => siteMeta("Escalas — Área de membros Aava", "Escalas dos departamentos de voluntários."),
  component: ShiftsPage,
});

/** Departamentos cujas escalas a pessoa pode ver (líder, voluntário ou liderança da igreja). */
export function useShiftDepartments() {
  return useQuery({
    queryKey: ["shift-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shift_departments");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function ShiftsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const depts = useShiftDepartments();
  const mine = useMyShifts(20);
  const { isFullAccess } = useAccess();

  if (depts.isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  const list = depts.data ?? [];
  if (list.length === 0) {
    return (
      <div>
        <h1 className="text-3xl text-foreground">Escalas</h1>
        <p className="mt-4 text-muted-foreground">Você ainda não participa de nenhum departamento. Quando entrar em um, a escala aparece aqui.</p>
      </div>
    );
  }
  const current = list.find((d) => d.id === search.dept) ?? list[0]!;

  return (
    <div>
      <h1 className="text-3xl text-foreground">Escalas</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        {current.can_manage
          ? `Você é líder: escolha o dia no calendário e marque os voluntários. Os voluntários só veem a escala, dão ciente ou pedem alteração.${isFullAccess ? "" : " Você vê apenas o seu departamento."}`
          : "Veja quando você está escalado, dê o seu ciente ou peça alteração informando o motivo."}
      </p>

      {(mine.data ?? []).length > 0 && (
        <section className="mt-8" aria-labelledby="mine-title">
          <h2 id="mine-title" className="font-display text-xl text-foreground">
            Minhas próximas escalas
          </h2>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {(mine.data ?? []).map((s) => (
              <li key={s.shift_id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-lg capitalize text-foreground">{fmtShiftLong(s.shift_date)}</p>
                  <Badge variant="secondary">{s.department_name}</Badge>
                </div>
                <p className="mt-1 text-sm text-foreground">
                  {s.service_name}
                  {fmtShiftTime(s.service_time) ? ` · ${fmtShiftTime(s.service_time)}` : ""}
                </p>
                {s.team.length > 0 && <p className="mt-1 text-sm text-muted-foreground">Com: {s.team.join(", ")}</p>}
                <MyShiftActions shift={s} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="dept-title">
        <h2 id="dept-title" className="font-display text-xl text-foreground">
          Escala do departamento
        </h2>
        {list.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {list.map((d) => (
              <Button key={d.id} size="sm" variant={d.id === current.id ? "default" : "outline"} onClick={() => void navigate({ search: { dept: d.id } })}>
                {d.name}
              </Button>
            ))}
          </div>
        )}
        {list.length === 1 && <p className="mt-1 text-sm text-muted-foreground">{current.name}</p>}
        <div className="mt-5">
          <DeptSchedule key={current.id} dept={current} />
        </div>
      </section>
    </div>
  );
}
