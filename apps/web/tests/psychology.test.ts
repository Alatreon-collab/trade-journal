import { describe, expect, it } from "vitest";
import {
  DAY_PSYCH_GROUPS,
  psychKeyLabel,
  psychKeys,
  sanitizePsych,
  sessionOf,
  TRADE_PSYCH_GROUPS,
} from "../src/lib/psychology";

describe("sesiones en hora de Nueva York", () => {
  it.each([
    // Verano (EDT, UTC-4)
    ["2026-07-14T06:30:00Z", "london"], // 02:30 NY
    ["2026-07-14T12:00:00Z", "ny_am"], // 08:00 NY
    ["2026-07-14T15:59:00Z", "ny_am"], // 11:59 NY
    ["2026-07-14T16:30:00Z", "none"], // 12:30 NY (pausa)
    ["2026-07-14T17:00:00Z", "ny_pm"], // 13:00 NY
    ["2026-07-15T00:30:00Z", "asia"], // 20:30 NY
    // Invierno (EST, UTC-5)
    ["2026-01-14T13:00:00Z", "ny_am"], // 08:00 NY
    ["2026-01-14T12:59:00Z", "none"], // 07:59 NY
    ["2026-01-14T07:00:00Z", "london"], // 02:00 NY
  ])("%s → %s", (iso, session) => {
    expect(sessionOf(iso)).toBe(session);
  });
});

describe("psicología", () => {
  it("acepta solo grupos y opciones conocidos", () => {
    expect(
      sanitizePsych(
        { before: "calm", entry: "fomo", management: ["plan", "plan"], extra: "x", note: " " },
        TRADE_PSYCH_GROUPS,
      ),
    ).toEqual({ before: "calm", entry: "fomo", management: ["plan"] });
    expect(() => sanitizePsych({ entry: "hack" }, TRADE_PSYCH_GROUPS)).toThrow();
    expect(() => sanitizePsych({ management: "plan" }, TRADE_PSYCH_GROUPS)).toThrow();
    expect(sanitizePsych({}, DAY_PSYCH_GROUPS)).toBeNull();
  });

  it("genera claves y etiquetas para las estadísticas", () => {
    const keys = psychKeys({ entry: "fomo", management: ["moved_stop", "early_exit"] });
    expect(keys).toEqual(["entry:fomo", "management:moved_stop", "management:early_exit"]);
    expect(psychKeyLabel("entry:fomo")).toBe("Entrada · ⚡ FOMO");
  });
});
