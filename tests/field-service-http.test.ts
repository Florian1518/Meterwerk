import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AccessError } from "../src/server/policy";
const service = vi.hoisted(() => ({
  listWorkOrders: vi.fn(),
  getWorkOrder: vi.fn(),
  createWorkOrder: vi.fn(),
  updateWorkOrder: vi.fn(),
  deleteWorkOrder: vi.fn(),
  assignTechnician: vi.fn(),
  changeWorkOrderStatus: vi.fn(),
  addChecklist: vi.fn(),
  completeChecklistItem: vi.fn(),
  addWorkOrderComment: vi.fn(),
  fieldServiceOptions: vi.fn(),
}));
const auth = vi.hoisted(() => ({ requireActor: vi.fn() }));
vi.mock("../src/server/auth", () => auth);
vi.mock("../src/server/field-service", () => service);
import {
  GET,
  POST,
  PATCH,
  DELETE,
} from "../src/app/api/work-orders/[[...path]]/route";
const context = (path: string[] = []) => ({
  params: Promise.resolve({ path }),
});
function request(
  path: string,
  method = "GET",
  body?: unknown,
  origin = "http://localhost:3000",
) {
  return new NextRequest(
    `http://localhost:3000/api/work-orders${path}?tenantId=a`,
    {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  auth.requireActor.mockResolvedValue({ id: "admin" });
  service.listWorkOrders.mockResolvedValue([]);
  service.createWorkOrder.mockResolvedValue({ id: "order" });
});
describe("Field Service API", () => {
  it("weist nicht angemeldete Anfragen ab", async () => {
    auth.requireActor.mockRejectedValue(
      new AccessError(401, "Bitte anmelden."),
    );
    expect((await GET(request(""), context())).status).toBe(401);
    expect(service.listWorkOrders).not.toHaveBeenCalled();
  });
  it("liefert persönliche Listen ohne Cache und ohne all-Umgehung", async () => {
    const response = await GET(request("/mine"), context(["mine"]));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(service.listWorkOrders).toHaveBeenCalledWith("a", { view: "mine" });
    const invalid = new NextRequest(
      "http://localhost:3000/api/work-orders/mine?view=all",
    );
    expect((await GET(invalid, context(["mine"]))).status).toBe(400);
  });
  it("weist fremden Origin bei Erstellung und Löschung ab", async () => {
    expect(
      (
        await POST(
          request("", "POST", { title: "X" }, "https://foreign.invalid"),
          context(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await DELETE(
          request("/order", "DELETE", undefined, "https://foreign.invalid"),
          context(["order"]),
        )
      ).status,
    ).toBe(403);
    expect(service.createWorkOrder).not.toHaveBeenCalled();
    expect(service.deleteWorkOrder).not.toHaveBeenCalled();
  });
  it("verbindet CRUD mit den authentifizierenden Serverfunktionen", async () => {
    await POST(request("", "POST", { title: "X" }), context());
    expect(service.createWorkOrder).toHaveBeenCalledWith({ title: "X" }, "a");
    await PATCH(request("/order", "PATCH", { title: "Y" }), context(["order"]));
    expect(service.updateWorkOrder).toHaveBeenCalledWith(
      "order",
      { title: "Y" },
      "a",
    );
    await DELETE(request("/order", "DELETE"), context(["order"]));
    expect(service.deleteWorkOrder).toHaveBeenCalledWith("order", "a");
  });
  it.each([
    ["status", { status: "IN_PROGRESS" }, "changeWorkOrderStatus"],
    ["checklists", { title: "Test", items: [] }, "addChecklist"],
    ["comments", { body: "Kommentar" }, "addWorkOrderComment"],
  ] as const)("verbindet %s", async (resource, body, fn) => {
    await POST(
      request(`/order/${resource}`, "POST", body),
      context(["order", resource]),
    );
    expect(service[fn]).toHaveBeenCalledWith("order", body, "a");
  });
  it("verbindet Zuweisung und Entfernung sowie Item-Update", async () => {
    await POST(
      request("/order/assignments", "POST", { userId: "tech" }),
      context(["order", "assignments"]),
    );
    expect(service.assignTechnician).toHaveBeenCalledWith(
      "order",
      { userId: "tech" },
      false,
      "a",
    );
    await DELETE(
      request("/order/assignments/tech", "DELETE"),
      context(["order", "assignments", "tech"]),
    );
    expect(service.assignTechnician).toHaveBeenCalledWith(
      "order",
      { userId: "tech" },
      true,
      "a",
    );
    await PATCH(
      request("/order/checklist-items/item", "PATCH", { completed: true }),
      context(["order", "checklist-items", "item"]),
    );
    expect(service.completeChecklistItem).toHaveBeenCalledWith(
      "order",
      "item",
      { completed: true },
      "a",
    );
  });
  it("gibt Domainfehler als sauberen Konflikt zurück", async () => {
    service.changeWorkOrderStatus.mockRejectedValue(
      new AccessError(409, "Pflichtpunkte offen."),
    );
    const response = await POST(
      request("/order/status", "POST", { status: "COMPLETED" }),
      context(["order", "status"]),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Pflichtpunkte offen." });
  });
  it("Historie und Kindressourcen werden nur über den gesicherten Auftrag gelesen", async () => {
    service.getWorkOrder.mockRejectedValue(
      new AccessError(404, "Nicht gefunden."),
    );
    for (const resource of ["history", "checklists", "comments", "assignments"])
      expect(
        (
          await GET(
            request(`/foreign/${resource}`),
            context(["foreign", resource]),
          )
        ).status,
      ).toBe(404);
  });
});
