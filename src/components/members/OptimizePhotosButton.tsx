import { useState } from "react";
import { toast } from "sonner";
import { ImageDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { optimizeMemberPhotos } from "@/lib/optimize-photos";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");

/** Reduz o peso das fotos de membros já enviadas (uma vez só; fotos leves são ignoradas). */
export function OptimizePhotosButton({ paths, onDone }: { paths: string[]; onDone?: () => void }) {
  const [running, setRunning] = useState(false);

  async function run() {
    const ok = confirm(
      `Reduzir o tamanho de até ${paths.length} fotos de membros?\n\n` +
        "As fotos ficam menores (400 px, mais que suficiente para os círculos do sistema) e o site carrega bem mais rápido. " +
        "Esta ação não pode ser desfeita: as fotos grandes originais serão substituídas. Fotos que já são leves não são alteradas.",
    );
    if (!ok) return;
    setRunning(true);
    const id = toast.loading("Otimizando fotos... 0%");
    try {
      const r = await optimizeMemberPhotos(paths, (done, total) => toast.loading(`Otimizando fotos... ${Math.round((done / total) * 100)}%`, { id }));
      const failed = r.failed ? ` ${r.failed} falharam (pode rodar de novo).` : "";
      toast.success(`${r.optimized} fotos otimizadas, ${mb(r.savedBytes)} MB economizados.${failed}`, { id, duration: 8000 });
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível otimizar as fotos.", { id });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button variant="outline" onClick={run} disabled={running || paths.length === 0}>
      <ImageDown className="h-4 w-4" /> {running ? "Otimizando..." : "Otimizar fotos"}
    </Button>
  );
}
