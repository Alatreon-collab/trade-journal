export interface AiFeedback {
  title: string;
  description: string;
  tone: "info" | "error";
  action?: { label: string; href: string };
  retry?: boolean;
}

/** Friendly, bounded copy: never echo provider payloads or credentials into the UI. */
export function aiFeedback(message: string): AiFeedback {
  if (/^No (?:closed )?trades match/.test(message))
    return {
      title: "Ningún trade coincide",
      description:
        "No hay trades que analizar en esta selección. Ajusta las cuentas, las fechas u otros filtros del journal.",
      tone: "info",
    };
  if (
    /^A selected account no longer exists|^Invalid .* filter|^Invalid .* (?:date|time|number|range)|^Unknown journal filter|^filters is required|^From date must/.test(
      message,
    )
  )
    return {
      title: "Revisa los filtros del journal",
      description:
        "La selección ya no es válida. Actualiza las cuentas y los filtros antes de volver a intentarlo.",
      tone: "info",
    };
  if (/^Journal timezone changed/.test(message))
    return {
      title: "Recarga el journal",
      description:
        "La zona horaria del journal ha cambiado. Recarga esta página para que las fechas y el análisis de la IA coincidan.",
      tone: "info",
    };
  if (/AI is not configured/i.test(message))
    return {
      title: "Configura la IA para continuar",
      description:
        "Conecta una API key de Anthropic u OpenAI en Ajustes para hacer preguntas, generar resúmenes y revisar trades.",
      tone: "info",
      action: { label: "Configurar IA", href: "/settings#ai-settings" },
    };
  if (
    /invalid.*(?:api.?key|x-api-key)|incorrect api key|authentication_error|invalid_api_key/i.test(
      message,
    )
  )
    return {
      title: "Revisa la conexión con la IA",
      description:
        "Tu proveedor de IA no ha podido verificar la clave o los permisos. Revísalos en Ajustes y vuelve a intentarlo.",
      tone: "error",
      action: { label: "Revisar ajustes de IA", href: "/settings#ai-settings" },
    };
  if (
    /credit balance|billing|insufficient.*(?:credit|quota)|exceeded your current quota/i.test(
      message,
    )
  )
    return {
      title: "Tu cuenta de IA necesita atención",
      description:
        "Revisa la facturación, el saldo de créditos o la cuota de tu cuenta del proveedor de IA y vuelve a intentarlo.",
      tone: "info",
    };
  if (/model unavailable|model_not_found/i.test(message))
    return {
      title: "Revisa el modelo de IA",
      description: "Comprueba en Ajustes el ID del modelo y el acceso de tu cuenta del proveedor.",
      tone: "error",
      action: { label: "Revisar ajustes de IA", href: "/settings#ai-settings" },
    };
  if (/rate.limit|too many requests|overloaded/i.test(message))
    return {
      title: "La IA está saturada ahora mismo",
      description: "Espera un momento antes de volver a intentarlo. Tus datos no han cambiado.",
      tone: "info",
      retry: true,
    };
  if (/journal is empty/i.test(message))
    return {
      title: "Añade trades para empezar",
      description:
        "La IA usa el historial de tu journal. Importa tus trades y vuelve a hacer la pregunta.",
      tone: "info",
      action: { label: "Importar trades", href: "/import" },
    };
  if (/No closed trades on this day/i.test(message))
    return {
      title: "Aún no hay trades que resumir",
      description:
        "El resumen necesita al menos un trade cerrado en este día. Puedes escribir tu propia nota del día.",
      tone: "info",
    };
  if (/Unauthorized/i.test(message))
    return {
      title: "Vuelve a iniciar sesión",
      description:
        "Puede que tu sesión haya caducado. Inicia sesión para seguir usando el journal.",
      tone: "info",
      action: { label: "Iniciar sesión", href: "/login" },
    };
  if (/failed to fetch|network|timeout|timed out|connection/i.test(message))
    return {
      title: "No se pudo conectar con la IA",
      description: "Revisa tu conexión y vuelve a intentarlo. Tus datos no han cambiado.",
      tone: "error",
      retry: true,
    };
  return {
    title: "No se pudo completar la petición a la IA",
    description: "Vuelve a intentarlo en un momento. Si sigue pasando, revisa los ajustes de IA.",
    tone: "error",
    retry: true,
  };
}
