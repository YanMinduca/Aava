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
        url: z
          .string()
          .max(700000)
          .regex(/^data:image\/jpeg;base64,/),
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
        qrCode: z
          .string()
          .max(700000)
          .regex(/^data:image\/jpeg;base64,/)
          .optional(),
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
    const { data: roles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw roleError;
    if (!roles?.some((r) => r.role === "ceo" || r.role === "pastor_presidente"))
      throw new Error("Acesso negado.");
    const { error } = await context.supabase
      .from("site_content")
      .upsert({ id: "main", content: data as Json, updated_at: new Date().toISOString() });
    if (error) throw error;
    return mergeContent(data);
  });
