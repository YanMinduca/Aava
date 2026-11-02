import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadSheets } from "@/lib/export";
import { ageFrom, dateBR } from "@/lib/church";
import { fmtDateTime, REGISTRATION_STATUS } from "@/lib/events";
import { MEMBER_RELIGION, RELIGIONS, religionLabel, summarizePeople } from "@/lib/event-data";

type Row = Tables<"event_registrations"> & { event_lots: { name: string } | null };

const COLORS = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0d9488", "#64748b", "#94a3b8"];
const fmtAge = (n: number | null | undefined) => (n == null ? "—" : String(n).replace(".", ","));

/** Aba "Dados": médias, gráficos, relatório em Excel e consulta pessoa a pessoa. */
export function EventData({ eventId, title }: { eventId: string; title: string }) {
  const [search, setSearch] = useState("");
  const [religionFilter, setReligionFilter] = useState("todas");
  const [openId, setOpenId] = useState<string | null>(null);

  const regs = useQuery({
    queryKey: ["admin-event-data", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registrations")
        .select("*, event_lots(name)")
        .eq("event_id", eventId)
        .neq("status", "cancelled")
        .order("attendee_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const people = useMemo(() => regs.data ?? [], [regs.data]);
  const sum = useMemo(() => summarizePeople(people), [people]);
  const list = people.filter((r) => {
    if (
      religionFilter === "nao"
        ? !!r.attendee_religion
        : religionFilter !== "todas" && r.attendee_religion !== religionFilter
    )
      return false;
    const q = search.trim().toLowerCase();
    return (
      !q ||
      r.attendee_name.toLowerCase().includes(q) ||
      (r.attendee_institution ?? "").toLowerCase().includes(q) ||
      (r.attendee_phone ?? "").includes(q)
    );
  });
  const open = people.find((r) => r.id === openId) ?? null;

  function exportReport() {
    const a = sum.ageStats;
    downloadSheets(`dados-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, [
      {
        name: "Resumo",
        rows: [
          ["Relatório de dados do evento", title],
          ["Gerado em", fmtDateTime(new Date().toISOString())],
          ["Inscrições consideradas (sem canceladas)", sum.total],
          [],
          ["Idade", ""],
          ["Média de idade", a.avg ?? "—"],
          ["Mediana", a.median ?? "—"],
          ["Mais novo(a)", a.min ?? "—"],
          ["Mais velho(a)", a.max ?? "—"],
          ["Inscrições com data de nascimento", a.count],
        ],
      },
      {
        name: "Religiões",
        rows: [
          ["Religião", "Inscritos", "% do total"],
          ...sum.religions.map((r) => [r.label, r.count, r.pct]),
        ],
      },
      {
        name: "Faixas etárias",
        rows: [["Faixa (anos)", "Inscritos"], ...sum.bands.map((b) => [b.label, b.count])],
      },
      {
        name: "Instituições",
        rows: [["Instituição", "Inscritos"], ...sum.institutions.map((i) => [i.name, i.count])],
      },
      {
        name: "Inscritos",
        rows: [
          [
            "Nome",
            "CPF",
            "Telefone",
            "E-mail",
            "Data de nascimento",
            "Idade",
            "Religião",
            "Instituição",
            "Lote",
            "Situação",
            "Inscrito em",
          ],
          ...people.map((r) => [
            r.attendee_name,
            r.attendee_cpf ?? "",
            r.attendee_phone ?? "",
            r.attendee_email ?? "",
            dateBR(r.attendee_birth_date),
            ageFrom(r.attendee_birth_date) ?? "",
            religionLabel(r.attendee_religion),
            r.attendee_institution ?? "",
            r.event_lots?.name ?? "",
            REGISTRATION_STATUS[r.status] ?? r.status,
            fmtDateTime(r.created_at),
          ]),
        ],
      },
    ]);
  }

  if (regs.isLoading) return <p className="mt-4 text-muted-foreground">Carregando...</p>;
  const relData = sum.religions.filter((r) => r.count > 0);

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Considera as inscrições não canceladas. Idade calculada na data de hoje.
        </p>
        <Button variant="outline" onClick={exportReport} disabled={sum.total === 0}>
          <Download className="h-4 w-4" /> Gerar relatório (Excel)
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Inscritos", String(sum.total)],
          ["Média de idade", sum.ageStats.avg === null ? "—" : `${fmtAge(sum.ageStats.avg)} anos`],
          ["Mediana", sum.ageStats.median === null ? "—" : `${fmtAge(sum.ageStats.median)} anos`],
          [
            "Mais novo – mais velho",
            sum.ageStats.min === null ? "—" : `${sum.ageStats.min} – ${sum.ageStats.max}`,
          ],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-5">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 text-3xl font-semibold text-foreground">{v}</p>
          </div>
        ))}
      </div>
      {sum.ageStats.count < sum.total && (
        <p className="-mt-3 text-xs text-muted-foreground">
          A idade considera {sum.ageStats.count} de {sum.total} inscritos (os demais não têm data de
          nascimento).
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <p className="font-semibold text-foreground">Religiões</p>
          <div className="mt-2 h-64">
            {sum.total === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                Ainda não há inscrições.
              </p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={relData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {relData.map((r, i) => (
                      <Cell key={r.value} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {sum.religions.map((r) => (
              <li key={r.value} className="flex justify-between">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="text-foreground">
                  {r.count} · {String(r.pct).replace(".", ",")}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <p className="font-semibold text-foreground">Faixas etárias</p>
          <div className="mt-2 h-64">
            {sum.ageStats.count === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                Sem datas de nascimento ainda.
              </p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={sum.bands}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Inscritos"
                    fill="var(--primary)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-3 font-semibold text-foreground">Instituições</p>
          {sum.institutions.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">Nenhuma informada.</p>
          ) : (
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
              {sum.institutions.map((i) => (
                <li key={i.name} className="flex justify-between">
                  <span className="text-muted-foreground">{i.name}</span>
                  <span className="text-foreground">{i.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div>
        <p className="font-semibold text-foreground">Pessoa a pessoa</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Buscar</Label>
            <Input
              placeholder="Nome, telefone ou instituição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Religião</Label>
            <Select value={religionFilter} onValueChange={setReligionFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {RELIGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
                <SelectItem value={MEMBER_RELIGION.value}>{MEMBER_RELIGION.label}</SelectItem>
                <SelectItem value="nao">Não informado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                {["Nome", "Idade", "Religião", "Instituição", "Telefone"].map((h) => (
                  <th key={h} className="p-4 font-medium">
                    {h}
                  </th>
                ))}
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={6}>
                    Nenhuma pessoa encontrada.
                  </td>
                </tr>
              )}
              {list.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-4 font-medium text-foreground">{r.attendee_name}</td>
                  <td className="p-4 text-muted-foreground">
                    {ageFrom(r.attendee_birth_date) ?? "—"}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {religionLabel(r.attendee_religion)}
                  </td>
                  <td className="p-4 text-muted-foreground">{r.attendee_institution || "—"}</td>
                  <td className="p-4 text-muted-foreground">{r.attendee_phone || "—"}</td>
                  <td className="p-4 text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>
                      Ver dados
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.attendee_name}</DialogTitle>
              </DialogHeader>
              <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
                {(
                  [
                    ["Situação", REGISTRATION_STATUS[open.status] ?? open.status],
                    ["Telefone", open.attendee_phone || "—"],
                    ["E-mail", open.attendee_email || "—"],
                    ["CPF", open.attendee_cpf || "—"],
                    [
                      "Data de nascimento",
                      open.attendee_birth_date
                        ? `${dateBR(open.attendee_birth_date)} (${ageFrom(open.attendee_birth_date)} anos)`
                        : "—",
                    ],
                    ["Religião", religionLabel(open.attendee_religion)],
                    ["Instituição", open.attendee_institution || "—"],
                    ["Lote", `${open.event_lots?.name ?? "—"} × ${open.quantity}`],
                    ["Inscrito em", fmtDateTime(open.created_at)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-foreground">
                      {k === "Situação" ? (
                        <Badge variant={open.status === "confirmed" ? "default" : "secondary"}>
                          {v}
                        </Badge>
                      ) : (
                        v
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
