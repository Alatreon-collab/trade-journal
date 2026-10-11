// Psicología del trade y del día. Los valores se guardan con claves estables
// (en inglés) y aquí se definen los textos que se muestran.

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipGroup {
  id: string;
  title: string;
  multiple?: boolean;
  options: ChipOption[];
}

export const TRADE_PSYCH_GROUPS: ChipGroup[] = [
  {
    id: "before",
    title: "Estado antes",
    options: [
      { value: "calm", label: "😌 Tranquilo" },
      { value: "nervous", label: "😰 Nervioso" },
      { value: "frustrated", label: "😤 Frustrado" },
      { value: "confident", label: "😎 Confiado" },
      { value: "doubtful", label: "😔 Dudoso" },
    ],
  },
  {
    id: "entry",
    title: "Entrada",
    options: [
      { value: "patient", label: "✅ Esperé pacientemente" },
      { value: "fomo", label: "⚡ FOMO" },
      { value: "rushed", label: "🏃 Precipitado" },
      { value: "revenge", label: "😡 Revenge" },
      { value: "late", label: "🐢 Dudé / entré tarde" },
    ],
  },
  {
    id: "management",
    title: "Gestión",
    multiple: true,
    options: [
      { value: "plan", label: "✅ Seguí el plan" },
      { value: "early_exit", label: "Cerré antes" },
      { value: "moved_stop", label: "Moví el stop" },
      { value: "held_too_long", label: "Aguanté de más" },
    ],
  },
  {
    id: "affected",
    title: "¿Las emociones afectaron?",
    options: [
      { value: "yes", label: "Sí" },
      { value: "no", label: "No" },
    ],
  },
];

export const DAY_PSYCH_GROUPS: ChipGroup[] = [
  {
    id: "mood",
    title: "Estado del día",
    options: [
      { value: "calm", label: "😌 Tranquilo" },
      { value: "anxious", label: "😰 Ansioso" },
      { value: "frustrated", label: "😤 Frustrado" },
      { value: "confident", label: "😎 Confiado" },
      { value: "tired", label: "😴 Cansado" },
    ],
  },
  {
    id: "plan",
    title: "¿Seguí mi plan?",
    options: [
      { value: "yes", label: "Sí" },
      { value: "partial", label: "A medias" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "overtrading",
    title: "¿Overtrading?",
    options: [
      { value: "yes", label: "Sí" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "accepted",
    title: "¿Acepté el resultado del día?",
    options: [
      { value: "yes", label: "Sí" },
      { value: "no", label: "No" },
    ],
  },
];

/** Valores guardados: cada grupo es un string (una opción) o un array (varias). */
export type PsychValues = Record<string, string | string[] | undefined> & { note?: string };

/** Limpia lo que llega del navegador: solo grupos y opciones conocidos. */
export function sanitizePsych(input: unknown, groups: ChipGroup[]): PsychValues | null {
  if (input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Psicología no válida.");
  const raw = input as Record<string, unknown>;
  const out: PsychValues = {};
  for (const group of groups) {
    const value = raw[group.id];
    const allowed = new Set(group.options.map((option) => option.value));
    if (value === undefined || value === null || value === "") continue;
    if (group.multiple) {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && allowed.has(v)))
        throw new Error(`Valor no válido en ${group.title}.`);
      if (value.length) out[group.id] = [...new Set(value as string[])];
    } else {
      if (typeof value !== "string" || !allowed.has(value))
        throw new Error(`Valor no válido en ${group.title}.`);
      out[group.id] = value;
    }
  }
  if (raw.note !== undefined && raw.note !== null) {
    if (typeof raw.note !== "string" || raw.note.length > 2000)
      throw new Error("La nota de psicología admite como máximo 2.000 caracteres.");
    if (raw.note.trim()) out.note = raw.note;
  }
  return Object.keys(out).length ? out : null;
}

export function parsePsych(json: string | null | undefined): PsychValues {
  if (!json) return {};
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as PsychValues)
      : {};
  } catch {
    return {};
  }
}

/** Claves "grupo:valor" de un trade, para agrupar estadísticas. */
export function psychKeys(values: PsychValues | undefined): string[] {
  if (!values) return [];
  const keys: string[] = [];
  for (const group of TRADE_PSYCH_GROUPS) {
    const value = values[group.id];
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      keys.push(`${group.id}:${item}`);
  }
  return keys;
}

/** Texto de una clave "grupo:valor", p. ej. "Entrada · ⚡ FOMO". */
export function psychKeyLabel(key: string): string {
  const [groupId, value] = key.split(":");
  const group = TRADE_PSYCH_GROUPS.find((g) => g.id === groupId);
  const option = group?.options.find((o) => o.value === value);
  if (!group || !option) return key;
  return group.id === "affected"
    ? `Emociones afectaron · ${option.label}`
    : `${group.title} · ${option.label}`;
}

/** Orden fijo de las claves para mostrarlas agrupadas. */
export function psychKeyOrder(key: string): number {
  const [groupId, value] = key.split(":");
  const groupIndex = TRADE_PSYCH_GROUPS.findIndex((g) => g.id === groupId);
  const optionIndex =
    TRADE_PSYCH_GROUPS[groupIndex]?.options.findIndex((o) => o.value === value) ?? 0;
  return groupIndex * 100 + optionIndex;
}

// ---- Sesiones (hora de Nueva York) ----

export const SESSIONS = [
  { key: "asia", label: "Asia", from: 20 * 60, to: 24 * 60, hours: "20:00–00:00" },
  { key: "london", label: "Londres", from: 2 * 60, to: 5 * 60, hours: "02:00–05:00" },
  { key: "ny_am", label: "NY AM", from: 8 * 60, to: 12 * 60, hours: "08:00–12:00" },
  { key: "ny_pm", label: "NY PM", from: 13 * 60, to: 16 * 60, hours: "13:00–16:00" },
] as const;
export const OUT_OF_SESSION = { key: "none", label: "Fuera de sesión" } as const;

const nyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Sesión según la hora de Nueva York de la entrada. */
export function sessionOf(iso: string): string {
  const parts = nyFormatter.formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutes = hour * 60 + minute;
  return SESSIONS.find((s) => minutes >= s.from && minutes < s.to)?.key ?? OUT_OF_SESSION.key;
}

export const sessionLabel = (key: string) =>
  SESSIONS.find((s) => s.key === key)?.label ?? OUT_OF_SESSION.label;
export const sessionOrder = (key: string) => {
  const index = SESSIONS.findIndex((s) => s.key === key);
  return index < 0 ? SESSIONS.length : index;
};
