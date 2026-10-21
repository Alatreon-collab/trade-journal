/**
 * Colores del journal: positivo, negativo y color de los gráficos.
 * Se guardan en Ajustes (viajan con la copia entre PCs) y se aplican como
 * variables CSS encima de las del tema claro/oscuro.
 */

export interface ColorSet {
  /** Texto e iconos de resultados positivos. */
  profit: string;
  /** Barras y rellenos positivos. */
  profitFill: string;
  /** Resultados negativos (texto y barras). */
  loss: string;
  /** Curvas, indicadores y acentos de los gráficos. */
  accent: string;
}

export interface ColorPreset {
  id: string;
  label: string;
  description: string;
  light: ColorSet;
  dark: ColorSet;
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: "classic",
    label: "Clásico",
    description: "Verde y rojo, los colores de siempre.",
    light: { profit: "#006300", profitFill: "#0ca30c", loss: "#d03b3b", accent: "#0b7cbd" },
    dark: { profit: "#0ca30c", profitFill: "#0ca30c", loss: "#d03b3b", accent: "#1197e2" },
  },
  {
    id: "calm",
    label: "Calma",
    description: "Azul y naranja suave. No «grita» y se distingue bien con daltonismo.",
    light: { profit: "#1f63c6", profitFill: "#3a86e8", loss: "#c06a1b", accent: "#178c86" },
    dark: { profit: "#5aa2f2", profitFill: "#3a86e8", loss: "#e39446", accent: "#2bb3a8" },
  },
  {
    id: "neutral",
    label: "Neutro",
    description: "Casi sin color: manda el signo (+/−) y la etiqueta WIN/LOSS.",
    light: { profit: "#16161a", profitFill: "#3f3f46", loss: "#8a8984", accent: "#52514e" },
    dark: { profit: "#f4f4f4", profitFill: "#d4d4d8", loss: "#8b8b95", accent: "#b4b4bc" },
  },
];

export const CUSTOM_ID = "custom";

export interface ColorSettings {
  preset: string;
  /** Solo para «Personalizado»: los mismos colores en modo claro y oscuro. */
  custom?: { profit: string; loss: string; accent: string };
}

export const DEFAULT_COLORS: ColorSettings = { preset: "classic" };
export const DEFAULT_CUSTOM = { profit: "#2bb3a8", loss: "#e39446", accent: "#3987e5" };

const HEX = /^#[0-9a-f]{6}$/i;

/** Valida lo que llega del navegador. Lanza un error si no es válido. */
export function sanitizeColors(input: unknown): ColorSettings {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Colores no válidos.");
  const raw = input as Record<string, unknown>;
  const preset = raw.preset;
  if (
    typeof preset !== "string" ||
    (preset !== CUSTOM_ID && !COLOR_PRESETS.some((item) => item.id === preset))
  )
    throw new Error("Elige una combinación de colores válida.");
  if (preset !== CUSTOM_ID) return { preset };
  const custom = raw.custom as Record<string, unknown> | undefined;
  const pick = (key: "profit" | "loss" | "accent") => {
    const value = custom?.[key];
    if (typeof value !== "string" || !HEX.test(value))
      throw new Error("Los colores personalizados deben ser #RRGGBB.");
    return value.toLowerCase();
  };
  return { preset, custom: { profit: pick("profit"), loss: pick("loss"), accent: pick("accent") } };
}

export function parseColors(json: string | null | undefined): ColorSettings {
  if (!json) return DEFAULT_COLORS;
  try {
    return sanitizeColors(JSON.parse(json));
  } catch {
    return DEFAULT_COLORS;
  }
}

/** Colores efectivos para un modo (claro u oscuro). */
export function resolveColors(settings: ColorSettings, mode: "light" | "dark"): ColorSet {
  if (settings.preset === CUSTOM_ID && settings.custom) {
    const { profit, loss, accent } = settings.custom;
    return { profit, profitFill: profit, loss, accent };
  }
  const preset = COLOR_PRESETS.find((item) => item.id === settings.preset) ?? COLOR_PRESETS[0]!;
  return preset[mode];
}

const block = (set: ColorSet) =>
  `--profit:${set.profit};--profit-fill:${set.profitFill};--loss:${set.loss};--brand:${set.accent};--ring:${set.accent};--series-1:${set.accent};`;

/** CSS que pisa las variables del tema; mayor especificidad que :root y .dark. */
export const colorsCss = (settings: ColorSettings): string =>
  `html:root{${block(resolveColors(settings, "light"))}}html.dark:root{${block(resolveColors(settings, "dark"))}}`;
