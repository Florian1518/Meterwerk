import { describe, expect, it } from "vitest";
import {
  dashboardInput,
  widgetInput,
  resolveLayout,
} from "../src/server/dashboards";

const widget = {
  title: "Verbrauch",
  type: "CONSUMPTION",
  dataSource: "ANALYTICS",
  period: "day",
  aggregation: "SUM",
  positionX: 0,
  positionY: 0,
  width: 4,
  height: 3,
};
describe("konfigurierbare Dashboards", () => {
  it("validiert Sichtbarkeit und Rollen", () => {
    expect(
      dashboardInput.safeParse({
        name: "Privat",
        visibility: "PRIVATE",
        roles: ["USER"],
      }).success,
    ).toBe(false);
    expect(
      dashboardInput.parse({
        name: "Rollen",
        visibility: "ROLE_BASED",
        roles: ["MANAGER"],
      }).visibility,
    ).toBe("ROLE_BASED");
  });
  it("akzeptiert strukturierte Widgets und verweigert Codefelder", () => {
    expect(widgetInput.parse(widget).type).toBe("CONSUMPTION");
    expect(
      widgetInput.safeParse({ ...widget, query: "process.env.SECRET" }).success,
    ).toBe(false);
    expect(widgetInput.safeParse({ ...widget, width: 99 }).success).toBe(false);
  });
  it("verschiebt kollidierende Widgets automatisch", () => {
    const layout = resolveLayout(
      [
        { id: "a", positionX: 0, positionY: 0, width: 4, height: 3 },
        { id: "b", positionX: 0, positionY: 5, width: 4, height: 3 },
      ],
      { id: "a", positionX: 0, positionY: 5, width: 4, height: 3 },
    );
    expect(layout.find((item) => item.id === "b")?.positionY).toBe(9);
  });
});
