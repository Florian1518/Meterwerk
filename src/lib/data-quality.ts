import Decimal from "decimal.js";

export type QualityReading = {
  id: string;
  timestamp: Date;
  registerValue: string;
  consumption: string;
  measurementUnit: string;
  deviceId: string | null;
  deviceMeterId: string | null;
};
export type QualityMeter = {
  id: string;
  serialNumber: string;
  type: "ELECTRICITY" | "WATER" | "GAS" | "HEAT";
  measurementUnit: string;
  installedAt: Date;
  status: string;
};
export type QualityIssue = {
  type:
    | "MISSING_READINGS"
    | "DUPLICATE_READINGS"
    | "TIMESTAMP_OUT_OF_RANGE"
    | "NEGATIVE_CONSUMPTION"
    | "UNUSUAL_JUMP"
    | "COUNTER_ROLLBACK"
    | "UNIT_MISMATCH"
    | "ORPHANED_ASSIGNMENT"
    | "DATA_GAP";
  status: "WARNING" | "ERROR";
  readingId: string | null;
  key: string;
  description: string;
  details: Record<string, string | number | null>;
};

const DAY = 86_400_000;
const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
};
const decimalMedian = (values: Decimal[]) => {
  const ordered = [...values].sort((a, b) => a.comparedTo(b));
  if (!ordered.length) return new Decimal(0);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]!
    : ordered[middle - 1]!.plus(ordered[middle]!).div(2);
};

export function analyzeMeterQuality(
  meter: QualityMeter,
  readings: QualityReading[],
  from: Date,
  to: Date,
  now = new Date(),
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const add = (issue: QualityIssue) => issues.push(issue);
  const ordered = [...readings].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  if (
    meter.status === "ACTIVE" &&
    ordered.length === 0 &&
    meter.installedAt < to
  )
    add({
      type: "MISSING_READINGS",
      status: "ERROR",
      readingId: null,
      key: `missing:${meter.id}`,
      description: `Im ausgewählten Zeitraum liegen keine Messwerte für Zähler ${meter.serialNumber} vor.`,
      details: { from: from.toISOString(), to: to.toISOString() },
    });

  const timestampGroups = new Map<string, QualityReading[]>();
  for (const reading of ordered) {
    const timestamp = reading.timestamp.toISOString();
    timestampGroups.set(timestamp, [
      ...(timestampGroups.get(timestamp) ?? []),
      reading,
    ]);
    if (
      reading.timestamp < meter.installedAt ||
      reading.timestamp > new Date(now.getTime() + 5 * 60_000)
    )
      add({
        type: "TIMESTAMP_OUT_OF_RANGE",
        status: "ERROR",
        readingId: reading.id,
        key: `timestamp:${reading.id}`,
        description: `Zeitstempel ${timestamp} liegt vor der Installation oder mehr als fünf Minuten in der Zukunft.`,
        details: { timestamp, installedAt: meter.installedAt.toISOString() },
      });
    if (reading.measurementUnit !== meter.measurementUnit)
      add({
        type: "UNIT_MISMATCH",
        status: "ERROR",
        readingId: reading.id,
        key: `unit:${reading.id}`,
        description: `Messwerteinheit ${reading.measurementUnit} stimmt nicht mit der Zählereinheit ${meter.measurementUnit} überein.`,
        details: {
          actualUnit: reading.measurementUnit,
          expectedUnit: meter.measurementUnit,
        },
      });
    if (reading.deviceId && reading.deviceMeterId !== meter.id)
      add({
        type: "ORPHANED_ASSIGNMENT",
        status: "ERROR",
        readingId: reading.id,
        key: `orphan:${reading.id}`,
        description: "Das zugeordnete Device gehört nicht zu diesem Zähler.",
        details: {
          deviceId: reading.deviceId,
          meterId: meter.id,
          deviceMeterId: reading.deviceMeterId,
        },
      });
    if (
      meter.type !== "ELECTRICITY" &&
      new Decimal(reading.consumption).isNegative()
    )
      add({
        type: "NEGATIVE_CONSUMPTION",
        status: "ERROR",
        readingId: reading.id,
        key: `negative:${reading.id}`,
        description: `Negativer Verbrauch ${reading.consumption} ${meter.measurementUnit} ist für ${meter.type} unzulässig.`,
        details: {
          consumption: reading.consumption,
          unit: meter.measurementUnit,
        },
      });
  }
  for (const [timestamp, group] of timestampGroups)
    if (group.length > 1)
      add({
        type: "DUPLICATE_READINGS",
        status: "ERROR",
        readingId: group[0]!.id,
        key: `duplicate:${timestamp}`,
        description: `${group.length} Messwerte haben denselben Zeitstempel ${timestamp}.`,
        details: {
          readingIds: group.map((row) => row.id).join(","),
          count: group.length,
        },
      });

  const consumptionMedian = decimalMedian(
    ordered
      .map((r) => new Decimal(r.consumption))
      .filter((v) => v.isPositive()),
  );
  const deltas: Decimal[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!;
    const current = ordered[i]!;
    const previousRegister = new Decimal(previous.registerValue);
    const currentRegister = new Decimal(current.registerValue);
    if (currentRegister.lt(previousRegister))
      add({
        type: "COUNTER_ROLLBACK",
        status: "ERROR",
        readingId: current.id,
        key: `rollback:${current.id}`,
        description: `Zählerstand fällt von ${previousRegister.toString()} auf ${currentRegister.toString()} zurück.`,
        details: {
          previousReadingId: previous.id,
          previousRegister: previousRegister.toString(),
          registerValue: currentRegister.toString(),
        },
      });
    else {
      const delta = currentRegister.minus(previousRegister);
      if (delta.isPositive()) deltas.push(delta);
    }
  }
  const deltaMedian = decimalMedian(deltas);
  if (ordered.length >= 4) {
    for (let i = 0; i < ordered.length; i++) {
      const reading = ordered[i]!;
      const consumption = new Decimal(reading.consumption);
      const previous = i > 0 ? ordered[i - 1]! : null;
      const delta = previous
        ? new Decimal(reading.registerValue).minus(previous.registerValue)
        : new Decimal(0);
      const consumptionSpike =
        consumptionMedian.isPositive() &&
        consumption.gt(consumptionMedian.mul(10)) &&
        consumption.minus(consumptionMedian).gt(1);
      const registerSpike =
        deltaMedian.isPositive() &&
        delta.gt(deltaMedian.mul(10)) &&
        delta.minus(deltaMedian).gt(1);
      if (consumptionSpike || registerSpike)
        add({
          type: "UNUSUAL_JUMP",
          status: "WARNING",
          readingId: reading.id,
          key: `jump:${reading.id}`,
          description: `Ungewöhnlicher Sprung: Verbrauch ${consumption.toString()} ${meter.measurementUnit}; typischer Median ${consumptionMedian.toString()}.`,
          details: {
            consumption: consumption.toString(),
            medianConsumption: consumptionMedian.toString(),
            registerDelta: delta.toString(),
            medianRegisterDelta: deltaMedian.toString(),
          },
        });
    }
  }
  const gaps = ordered
    .slice(1)
    .map(
      (reading, index) =>
        reading.timestamp.getTime() - ordered[index]!.timestamp.getTime(),
    )
    .filter((gap) => gap > 0);
  const typicalGap = gaps.length >= 3 ? median(gaps) : 7 * DAY;
  const gapThreshold = Math.max(24 * 60 * 60_000, typicalGap * 3);
  if (ordered.length) {
    const coverageStart = Math.max(from.getTime(), meter.installedAt.getTime());
    const leadingGap = ordered[0]!.timestamp.getTime() - coverageStart;
    if (leadingGap > gapThreshold)
      add({
        type: "DATA_GAP",
        status: "WARNING",
        readingId: ordered[0]!.id,
        key: `gap:start:${ordered[0]!.id}`,
        description: `Datenlücke von ${(leadingGap / DAY).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tagen am Anfang des Prüfzeitraums.`,
        details: {
          nextReadingId: ordered[0]!.id,
          gapMilliseconds: leadingGap,
          thresholdMilliseconds: gapThreshold,
        },
      });
    const coverageEnd = Math.min(to.getTime(), now.getTime());
    const trailingGap =
      coverageEnd - ordered[ordered.length - 1]!.timestamp.getTime();
    if (trailingGap > gapThreshold)
      add({
        type: "DATA_GAP",
        status: "WARNING",
        readingId: ordered[ordered.length - 1]!.id,
        key: `gap:end:${ordered[ordered.length - 1]!.id}`,
        description: `Datenlücke von ${(trailingGap / DAY).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tagen bis zum Ende des Prüfzeitraums.`,
        details: {
          previousReadingId: ordered[ordered.length - 1]!.id,
          gapMilliseconds: trailingGap,
          thresholdMilliseconds: gapThreshold,
        },
      });
  }
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1]!;
    const current = ordered[i]!;
    const gap = current.timestamp.getTime() - previous.timestamp.getTime();
    if (
      gap > gapThreshold &&
      previous.timestamp < to &&
      current.timestamp > from
    )
      add({
        type: "DATA_GAP",
        status: "WARNING",
        readingId: current.id,
        key: `gap:${previous.id}:${current.id}`,
        description: `Datenlücke von ${(gap / DAY).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tagen zwischen zwei Messwerten.`,
        details: {
          previousReadingId: previous.id,
          nextReadingId: current.id,
          gapMilliseconds: gap,
          thresholdMilliseconds: gapThreshold,
        },
      });
  }
  return issues;
}
