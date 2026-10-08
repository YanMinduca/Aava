import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Save, Plus, Trash2, ImagePlus } from "lucide-react";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { contentFields, type ContentKey, type SiteContent } from "@/lib/site-content";
import { siteQuery, siteMeta } from "@/lib/site-query";
import { saveSiteContent } from "@/lib/site-editor.functions";

export const Route = createFileRoute("/_authenticated/painel/site")({
  head: () =>
    siteMeta(
      "Editar site — Comunidade Aava",
      "Textos, fotos, horários e formas de contribuição da igreja.",
    ),
  component: SiteEditor,
});

async function optimizePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024)
    throw new Error("Escolha uma imagem de até 15 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Não foi possível preparar a foto.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.82;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > 650000 && quality > 0.25) {
    quality -= 0.1;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  if (result.length > 650000) throw new Error("Esta foto é muito grande. Escolha outra imagem.");
  return result;
}
function SiteEditor() {
  const { isFullAccess, isLoading } = useAccess();
  const content = useQuery({ ...siteQuery, enabled: isFullAccess });
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SiteContent | null>(null);
  const [uploading, setUploading] = useState(false);
  const c = draft ?? content.data;
  const save = useMutation({
    mutationFn: () => saveSiteContent({ data: c }),
    onSuccess: (saved) => {
      qc.setQueryData(["site-content"], saved);
      setDraft(saved);
      toast.success("Site atualizado");
    },
    onError: (e) => toast.error(e.message),
  });
  function edit(key: ContentKey, value: string) {
    if (c) setDraft({ ...c, [key]: value });
  }
  if (isLoading || content.isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!isFullAccess) return <p>Você não tem acesso a esta área.</p>;
  if (!c) return <p className="text-destructive">Não foi possível carregar o site.</p>;
  const groups = [...new Set(Object.values(contentFields).map((f) => f[0]))];
  return (
    <div className="max-w-5xl">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b bg-background py-4">
        <h1 className="text-3xl">Editar site</h1>
        <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
          <Save />
          {save.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
      <Tabs defaultValue="Início" className="mt-6">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          {[...groups, "Fotos", "Horários", "Pix e métodos"].map((group) => (
            <TabsTrigger key={group} value={group}>
              {group}
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => (
          <TabsContent key={group} value={group}>
            <div className="grid gap-5 py-5 md:grid-cols-2">
              {(Object.entries(contentFields) as [ContentKey, readonly [string, string, string]][])
                .filter(([, f]) => f[0] === group)
                .map(([key, f]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`site-${key}`}>{f[1]}</Label>
                    {key.endsWith("Text") ||
                    key === "heroText" ||
                    key === "tagline" ||
                    key === "prayerPrivacy" ? (
                      <Textarea
                        id={`site-${key}`}
                        value={c[key]}
                        onChange={(e) => edit(key, e.target.value)}
                        rows={3}
                      />
                    ) : (
                      <Input
                        id={`site-${key}`}
                        value={c[key]}
                        onChange={(e) => edit(key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
            </div>
          </TabsContent>
        ))}
        <TabsContent value="Fotos">
          <div className="py-6">
            <Label htmlFor="site-photo" className="mb-3 block">
              Fotos da página inicial ({c.photos.length}/8)
            </Label>
            <div className="flex items-center gap-3">
              <ImagePlus className="text-primary" />
              <Input
                id="site-photo"
                type="file"
                accept="image/*"
                multiple
                disabled={uploading || c.photos.length >= 8}
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  const remaining = 8 - c.photos.length;
                  if (files.length > remaining) {
                    toast.error(`Você pode adicionar mais ${remaining} foto(s).`);
                    return;
                  }
                  setUploading(true);
                  try {
                    const photos = await Promise.all(
                      files.map(async (file) => ({ url: await optimizePhoto(file), caption: "" })),
                    );
                    setDraft({ ...c, photos: [...c.photos, ...photos] });
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Erro ao preparar foto");
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </div>
            {uploading && <p className="mt-3 text-muted-foreground">Preparando fotos...</p>}
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {c.photos.map((photo, i) => (
                <div key={i} className="space-y-3">
                  <img
                    src={photo.url}
                    alt={photo.caption || "Foto da comunidade"}
                    className="aspect-[4/3] w-full rounded-md object-cover"
                  />
                  <Input
                    aria-label={`Legenda da foto ${i + 1}`}
                    placeholder="Legenda da foto"
                    value={photo.caption}
                    onChange={(e) =>
                      setDraft({
                        ...c,
                        photos: c.photos.map((p, j) =>
                          j === i ? { ...p, caption: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="outline"
                    onClick={() => setDraft({ ...c, photos: c.photos.filter((_, j) => j !== i) })}
                  >
                    <Trash2 />
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="Horários">
          <div className="space-y-5 py-6">
            {c.schedule.map((row, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 border-b pb-5">
                {(["day", "time", "name"] as const).map((key) => (
                  <div key={key} className="min-w-40 flex-1 space-y-2">
                    <Label htmlFor={`schedule-${i}-${key}`}>
                      {key === "day" ? "Dia" : key === "time" ? "Horário" : "Nome do encontro"}
                    </Label>
                    <Input
                      id={`schedule-${i}-${key}`}
                      value={row[key]}
                      onChange={(e) =>
                        setDraft({
                          ...c,
                          schedule: c.schedule.map((r, j) =>
                            j === i ? { ...r, [key]: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remover horário"
                  aria-label="Remover horário"
                  onClick={() => setDraft({ ...c, schedule: c.schedule.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setDraft({ ...c, schedule: [...c.schedule, { day: "", time: "", name: "" }] })
              }
            >
              <Plus />
              Adicionar horário
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="Pix e métodos">
          <div className="space-y-10 py-6">
            <section>
              <h2 className="mb-5 text-xl">Chaves Pix</h2>
              <div className="space-y-5">
                {c.pixKeys.map((row, i) => (
                  <div key={i} className="grid gap-3 border-b pb-5 md:grid-cols-[1fr_1fr_1fr_auto]">
                    {(["label", "key", "recipient"] as const).map((key) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={`pix-${i}-${key}`}>
                          {key === "label"
                            ? "Tipo / identificação"
                            : key === "key"
                              ? "Chave Pix"
                              : "Nome do recebedor"}
                        </Label>
                        <Input
                          id={`pix-${i}-${key}`}
                          value={row[key]}
                          onChange={(e) =>
                            setDraft({
                              ...c,
                              pixKeys: c.pixKeys.map((r, j) =>
                                j === i ? { ...r, [key]: e.target.value } : r,
                              ),
                            })
                          }
                        />
                      </div>
                    ))}
                    <Button
                      className="self-end"
                      variant="ghost"
                      size="icon"
                      title="Remover chave Pix"
                      aria-label="Remover chave Pix"
                      onClick={() =>
                        setDraft({ ...c, pixKeys: c.pixKeys.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 />
                    </Button>
                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor={`pix-${i}-qr`}>QR Code Pix (opcional)</Label>
                      <Input
                        id={`pix-${i}-qr`}
                        type="file"
                        accept="image/*"
                        disabled={uploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploading(true);
                          try {
                            const qrCode = await optimizePhoto(file);
                            setDraft({
                              ...c,
                              pixKeys: c.pixKeys.map((r, j) => (j === i ? { ...r, qrCode } : r)),
                            });
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : "Erro ao preparar o QR Code",
                            );
                          } finally {
                            setUploading(false);
                            e.target.value = "";
                          }
                        }}
                      />
                      {row.qrCode && (
                        <div className="flex items-center gap-3">
                          <img
                            src={row.qrCode}
                            alt={`QR Code Pix ${i + 1}`}
                            className="h-20 w-20 rounded border object-contain p-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              setDraft({
                                ...c,
                                pixKeys: c.pixKeys.map((r, j) =>
                                  j === i ? { ...r, qrCode: undefined } : r,
                                ),
                              })
                            }
                          >
                            <Trash2 />
                            Remover QR Code
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...c,
                    pixKeys: [
                      ...c.pixKeys,
                      { label: "", key: "", recipient: "", qrCode: undefined },
                    ],
                  })
                }
              >
                <Plus />
                Adicionar chave Pix
              </Button>
            </section>
            <section>
              <h2 className="mb-5 text-xl">Métodos de contribuição</h2>
              <div className="space-y-5">
                {c.methods.map((row, i) => (
                  <div key={i} className="grid gap-3 border-b pb-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`method-${i}-title`}>Nome</Label>
                      <Input
                        id={`method-${i}-title`}
                        value={row.title}
                        onChange={(e) =>
                          setDraft({
                            ...c,
                            methods: c.methods.map((r, j) =>
                              j === i ? { ...r, title: e.target.value } : r,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`method-${i}-url`}>Link de contribuição (opcional)</Label>
                      <Input
                        id={`method-${i}-url`}
                        value={row.url}
                        onChange={(e) =>
                          setDraft({
                            ...c,
                            methods: c.methods.map((r, j) =>
                              j === i ? { ...r, url: e.target.value } : r,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`method-${i}-details`}>Instruções / dados bancários</Label>
                      <Textarea
                        id={`method-${i}-details`}
                        value={row.details}
                        onChange={(e) =>
                          setDraft({
                            ...c,
                            methods: c.methods.map((r, j) =>
                              j === i ? { ...r, details: e.target.value } : r,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      className="self-end justify-self-start"
                      variant="outline"
                      onClick={() =>
                        setDraft({ ...c, methods: c.methods.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 />
                      Remover método
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() =>
                  setDraft({ ...c, methods: [...c.methods, { title: "", details: "", url: "" }] })
                }
              >
                <Plus />
                Adicionar método
              </Button>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
