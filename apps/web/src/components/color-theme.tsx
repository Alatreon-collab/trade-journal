"use client";

import { useEffect } from "react";
import { useApi } from "@/lib/use-api";
import { colorsCss, type ColorSettings } from "@/lib/colors";
import { COLORS_CSS_KEY } from "@/lib/theme";

export const COLORS_EVENT = "journal-colors";

/** Aplica la combinación de colores elegida (variables CSS) en todo el journal. */
export function applyColors(settings: ColorSettings): void {
  const css = colorsCss(settings);
  let style = document.getElementById("journal-colors") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "journal-colors";
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
  // Los gráficos leen los colores al cambiar este atributo.
  document.documentElement.dataset.colors =
    settings.preset + (settings.custom ? Object.values(settings.custom).join("") : "");
  try {
    localStorage.setItem(COLORS_CSS_KEY, css);
  } catch {
    // sin almacenamiento: se aplican igual al cargar los ajustes
  }
}

export function ColorTheme() {
  const { data } = useApi<{ colors?: ColorSettings }>("/api/settings");
  useEffect(() => {
    if (data?.colors) applyColors(data.colors);
  }, [data]);
  useEffect(() => {
    const onChange = (event: Event) => applyColors((event as CustomEvent<ColorSettings>).detail);
    window.addEventListener(COLORS_EVENT, onChange);
    return () => window.removeEventListener(COLORS_EVENT, onChange);
  }, []);
  return null;
}
