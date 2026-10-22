import type { Row } from "../csv";
import { makeFillsFormat } from "./fills";

/** Tradervue executions export: Date,Time,Symbol,Quantity,Price,Side,Commission,TransFee,ECNFee */
export const tradervue = makeFillsFormat({
  id: "tradervue",
  label: "Tradervue (executions export)",
  required: [["date"], ["time"], ["symbol"], ["quantity"], ["price"], ["side"]],
  columns: {
    symbol: ["symbol"],
    side: ["side"],
    quantity: ["quantity"],
    price: ["price"],
    fees: [["commission"], ["transfee"], ["ecnfee"], ["secfee"]],
    date: ["date"],
    time: ["time"],
  },
});

const BRACKET_TYPES = /^(stop|limit|stop loss|take profit)$/i;

/**
 * Paper trading de TradingView: el historial puede empezar con la salida (stop o
 * take profit de un bracket) de una posición abierta antes del periodo exportado.
 * Si se deja, desplaza el resto de trades de ese símbolo (salidas tomadas como
 * entradas). Se omite la salida huérfana y se avisa.
 */
const dropOrphanBracketExits = (rows: Row[]) => {
  const filled = (row: Row) => (row["fillprice"] ?? "").trim() !== "";
  const key = (row: Row) =>
    [row["symbol"], (row["side"] ?? "").toLowerCase(), row["placingtime"]].join("|");
  const bracketGroups = new Map<string, Row[]>();
  for (const row of rows)
    if (BRACKET_TYPES.test((row["type"] ?? "").trim()))
      bracketGroups.set(key(row), [...(bracketGroups.get(key(row)) ?? []), row]);
  // Un bracket: dos órdenes del mismo lado colocadas a la vez (stop + límite).
  const isBracketExit = (row: Row) => (bracketGroups.get(key(row))?.length ?? 0) >= 2;

  const position = new Map<string, number>();
  const dropped = new Set<Row>();
  const warnings: string[] = [];
  const ordered = rows
    .filter(filled)
    .sort((a, b) =>
      (a["closingtime"] ?? a["time"] ?? "").localeCompare(b["closingtime"] ?? b["time"] ?? ""),
    );
  for (const row of ordered) {
    const symbol = row["symbol"] ?? "";
    const quantity = Math.abs(Number(row["quantity"] ?? row["qty"] ?? 0)) || 0;
    const signed = /^buy/i.test((row["side"] ?? "").trim()) ? quantity : -quantity;
    const current = position.get(symbol) ?? 0;
    if (current === 0 && isBracketExit(row)) {
      dropped.add(row);
      warnings.push(
        `Se ha omitido una salida de ${symbol.split(":").pop()!.replace(/\d+!$/, "")} (${row["closingtime"]}) porque su entrada es anterior a las fechas del archivo.`,
      );
      continue;
    }
    position.set(symbol, current + signed);
  }
  return { rows: rows.filter((row) => !dropped.has(row)), warnings };
};

/** TradingView paper-trading history export. */
export const tradingview = makeFillsFormat({
  prepareRows: dropOrphanBracketExits,
  id: "tradingview",
  label: "TradingView (paper trading history)",
  required: [["symbol"], ["side"], ["fillprice"]],
  columns: {
    symbol: ["symbol"],
    side: ["side"],
    quantity: ["qty", "quantity", "filledqty"],
    price: ["fillprice", "avgfillprice"],
    fees: [["commission"]],
    timestamp: ["closingtime", "time", "placingtime"],
  },
  rowFilter: (row) =>
    !("status" in row) || /filled/i.test(row["status"] ?? "") || row["status"] === "",
  // "NASDAQ:AAPL" → "AAPL". Futuros: continuo "CME_MINI:MNQ1!" → "MNQ" y contrato
  // "CME_MINI:MNQZ2026" → "MNQ", para que use el multiplicador de Ajustes.
  normalizeSymbol: (symbol) =>
    symbol
      .split(":")
      .pop()!
      .trim()
      .toUpperCase()
      .replace(/\d+!$/, "")
      .replace(/^([A-Z0-9]{1,4}?)[FGHJKMNQUVXZ]\d{4}$/, "$1"),
});

export { ninjatrader } from "./ninjatrader";

/**
 * Tradovate orders export. Real files (cross-checked against TradeNote's
 * community parser): orderId, Account, Date (M/D/YY), Fill Time, B/S, Contract,
 * Product, Filled Qty, Avg Fill Price, Status — only "Filled" rows are fills.
 */
export const tradovate = makeFillsFormat({
  id: "tradovate",
  label: "Tradovate (orders export)",
  required: [["contract"], ["bs"], ["filltime", "timestamp"]],
  columns: {
    // Prefer Product (the root symbol, "ES") over Contract ("ESU6").
    symbol: ["product", "contract"],
    side: ["bs", "side"],
    quantity: ["filledqty", "fillqty", "qty"],
    price: ["avgfillprice", "avgprice", "price"],
    fees: [["commission"], ["fees"]],
    timestamp: ["filltime", "timestamp"],
    date: ["date"],
    time: ["filltime"],
  },
  rowFilter: (row) => !("status" in row) || /filled/i.test(row["status"] ?? ""),
  normalizeSymbol: (symbol) => symbol.trim().toUpperCase(),
});

/**
 * TopstepX fills export. Real files (cross-checked against TradeNote's
 * community parser): AccountName, ContractName, ExecutePrice, FilledAt,
 * PositionDisposition (Opening/Closing), Side (Bid/Ask), Size, Status.
 */
export const topstepx = makeFillsFormat({
  id: "topstepx",
  label: "TopstepX (fills export)",
  required: [["contractname"], ["executeprice"], ["filledat"]],
  columns: {
    symbol: ["contractname"],
    side: ["side"], // "Bid" = buy, "Ask" = sell (handled by parseSide)
    quantity: ["size", "qty"],
    price: ["executeprice"],
    timestamp: ["filledat"],
  },
  rowFilter: (row) => !("status" in row) || /filled/i.test(row["status"] ?? ""),
});

/**
 * Interactive Brokers Flex Query export (distinct from the activity statement):
 * ClientAccountID, Symbol, Date/Time ("YYYYMMDD;HHmmss"), Buy/Sell, Quantity,
 * Price, Commission (negative), AssetClass, Code. Cross-checked against
 * TradeNote's community parser.
 */
export const ibkrFlex = makeFillsFormat({
  id: "ibkr-flex",
  label: "Interactive Brokers (Flex Query)",
  required: [["clientaccountid"], ["datetime"], ["buysell"]],
  columns: {
    symbol: ["symbol"],
    side: ["buysell"],
    quantity: ["quantity"],
    price: ["price", "tradeprice"],
    fees: [["commission", "ibcommission"]],
    timestamp: ["datetime"],
  },
});

/**
 * Webull orders export (only filled orders become executions). Two variants
 * exist in the wild: split columns (Filled, Avg Price, Filled Time) and
 * combined columns ("Filled/Total Qty", "Price/Avg Price") — both covered.
 */
export const webull = makeFillsFormat({
  id: "webull",
  label: "Webull (orders export)",
  required: [["symbol"], ["side"], ["status"], ["filled", "filledtotalqty"]],
  columns: {
    symbol: ["symbol"],
    side: ["side"],
    quantity: ["filled", "filledqty", "filledtotalqty"],
    price: ["avgprice", "averagefillprice", "priceavgprice", "price"],
    fees: [["commission"], ["fee"]],
    timestamp: ["filledtime", "timefilled", "placedtime", "time"],
  },
  rowFilter: (row) => /filled/i.test(row["status"] ?? ""),
});

/** DAS Trader Pro executions export. */
export const dastrader = makeFillsFormat({
  id: "das-trader",
  label: "DAS Trader Pro (executions export)",
  required: [["symb", "symbol"], ["bs", "side"], ["price"], ["time"]],
  columns: {
    symbol: ["symb", "symbol"],
    side: ["bs", "side"],
    quantity: ["qty", "shares"],
    price: ["price"],
    fees: [["commission"], ["ecnfee"], ["fee"]],
    date: ["date"],
    time: ["time"],
  },
});
