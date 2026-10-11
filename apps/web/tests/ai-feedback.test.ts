import { describe, expect, it } from "vitest";
import { aiFeedback } from "../src/lib/ai-feedback";

describe("AI feedback", () => {
  it("explains empty or invalid scopes without suggesting an AI connection problem", () => {
    for (const message of [
      "No trades match the selected accounts and filters",
      "No closed trades match this day and the selected filters",
    ])
      expect(aiFeedback(message)).toEqual({
        title: "Ningún trade coincide",
        description:
          "No hay trades que analizar en esta selección. Ajusta las cuentas, las fechas u otros filtros del journal.",
        tone: "info",
      });
    expect(aiFeedback("A selected account no longer exists. Update your filters.").title).toBe(
      "Revisa los filtros del journal",
    );
    expect(aiFeedback("Journal timezone changed. Refresh and try again.").title).toBe(
      "Recarga el journal",
    );
  });
  it("treats missing setup as guidance with a direct settings destination", () => {
    expect(
      aiFeedback(
        "AI is not configured — add your Anthropic API key in Settings (it stays on your machine).",
      ),
    ).toMatchObject({
      tone: "info",
      title: "Configura la IA para continuar",
      action: { href: "/settings#ai-settings" },
    });
  });
  it("distinguishes credentials, billing and temporary provider failures", () => {
    expect(aiFeedback("authentication_error: invalid x-api-key").action?.label).toBe(
      "Revisar ajustes de IA",
    );
    expect(aiFeedback("Your credit balance is too low").title).toBe(
      "Tu cuenta de IA necesita atención",
    );
    expect(aiFeedback("rate_limit_error")).toMatchObject({ tone: "info", retry: true });
    expect(aiFeedback("overloaded_error").retry).toBe(true);
  });
  it("offers data-specific empty-state guidance without an unhelpful retry", () => {
    expect(aiFeedback("The journal is empty — import trades first").action?.href).toBe("/import");
    const recap = aiFeedback("No closed trades on this day to recap");
    expect(recap.title).toBe("Aún no hay trades que resumir");
    expect(recap.retry).toBeUndefined();
  });
  it("recognizes OpenAI credentials, quota and model errors without showing key fragments", () => {
    const notice = aiFeedback("Incorrect API key provided: sk-proj-PRIVATE");
    expect(notice.action?.label).toBe("Revisar ajustes de IA");
    expect(JSON.stringify(notice)).not.toContain("PRIVATE");
    expect(aiFeedback("insufficient_quota").title).toBe("Tu cuenta de IA necesita atención");
    expect(aiFeedback("You exceeded your current quota").retry).toBeUndefined();
    expect(aiFeedback("AI model unavailable").title).toBe("Revisa el modelo de IA");
  });
  it("offers recovery for network and session failures", () => {
    expect(aiFeedback("Failed to fetch")).toMatchObject({
      title: "No se pudo conectar con la IA",
      retry: true,
    });
    expect(aiFeedback("Unauthorized").action?.href).toBe("/login");
  });
  it("never echoes raw provider payloads or credentials into the notice", () => {
    const raw = 'Provider error: {secret: "sk-ant-PRIVATE", prompt: "PRIVATE JOURNAL"}';
    const notice = aiFeedback(raw);
    expect(notice.title).toBe("No se pudo completar la petición a la IA");
    expect(JSON.stringify(notice)).not.toContain("PRIVATE");
    expect(notice.retry).toBe(true);
  });
});
