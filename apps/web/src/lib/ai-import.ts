import type { AiProvider } from "./ai-settings";

export const AI_IMPORT_MAX_BYTES = 8 * 1024 * 1024;
export const AI_IMPORT_MAX_TEXT = 150_000;
export const AI_IMPORT_MAX_EXECUTIONS = 200;
export const AI_IMPORT_HELP =
  "Si tienes problemas para importar un archivo, la IA puede ayudarte. El journal admite muchas exportaciones de brókers, pero los nombres de columnas y el formato de los extractos pueden cambiar. OpenAI o Anthropic pueden interpretar formatos desconocidos y extraer los trades para que los revises. Comprueba cantidades, precios, comisiones y fechas con tu extracto antes de importar. El archivo se envía al proveedor que elijas con tu API key; el proveedor te cobrará el uso.";

export interface AiImportOptions {
  provider: AiProvider;
  model: string;
  apiKey?: string;
}
