import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "../src/server/policy";
const auth = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("../src/server/auth", () => ({
  requireActor: vi.fn(async () => {
    if (!auth.actor) throw new Error("unauthenticated");
    return auth.actor;
  }),
}));
import { db } from "../src/server/db";
import {
  saveFieldDocumentation,
  saveChecklistTemplate,
} from "../src/server/field-documentation";
import {
  addChecklist,
  addWorkOrderComment,
  assignTechnician,
  changeWorkOrderStatus,
  completeChecklistItem,
  createWorkOrder,
  deleteWorkOrder,
  getWorkOrder,
  listWorkOrders,
  updateWorkOrder,
} from "../src/server/field-service";

const prefix = `field-test-${randomUUID()}`;
const a = `${prefix}-a`,
  b = `${prefix}-b`;
const admin: Actor = {
  id: `${prefix}-admin`,
  tenantId: a,
  role: "TENANT_ADMIN",
  name: "Testverwaltung",
  email: `${prefix}@example.invalid`,
};
const tech: Actor = { ...admin, id: `${prefix}-tech`, role: "USER" };
const noGrant: Actor = { ...tech, id: `${prefix}-nogrant` };
const foreign: Actor = { ...tech, id: `${prefix}-foreign`, tenantId: b };
let orderId: string;
let fixtureStarted = false;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.SEED_DEMO !== "true" ||
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    !(
      url.pathname === "/meterwerk" ||
      (process.env.METERWERK_ENV === "test" &&
        url.pathname === "/meterwerk_acceptance" &&
        url.port === "55435")
    )
  )
    throw new Error(
      "Nur lokale Demo- oder explizite Acceptance-Datenbank mit SEED_DEMO=true erlaubt.",
    );
  await db.$queryRaw`SELECT 1`;
  fixtureStarted = true;
  await db.tenant.createMany({
    data: [
      { id: a, name: "Field Test A", slug: a },
      { id: b, name: "Field Test B", slug: b },
    ],
  });
  for (const actor of [admin, tech, noGrant, foreign])
    await db.user.create({
      data: {
        id: actor.id,
        tenantId: actor.tenantId,
        name: actor.name,
        email: `${actor.id}@example.invalid`,
        passwordHash: "disabled-integration-login",
        role: actor.role,
      },
    });
  await db.property.createMany({
    data: [
      { id: `${a}-p`, tenantId: a, name: "A", address: "Test", city: "Test" },
      { id: `${b}-p`, tenantId: b, name: "B", address: "Test", city: "Test" },
    ],
  });
  await db.propertyGrant.create({
    data: { tenantId: a, propertyId: `${a}-p`, userId: tech.id },
  });
  auth.actor = admin;
});
afterAll(async () => {
  // Delete only records belonging to this run's two unique fixture tenants.
  const where = { tenantId: { in: [a, b] } };
  try {
    if (!fixtureStarted) return;
    await db.attachment.deleteMany({ where });
    await db.workOrderReceipt.deleteMany({ where });
    await db.workOrderEntry.deleteMany({ where });
    await db.checklistTemplate.deleteMany({ where });
    await db.workOrderComment.deleteMany({ where });
    await db.checklistItem.deleteMany({ where });
    await db.workOrderChecklist.deleteMany({ where });
    await db.technicianAssignment.deleteMany({ where });
    await db.workOrder.deleteMany({ where });
    await db.auditEvent.deleteMany({ where });
    await db.propertyGrant.deleteMany({ where });
    await db.property.deleteMany({ where });
    await db.user.deleteMany({ where });
    await db.tenant.deleteMany({ where: { id: { in: [a, b] } } });
  } finally {
    await db.$disconnect();
  }
});
describe.sequential("Field Service mit PostgreSQL", () => {
  it("CRUD und historische Terminänderungen", async () => {
    auth.actor = admin;
    const order = await createWorkOrder({
      title: "Wartung",
      type: "MAINTENANCE",
      propertyId: `${a}-p`,
      scheduledAt: new Date().toISOString(),
    });
    orderId = order.id;
    expect((await getWorkOrder(orderId)).status).toBe("DRAFT");
    await updateWorkOrder(orderId, { title: "Wartung vor Ort" });
    expect((await getWorkOrder(orderId)).title).toBe("Wartung vor Ort");
    const draft = await createWorkOrder({
      title: "Löschen",
      type: "OTHER",
      propertyId: `${a}-p`,
    });
    await deleteWorkOrder(draft.id);
    await expect(getWorkOrder(draft.id)).rejects.toMatchObject({ status: 404 });
    expect(
      await db.auditEvent.count({
        where: {
          tenantId: a,
          entityId: draft.id,
          action: "work-order.deleted",
        },
      }),
    ).toBe(1);
  });
  it("fremde Tenant-/Objekt-IDs und fehlende Grants", async () => {
    await expect(
      createWorkOrder({ title: "Fremd", type: "OTHER", propertyId: `${b}-p` }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(getWorkOrder(orderId, b)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      assignTechnician(orderId, { userId: foreign.id }, false),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      assignTechnician(orderId, { userId: noGrant.id }, false),
    ).rejects.toMatchObject({ status: 400 });
    auth.actor = foreign;
    await expect(getWorkOrder(orderId)).rejects.toMatchObject({ status: 404 });
    auth.actor = tech;
    expect(await listWorkOrders()).toHaveLength(0);
    await expect(getWorkOrder(orderId)).rejects.toMatchObject({ status: 404 });
    await expect(
      createWorkOrder({
        title: "Eskalation",
        type: "OTHER",
        propertyId: `${a}-p`,
      }),
    ).rejects.toMatchObject({ status: 403 });
    auth.actor = admin;
    // Even a direct inconsistent assignment cannot bypass the property grant.
    await db.technicianAssignment.create({
      data: { tenantId: a, workOrderId: orderId, userId: noGrant.id },
    });
    auth.actor = noGrant;
    expect(await listWorkOrders()).toHaveLength(0);
    await expect(getWorkOrder(orderId)).rejects.toMatchObject({ status: 404 });
    auth.actor = admin;
    await assignTechnician(orderId, { userId: noGrant.id }, true);
  });
  it("Datenbank verhindert mandantenfremde zusammengesetzte Fremdschlüssel", async () => {
    await expect(
      db.technicianAssignment.create({
        data: { tenantId: a, workOrderId: orderId, userId: foreign.id },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      db.workOrderChecklist.create({
        data: { tenantId: b, workOrderId: orderId, title: "Fremd" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("Planung, Zuweisung, persönliche Filter, Statusautomat und Kommentare", async () => {
    auth.actor = admin;
    await expect(
      changeWorkOrderStatus(orderId, { status: "COMPLETED" }),
    ).rejects.toMatchObject({ status: 409 });
    await changeWorkOrderStatus(orderId, { status: "PLANNED" });
    await assignTechnician(orderId, { userId: tech.id }, false);
    await changeWorkOrderStatus(orderId, { status: "ASSIGNED" });
    auth.actor = tech;
    expect(await listWorkOrders(a, { view: "mine" })).toHaveLength(1);
    expect(await listWorkOrders(a, { view: "today" })).toHaveLength(1);
    expect(await listWorkOrders(a, { view: "planned" })).toHaveLength(1);
    expect(await listWorkOrders(a, { view: "completed" })).toHaveLength(0);
    await changeWorkOrderStatus(orderId, { status: "IN_PROGRESS" });
    const startedAt = (await getWorkOrder(orderId)).startedAt;
    await changeWorkOrderStatus(orderId, { status: "PAUSED" });
    await changeWorkOrderStatus(orderId, { status: "IN_PROGRESS" });
    expect((await getWorkOrder(orderId)).startedAt).toEqual(startedAt);
    await addWorkOrderComment(orderId, { body: "Vor Ort" });
    expect((await getWorkOrder(orderId)).comments[0].body).toBe("Vor Ort");
    await expect(
      assignTechnician(orderId, { userId: noGrant.id }, false),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("Pflichtcheckliste, fremde Item-ID, Abschluss und unveränderliche Historie", async () => {
    auth.actor = admin;
    await addChecklist(orderId, {
      title: "Abnahme",
      items: [{ title: "Sichtprüfung", required: true, order: 0 }],
    });
    auth.actor = tech;
    const order = await getWorkOrder(orderId);
    const item = order.checklists[0].items[0];
    expect(item.tenantId).toBe(a);
    await expect(
      changeWorkOrderStatus(orderId, { status: "COMPLETED" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      completeChecklistItem(orderId, "foreign-item", { completed: true }),
    ).rejects.toMatchObject({ status: 404 });
    await completeChecklistItem(orderId, item.id, {
      completed: true,
      comment: "Geprüft",
    });
    await saveFieldDocumentation(orderId, {
      requestId: randomUUID(),
      revision: 0,
      mutation: {
        kind: "documentation",
        value: {
          report: "Wartung abgeschlossen",
          workPerformed: "Prüfung",
          actualStart: "2026-01-01T08:00:00Z",
          actualEnd: "2026-01-01T10:00:00Z",
        },
      },
    });
    await saveFieldDocumentation(orderId, {
      requestId: randomUUID(),
      revision: 1,
      mutation: {
        kind: "time",
        value: {
          technicianId: tech.id,
          start: "2026-01-01T08:00:00Z",
          end: "2026-01-01T10:00:00Z",
          pauseMinutes: 15,
          activity: "Wartung",
        },
      },
    });
    await changeWorkOrderStatus(orderId, { status: "COMPLETED" });
    const completed = await getWorkOrder(orderId);
    expect(completed.endedAt).toBeInstanceOf(Date);
    expect(completed.checklists[0].items[0].completedById).toBe(tech.id);
    expect(completed.history.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "work-order.created",
        "work-order.technician-assigned",
        "work-order.status-changed",
        "work-order.checklist-item-updated",
        "work-order.completed",
      ]),
    );
    expect(await listWorkOrders(a, { view: "completed" })).toHaveLength(1);
    await expect(
      completeChecklistItem(orderId, item.id, { completed: false }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("Teil 2: idempotente Materialerfassung, Snapshot und zusammengesetzte Fremdschlüssel", async () => {
    auth.actor = admin;
    const definition = {
      title: "Wartungsvorlage",
      type: "MAINTENANCE",
      medium: "WATER",
      items: [{ title: "Sichtprüfung", order: 0, required: true }],
    };
    const template = await saveChecklistTemplate(definition);
    const order = await createWorkOrder({
      title: "Teil 2",
      type: "MAINTENANCE",
      propertyId: `${a}-p`,
      templateId: template.id,
    });
    await assignTechnician(order.id, { userId: tech.id }, false);
    await saveChecklistTemplate(
      { ...definition, items: [{ title: "Geänderte Vorlage", order: 0 }] },
      a,
      template.id,
    );
    expect((await getWorkOrder(order.id)).checklists[0].items[0].title).toBe(
      "Sichtprüfung",
    );
    expect((await getWorkOrder(order.id)).checklists[0].items[0].tenantId).toBe(
      a,
    );
    auth.actor = tech;
    const input = {
      requestId: randomUUID(),
      revision: 0,
      mutation: {
        kind: "material",
        value: { description: "Dichtung", quantity: "0.125", unit: "Stück" },
      },
    };
    await Promise.all([
      saveFieldDocumentation(order.id, input),
      saveFieldDocumentation(order.id, input),
    ]);
    expect(
      await db.workOrderEntry.count({
        where: { tenantId: a, workOrderId: order.id, kind: "material" },
      }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: {
          tenantId: a,
          entityId: order.id,
          action: "work-order.material-saved",
        },
      }),
    ).toBe(1);
    await expect(
      db.workOrderEntry.create({
        data: {
          tenantId: b,
          workOrderId: order.id,
          actorId: foreign.id,
          kind: "material",
          payload: {},
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    auth.actor = noGrant;
    await expect(saveFieldDocumentation(order.id, input)).rejects.toMatchObject(
      { status: 404 },
    );
    auth.actor = foreign;
    await expect(saveFieldDocumentation(order.id, input)).rejects.toMatchObject(
      { status: 404 },
    );
    auth.actor = admin;
  });
  it("nachträglich angewandte Vorlage übernimmt den Tenant für verschachtelte Items", async () => {
    auth.actor = admin;
    const template = await saveChecklistTemplate({
      title: "Nachträgliche Vorlage",
      type: "MAINTENANCE",
      medium: "WATER",
      items: [{ title: "Tenantprüfung", order: 0, required: true }],
    });
    const order = await createWorkOrder({
      title: "Vorlagenregression",
      type: "MAINTENANCE",
      propertyId: `${a}-p`,
    });
    await saveFieldDocumentation(order.id, {
      requestId: randomUUID(),
      revision: 0,
      mutation: { kind: "template", value: { templateId: template.id } },
    });
    const checklist = (await getWorkOrder(order.id)).checklists[0];
    expect(checklist.tenantId).toBe(a);
    expect(checklist.items[0].tenantId).toBe(a);
    expect(checklist.items[0].title).toBe("Tenantprüfung");
  });
  it("Grant-Entzug entfernt auch einen bereits zugewiesenen Auftrag aus allen Ansichten", async () => {
    await db.propertyGrant.deleteMany({
      where: { tenantId: a, userId: tech.id },
    });
    auth.actor = tech;
    expect(await listWorkOrders(a, { view: "completed" })).toHaveLength(0);
    await expect(getWorkOrder(orderId)).rejects.toMatchObject({ status: 404 });
    auth.actor = admin;
  });
  it("MANAGER im eigenen Bereich und SUPER_ADMIN nur mit Tenant und lesend", async () => {
    auth.actor = { ...admin, role: "MANAGER" };
    const order = await createWorkOrder({
      title: "Abbruch",
      type: "FAULT",
      propertyId: `${a}-p`,
    });
    await changeWorkOrderStatus(order.id, { status: "CANCELED" });
    expect(
      (await getWorkOrder(order.id)).history.some(
        (e) => e.action === "work-order.canceled",
      ),
    ).toBe(true);
    auth.actor = { ...admin, tenantId: null, role: "SUPER_ADMIN" };
    await expect(getWorkOrder(orderId)).rejects.toMatchObject({ status: 400 });
    expect((await getWorkOrder(orderId, a)).id).toBe(orderId);
    await expect(
      updateWorkOrder(orderId, { title: "Nein" }, a),
    ).rejects.toMatchObject({ status: 403 });
  });
});
