import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { BACKUP_REMINDER_DAYS, daysSince } from "@/lib/backup";

/** Aviso na visão geral (só CEO e Pastor Presidente) quando o último backup tem mais de 7 dias ou nunca foi feito. */
export function BackupReminder() {
  const { isFullAccess } = useAccess();
  const last = useQuery({
    queryKey: ["backup", "last"],
    enabled: isFullAccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("backup_last");
      if (error) throw error;
      return data;
    },
  });
  if (!isFullAccess || !last.data) return null;
  const days = daysSince(last.data[0]?.created_at);
  if (days !== null && days < BACKUP_REMINDER_DAYS) return null;
  return (
    <Link
      to="/painel/backup"
      className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm transition-shadow hover:shadow-soft"
    >
      <DatabaseBackup className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
      <span className="text-foreground">
        {days === null
          ? "Nenhum backup dos dados foi feito ainda."
          : `O último backup dos dados foi há ${days} dias.`}{" "}
        <span className="font-medium underline">Fazer backup agora</span>
      </span>
    </Link>
  );
}
