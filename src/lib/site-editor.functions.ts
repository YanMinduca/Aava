import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { contentFields, mergeContent } from "./site-content";
import type { Json } from "@/integrations/supabase/types";

const textFields = Object.fromEntries(
  Object.keys(contentFields).map((k) => [k, z.string().max(10000)]),
);
const link = z
  .string()
  .refine((v) => !v || /^https:\/\//.test(v), "Use um link completo começando com https://");
// Imagens ficam no armazenamento (bucket público "site-assets"); nada de imagem dentro do banco.
const storageImage = z
  .string()
  .max(600)
  .regex(/^https:\/\/[^/\s]+\/storage\/v1\/object\/public\/site-assets\/[A-Za-z0-9/_.-]+$/, "Imagem inválida. Envie novamente.");
const schema = z.object({
  ...textFields,
  instagramUrl: link,
  instagramVideo: link,
  facebookUrl: link,
  youtubeUrl: link,
  whatsappUrl: link,
  photos: z
    .array(
      z.object({
        url: storageImage,
        caption: z.string().max(300),
      }),
    )
    .max(8),
  schedule: z
    .array(
      z.object({ day: z.string().max(100), time: z.string().max(50), name: z.string().max(200) }),
    )
    .max(30),
  pixKeys: z
    .array(
      z.object({
        label: z.string().max(100),
        key: z.string().min(1).max(200),
        recipient: z.string().max(200),
        qrCode: storageImage.optional(),
      }),
    )
    .max(20),
  methods: z
    .array(z.object({ title: z.string().max(100), details: z.string().max(3000), url: link }))
    .max(20),
});
export const saveSiteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    // CEO e pastor presidente editam sempre; os demais precisam da permissão "edit_site" (has_permission já cobre os dois casos).
    const { data: allowed, error: permError } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _permission: "edit_site",
    });
    if (permError) throw permError;
    if (!allowed) throw new Error("Acesso negado.");
    // Quem não é liderança não altera Pix nem métodos de contribuição: o banco mantém os valores atuais,
    // por isso devolvemos o que realmente ficou salvo (e não o que foi enviado).
    const { data: saved, error } = await context.supabase
      .from("site_content")
      .upsert({ id: "main", content: data as Json, updated_at: new Date().toISOString() })
      .select("content")
      .single();
    if (error) throw error;
    return mergeContent(saved.content);
  });
