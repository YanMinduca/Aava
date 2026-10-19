import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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

type Orphan = { bucket: string; path: string; size: number };

/** Acha e apaga arquivos que nenhum registro usa mais (sobras de coisas apagadas antes). */
export function StorageCleanupCard() {
  const [found, setFound] = useState<Orphan[] | null>(null);
  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("storage_orphans_preview");
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (rows) => setFound(rows),
    onError: () => toast.error("Não foi possível verificar os arquivos."),
  });
  const wipe = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("storage_enqueue_orphans");
      if (error) throw error;
      return purgeStorageTrash();
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "arquivo apagado" : "arquivos apagados"} do armazenamento`);
      setFound(null);
    },
    onError: () => toast.error("Não foi possível apagar os arquivos."),
  });

  const byBucket = (found ?? []).reduce<Record<string, { n: number; size: number }>>((acc, o) => {
    const b = (acc[o.bucket] ??= { n: 0, size: 0 });
    b.n += 1;
    b.size += o.size;
    return acc;
  }, {});
  const total = (found ?? []).reduce((s, o) => s + o.size, 0);

  return (
    <div className="mt-10 rounded-2xl border bg-card p-6">
      <p className="font-display text-xl text-foreground">Arquivos sem uso</p>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Procura no armazenamento arquivos que nenhum cadastro, comprovante, recibo ou página do site usa mais (por exemplo, sobras de coisas apagadas antes) e permite apagá-los para sempre. Só entram arquivos com mais de 1 dia.
      </p>
      <Button type="button" variant="outline" className="mt-4" disabled={check.isPending} onClick={() => check.mutate()}>Verificar agora</Button>
      {found && (
        <div className="mt-4 text-sm">
          {found.length === 0 ? (
            <p className="text-muted-foreground">Nenhum arquivo sem uso. Está tudo em ordem.</p>
          ) : (
            <>
              <p className="text-foreground">{found.length} {found.length === 1 ? "arquivo" : "arquivos"} sem uso ({formatBytes(total)}):</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {Object.entries(byBucket).map(([b, v]) => <li key={b}>{BUCKET_LABELS[b] ?? b}: {v.n} ({formatBytes(v.size)})</li>)}
              </ul>
              <Button type="button" variant="destructive" className="mt-4" disabled={wipe.isPending} onClick={() => confirm("Apagar estes arquivos para sempre? Não dá para desfazer.") && wipe.mutate()}>
                Apagar para sempre
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
