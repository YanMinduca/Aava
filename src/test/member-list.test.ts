import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countByStatus, registrationNumber, sortMembers } from "@/lib/member-list";

const people = [
  {
    full_name: "Carlos Souza",
    birth_date: "1990-05-10",
    registration_number: "0012",
    status: "membro",
  },
  { full_name: "Ana Lima", birth_date: "1960-01-02", registration_number: "3", status: "membro" },
  { full_name: "Álvaro Dias", birth_date: null, registration_number: null, status: "inativo" },
  {
    full_name: "Bruno Reis",
    birth_date: "2005-12-31",
    registration_number: "105",
    status: "afastado",
  },
  { full_name: "Zélia Prado", birth_date: "1975-07-07", registration_number: "", status: "membro" },
];
const names = (l: { full_name: string }[]) => l.map((m) => m.full_name);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00"));
});
afterEach(() => vi.useRealTimers());

describe("sortMembers", () => {
  it("nome A–Z e Z–A, ignorando acento", () => {
    expect(names(sortMembers(people, "nome_asc"))).toEqual([
      "Álvaro Dias",
      "Ana Lima",
      "Bruno Reis",
      "Carlos Souza",
      "Zélia Prado",
    ]);
    expect(names(sortMembers(people, "nome_desc"))).toEqual([
      "Zélia Prado",
      "Carlos Souza",
      "Bruno Reis",
      "Ana Lima",
      "Álvaro Dias",
    ]);
  });

  it("idade do maior para o menor e do menor para o maior, sem data de nascimento sempre no fim", () => {
    expect(names(sortMembers(people, "idade_desc"))).toEqual([
      "Ana Lima",
      "Zélia Prado",
      "Carlos Souza",
      "Bruno Reis",
      "Álvaro Dias",
    ]);
    expect(names(sortMembers(people, "idade_asc"))).toEqual([
      "Bruno Reis",
      "Carlos Souza",
      "Zélia Prado",
      "Ana Lima",
      "Álvaro Dias",
    ]);
  });

  it("matrícula numérica (3 vem antes de 105), sem matrícula sempre no fim", () => {
    expect(names(sortMembers(people, "matricula_asc"))).toEqual([
      "Ana Lima",
      "Carlos Souza",
      "Bruno Reis",
      "Álvaro Dias",
      "Zélia Prado",
    ]);
    expect(names(sortMembers(people, "matricula_desc"))).toEqual([
      "Bruno Reis",
      "Carlos Souza",
      "Ana Lima",
      "Álvaro Dias",
      "Zélia Prado",
    ]);
  });

  it("não altera a lista original", () => {
    const before = names(people);
    sortMembers(people, "nome_desc");
    expect(names(people)).toEqual(before);
  });

  it("lê matrícula com zeros à esquerda", () => {
    expect(registrationNumber({ registration_number: "0012" })).toBe(12);
    expect(registrationNumber({ registration_number: " " })).toBeNull();
  });
});

describe("countByStatus", () => {
  it("conta cada status separado, na ordem do sistema, sem os que têm zero", () => {
    expect(countByStatus(people)).toEqual([
      { status: "membro", label: "Membro", count: 3 },
      { status: "afastado", label: "Afastado", count: 1 },
      { status: "inativo", label: "Inativo", count: 1 },
    ]);
  });

  it("não deixa sumir um status desconhecido e ignora visitantes", () => {
    const r = countByStatus([
      { status: "novo_status" },
      { status: "visitante" },
      { status: "membro" },
    ]);
    expect(r.map((x) => [x.status, x.count])).toEqual([
      ["membro", 1],
      ["novo_status", 1],
    ]);
  });
});
