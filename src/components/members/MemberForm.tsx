import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Camera, ChevronDown, User } from "lucide-react";
import { compressImage, fileExt, MEMBER_PHOTO_MAX_SIDE } from "@/lib/images";
import { getPhotoUrl, peekPhotoUrl } from "@/lib/photo-urls";
import { uuid } from "@/lib/uuid";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARITAL, MEMBER_STATUS, ageFrom, formatCep, formatCpf } from "@/lib/church";

export type MemberDraft = TablesInsert<"members"> & { id?: string };

export const emptyMember: MemberDraft = {
  full_name: "", email: "", phone: "", birth_date: null, address: "", cpf: "", rg: "", marital_status: null,
  affiliated_on: null, baptized: false, baptism_date: null, church_role_id: null,
  status: "membro", photo_path: null,
  neighborhood: "", city: "", zip_code: "", baptism_church: "",
};

export function usePhotoUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(() => peekPhotoUrl(path));
  useEffect(() => {
    if (!path) return setUrl(null);
    let alive = true;
    const known = peekPhotoUrl(path);
    if (known) setUrl(known);
    else {
      setUrl(null);
      void getPhotoUrl(path).then((u) => alive && setUrl(u));
    }
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

export function MemberAvatar({ path, size = "h-10 w-10" }: { path?: string | null | undefined; size?: string }) {
  const url = usePhotoUrl(path);
  return url ? (
    <img src={url} alt="" loading="lazy" decoding="async" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${size} flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary`}>
      <User className="h-1/2 w-1/2" />
    </div>
  );
}

export type DepartmentOption = { id: string; name: string };
export type RoleOption = { id: string; name: string; is_leadership: boolean };

/** Menu de opções (seleção múltipla) com os departamentos cadastrados na página Departamentos. */
function DepartmentPicker({ options, value, onChange }: { options: DepartmentOption[]; value: string[]; onChange: (ids: string[]) => void }) {
  const names = options.filter((o) => value.includes(o.id)).map((o) => o.name);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="truncate">{names.length ? names.join(", ") : "Selecione os departamentos"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
        {options.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">Nenhum departamento cadastrado. Crie em Departamentos, no menu lateral.</p>
        ) : (
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {options.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent">
                <Checkbox
                  checked={value.includes(o.id)}
                  onCheckedChange={(on) => onChange(on ? [...value, o.id] : value.filter((id) => id !== o.id))}
                />
                {o.name}
              </label>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  departments,
  departmentIds,
  onDepartmentIdsChange,
  roles,
  leaderDepartmentIds,
  onLeaderDepartmentIdsChange,
  nameAddon,
}: {
  value: MemberDraft;
  onChange: (v: MemberDraft) => void;
  mode: "self" | "admin";
  photoFolder: string;
  notes?: string;
  onNotesChange?: (v: string) => void;
  /** Opções de departamento. Só é passado para quem pode vincular membros a departamentos. */
  departments?: DepartmentOption[];
  departmentIds?: string[];
  onDepartmentIdsChange?: (ids: string[]) => void;
  /** Cargos criados na área de Departamentos. Só é passado para quem pode atribuir cargos. */
  roles?: RoleOption[];
  /** Departamentos dos quais o membro é líder (perguntado quando o cargo é de liderança). */
  leaderDepartmentIds?: string[];
  onLeaderDepartmentIdsChange?: (ids: string[]) => void;
  /** Conteúdo exibido logo abaixo do campo de nome (ex.: "Este é você?"). */
  nameAddon?: ReactNode;
}) {
  const set = (patch: Partial<MemberDraft>) => onChange({ ...value, ...patch });
  const age = ageFrom(value.birth_date);
  const [uploading, setUploading] = useState(false);
  const isLeadershipRole = !!roles?.find((r) => r.id === value.church_role_id)?.is_leadership;
  const selectedDepartments = (departments ?? []).filter((d) => (departmentIds ?? []).includes(d.id));

  async function upload(file: File) {
    setUploading(true);
    // A foto só aparece em círculos de até 80 px: 400 px já sobra e pesa ~7x menos que 900 px.
    const blob = await compressImage(file, { maxSide: MEMBER_PHOTO_MAX_SIDE, quality: 0.8 });
    const path = `${photoFolder}/${uuid()}.${fileExt(blob, file.name)}`;
    const { error } = await supabase.storage.from("member-photos").upload(path, blob, { contentType: blob.type || file.type, cacheControl: "86400" });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    set({ photo_path: path });
  }

  // Preenche rua, bairro e cidade a partir do CEP (ViaCEP). Se falhar, o usuário digita manualmente.
  async function fillFromCep(cep: string) {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g, "")}/json/`);
      if (!res.ok) return;
      const d = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string };
      if (d.erro) return;
      onChange({
        ...value,
        zip_code: cep,
        address: value.address || d.logradouro || "",
        neighborhood: value.neighborhood || d.bairro || "",
        city: value.city || d.localidade || "",
      });
    } catch {
      /* sem internet ou serviço fora do ar: segue manual */
    }
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
        <F label="Nome completo *" full><Input required {...txt("full_name")} />{nameAddon}</F>
        <F label="Data de nascimento"><Input {...dt("birth_date")} /></F>
        <F label="Idade"><Input disabled value={age !== null ? `${age} anos` : "—"} /></F>
        <F label="CPF"><Input value={value.cpf ?? ""} onChange={(e) => set({ cpf: formatCpf(e.target.value) })} placeholder="000.000.000-00" /></F>
        <F label="RG"><Input {...txt("rg")} /></F>
        <F label="Telefone"><Input {...txt("phone")} placeholder="(12) 90000-0000" /></F>
        <F label="E-mail"><Input type="email" {...txt("email")} /></F>
        <F label="Estado civil">
          <Select value={value.marital_status ?? ""} onValueChange={(v) => set({ marital_status: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{MARITAL.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </F>
      </Section>

      <Section title="Endereço">
        <F label="CEP">
          <Input
            inputMode="numeric"
            placeholder="00000-000"
            value={value.zip_code ?? ""}
            onChange={(e) => {
              const cep = formatCep(e.target.value);
              set({ zip_code: cep });
              if (cep.length === 9) void fillFromCep(cep);
            }}
          />
        </F>
        <F label="Endereço (rua e número)"><Input {...txt("address")} /></F>
        <F label="Bairro"><Input {...txt("neighborhood")} /></F>
        <F label="Cidade"><Input {...txt("city")} /></F>
      </Section>

      <Section title="Dados da igreja">
        {mode === "admin" && <F label="Matrícula"><Input {...txt("registration_number")} placeholder="Ex.: 0001" /></F>}
        {mode === "admin" && <F label="Data de filiação"><Input {...dt("affiliated_on")} /></F>}
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={!!value.baptized} onCheckedChange={(v) => set({ baptized: v, baptism_date: v ? (value.baptism_date ?? null) : null, baptism_church: v ? (value.baptism_church ?? "") : "" })} />
          <Label>Batizado?</Label>
        </div>
        {value.baptized && <F label="Data do batismo"><Input {...dt("baptism_date")} /></F>}
        {value.baptized && (
          <F label="Igreja onde se batizou" full>
            <Input {...txt("baptism_church")} placeholder="Nome da igreja e cidade" />
          </F>
        )}
        {mode === "admin" && (
          <>
            {departments && onDepartmentIdsChange && (
              <F label="Departamento">
                <DepartmentPicker options={departments} value={departmentIds ?? []} onChange={onDepartmentIdsChange} />
              </F>
            )}
            {roles && (
              <F label="Cargo">
                <Select value={value.church_role_id ?? "none"} onValueChange={(v) => set({ church_role_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cargo</SelectItem>
                    {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            )}
            <F label="Status">
              <Select value={value.status ?? "membro"} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MEMBER_STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          </>
        )}
        {mode === "admin" && isLeadershipRole && departments && onLeaderDepartmentIdsChange && (
          <div className="space-y-3 rounded-xl border bg-primary-soft/40 p-4 sm:col-span-2">
            <p className="text-sm font-medium text-foreground">Este cargo é de liderança. A pessoa é líder de qual departamento?</p>
            {selectedDepartments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Selecione acima o(s) departamento(s) da pessoa para definir a liderança.</p>
            ) : (
              selectedDepartments.map((d) => (
                <label key={d.id} className="flex items-center justify-between gap-4 rounded-lg border bg-background px-4 py-2.5 text-sm">
                  <span className="text-foreground">É líder do departamento {d.name}?</span>
                  <Switch
                    checked={(leaderDepartmentIds ?? []).includes(d.id)}
                    onCheckedChange={(on) =>
                      onLeaderDepartmentIdsChange(on ? [...(leaderDepartmentIds ?? []), d.id] : (leaderDepartmentIds ?? []).filter((x) => x !== d.id))
                    }
                  />
                </label>
              ))
            )}
          </div>
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
