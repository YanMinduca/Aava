import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/site-query", () => ({
  useSiteContent: () => ({ schedule: [{ day: "Domingo", time: "18h00", name: "Culto de Celebração" }, { day: "Quarta-feira", time: "20h00", name: "Culto de Oração" }] }),
  siteMeta: () => ({}),
}));

import {
  fmtShiftLong, fmtShiftTime, groupShifts, monthBounds, parseISODate, parseServiceTime, servicesForDate, shiftError, toISODate, todayBR, weekdayFromText,
  type MyShift, type Shift, type ShiftRow,
} from "@/lib/shifts";
import { NextShiftCard } from "@/components/shifts/MyShifts";
import { ShiftEditor } from "@/components/shifts/ShiftEditor";
import { DeptSchedule } from "@/components/shifts/DeptSchedule";

// O jsdom não tem ResizeObserver (os navegadores têm); os checkboxes do Radix dentro de formulário precisam dele.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
const ahead = (days: number) => toISODate(new Date(Date.now() + days * 86400_000));
const nextSunday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return toISODate(d);
};

beforeEach(() => h.rpc.mockResolvedValue({ data: [], error: null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("lógica de escalas (lib/shifts)", () => {
  it("entende dia e horário dos cultos escritos no site", () => {
    expect(parseServiceTime("18h00")).toBe("18:00");
    expect(parseServiceTime("20h")).toBe("20:00");
    expect(parseServiceTime("19:30")).toBe("19:30");
    expect(parseServiceTime("em breve")).toBeNull();
    expect(parseServiceTime("25h00")).toBeNull();
    expect(weekdayFromText("Domingo")).toBe(0);
    expect(weekdayFromText("Quarta-feira")).toBe(3);
    expect(weekdayFromText("Sábado")).toBe(6);
    expect(weekdayFromText("todo mês")).toBeNull();
  });

  it("sugere só os cultos do dia da semana escolhido", () => {
    const schedule = [{ day: "Domingo", time: "18h00", name: "Celebração" }, { day: "Quarta-feira", time: "20h00", name: "Oração" }];
    expect(servicesForDate(parseISODate("2026-11-08"), schedule)).toEqual([{ name: "Celebração", time: "18:00" }]); // domingo
    expect(servicesForDate(parseISODate("2026-11-11"), schedule)).toEqual([{ name: "Oração", time: "20:00" }]); // quarta
    expect(servicesForDate(parseISODate("2026-11-10"), schedule)).toEqual([]); // terça
  });

  it("formata data sem deslocar o dia e usa o horário de Brasília", () => {
    expect(fmtShiftLong("2026-11-08")).toMatch(/domingo.*08.*novembro/i);
    expect(toISODate(parseISODate("2026-11-08"))).toBe("2026-11-08");
    expect(todayBR(new Date("2026-10-25T02:00:00Z"))).toBe("2026-10-24"); // 23h do dia 24 em Brasília
    expect(fmtShiftTime("18:00:00")).toBe("18h00");
    expect(fmtShiftTime("00:00:00")).toBe("");
    expect(fmtShiftTime(null)).toBe("");
    expect(monthBounds(parseISODate("2026-02-10"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("junta as linhas em cultos com seus voluntários", () => {
    const base = { shift_id: "s1", shift_date: "2026-11-08", service_name: "Celebração", service_time: "18:00:00", notes: null, has_account: true, acknowledged_at: null, change_reason: null, change_requested_at: null, leader_note: null };
    const rows: ShiftRow[] = [
      { ...base, member_id: "a", member_name: "Ana", status: "confirmed", is_me: true },
      { ...base, member_id: "b", member_name: "Bia", status: "change_requested", is_me: false },
      { ...base, shift_id: "s2", member_id: null, member_name: null, status: null, is_me: null },
    ];
    const shifts = groupShifts(rows);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]!.members.map((m) => [m.name, m.status, m.isMe])).toEqual([["Ana", "confirmed", true], ["Bia", "change_requested", false]]);
    expect(shifts[1]!.members).toEqual([]);
  });

  it("traduz os erros do banco", () => {
    expect(shiftError(new Error("shift_exists"))).toMatch(/Já existe uma escala/);
    expect(shiftError({ message: "forbidden" })).toMatch(/permissão/);
    expect(shiftError(new Error("invalid_reason"))).toMatch(/motivo/);
    expect(shiftError(new Error("qualquer coisa"))).toMatch(/Não foi possível/);
  });
});

describe("dashboard: Próxima escala", () => {
  const mine = (o: Partial<MyShift> = {}): MyShift => ({
    shift_id: "s1", department_id: "d1", department_name: "Louvor", shift_date: ahead(5), service_name: "Culto de Celebração", service_time: "18:00:00",
    notes: null, status: "pending", change_reason: null, leader_note: null, team: ["Bia", "Caio"], ...o,
  });
  const serve = (rows: MyShift[]) =>
    h.rpc.mockImplementation(async (fn: string) => (fn === "my_shifts" ? { data: rows, error: null } : { data: null, error: null }));

  it("não aparece para quem não tem escala", async () => {
    serve([]);
    const { container } = render(wrap(<NextShiftCard />));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("my_shifts", expect.anything()));
    expect(container.textContent).toBe("");
  });

  it("mostra a próxima escala e 'Estou ciente' registra o ciente", async () => {
    serve([mine(), mine({ shift_id: "s2", shift_date: ahead(12) })]);
    render(wrap(<NextShiftCard />));
    await screen.findByText("Próxima escala");
    expect(screen.getByText("Louvor")).toBeTruthy();
    expect(screen.getByText("Culto de Celebração")).toBeTruthy();
    expect(screen.getByText(/Com: Bia, Caio/)).toBeTruthy();
    expect(screen.getByText(/mais 1 escala à frente/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Estou ciente/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("ack_shift", { _shift: "s1" }));
  });

  it("já ciente: some o botão e aparece a confirmação", async () => {
    serve([mine({ status: "confirmed" })]);
    render(wrap(<NextShiftCard />));
    await screen.findByText(/Você está ciente desta escala/);
    expect(screen.queryByRole("button", { name: /Estou ciente/ })).toBeNull();
  });

  it("pedir alteração exige motivo e avisa o líder", async () => {
    serve([mine()]);
    render(wrap(<NextShiftCard />));
    fireEvent.click(await screen.findByRole("button", { name: /Solicitar alteração/ }));
    const send = (await screen.findByRole("button", { name: /Enviar pedido/ })) as HTMLButtonElement;
    expect(send.disabled).toBe(true); // sem motivo não envia
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "abc" } });
    expect(send.disabled).toBe(true); // motivo curto demais
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Estarei viajando nesse dia" } });
    fireEvent.click(send);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("request_shift_change", { _shift: "s1", _reason: "Estarei viajando nesse dia" }));
  });

  it("com pedido em andamento mostra o motivo e a resposta do líder aparece quando mantida", async () => {
    serve([mine({ status: "change_requested", change_reason: "Viagem" })]);
    const { unmount } = render(wrap(<NextShiftCard />));
    await screen.findByText(/aguardando o líder/);
    expect(screen.getByText(/Seu motivo: Viagem/)).toBeTruthy();
    unmount();
    serve([mine({ status: "pending", leader_note: "Preciso de você nesse dia" })]);
    render(wrap(<NextShiftCard />));
    await screen.findByText(/Resposta do líder: Preciso de você nesse dia/);
  });
});

describe("editor da escala (líder)", () => {
  const schedule = [{ day: "Domingo", time: "18h00", name: "Culto de Celebração" }];
  const serve = (warnings: object[] = []) =>
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === "shift_candidates")
        return { data: [{ member_id: "ana", full_name: "Ana Souza", has_account: true, month_count: 3 }, { member_id: "bia", full_name: "Bia Lima", has_account: false, month_count: 0 }], error: null };
      if (fn === "shift_warnings") return { data: warnings, error: null };
      return { data: "novo-id", error: null };
    });

  it("só deixa criar com pelo menos um voluntário e mostra quantas escalas cada um já tem", async () => {
    serve();
    render(wrap(<ShiftEditor dept={{ id: "d1", name: "Louvor" }} initialDate={nextSunday()} shift={null} schedule={schedule} onClose={() => {}} />));
    await screen.findByText("Ana Souza");
    expect(screen.getByText(/3 escalas em/)).toBeTruthy();
    expect(screen.getByText(/sem conta/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Criar escala" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mostra o aviso de culto seguido, mas deixa salvar mesmo assim", async () => {
    serve([{ member_id: "ana", kind: "consecutive", detail: "também está escalado no culto anterior (01/11 às 18h00)", total: null }]);
    const onClose = vi.fn();
    const date = nextSunday();
    render(wrap(<ShiftEditor dept={{ id: "d1", name: "Louvor" }} initialDate={date} shift={null} schedule={schedule} onClose={onClose} />));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ana Souza" }));
    const alert = await screen.findByRole("status", {}, { timeout: 3000 });
    expect(within(alert).getByText(/você pode escalar mesmo assim/)).toBeTruthy();
    expect(within(alert).getByText(/também está escalado no culto anterior/)).toBeTruthy();

    const save = screen.getByRole("button", { name: "Criar escala" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false); // aviso não bloqueia
    fireEvent.click(save);
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("save_shift", {
        _dept: "d1", _date: date, _service_name: "Culto de Celebração", _service_time: "18:00", _member_ids: ["ana"], _notes: null, _shift_id: null,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("aviso de mais de 3 escalas no mês aparece e também não bloqueia", async () => {
    serve([{ member_id: "ana", kind: "monthly", detail: "ficará com 4 escalas em novembro (somando todos os departamentos)", total: 4 }]);
    render(wrap(<ShiftEditor dept={{ id: "d1", name: "Louvor" }} initialDate={nextSunday()} shift={null} schedule={schedule} onClose={() => {}} />));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Ana Souza" }));
    // o aviso aparece no resumo do topo e também na linha da pessoa
    expect((await screen.findAllByText(/ficará com 4 escalas em novembro/, undefined, { timeout: 3000 })).length).toBe(2);
    expect((screen.getByRole("button", { name: "Criar escala" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("culto fora da lista do site: pede o nome e o horário", async () => {
    serve();
    const date = nextSunday();
    render(wrap(<ShiftEditor dept={{ id: "d1", name: "Louvor" }} initialDate={date} shift={null} schedule={schedule} onClose={() => {}} />));
    fireEvent.change(await screen.findByLabelText("Culto"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText(/Nome do culto/), { target: { value: "Culto de Jovens" } });
    fireEvent.change(screen.getByLabelText("Horário"), { target: { value: "19:30" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Bia Lima" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar escala" }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("save_shift", expect.objectContaining({ _service_name: "Culto de Jovens", _service_time: "19:30", _member_ids: ["bia"] })),
    );
  });
});

describe("calendário da escala do departamento", () => {
  const date = ahead(6);
  const row = (o: Partial<ShiftRow>): ShiftRow => ({
    shift_id: "s1", shift_date: date, service_name: "Culto de Celebração", service_time: "18:00:00", notes: null, member_id: "ana", member_name: "Ana Souza",
    has_account: true, status: "pending", acknowledged_at: null, change_reason: null, change_requested_at: null, leader_note: null, is_me: false, ...o,
  });
  const serve = (rows: ShiftRow[]) => h.rpc.mockImplementation(async (fn: string) => (fn === "dept_schedule" ? { data: rows, error: null } : { data: [], error: null }));
  const open = async () => fireEvent.click(await screen.findByRole("button", { name: /Culto de Celebração/ }));

  it("líder: vê pedidos de alteração com o motivo e pode escalar, editar e apagar", async () => {
    serve([row({ status: "change_requested", change_reason: "Estarei viajando" }), row({ member_id: "bia", member_name: "Bia Lima", status: "confirmed" })]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: true }} />));
    await screen.findByText(/pedido de alteração aguardando você/);
    expect(screen.getAllByText(/Estarei viajando/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Escalar este dia/ })).toBeTruthy();
    await open();
    await screen.findByRole("button", { name: /Editar/ });
    expect(screen.getByRole("button", { name: /Excluir escala/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remover Ana Souza da escala" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Manter na escala/ })).toBeTruthy();
    expect(screen.getByText("Ciente")).toBeTruthy();
  });

  it("líder mantém a pessoa na escala com uma resposta", async () => {
    serve([row({ status: "change_requested", change_reason: "Estarei viajando" })]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: true }} />));
    await open();
    fireEvent.change(await screen.findByPlaceholderText(/Resposta/), { target: { value: "Preciso de você" } });
    fireEvent.click(screen.getByRole("button", { name: /Manter na escala/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("resolve_shift_change", { _shift: "s1", _member: "ana", _note: "Preciso de você" }));
  });

  it("voluntário: só visualiza (sem criar, editar ou apagar) e responde pela própria escala", async () => {
    serve([row({ is_me: true, member_name: "Ana Souza" }), row({ member_id: "bia", member_name: "Bia Lima" })]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: false }} />));
    await open();
    await screen.findByText(/Ana Souza \(você\)/);
    expect(screen.queryByRole("button", { name: /Escalar este dia/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Excluir escala/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remover .* da escala/ })).toBeNull();
    expect(screen.queryByText(/pedido de alteração aguardando/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Estou ciente/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("ack_shift", { _shift: "s1" }));
  });

  it("líder exclui a escala inteira, com confirmação dentro do app", async () => {
    serve([row({}), row({ member_id: "bia", member_name: "Bia Lima" })]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: true }} />));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /Excluir escala/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/serão avisados/)).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalledWith("delete_shift", expect.anything()); // ainda não apagou
    fireEvent.click(within(dialog).getByRole("button", { name: "Excluir escala" }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("delete_shift", { _shift: "s1" }));
  });

  it("líder tira uma pessoa da escala; cancelar não apaga nada", async () => {
    serve([row({}), row({ member_id: "bia", member_name: "Bia Lima" })]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: true }} />));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Remover Bia Lima da escala" }));
    let dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.rpc).not.toHaveBeenCalledWith("remove_shift_member", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Remover Bia Lima da escala" }));
    dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/é avisada no celular/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("remove_shift_member", { _shift: "s1", _member: "bia" }));
  });

  it("tirar a última pessoa avisa que a escala do culto será apagada", async () => {
    serve([row({})]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: true }} />));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Remover Ana Souza da escala" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/última pessoa escalada/)).toBeTruthy();
  });

  it("líder marca o ciente de quem não tem conta", async () => {
    serve([row({ has_account: false, member_name: "Dona Maria" })]);
    render(wrap(<DeptSchedule dept={{ id: "d1", name: "Louvor", can_manage: true }} />));
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /Marcar ciente/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("leader_confirm_shift", { _shift: "s1", _member: "ana" }));
  });
});

// garante que o tipo Shift continua exportado para os componentes
const _typecheck: Shift | null = null;
void _typecheck;
