import Decimal from "decimal.js";

export type AnalyticsPoint = {
  timestamp: Date;
  value: Decimal | string | number;
};
export type ProfileBucket = "15_MINUTES" | "HOUR" | "DAY" | "WEEK" | "MONTH";

function bucketStart(date: Date, bucket: ProfileBucket) {
  const d = new Date(date);
  if (bucket === "15_MINUTES")
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15, 0, 0);
  else if (bucket === "HOUR") d.setUTCMinutes(0, 0, 0);
  else if (bucket === "DAY") d.setUTCHours(0, 0, 0, 0);
  else if (bucket === "WEEK") {
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  } else {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export function consumptionProfile(
  points: AnalyticsPoint[],
  bucket: ProfileBucket,
) {
  const grouped = new Map<string, Decimal>();
  for (const point of points) {
    const key = bucketStart(point.timestamp, bucket);
    grouped.set(
      key,
      (grouped.get(key) ?? new Decimal(0)).plus(point.value.toString()),
    );
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([timestamp, value]) => ({ timestamp, value: value.toString() }));
}

export function detectConsumptionAnomalies(
  values: Array<Decimal | string | number>,
  options: {
    highFactor?: number;
    spikeFactor?: number;
    baselineCount?: number;
  } = {},
) {
  const highFactor = options.highFactor ?? 1.5,
    spikeFactor = options.spikeFactor ?? 2,
    baselineCount = options.baselineCount ?? 7;
  if (values.length < 2)
    return [] as Array<{
      index: number;
      kind: "HIGH_CONSUMPTION" | "SPIKE" | "CONTINUOUS_CONSUMPTION";
      value: string;
    }>;
  const baseline = values
    .slice(0, Math.min(baselineCount, values.length))
    .reduce<Decimal>((sum, v) => sum.plus(v.toString()), new Decimal(0))
    .div(Math.min(baselineCount, values.length));
  const anomalies: Array<{
    index: number;
    kind: "HIGH_CONSUMPTION" | "SPIKE" | "CONTINUOUS_CONSUMPTION";
    value: string;
  }> = [];
  values.forEach((raw, index) => {
    const value = new Decimal(raw.toString());
    if (value.gt(baseline.mul(highFactor)))
      anomalies.push({
        index,
        kind: "HIGH_CONSUMPTION",
        value: value.toString(),
      });
    if (
      index > 0 &&
      value.gt(new Decimal(values[index - 1].toString()).mul(spikeFactor))
    )
      anomalies.push({ index, kind: "SPIKE", value: value.toString() });
  });
  if (values.slice(-3).every((v) => new Decimal(v.toString()).gt(0)))
    anomalies.push({
      index: values.length - 1,
      kind: "CONTINUOUS_CONSUMPTION",
      value: new Decimal(values[values.length - 1].toString()).toString(),
    });
  return anomalies;
}

export function benchmarkPerArea(
  value: Decimal | string | number,
  area: Decimal | string | number,
) {
  const denominator = new Decimal(area.toString());
  return denominator.isZero()
    ? null
    : new Decimal(value.toString()).div(denominator).toString();
}
