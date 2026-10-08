const MONEY = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,2}))?$/;

export function normalizeMoney(value: string): string | null {
  const cleaned = value.trim().replace(/,/g, "");
  const match = MONEY.exec(cleaned);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function moneyToPaise(value: string): bigint {
  const normalized = normalizeMoney(value);
  if (!normalized) throw new Error("Invalid money value");
  const [rupees, paise] = normalized.split(".");
  return BigInt(rupees) * BigInt(100) + BigInt(paise);
}

export function formatINR(value: string | undefined | null): string {
  if (!value) return "—";
  const normalized = normalizeMoney(value);
  if (!normalized) return value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(normalized));
}
