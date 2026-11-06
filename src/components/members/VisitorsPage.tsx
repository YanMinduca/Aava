import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Eye, Search, UserRoundCheck } from "lucide-react";
import { useAccess } from "@/hooks/use-access";
import { useAllMembers } from "@/hooks/use-members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberAvatar } from "@/components/members/MemberForm";
import { AccountBadge, LinkAccountDialog, useAccountLinks } from "@/components/members/MemberAccountLink";
import { APPROVAL_LABELS, dateBR } from "@/lib/church";
import { downloadXls } from "@/lib/export";
import { isVisitor, originKey, originKeyLabel, recentCount, signupOrigin } from "@/lib/visitors";

export function VisitorsPage() {
  const { can, isFullAccess, isLoading: loadingAccess } = useAccess();
  const [search, setSearch] = useState("");
  const [origin, setOrigin] = useState("todas");
  const [linking, setLinking] = useState<{ id: string; full_name: string; user_id: string | null } | null>(null);
  const members = useAllMembers(can("view_members"));
  const accountLinks = useAccountLinks(isFullAccess);
  const accountEmail = (userId: string | null) => (userId ? accountLinks.data?.find((a) => a.account_id === userId)?.account_email ?? null : null);

  if (loadingAccess) return null;
  if (!can("view_members")) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  // Mais recentes primeiro
  const visitors = (members.data ?? []).filter(isVisitor).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const origins = [...new Set(visitors.map(originKey))].sort((a, b) => originKeyLabel(a).localeCompare(originKeyLabel(b), "pt-BR"));
  const q = search.trim().toLowerCase();
  const filtered = visitors.filter(
    (m) =>
      (origin === "todas" || originKey(m) === origin) &&
      (!q ||
        m.full_name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.phone ?? "").includes(q) ||
        (m.cpf ?? "").includes(q) ||
        signupOrigin(m).toLowerCase().includes(q)),
  );
  const withAccount = visitors.filter((m) => !!m.user_id).length;

  function exportXls() {
    const head = ["Nome", "Telefone", "E-mail", "CPF", "Nascimento", "Origem do cadastro", "Cadastrado em", "Conta"];
    const rows = filtered.map((m) => [m.full_name, m.phone, m.email, m.cpf, dateBR(m.birth_date), signupOrigin(m), dateBR(m.created_at), m.user_id ? "Com conta" : "Sem conta"]);
    void downloadXls("visitantes", [head, ...rows], "Visitantes");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Visitantes</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pessoas que se cadastraram como visitantes (por exemplo, ao se inscrever em um evento). Ficam separadas dos membros; para virar membro, edite o status no perfil.
          </p>
        </div>
        <Button variant="outline" onClick={exportXls} disabled={filtered.length === 0}><Download className="h-4 w-4" /> XLS</Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, contato ou origem" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as origens</SelectItem>
            {origins.map((k) => <SelectItem key={k} value={k}>{originKeyLabel(k)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {visitors.length} {visitors.length === 1 ? "visitante" : "visitantes"} · {withAccount} com conta · {recentCount(visitors)} nos últimos 30 dias
      </p>

      <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Contato</th>
              <th className="p-4 font-medium">Origem do cadastro</th>
              <th className="p-4 font-medium">Cadastrado em</th>
              <th className="p-4 font-medium">Conta</th>
              <th className="p-4" />
            </tr>
          </thead>
          <tbody>
            {members.isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Carregando...</td></tr>}
            {members.isError && <tr><td className="p-4 text-destructive" colSpan={6}>Não foi possível carregar os visitantes.</td></tr>}
            {!members.isLoading && !members.isError && filtered.length === 0 && (
              <tr>
                <td className="p-6 text-center text-muted-foreground" colSpan={6}>
                  {visitors.length === 0 ? "Nenhum visitante cadastrado ainda. Quem se inscreve em um evento sem ser membro aparece aqui." : "Nenhum visitante encontrado com esses filtros."}
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <MemberAvatar path={m.photo_path} />
                    <div>
                      <Link to="/painel/membro/$id" params={{ id: m.id }} className="font-medium text-foreground hover:text-primary hover:underline">{m.full_name}</Link>
                      {m.approval_status !== "aprovado" && <p className="text-xs text-destructive">{APPROVAL_LABELS[m.approval_status] ?? m.approval_status}</p>}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-muted-foreground">{m.phone}<br />{m.email}</td>
                <td className="p-4">
                  <Badge variant={m.signup_source === "event" ? "default" : "secondary"} className="max-w-xs whitespace-normal text-left font-normal">{signupOrigin(m)}</Badge>
                </td>
                <td className="whitespace-nowrap p-4 text-muted-foreground">{dateBR(m.created_at)}</td>
                <td className="p-4"><AccountBadge linked={!!m.user_id} email={accountEmail(m.user_id)} /></td>
                <td className="whitespace-nowrap p-4 text-right">
                  <Button size="icon" variant="ghost" asChild aria-label="Ver perfil"><Link to="/painel/membro/$id" params={{ id: m.id }}><Eye className="h-4 w-4" /></Link></Button>
                  {isFullAccess && (
                    <Button size="icon" variant="ghost" aria-label={m.user_id ? "Ver conta vinculada" : "Vincular conta"} title={m.user_id ? "Ver conta vinculada" : "Vincular conta"} onClick={() => setLinking({ id: m.id, full_name: m.full_name, user_id: m.user_id })}>
                      <UserRoundCheck className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isFullAccess && <LinkAccountDialog member={linking} accounts={accountLinks.data ?? []} onClose={() => setLinking(null)} />}
    </div>
  );
}
