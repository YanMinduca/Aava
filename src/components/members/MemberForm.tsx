import { useEffect, useState } from "react";
import { Camera, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARITAL, MEMBER_STATUS, ageFrom, formatCpf } from "@/lib/church";

export type MemberDraft = TablesInsert<"members"> & { id?: string };

export const emptyMember: MemberDraft = {
  full_name: "", email: "", phone: "", birth_date: null, address: "", cpf: "", rg: "", marital_status: null,
  joined_on: null, affiliated_on: null, baptized: false, baptism_date: null, ministry: "", department: "", church_role: "",
  status: "membro", photo_path: null,
};

export function usePhotoUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return setUrl(null);
    supabase.storage.from("member-photos").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url;
}

export function MemberAvatar({ path, size = "h-10 w-10" }: { path?: string | null | undefined; size?: string }) {
  const url = usePhotoUrl(path);
  return url ? (
    <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary`}>
      <User className="h-1/2 w-1/2" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border p-5">
      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-primary">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function MemberForm({
  value,
  onChange,
  mode,
  photoFolder,
  notes,
  onNotesChange,
}: {
  value: MemberDraft;
  onChange: (v: MemberDraft) => void;
  mode: "self" | "admin";
  photoFolder: string;
  notes?: string;
  onNotesChange?: (v: string) => void;
}) {
  const set = (patch: Partial<MemberDraft>) => onChange({ ...value, ...patch });
  const age = ageFrom(value.birth_date);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${photoFolder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("member-photos").upload(path, file);
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    set({ photo_path: path });
  }

  const txt = (k: keyof MemberDraft) => ({
    value: (value[k] as string | null | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value } as Partial<MemberDraft>),
  });
  const dt = (k: keyof MemberDraft) => ({
    type: "date",
    value: (value[k] as string | null | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: e.target.value || null } as Partial<MemberDraft>),
  });

  return (
    <div className="space-y-6">
      <Section title="Dados pessoais">
        <div className="flex items-center gap-4 sm:col-span-2">
          <MemberAvatar path={value.photo_path} size="h-20 w-20" />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm text-foreground hover:bg-accent">
            <Camera className="h-4 w-4" /> {uploading ? "Enviando..." : "Escolher foto"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        <F label="Nome completo *" full><Input required {...txt("full_name")} /></F>
        <F label="Data de nascimento"><Input {...dt("birth_date")} /></F>
        <F label="Idade"><Input disabled value={age !== null ? `${age} anos` : "—"} /></F>
        <F label="CPF"><Input value={value.cpf ?? ""} onChange={(e) => set({ cpf: formatCpf(e.target.value) })} placeholder="000.000.000-00" /></F>
        <F label="RG"><Input {...txt("rg")} /></F>
        <F label="Telefone"><Input {...txt("phone")} placeholder="(12) 90000-0000" /></F>
        <F label="E-mail"><Input type="email" {...txt("email")} /></F>
        <F label="Endereço" full><Input {...txt("address")} /></F>
        <F label="Estado civil">
          <Select value={value.marital_status ?? ""} onValueChange={(v) => set({ marital_status: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{MARITAL.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </F>
      </Section>

      <Section title="Dados da igreja">
        <F label="Data de entrada na igreja"><Input {...dt("joined_on")} /></F>
        {mode === "admin" && <F label="Data de filiação"><Input {...dt("affiliated_on")} /></F>}
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!value.baptized} onCheckedChange={(v) => set({ baptized: v, baptism_date: v ? (value.baptism_date ?? null) : null })} />
          <Label>Batizado?</Label>
        </div>
        {value.baptized && <F label="Data do batismo"><Input {...dt("baptism_date")} /></F>}
        {mode === "admin" && (
          <>
            <F label="Ministério"><Input {...txt("ministry")} /></F>
            <F label="Departamento"><Input {...txt("department")} /></F>
            <F label="Cargo"><Input {...txt("church_role")} /></F>
            <F label="Status">
              <Select value={value.status ?? "membro"} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MEMBER_STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          </>
        )}
      </Section>

      {mode === "admin" && onNotesChange && (
        <Section title="Dados administrativos (internos)">
          <F label="Observações — visível só para quem tem permissão" full>
            <Textarea rows={4} value={notes ?? ""} onChange={(e) => onNotesChange(e.target.value)} />
          </F>
        </Section>
      )}
    </div>
  );
}
