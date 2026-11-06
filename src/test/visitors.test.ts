import { describe, expect, it } from "vitest";
import { isVisitor, originKey, originKeyLabel, recentCount, signupOrigin, splitVisitors } from "@/lib/visitors";
import { rankMembersForAccount } from "@/lib/account-link";

describe("visitantes", () => {
  it("separa visitantes de membros mantendo a ordem", () => {
    const list = [
      { id: "1", status: "membro" },
      { id: "2", status: "visitante" },
      { id: "3", status: "membro_ativo" },
      { id: "4", status: "visitante" },
      { id: "5", status: "inativo" },
    ];
    const { members, visitors } = splitVisitors(list);
    expect(visitors.map((m) => m.id)).toEqual(["2", "4"]);
    expect(members.map((m) => m.id)).toEqual(["1", "3", "5"]);
    expect(isVisitor({ status: "visitante" })).toBe(true);
    expect(isVisitor({ status: "membro" })).toBe(false);
  });

  it("descreve a origem do cadastro", () => {
    expect(signupOrigin({ signup_source: "event", signup_event_title: "Musical de Natal" })).toBe("Veio pelo evento: Musical de Natal");
    expect(signupOrigin({ signup_source: "event", signup_event_title: null })).toBe("Veio por um evento");
    expect(signupOrigin({ signup_source: "admin" })).toBe("Cadastrado pela equipe");
    expect(signupOrigin({ signup_source: "site" })).toBe("Cadastro feito no site");
    expect(signupOrigin({ signup_source: null })).toBe("Origem não registrada");
    expect(signupOrigin({})).toBe("Origem não registrada");
  });

  it("gera chaves de filtro por origem", () => {
    expect(originKey({ signup_source: "event", signup_event_title: "X" })).toBe("event:X");
    expect(originKey({ signup_source: "admin" })).toBe("admin");
    expect(originKey({ signup_source: null })).toBe("none");
    expect(originKeyLabel("event:X")).toBe("Evento: X");
    expect(originKeyLabel("none")).toBe("Origem não registrada");
  });

  it("conta cadastros recentes", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const list = [{ created_at: "2026-11-05T10:00:00Z" }, { created_at: "2026-10-10T10:00:00Z" }, { created_at: "2026-09-01T10:00:00Z" }];
    expect(recentCount(list, 30, now)).toBe(2);
    expect(recentCount(list, 7, now)).toBe(1);
    expect(recentCount([], 30, now)).toBe(0);
  });
});

describe("sugestão de cadastro para vincular conta", () => {
  const members = [
    { id: "a", full_name: "Zélia Santos", email: null, phone: "1199" },
    { id: "b", full_name: "João da Silva", email: "joao@x.com", phone: null },
    { id: "c", full_name: "Ana Lima", email: "ana@x.com", phone: null },
  ];

  it("coloca primeiro quem tem o mesmo e-mail ou nome (ignorando acento e caixa)", () => {
    const byEmail = rankMembersForAccount({ name: "Outro", email: "JOAO@x.com" }, members);
    expect(byEmail[0]).toMatchObject({ id: "b", suggested: true });
    const byName = rankMembersForAccount({ name: "zelia santos", email: null }, members);
    expect(byName[0]).toMatchObject({ id: "a", suggested: true });
    expect(byName.slice(1).every((m) => !m.suggested)).toBe(true);
  });

  it("filtra por nome, e-mail ou telefone e ordena por nome", () => {
    expect(rankMembersForAccount({ name: null, email: null }, members, "ana").map((m) => m.id)).toEqual(["c"]);
    expect(rankMembersForAccount({ name: null, email: null }, members, "1199").map((m) => m.id)).toEqual(["a"]);
    expect(rankMembersForAccount({ name: null, email: null }, members).map((m) => m.id)).toEqual(["c", "b", "a"]);
  });
});
