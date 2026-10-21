import { describe, expect, it } from "vitest";
import { colorsCss, parseColors, resolveColors, sanitizeColors } from "../src/lib/colors";

describe("colores del journal", () => {
  it("accepts presets and validated custom colors", () => {
    expect(sanitizeColors({ preset: "calm" })).toEqual({ preset: "calm" });
    expect(
      sanitizeColors({
        preset: "custom",
        custom: { profit: "#2BB3A8", loss: "#e39446", accent: "#3987e5" },
      }),
    ).toEqual({
      preset: "custom",
      custom: { profit: "#2bb3a8", loss: "#e39446", accent: "#3987e5" },
    });
    expect(() => sanitizeColors({ preset: "otro" })).toThrow();
    expect(() =>
      sanitizeColors({
        preset: "custom",
        custom: { profit: "red", loss: "#000000", accent: "#000000" },
      }),
    ).toThrow("#RRGGBB");
  });
  it("falls back to the classic colors when nothing valid is saved", () => {
    expect(parseColors(null)).toEqual({ preset: "classic" });
    expect(parseColors("{roto")).toEqual({ preset: "classic" });
  });
  it("produces CSS for light and dark mode", () => {
    const css = colorsCss({ preset: "calm" });
    expect(css).toContain("html:root{--profit:#1f63c6");
    expect(css).toContain("html.dark:root{--profit:#5aa2f2");
    expect(
      resolveColors(
        { preset: "custom", custom: { profit: "#111111", loss: "#222222", accent: "#333333" } },
        "dark",
      ),
    ).toEqual({
      profit: "#111111",
      profitFill: "#111111",
      loss: "#222222",
      accent: "#333333",
    });
  });
});
