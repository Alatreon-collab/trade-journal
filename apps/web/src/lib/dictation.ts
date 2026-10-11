export interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

export const dictationError = (code: string) => {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Se ha bloqueado el acceso al micrófono o a la voz. Permite el micrófono en el navegador y en los ajustes del sistema, y vuelve a intentarlo.";
    case "audio-capture":
      return "No hay micrófono disponible. Conecta o activa uno y vuelve a intentarlo.";
    case "no-speech":
      return "No se ha detectado voz. Vuelve a intentarlo y habla cuando el botón diga Escuchando.";
    case "network":
      return "Este navegador no ha podido conectar con su servicio de reconocimiento de voz. Prueba Chrome con conexión a internet o usa el dictado del teclado (abajo).";
    case "language-not-supported":
      return "Este navegador no admite el dictado en tu idioma actual. Usa el dictado del teclado (abajo).";
    default:
      return "El reconocimiento de voz no ha podido arrancar en este navegador. Prueba Chrome o usa el dictado del teclado (abajo).";
  }
};

/** One recognition session. Final results are batched; handlers are detached on disposal. */
export function createDictationSession(
  recognizer: SpeechRecognizer,
  callbacks: {
    onText(text: string): void;
    onState(state: "starting" | "listening" | "idle"): void;
    onError(message: string): void;
  },
  language: string,
) {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
  };
  const detach = () => {
    clear();
    active = false;
    recognizer.onstart = recognizer.onresult = recognizer.onend = recognizer.onerror = null;
  };
  const fail = (message: string) => {
    if (!active) return;
    detach();
    try {
      recognizer.abort();
    } catch {}
    callbacks.onState("idle");
    callbacks.onError(message);
  };
  recognizer.lang = language;
  recognizer.continuous = true;
  recognizer.interimResults = false;
  recognizer.onstart = () => {
    clear();
    if (active) callbacks.onState("listening");
  };
  recognizer.onresult = (event) => {
    if (!active) return;
    const parts: string[] = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result?.isFinal && result[0]?.transcript.trim()) parts.push(result[0].transcript.trim());
    }
    if (parts.length) callbacks.onText(parts.join(" "));
  };
  recognizer.onend = () => {
    detach();
    callbacks.onState("idle");
  };
  recognizer.onerror = (event) => fail(dictationError(event.error));
  return {
    start() {
      callbacks.onState("starting");
      timer = setTimeout(() => fail(dictationError("timeout")), 10000);
      try {
        recognizer.start();
      } catch (error) {
        fail(
          dictationError(
            error instanceof Error && error.name === "NotAllowedError" ? "not-allowed" : "start",
          ),
        );
      }
    },
    stop() {
      if (!active) return;
      clear();
      // stop() allows the engine to deliver its final transcript before onend.
      try {
        recognizer.stop();
      } catch {
        detach();
      }
      callbacks.onState("idle");
    },
    dispose() {
      detach();
      try {
        recognizer.abort();
      } catch {}
    },
  };
}
