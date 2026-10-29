import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtShiftLong, fmtShiftTime, parseISODate, toISODate, type Shift, type ShiftMember } from "@/lib/shifts";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TITLE = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const MAX_NAMES = 4;

/** Primeiro e último dia exibidos na grade do mês (semanas inteiras, de domingo a sábado). */
export function gridBounds(month: Date): { start: Date; end: Date; weeks: number } {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + days) / 7);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + weeks * 7 - 1);
  return { start, end, weeks };
}

const dot: Record<ShiftMember["status"], string> = {
  confirmed: "bg-success",
  pending: "bg-muted-foreground/60",
  change_requested: "bg-destructive",
};
const dotLabel: Record<ShiftMember["status"], string> = { confirmed: "ciente", pending: "aguardando ciente", change_requested: "pediu alteração" };

/**
 * Calendário grande do mês: cada dia mostra os cultos escalados e o nome de quem está escalado.
 * Dias com escala ganham outra cor; a bolinha ao lado do nome mostra se a pessoa já deu ciente.
 */
export function MonthGrid({
  month,
  shifts,
  selected,
  today,
  onSelect,
  onMonthChange,
}: {
  month: Date;
  shifts: Shift[];
  selected: Date;
  /** Hoje, "AAAA-MM-DD" (horário de Brasília). */
  today: string;
  onSelect: (d: Date) => void;
  onMonthChange: (d: Date) => void;
}) {
  const { start, weeks } = gridBounds(month);
  const selectedIso = toISODate(selected);
  const byDay = new Map<string, Shift[]>();
  for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  for (const list of byDay.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));

  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const title = TITLE.format(month);

  return (
    <div className="rounded-2xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl capitalize text-foreground" aria-live="polite">
          {title}
        </h3>
        <div className="flex gap-2">
          <Button type="button" size="icon" variant="outline" aria-label="Mês anterior" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onMonthChange(parseISODate(today))}>
            Hoje
          </Button>
          <Button type="button" size="icon" variant="outline" aria-label="Próximo mês" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground sm:gap-1.5" aria-hidden>
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map((d) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === month.getMonth();
          const list = byDay.get(iso) ?? [];
          const has = list.length > 0;
          const isMine = list.some((s) => s.members.some((m) => m.isMe));
          const isToday = iso === today;
          const isSelected = iso === selectedIso;
          const past = iso < today;
          const people = list.reduce((n, s) => n + s.members.length, 0);

          const tone = has
            ? isMine
              ? "border-primary bg-primary/20"
              : "border-primary/40 bg-primary-soft"
            : inMonth
              ? "border-transparent bg-muted/30 hover:bg-muted/60"
              : "border-transparent bg-transparent text-muted-foreground/60 hover:bg-muted/30";

          return (
            <button
              key={iso}
              type="button"
              data-has-shift={has ? "true" : "false"}
              data-day={iso}
              aria-pressed={isSelected}
              aria-label={`${fmtShiftLong(iso)}${has ? `: ${list.length} ${list.length === 1 ? "culto escalado" : "cultos escalados"}, ${people} ${people === 1 ? "voluntário" : "voluntários"}` : ""}`}
              onClick={() => onSelect(d)}
              className={`flex min-h-20 flex-col rounded-lg border p-1 text-left transition-colors sm:min-h-28 sm:p-2 ${tone} ${has && past ? "opacity-75" : ""} ${isSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
            >
              <span
                className={`mb-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-primary text-primary-foreground" : has ? "text-primary" : "text-foreground"}`}
              >
                {d.getDate()}
              </span>

              <span className="flex min-w-0 flex-col gap-1.5">
                {list.map((s) => {
                  const shown = s.members.slice(0, MAX_NAMES);
                  const extra = s.members.length - shown.length;
                  const time = fmtShiftTime(s.time);
                  return (
                    <span key={s.id} className="min-w-0 text-[10px] leading-tight sm:text-xs">
                      <span className="block truncate font-semibold text-foreground">
                        {time}
                        <span className="hidden sm:inline">
                          {time ? " · " : ""}
                          {s.name}
                        </span>
                      </span>
                      {shown.map((m) => (
                        <span key={m.memberId} className={`flex items-center gap-1 ${m.isMe ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[m.status]}`} title={dotLabel[m.status]} aria-hidden />
                          <span className="truncate">
                            <span className="sm:hidden">{m.name.split(" ")[0]}</span>
                            <span className="hidden sm:inline">{m.name}</span>
                          </span>
                        </span>
                      ))}
                      {extra > 0 && <span className="block text-muted-foreground">+{extra} {extra === 1 ? "pessoa" : "pessoas"}</span>}
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda do calendário">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-primary/40 bg-primary-soft" aria-hidden /> Dia com culto escalado
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-primary bg-primary/20" aria-hidden /> Você está escalado
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-primary" aria-hidden /> Hoje
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> ciente
          <span className="ml-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" aria-hidden /> aguardando
          <span className="ml-2 h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden /> pediu alteração
        </li>
      </ul>
    </div>
  );
}
