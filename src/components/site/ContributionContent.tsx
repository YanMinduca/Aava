import { ArrowUpRight, Copy, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { safeLink, type SiteContent } from "@/lib/site-content";

export function ContributionContent({ content: c }: { content: SiteContent }) {
  if (!c.pixKeys.length && !c.methods.length) return null;

  return (
    <section className="border-t bg-secondary/30">
      <div className="mx-auto max-w-7xl space-y-12 px-5 py-16 lg:px-10">
        <div>
          <p className="text-xs font-bold text-primary">{c.contributionEyebrow}</p>
          <h2 className="mt-4 text-3xl">{c.contributionTitle}</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{c.contributionText}</p>
        </div>
        {c.pixKeys.length > 0 && (
          <section>
            <h3 className="mb-6 text-2xl">{c.pixTitle}</h3>
            <div className="grid gap-5 md:grid-cols-2">
              {c.pixKeys.map((pix, i) => (
                <div key={i} className="flex gap-5 rounded-md border bg-card p-6">
                  {pix.qrCode && (
                    <img
                      src={pix.qrCode}
                      alt={`QR Code Pix ${pix.label || i + 1}`}
                      className="h-32 w-32 shrink-0 rounded-md border bg-white object-contain p-1"
                    />
                  )}
                  <div className="min-w-0">
                    <Heart className="h-6 w-6 text-primary" />
                    <h4 className="mt-4 text-lg">{pix.label || "Pix"}</h4>
                    {pix.recipient && (
                      <p className="mt-2 text-sm text-muted-foreground">{pix.recipient}</p>
                    )}
                    <p className="mt-4 break-all font-mono text-sm">{pix.key}</p>
                    <Button
                      className="mt-5"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(pix.key);
                          toast.success("Chave Pix copiada");
                        } catch {
                          toast.error("Não foi possível copiar. Selecione a chave acima.");
                        }
                      }}
                    >
                      <Copy />
                      Copiar chave Pix
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {c.methods.length > 0 && (
          <section>
            <h3 className="mb-6 text-2xl">{c.methodsTitle}</h3>
            <div className="grid gap-5 md:grid-cols-2">
              {c.methods.map((method, i) => (
                <div key={i} className="rounded-md border bg-card p-6">
                  <h4 className="text-lg">{method.title}</h4>
                  <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{method.details}</p>
                  {safeLink(method.url) && (
                    <Button asChild className="mt-5">
                      <a href={safeLink(method.url)} target="_blank" rel="noreferrer">
                        {method.title}
                        <ArrowUpRight />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
