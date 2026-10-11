// Traducción solo para mostrar: las claves internas de los grupos (que vienen del
// paquete core y se usan para ordenar y filtrar) siguen en inglés.
const GROUP_LABELS: Record<string, string> = {
  Sun: "Dom",
  Mon: "Lun",
  Tue: "Mar",
  Wed: "Mié",
  Thu: "Jue",
  Fri: "Vie",
  Sat: "Sáb",
  Unspecified: "Sin especificar",
  Untagged: "Sin etiqueta",
  None: "Ninguno",
  Unassigned: "Sin asignar",
  Open: "Abierto",
  win: "Ganador",
  loss: "Perdedor",
  breakeven: "Breakeven",
  open: "Abierto",
  long: "Long",
  short: "Short",
  equity: "Acciones",
  futures: "Futuros",
  option: "Opciones",
  crypto: "Cripto",
  other: "Otros",
};

export const groupLabel = (key: string) => GROUP_LABELS[key] ?? key;
