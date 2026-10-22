// Setup del modelo en cada trade (y en los setups no tomados). Lo usa la
// exportación para el bot. Claves estables; los textos son los que se ven.
import { sanitizePsych, type ChipGroup, type PsychValues } from "./psychology";

const grades = ["A+", "A", "B", "C", "D", "F"].map((value) => ({ value, label: value }));

export const SETUP_GROUPS: ChipGroup[] = [
  {
    id: "nota_previa",
    title: "Nota previa (antes de entrar)",
    options: grades,
  },
  {
    id: "tf_setup",
    title: "TF del setup (C2)",
    options: ["30M", "1H", "4H"].map((value) => ({ value, label: value })),
  },
  {
    id: "tf_entrada",
    title: "TF de entrada",
    options: ["1M", "3M", "5M", "15M"].map((value) => ({ value, label: value })),
  },
  {
    id: "tipo_entrada",
    title: "Tipo de entrada",
    options: [
      { value: "c2_cierre", label: "C2 al cierre" },
      { value: "dentro_c2", label: "Dentro de la C2" },
      { value: "c3", label: "C3" },
    ],
  },
  {
    id: "poi",
    title: "POI",
    options: [
      { value: "fvg", label: "FVG" },
      { value: "ifvg", label: "iFVG" },
      { value: "cisd", label: "CISD" },
      { value: "breaker", label: "Breaker" },
      { value: "unicorn", label: "Unicorn" },
      { value: "apertura", label: "Apertura" },
    ],
  },
  {
    id: "liquidez_tomada",
    title: "Liquidez tomada",
    multiple: true,
    options: [
      { value: "asia", label: "Asia" },
      { value: "londres", label: "Londres" },
      { value: "pdh", label: "PDH" },
      { value: "pdl", label: "PDL" },
      { value: "ny_am_ayer", label: "NY AM de ayer" },
      { value: "ny_pm_ayer", label: "NY PM de ayer" },
      { value: "swing_1h", label: "Swing 1H" },
      { value: "swing_4h", label: "Swing 4H" },
      { value: "swing_d", label: "Swing D" },
    ],
  },
  {
    id: "zona_htf",
    title: "Zona HTF",
    options: [
      { value: "fvg_30m", label: "FVG 30M" },
      { value: "fvg_1h", label: "FVG 1H" },
      { value: "fvg_4h", label: "FVG 4H" },
      { value: "fvg_d", label: "FVG D" },
      { value: "ninguna", label: "Ninguna" },
    ],
  },
  {
    id: "nota_review",
    title: "Nota en la review (después)",
    options: grades,
  },
];

export interface TextField {
  key: string;
  label: string;
  placeholder: string;
  maxLength: number;
}

export const SETUP_TEXT_FIELDS: TextField[] = [
  {
    key: "id_aviso_bot",
    label: "ID del aviso del bot (Telegram)",
    placeholder: "Si la entrada viene de un aviso, pega su ID",
    maxLength: 120,
  },
];

/** Valida el setup que llega del navegador; null si está vacío. */
export function sanitizeSetup(input: unknown): PsychValues | null {
  const base = sanitizePsych(input, SETUP_GROUPS) ?? {};
  delete base.note;
  const raw = (input ?? {}) as Record<string, unknown>;
  for (const field of SETUP_TEXT_FIELDS) {
    const value = raw[field.key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || value.length > field.maxLength)
      throw new Error(`${field.label}: máximo ${field.maxLength} caracteres.`);
    if (value.trim()) base[field.key] = value.trim();
  }
  return Object.keys(base).length ? base : null;
}

/** Texto que se exporta para un grupo (la etiqueta visible; varias separadas por |). */
export function setupLabel(values: PsychValues, groupId: string): string {
  const group = SETUP_GROUPS.find((item) => item.id === groupId);
  const value = values[groupId];
  if (!group || value === undefined) return "";
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => group.options.find((option) => option.value === item)?.label ?? item)
    .join("|");
}
