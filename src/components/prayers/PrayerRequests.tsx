import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, Trash2, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultContent } from "@/lib/site-content";
const statuses: Record<string, string> = {
  recebido: "Recebido",
  em_oracao: "Em oração",
  concluido: "Concluído",
};
export function PrayerRequests({
  cta = defaultContent.prayerCta,
  privacy = defaultContent.prayerPrivacy,
  showRequests = true,
}: {
  cta?: string;
  privacy?: string;
  showRequests?: boolean;
}) {
  const { data: access, roles, can, isLoading } = useAccess();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const leadership = roles.some((r) => ["ceo", "pastor_presidente"].includes(r));
  const requests = useQuery({
    queryKey: ["prayer-requests", access?.uid],
    enabled: showRequests && !!access?.uid && can("view_prayer_requests"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prayer_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!access?.uid) throw new Error("Entre para enviar um pedido.");
      const { error } = await supabase
        .from("prayer_requests")
        .insert({ user_id: access.uid, subject: subject.trim(), message: message.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubject("");
      setMessage("");
      toast.success("Pedido de oração enviado");
      qc.invalidateQueries({ queryKey: ["prayer-requests"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("prayer_requests").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayer-requests"] }),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prayer_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prayer-requests"] }),
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!access?.uid)
    return (
      <p className="text-muted-foreground">
        Entre na área de membros para enviar seu pedido de oração.
      </p>
    );
  if (showRequests && !can("view_prayer_requests"))
    return <p>Você não tem permissão para ver pedidos de oração.</p>;
  return (
    <div className={showRequests ? "grid gap-12 lg:grid-cols-[0.9fr_1.1fr]" : "max-w-xl"}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (subject.trim() && message.trim()) send.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="prayer-subject">Assunto</Label>
          <Input
            id="prayer-subject"
            required
            maxLength={150}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prayer-message">Pedido de oração</Label>
          <Textarea
            id="prayer-message"
            required
            maxLength={5000}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{privacy}</p>
        <Button type="submit" disabled={send.isPending || !subject.trim() || !message.trim()}>
          <Send />
          {send.isPending ? "Enviando..." : cta}
        </Button>
      </form>
      {showRequests && (
        <section>
          <h2 className="mb-5 text-xl">{leadership ? "Pedidos da comunidade" : "Meus pedidos"}</h2>
          {requests.isError && (
            <p className="text-destructive">Não foi possível carregar os pedidos.</p>
          )}
          {requests.isLoading && <p className="text-muted-foreground">Carregando...</p>}
          {requests.data?.length === 0 && (
            <p className="text-muted-foreground">Nenhum pedido de oração.</p>
          )}
          <div className="space-y-4">
            {requests.data?.map((r) => (
              <article key={r.id} className="rounded-md border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-base">
                      <Heart className="h-4 w-4 shrink-0 text-primary" />
                      {r.subject}
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      {r.user_id === access.uid ? " · Meu pedido" : ""}
                    </p>
                  </div>
                  {(r.user_id === access.uid ||
                    roles.includes("ceo") ||
                    roles.includes("pastor_presidente")) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Excluir pedido"
                      aria-label="Excluir pedido"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm("Excluir este pedido de oração?")) remove.mutate(r.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {r.message}
                </p>
                {leadership ? (
                  <Select
                    value={r.status}
                    disabled={update.isPending}
                    onValueChange={(status) => update.mutate({ id: r.id, status })}
                  >
                    <SelectTrigger aria-label="Status do pedido" className="mt-4 w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(statuses).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-4 text-xs font-semibold text-primary">{statuses[r.status]}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
