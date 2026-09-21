import Decimal from "decimal.js";
import { profiles, type MetricName, type UtilityType } from "./utility";

export class VirtualMeter {
  protected register: Decimal;
  private exportRegister = new Decimal(0);
  private volume = new Decimal(0);
  constructor(
    readonly utility: UtilityType,
    initial = "0",
    readonly leakage = false,
    state: { export?: string; volume?: string } = {},
  ) {
    this.register = new Decimal(initial);
    this.exportRegister = new Decimal(state.export ?? "0");
    this.volume = new Decimal(state.volume ?? "0");
  }
  sample(timestamp: Date, hours = "0.25") {
    const h = timestamp.getUTCHours();
    const heating = new Decimal(
      [0, 1, 2, 9, 10, 11].includes(timestamp.getUTCMonth()) ? "1" : "0.25",
    );
    const peak = (h >= 6 && h < 9) || (h >= 18 && h < 22);
    const values: Array<{
      metric: MetricName;
      value: string;
      unit: string;
      quality: "VALID";
    }> = [];
    const add = (metric: MetricName, value: Decimal.Value, unit: string) =>
      values.push({
        metric,
        value: new Decimal(value).toFixed(6),
        unit,
        quality: "VALID",
      });
    let increment: Decimal;
    if (this.utility === "ELECTRICITY") {
      const power = new Decimal(peak ? "3.6" : h < 6 ? "0.4" : "1.8");
      increment = power.mul(hours);
      const exportPower = new Decimal(h >= 10 && h < 16 ? "0.6" : "0");
      this.exportRegister = this.exportRegister.plus(exportPower.mul(hours));
      add("ENERGY_EXPORT", this.exportRegister, "kWh");
      add(
        "ENERGY_NET",
        this.register.plus(increment).minus(this.exportRegister),
        "kWh",
      );
      add("ACTIVE_POWER", power, "kW");
      add("REACTIVE_POWER", power.mul("0.2"), "kvar");
      for (const phase of [1, 2, 3]) {
        add(`ACTIVE_POWER_L${phase}` as MetricName, power.div(3), "kW");
        add(`VOLTAGE_L${phase}` as MetricName, "230", "V");
        add(
          `CURRENT_L${phase}` as MetricName,
          power.mul(1000).div(3).div(230).div("0.98"),
          "A",
        );
      }
      add("FREQUENCY", "50", "Hz");
      add("POWER_FACTOR", "0.98", "1");
    } else if (this.utility === "HEAT") {
      const flow = heating.mul(peak ? "0.6" : "0.2");
      const supply = heating.mul(20).plus(40),
        delta = new Decimal(15);
      const power = flow.mul(delta).mul("1.163");
      increment = power.mul(hours);
      this.volume = this.volume.plus(flow.mul(hours));
      add("VOLUME_TOTAL", this.volume, "m3");
      add("FLOW_RATE", flow, "m3/h");
      add("POWER", power, "kW");
      add("SUPPLY_TEMPERATURE", supply, "°C");
      add("RETURN_TEMPERATURE", supply.minus(delta), "°C");
      add("DELTA_T", delta, "K");
    } else {
      const flow =
        this.utility === "WATER"
          ? new Decimal(peak ? "0.18" : h < 6 ? "0" : "0.03").plus(
              this.leakage ? "0.025" : "0",
            )
          : heating.mul(peak ? "0.8" : "0.25").plus("0.01");
      increment = flow.mul(hours);
      add("FLOW_RATE", flow, "m3/h");
      add("CONSUMPTION", increment, "m3");
      if (this.utility === "WATER") add("TEMPERATURE", "12", "°C");
    }
    this.register = this.register.plus(increment);
    add(
      profiles[this.utility].primary,
      this.register,
      ["WATER", "GAS"].includes(this.utility) ? "m3" : "kWh",
    );
    return {
      messageId: `virtual-${this.utility}-${timestamp.toISOString()}`,
      timestamp: timestamp.toISOString(),
      measurements: values,
    };
  }
}
export class VirtualElectricityMeter extends VirtualMeter {
  constructor(initial = "0") {
    super("ELECTRICITY", initial);
  }
}
export class VirtualWaterMeter extends VirtualMeter {
  constructor(initial = "0", leakage = false) {
    super("WATER", initial, leakage);
  }
}
export class VirtualGasMeter extends VirtualMeter {
  constructor(initial = "0") {
    super("GAS", initial);
  }
}
export class VirtualHeatMeter extends VirtualMeter {
  constructor(initial = "0") {
    super("HEAT", initial);
  }
}
