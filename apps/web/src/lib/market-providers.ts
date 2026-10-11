import type { Resolution } from "./market-data";

export interface CredentialField {
  key: string;
  label: string;
  environmentKey: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}
export interface ProviderInfo {
  id: string;
  name: string;
  mode: "credentials" | "public" | "csv";
  description: string;
  symbolHint: string;
  fields: CredentialField[];
  datasets?: { value: string; label: string }[];
  resolutions?: Resolution[];
}
export const MARKET_PROVIDERS: ProviderInfo[] = [
  {
    id: "london-strategic-edge",
    name: "London Strategic Edge",
    mode: "credentials",
    description:
      "Velas históricas. Los precios de acciones y ETF están ajustados por splits; la cobertura depende de tu plan.",
    symbolHint:
      "Usa el símbolo exacto del proveedor, incluido el contrato de futuros o el par de divisas.",
    fields: [{ key: "apiKey", label: "API key", environmentKey: "LSE_API_KEY" }],
  },
  {
    id: "alpaca",
    name: "Alpaca",
    mode: "credentials",
    description:
      "Acciones de EE. UU. y cripto. Elige un feed de acciones o de cripto; SIP necesita el acceso a datos correspondiente. Los precios de acciones no están ajustados.",
    symbolHint: "Acciones: AAPL. Cripto: BTC/USD; elige el conjunto de datos Cripto.",
    fields: [
      { key: "apiKey", label: "Key ID", environmentKey: "ALPACA_API_KEY" },
      { key: "secretKey", label: "Clave secreta", environmentKey: "ALPACA_SECRET_KEY" },
    ],
    datasets: [
      { value: "", label: "Elige un feed de datos" },
      { value: "iex", label: "Acciones IEX" },
      { value: "sip", label: "Acciones SIP" },
      { value: "crypto", label: "Cripto (EE. UU.)" },
    ],
  },
  {
    id: "binance",
    name: "Binance",
    mode: "public",
    description:
      "Velas spot públicas de Binance. No necesita API key. La disponibilidad depende de tu región y del par.",
    symbolHint:
      "Los pares spot usan BTCUSDT o ETHUSDT. USDT no es USD; la divisa de la cuenta y la de cotización deben coincidir para las estimaciones.",
    fields: [],
  },
  {
    id: "coinbase",
    name: "Coinbase",
    mode: "public",
    description:
      "Velas spot públicas de Coinbase Exchange. No necesita API key; los intervalos sin operaciones pueden no tener vela.",
    symbolHint: "Usa un producto de Coinbase Exchange como BTC-USD o ETH-USD.",
    fields: [],
  },
  {
    id: "oanda",
    name: "OANDA",
    mode: "credentials",
    description:
      "Velas de forex y CFD de tu cuenta v20. Precios medios, barras alineadas a UTC y volumen por número de ticks; no incluye spread ni conversión de divisas.",
    symbolHint:
      "Usa un instrumento de OANDA como EUR_USD. Pon en Ajustes el multiplicador del contrato para que coincida con las unidades de tus ejecuciones.",
    fields: [
      { key: "apiKey", label: "Token de acceso", environmentKey: "OANDA_API_TOKEN" },
      { key: "accountId", label: "ID de cuenta v20", environmentKey: "OANDA_ACCOUNT_ID" },
      {
        key: "environment",
        label: "Entorno",
        environmentKey: "OANDA_ENVIRONMENT",
        defaultValue: "practice",
        options: [
          { value: "practice", label: "Demo" },
          { value: "live", label: "Real" },
        ],
      },
    ],
  },
  {
    id: "market-csv",
    name: "CSV de datos de mercado",
    mode: "csv",
    description:
      "Archivos de velas OHLCV locales. Sube los precios de mercado por separado de las ejecuciones de tus trades.",
    symbolHint:
      "Usa el símbolo y la temporalidad exactos con los que subiste el archivo. Elige un conjunto de datos si los archivos se solapan.",
    fields: [],
  },
];
export const providerInfo = (id: string) => MARKET_PROVIDERS.find((item) => item.id === id);
