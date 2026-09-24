import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checklistSchema,
  todayRange,
  transitionError,
  transitions,
  workOrderSchema,
  workOrderStatuses,
} from "../src/lib/field-service";
import type { Actor } from "../src/server/policy";

const mocks = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  });
  const db = {
    workOrder: model(),
    property: model(),
    building: model(),
    unit: model(),
    meter: model(),
    gateway: model(),
    user: model(),
    technicianAssignment: model(),
    workOrderChecklist: model(),
    checklistItem: model(),
    workOrderComment: model(),
    auditEvent: model(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return { db, requireActor: vi.fn() };
});
vi.mock("../src/server/db", () => ({ db: mocks.db }));
vi.mock("../src/server/auth", () => ({ requireActor: mocks.requireActor }));
import {
  addChecklist,
  addWorkOrderComment,
  assignTechnician,
  changeWorkOrderStatus,
  completeChecklistItem,
  createWorkOrder,
  deleteWorkOrder,
  fieldServiceOptions,
  getWorkOrder,
  listWorkOrders,
  updateWorkOrder,
  workOrderScope,
} from "../src/server/field-service";

const admin: Actor = {
  id: "admin",
  tenantId: "tenant-a",
  name: "Admin",
  email: "admin@example.invalid",
  role: "TENANT_ADMIN",
};
const technician: Actor = { ...admin, id: "tech", role: "USER" };
const input = {
  title: "Wartung",
  propertyId: "property-a",
  type: "MAINTENANCE",
  scheduledAt: "2026-09-25T10:00:00Z",
};
const item = {
  id: "item-a",
  required: true,
  completed: false,
  comment: "",
  title: "Prüfung",
  completedById: null,
  completedAt: null,
};
let order: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActor.mockResolvedValue(admin);
  mocks.db.$transaction.mockImplementation(async (fn) => fn(mocks.db));
  order = {
    id: "order-a",
    tenantId: "tenant-a",
    propertyId: "property-a",
    title: "Wartung",
    status: "DRAFT",
    scheduledAt: new Date(input.scheduledAt),
    startedAt: null,
    assignments: [],
    checklists: [],
    deletedAt: null,
    attachments: [],
    entries: [
      {
        kind: "time",
        payload: {
          technicianId: "tech",
          start: "2026-01-01T08:00:00Z",
          end: "2026-01-01T09:00:00Z",
          pauseMinutes: 0,
          activity: "Wartung",
        },
      },
    ],
    documentation: {
      report: "Bericht",
      workPerformed: "Wartung",
      actualStart: "2026-01-01T08:00:00Z",
      actualEnd: "2026-01-01T09:00:00Z",
    },
  };
  mocks.db.workOrder.findFirst.mockImplementation(async () => order);
  mocks.db.workOrder.create.mockImplementation(async ({ data }) => ({
    id: "order-a",
    status: "DRAFT",
    ...data,
  }));
  mocks.db.workOrder.update.mockImplementation(async ({ data }) => ({
    ...order,
    ...data,
  }));
  mocks.db.property.findFirst.mockResolvedValue({ id: "property-a" });
  mocks.db.user.findFirst.mockResolvedValue({ id: "tech", name: "Techniker" });
  mocks.db.technicianAssignment.count.mockResolvedValue(1);
  mocks.db.technicianAssignment.deleteMany.mockResolvedValue({ count: 1 });
  mocks.db.workOrderChecklist.create.mockResolvedValue({ id: "checklist-a" });
  mocks.db.checklistItem.update.mockImplementation(async ({ data }) => ({
    id: "item-a",
    ...data,
  }));
  mocks.db.workOrderComment.create.mockResolvedValue({ id: "comment-a" });
  mocks.db.auditEvent.findMany.mockResolvedValue([]);
});
describe("Field Service: Verträge und Statusautomat", () => {
  it("validiert jeden möglichen Statussprung", () => {
    for (const from of workOrderStatuses)
      for (const to of workOrderStatuses) {
        expect(
          transitionError(from, to, {
            scheduled: true,
            assigned: true,
            openRequired: false,
          }) === null,
        ).toBe(transitions[from].includes(to));
      }
  });
  it("blockiert Planung ohne Termin, Start ohne Techniker und offenen Pflichtpunkt", () => {
    expect(
      transitionError("DRAFT", "PLANNED", {
        scheduled: false,
        assigned: true,
        openRequired: false,
      }),
    ).toBeTruthy();
    expect(
      transitionError("ASSIGNED", "IN_PROGRESS", {
        scheduled: true,
        assigned: false,
        openRequired: false,
      }),
    ).toBeTruthy();
    expect(
      transitionError("IN_PROGRESS", "COMPLETED", {
        scheduled: true,
        assigned: true,
        openRequired: true,
      }),
    ).toBeTruthy();
  });
  it("berechnet UTC-Tagesgrenzen ohne lokale Sommerzeitverschiebung", () => {
    expect(todayRange(new Date("2026-10-25T23:59:59Z"))).toEqual({
      gte: new Date("2026-10-25T00:00:00Z"),
      lt: new Date("2026-10-26T00:00:00Z"),
    });
  });
  it("lehnt Massenzuweisung, naive Zeitstempel, Scripts und Formeln als Struktur ab", () => {
    for (const extra of [
      { tenantId: "foreign" },
      { status: "COMPLETED" },
      { assignments: [] },
      { scheduledAt: "2026-09-25T10:00" },
    ])
      expect(workOrderSchema.safeParse({ ...input, ...extra }).success).toBe(
        false,
      );
    expect(
      checklistSchema.safeParse({
        title: "Check",
        items: [{ title: "Punkt", order: 0, script: "alert(1)" }],
      }).success,
    ).toBe(false);
    expect(
      checklistSchema.safeParse({
        title: "Check",
        items: [{ title: "Punkt", order: 0, formula: "1+1" }],
      }).success,
    ).toBe(false);
  });
});
describe("Field Service: serverseitige Zugriffspfade", () => {
  it("authentifiziert alle öffentlichen Datenzugriffe eigenständig", async () => {
    mocks.requireActor.mockRejectedValue(new Error("unauthenticated"));
    for (const fn of [
      () => listWorkOrders(),
      () => getWorkOrder("x"),
      () => fieldServiceOptions(),
      () => createWorkOrder(input),
      () => updateWorkOrder("x", {}),
      () => deleteWorkOrder("x"),
      () => assignTechnician("x", {}, false),
      () => changeWorkOrderStatus("x", {}),
      () => addChecklist("x", {}),
      () => completeChecklistItem("x", "y", {}),
      () => addWorkOrderComment("x", {}),
    ])
      await expect(fn()).rejects.toThrow("unauthenticated");
    expect(mocks.db.workOrder.findFirst).not.toHaveBeenCalled();
  });
  it("erstellt einen mandantengebundenen Entwurf und atomaren Audit", async () => {
    const row = await createWorkOrder(input);
    expect(row).toMatchObject({
      tenantId: "tenant-a",
      status: "DRAFT",
      title: "Wartung",
    });
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          action: "work-order.created",
          entityId: "order-a",
        }),
      }),
    );
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
  });
  it("weist fremden Mandanten und IDs zurück", async () => {
    await expect(createWorkOrder(input, "tenant-b")).rejects.toMatchObject({
      status: 403,
    });
    mocks.db.workOrder.findFirst.mockResolvedValue(null);
    await expect(getWorkOrder("foreign")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      updateWorkOrder("foreign", { title: "Angriff" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.db.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-a", id: "foreign" }),
      }),
    );
  });
  it.each([
    "buildingId",
    "unitId",
    "meterId",
    "gatewayId",
    "internalContactId",
  ])("weist fremde Referenz %s zurück", async (key) => {
    mocks.db.user.findFirst.mockResolvedValue(null);
    await expect(
      createWorkOrder({ ...input, [key]: "foreign" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.db.workOrder.create).not.toHaveBeenCalled();
  });
  it("weist fremde Liegenschaft zurück", async () => {
    mocks.db.property.findFirst.mockResolvedValue(null);
    await expect(createWorkOrder(input)).rejects.toMatchObject({ status: 404 });
  });
  it("erzwingt für USER sowohl Grant als auch Zuweisung in Listen und Details", async () => {
    mocks.requireActor.mockResolvedValue(technician);
    const scope = workOrderScope(technician, "tenant-a");
    expect(scope).toMatchObject({
      tenantId: "tenant-a",
      property: {
        tenantId: "tenant-a",
        grants: { some: { userId: "tech", tenantId: "tenant-a" } },
      },
      assignments: { some: { tenantId: "tenant-a", userId: "tech" } },
    });
    await listWorkOrders();
    await getWorkOrder("order-a");
    expect(mocks.db.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: scope }),
    );
    expect(mocks.db.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...scope, id: "order-a" } }),
    );
  });
  it("USER ohne freigegebenen Einsatz erhält keine Details, Kommentare oder Historie", async () => {
    mocks.requireActor.mockResolvedValue(technician);
    mocks.db.workOrder.findFirst.mockResolvedValue(null);
    await expect(getWorkOrder("order-a")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      addWorkOrderComment("order-a", { body: "Nein" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.db.auditEvent.findMany).not.toHaveBeenCalled();
    expect(mocks.db.workOrderComment.create).not.toHaveBeenCalled();
  });
  it("SUPER_ADMIN benötigt expliziten Tenant und bleibt nur lesend", async () => {
    mocks.requireActor.mockResolvedValue({
      ...admin,
      role: "SUPER_ADMIN",
      tenantId: null,
    });
    await expect(listWorkOrders()).rejects.toMatchObject({ status: 400 });
    await getWorkOrder("order-a", "tenant-a");
    await expect(
      updateWorkOrder("order-a", { title: "Nein" }, "tenant-a"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(createWorkOrder(input, "tenant-a")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("MANAGER verwaltet im bestehenden eigenen Mandantenbereich", async () => {
    mocks.requireActor.mockResolvedValue({ ...admin, role: "MANAGER" });
    await createWorkOrder(input);
    await expect(createWorkOrder(input, "tenant-b")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("USER kann Verwaltung und Rollenerweiterung nicht erzwingen", async () => {
    mocks.requireActor.mockResolvedValue(technician);
    for (const fn of [
      () => createWorkOrder(input),
      () => updateWorkOrder("order-a", { title: "Nein" }),
      () => deleteWorkOrder("order-a"),
      () => assignTechnician("order-a", { userId: "tech" }, false),
      () => addChecklist("order-a", {}),
      () => changeWorkOrderStatus("order-a", { status: "CANCELED" }),
    ])
      await expect(fn()).rejects.toMatchObject({ status: 403 });
  });
  it("speichert Terminänderung mit Vorher-/Nachher-Historie", async () => {
    await updateWorkOrder("order-a", { scheduledAt: "2026-09-26T12:00:00Z" });
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "work-order.scheduled",
        details: expect.objectContaining({
          before: "2026-09-25T10:00:00.000Z",
          after: "2026-09-26T12:00:00.000Z",
        }),
      }),
    });
    expect(mocks.db.$queryRaw).toHaveBeenCalled();
  });
  it("löscht nur Entwürfe logisch und behält Historie", async () => {
    await deleteWorkOrder("order-a");
    expect(mocks.db.workOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    order.status = "PLANNED";
    await expect(deleteWorkOrder("order-a")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("Zuweisung prüft aktiven USER, Tenant und Grant", async () => {
    await assignTechnician("order-a", { userId: "tech" }, false);
    expect(mocks.db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "tech",
          tenantId: "tenant-a",
          role: "USER",
          active: true,
          grants: { some: { tenantId: "tenant-a", propertyId: "property-a" } },
        },
        select: { id: true, name: true },
      }),
    );
    mocks.db.user.findFirst.mockResolvedValue(null);
    await expect(
      assignTechnician("order-a", { userId: "foreign" }, false),
    ).rejects.toMatchObject({ status: 400 });
    await assignTechnician("order-a", { userId: "tech" }, true);
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "work-order.technician-removed",
      }),
    });
  });
  it("blockiert letzte Zuweisungsentfernung bei laufendem Einsatz", async () => {
    order.status = "IN_PROGRESS";
    order.assignments = [{ userId: "tech", user: { name: "Techniker" } }];
    await expect(
      assignTechnician("order-a", { userId: "tech" }, true),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("erzwingt Statusautomat und schreibt tatsächliche Zeiten", async () => {
    await expect(
      changeWorkOrderStatus("order-a", { status: "COMPLETED" }),
    ).rejects.toMatchObject({ status: 409 });
    order.status = "ASSIGNED";
    mocks.requireActor.mockResolvedValue(technician);
    const started = await changeWorkOrderStatus("order-a", {
      status: "IN_PROGRESS",
    });
    expect(started.startedAt).toBeInstanceOf(Date);
    order.status = "PAUSED";
    order.startedAt = started.startedAt;
    const resumed = await changeWorkOrderStatus("order-a", {
      status: "IN_PROGRESS",
    });
    expect(resumed.startedAt).toEqual(started.startedAt);
  });
  it("Abschluss verweigert offene Pflichtpunkte und protokolliert erfolgreichen Abschluss", async () => {
    order.status = "IN_PROGRESS";
    order.checklists = [{ items: [item] }];
    await expect(
      changeWorkOrderStatus("order-a", { status: "COMPLETED" }),
    ).rejects.toMatchObject({ status: 409 });
    order.checklists = [
      {
        items: [
          { ...item, completed: true },
          { required: false, completed: false },
        ],
      },
    ];
    const completed = await changeWorkOrderStatus("order-a", {
      status: "COMPLETED",
    });
    expect(completed.endedAt).toBeInstanceOf(Date);
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "work-order.completed" }),
    });
  });
  it("Abbruch protokolliert Status und Abschlusszeit", async () => {
    const canceled = await changeWorkOrderStatus("order-a", {
      status: "CANCELED",
    });
    expect(canceled.endedAt).toBeInstanceOf(Date);
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "work-order.canceled" }),
    });
  });
  it("Checklisten speichern Bearbeiter/Zeit und verweigern fremde Item-ID", async () => {
    order.status = "IN_PROGRESS";
    order.checklists = [{ items: [item] }];
    await expect(
      completeChecklistItem("order-a", "foreign", { completed: true }),
    ).rejects.toMatchObject({ status: 404 });
    const result = await completeChecklistItem("order-a", "item-a", {
      completed: true,
      comment: "Geprüft",
    });
    expect(result).toMatchObject({
      completed: true,
      completedById: "admin",
      completedAt: expect.any(Date),
    });
    expect(mocks.db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "work-order.checklist-item-updated",
      }),
    });
  });
  it("terminaler Auftrag ist unveränderlich", async () => {
    order.status = "COMPLETED";
    await expect(
      completeChecklistItem("order-a", "item-a", { completed: false }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateWorkOrder("order-a", { title: "Neu" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      addWorkOrderComment("order-a", { body: "Neu" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it.each(["mine", "today", "planned", "active", "completed"])(
    "Meine-Einsätze-Filter %s bleibt persönlich",
    async (view) => {
      await listWorkOrders(null, { view });
      const where = mocks.db.workOrder.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        tenantId: "tenant-a",
        assignments: { some: { tenantId: "tenant-a", userId: "admin" } },
      });
      if (view === "today") expect(where.scheduledAt).toEqual(todayRange());
      if (view === "active")
        expect(where.status).toEqual({ in: ["IN_PROGRESS", "PAUSED"] });
      if (view === "completed") expect(where.status).toBe("COMPLETED");
    },
  );
  it("fehlgeschlagener Audit lässt die Transaktion fehlschlagen", async () => {
    mocks.db.auditEvent.create.mockRejectedValue(new Error("audit failure"));
    await expect(createWorkOrder(input)).rejects.toThrow("audit failure");
  });
});
