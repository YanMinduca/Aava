import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { purgeStorageTrash } from "@/lib/storage-trash";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DELETE_ERRORS: Record<string, string> = {
  cannot_delete_self: "Você não pode excluir a sua própria conta.",
  cannot_delete_ceo: "A conta do CEO não pode ser excluída.",
  only_ceo_deletes_president: "Somente o CEO pode excluir a conta de um Pastor Presidente.",
  user_not_found: "Esta conta já não existe.",
  "Acesso negado": "Somente o CEO e o Pastor Presidente podem excluir usuários.",
};
export const deleteUserError = (e: unknown) => {
  const msg = e instanceof Error ? e.message : "";
  return DELETE_ERRORS[msg] ?? (msg || "Não foi possível excluir o usuário.");
};

/** Botão + confirmação para excluir a conta de um usuário (apaga tudo o que é dele, para sempre). */
export function DeleteUserSection({ user, onDeleted }: { user: { id: string; name: string }; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [alsoMember, setAlsoMember] = useState(false);
  const [typed, setTyped] = useState("");

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_user_account", { _user: user.id, _delete_member: alsoMember });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Usuário excluído");
      void purgeStorageTrash();
      for (const key of ["users-admin", "members", "member-departments", "departments", "dashboard-volunteers"]) qc.invalidateQueries({ queryKey: [key] });
      setOpen(false);
      onDeleted();
    },
    onError: (e) => toast.error(deleteUserError(e)),
  });

  return (
    <div className="mt-8 rounded-xl border border-destructive/30 p-4">
      <p className="text-sm font-medium text-foreground">Excluir usuário</p>
      <p className="mt-1 text-xs text-muted-foreground">Apaga a conta de acesso e tudo o que é dela. Não dá para desfazer.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={() => { setTyped(""); setAlsoMember(false); setOpen(true); }}>
        <Trash2 className="h-4 w-4" /> Excluir usuário
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {user.name}?</DialogTitle>
            <DialogDescription>Esta ação apaga para sempre, do banco de dados e do armazenamento:</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>a conta de acesso (login), as permissões e o perfil;</li>
            <li>os pedidos de oração da pessoa;</li>
            <li>as inscrições em eventos, pagamentos, ingressos e <strong className="text-foreground">comprovantes enviados</strong>.</li>
          </ul>
          <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox checked={alsoMember} onCheckedChange={(on) => setAlsoMember(!!on)} className="mt-0.5" />
            <span>
              <span className="block font-medium text-foreground">Excluir também o cadastro de membro</span>
              <span className="block text-xs text-muted-foreground">Apaga a ficha, a foto e os vínculos com departamentos. Se não marcar, o cadastro continua na lista de membros, só sem conta.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label>Para confirmar, digite EXCLUIR</Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          <Button variant="destructive" disabled={typed.trim().toUpperCase() !== "EXCLUIR" || del.isPending} onClick={() => del.mutate()}>
            Excluir para sempre
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const BUCKET_LABELS: Record<string, string> = {
  "member-photos": "Fotos de membros",
  receipts: "Recibos do financeiro",
  "event-proofs": "Comprovantes de eventos",
  "event-assets": "QR de pagamento de eventos",
  "site-assets": "Imagens do site",
};
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Orphan = { bucket: string; path: string; size: number; created_at: string };

const orphanKey = (o: Pick<Orphan, "bucket" | "path">) => `${o.bucket}/${o.path}`;
const isImagePath = (p: string) => /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(p);
const PAGE = 24;

/**
 * Acha arquivos que nenhum registro usa mais (sobras de coisas apagadas antes), mostra cada um
 * (miniatura, origem, tamanho e data) e apaga só os que a pessoa marcar. Os não marcados ficam guardados.
 */
export function StorageCleanupCard() {
  const [found, setFound] = useState<Orphan[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bucket, setBucket] = useState("todos");
  const [visible, setVisible] = useState(PAGE);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [broken, setBroken] = useState<Set<string>>(new Set());

  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("storage_orphans_preview");
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (rows) => {
      setFound(rows);
      setSelected(new Set());
      setBucket("todos");
      setVisible(PAGE);
      setBroken(new Set());
    },
    onError: () => toast.error("Não foi possível verificar os arquivos."),
  });

  const wipe = useMutation({
    mutationFn: async (items: Orphan[]) => {
      const { error } = await supabase.rpc("storage_enqueue_orphans_selected", {
        _items: items.map((o) => ({ bucket: o.bucket, path: o.path })),
      });
      if (error) throw error;
      await purgeStorageTrash();
      return items;
    },
    onSuccess: (items) => {
      const gone = new Set(items.map(orphanKey));
      setFound((f) => (f ?? []).filter((o) => !gone.has(orphanKey(o))));
      setSelected(new Set());
      toast.success(`${items.length} ${items.length === 1 ? "arquivo apagado" : "arquivos apagados"} do armazenamento`);
    },
    onError: () => toast.error("Não foi possível apagar os arquivos."),
  });

  const all = found ?? [];
  const counts = all.reduce<Record<string, number>>((acc, o) => ((acc[o.bucket] = (acc[o.bucket] ?? 0) + 1), acc), {});
  const filtered = useMemo(() => all.filter((o) => bucket === "todos" || o.bucket === bucket), [all, bucket]);
  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const chosen = all.filter((o) => selected.has(orphanKey(o)));
  const chosenSize = chosen.reduce((s, o) => s + o.size, 0);

  // Miniaturas: só das imagens que estão na tela (links temporários, pois os arquivos são privados).
  useEffect(() => {
    const need = shown.filter((o) => isImagePath(o.path) && !urls[orphanKey(o)]);
    if (need.length === 0) return;
    let alive = true;
    void (async () => {
      const add: Record<string, string> = {};
      const byBucket = new Map<string, Orphan[]>();
      for (const o of need) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o]);
      for (const [b, items] of byBucket) {
        if (b === "site-assets") {
          for (const o of items) add[orphanKey(o)] = supabase.storage.from(b).getPublicUrl(o.path).data.publicUrl;
          continue;
        }
        const { data } = await supabase.storage.from(b).createSignedUrls(items.map((o) => o.path), 1800);
        for (const d of data ?? []) if (d.signedUrl && d.path) add[`${b}/${d.path}`] = d.signedUrl;
      }
      if (alive) setUrls((u) => ({ ...u, ...add }));
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const toggle = (o: Orphan, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(orphanKey(o));
      else n.delete(orphanKey(o));
      return n;
    });

  return (
    <div className="mt-10 rounded-2xl border bg-card p-6">
      <p className="font-display text-xl text-foreground">Arquivos sem uso</p>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Procura no armazenamento arquivos que nenhum cadastro, comprovante, recibo ou página do site usa mais (por exemplo, sobras de coisas apagadas antes). Você vê cada arquivo e marca só os que quer apagar; os que ficarem sem marca continuam guardados. Só entram arquivos com mais de 1 dia.
      </p>
      <Button type="button" variant="outline" className="mt-4" disabled={check.isPending} onClick={() => check.mutate()}>
        {found ? "Verificar de novo" : "Verificar agora"}
      </Button>

      {found && found.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Nenhum arquivo sem uso. Está tudo em ordem.</p>}

      {found && found.length > 0 && (
        <div className="mt-5 text-sm">
          <div className="flex flex-wrap gap-2">
            {[["todos", `Todos (${all.length})`] as const, ...Object.entries(counts).map(([b, n]) => [b, `${BUCKET_LABELS[b] ?? b} (${n})`] as const)].map(([b, label]) => (
              <Button key={b} type="button" size="sm" variant={bucket === b ? "default" : "outline"} onClick={() => { setBucket(b); setVisible(PAGE); }}>
                {label}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => setSelected((s) => new Set([...s, ...shown.map(orphanKey)]))}>
              Marcar os exibidos ({shown.length})
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Desmarcar tudo
            </Button>
            <p className="ml-auto text-muted-foreground" aria-live="polite">
              {chosen.length} de {all.length} marcados para apagar{chosen.length > 0 ? ` (${formatBytes(chosenSize)})` : ""}
            </p>
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((o) => {
              const k = orphanKey(o);
              const on = selected.has(k);
              const url = urls[k];
              return (
                <li key={k} className={`overflow-hidden rounded-xl border bg-background ${on ? "border-destructive ring-2 ring-destructive/40" : ""}`}>
                  <div className="relative aspect-square bg-muted">
                    {url && !broken.has(k) ? (
                      <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setBroken((b) => new Set(b).add(k))} />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                        <FileText className="h-8 w-8" aria-hidden />
                        {isImagePath(o.path) ? (broken.has(k) ? "Não foi possível mostrar" : "Carregando...") : "Arquivo"}
                      </div>
                    )}
                    <label className="absolute left-2 top-2 flex cursor-pointer items-center gap-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow">
                      <Checkbox checked={on} onCheckedChange={(v) => toggle(o, v === true)} aria-label={`Apagar ${o.path}`} />
                      Apagar
                    </label>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" aria-label="Abrir em tamanho grande" className="absolute right-2 top-2 rounded-md bg-background/90 p-1.5 text-foreground shadow">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  <div className="space-y-0.5 p-2.5 text-xs">
                    <p className="font-medium text-foreground">{BUCKET_LABELS[o.bucket] ?? o.bucket}</p>
                    <p className="text-muted-foreground">{formatBytes(o.size)} · enviado em {new Date(o.created_at).toLocaleDateString("pt-BR")}</p>
                    <p className="truncate text-muted-foreground" title={o.path}>{o.path.split("/").pop()}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          {filtered.length > shown.length && (
            <Button type="button" variant="outline" className="mt-4" onClick={() => setVisible((v) => v + PAGE)}>
              Mostrar mais ({filtered.length - shown.length} restantes)
            </Button>
          )}

          <div className="mt-6 border-t pt-4">
            <Button
              type="button"
              variant="destructive"
              disabled={chosen.length === 0 || wipe.isPending}
              onClick={() => confirm(`Apagar ${chosen.length} ${chosen.length === 1 ? "arquivo marcado" : "arquivos marcados"} para sempre? Não dá para desfazer. Os não marcados continuam guardados.`) && wipe.mutate(chosen)}
            >
              <Trash2 className="h-4 w-4" /> Apagar {chosen.length > 0 ? `${chosen.length} marcado${chosen.length === 1 ? "" : "s"}` : "marcados"} para sempre
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
