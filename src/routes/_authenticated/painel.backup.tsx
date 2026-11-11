import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DatabaseBackup, Download, Loader2, Lock, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { siteMeta } from "@/lib/site-query";
import { createBackup, type BackupProgress } from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/painel/backup")({
  head: () =>
    siteMeta("Backup — Comunidade Aava", "Baixe uma cópia de todos os dados da Comunidade Aava."),
  component: BackupPage,
});

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
const PHASE: Record<BackupProgress["phase"], string> = {
  tabelas: "Lendo os dados",
  arquivos: "Baixando fotos e arquivos",
  compactando: "Compactando",
  pronto: "Pronto",
};

function BackupPage() {
  const { isFullAccess, isLoading } = useAccess();
  const qc = useQueryClient();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);

  const last = useQuery({
    queryKey: ["backup", "last"],
    enabled: isFullAccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("backup_last");
      if (error) throw error;
      return data;
    },
  });

  async function run() {
    setRunning(true);
    setProgress(null);
    try {
      const result = await createBackup({ includeFiles, onProgress: setProgress });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (result.failedFiles.length > 0) {
        toast.warning(
          `Backup baixado, mas ${result.failedFiles.length} arquivo(s) não puderam ser copiados (veja o LEIAME.txt dentro do ZIP).`,
        );
      } else {
        toast.success(
          `Backup baixado: ${result.rows} registros${result.files ? ` e ${result.files} arquivos` : ""} (${mb(result.bytes)}).`,
        );
      }
      void qc.invalidateQueries({ queryKey: ["backup"] });
    } catch {
      toast.error(
        "Não foi possível gerar o backup agora. Tente de novo; se continuar, avise o suporte.",
      );
    } finally {
      setRunning(false);
    }
  }

  if (isLoading)
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  if (!isFullAccess) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O backup é feito apenas pelo CEO e pelo Pastor Presidente.
        </p>
      </div>
    );
  }

  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Backup dos dados</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Baixa uma cópia de <strong>todos os dados do sistema</strong> (membros, financeiro,
          eventos, departamentos, pedidos de oração, lixeira, registros...) e, se quiser, também as
          fotos e arquivos. Faça isso pelo menos <strong>uma vez por semana</strong> e guarde o
          arquivo fora daqui (por exemplo, num HD externo ou numa nuvem privada).
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-3 text-foreground">
          <DatabaseBackup className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Gerar backup agora</h2>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Checkbox
            id="bk-files"
            checked={includeFiles}
            onCheckedChange={(v) => setIncludeFiles(v === true)}
            disabled={running}
          />
          <Label htmlFor="bk-files">
            Incluir fotos e arquivos (comprovantes, QR de Pix, mídias de eventos). O ZIP fica maior.
          </Label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void run()} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}{" "}
            {running ? "Gerando…" : "Gerar e baixar backup"}
          </Button>
          {running && progress && (
            <span className="text-sm text-muted-foreground" role="status">
              {PHASE[progress.phase]}
              {progress.phase !== "compactando" && progress.total > 0
                ? ` (${progress.done}/${progress.total})`
                : ""}
            </span>
          )}
        </div>
        {running && (
          <div
            className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Mantenha esta página aberta até o download começar.
        </p>
      </section>

      <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-sm">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Cuidado com o arquivo
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            O backup tem dados pessoais e sensíveis (CPF, religião, pedidos de oração, financeiro).
            Guarde em lugar privado e não envie por WhatsApp ou e-mail.
          </li>
          <li>Apague as cópias antigas que não precisa mais.</li>
        </ul>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">Últimos backups</h2>
        {last.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
        ) : (last.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Ainda não foi feito nenhum backup por aqui.
          </p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {last.data!.map((b) => (
              <li
                key={b.created_at}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="text-foreground">{when(b.created_at)}</span>
                <span className="text-muted-foreground">
                  {b.rows} registros · {b.files} arquivos · {mb(b.bytes)} ·{" "}
                  {b.source === "painel" ? "pelo painel" : "pelo script"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
