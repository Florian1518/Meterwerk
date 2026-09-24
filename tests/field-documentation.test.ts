import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { attachmentError } from "../src/lib/attachment-validation";
import {
  documentationSchema,
  materialSchema,
  netMinutes,
  signatureSchema,
  timeSchema,
  commissioningSchema,
} from "../src/lib/field-documentation";
const mock = vi.hoisted(() => {
  const model = () => ({
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  });
  return {
    auth: vi.fn(),
    db: {
      workOrder: model(),
      workOrderEntry: model(),
      workOrderReceipt: model(),
      checklistTemplate: model(),
      workOrderChecklist: model(),
      attachment: model(),
      deviceProfile: model(),
      meterReplacement: model(),
      meter: model(),
      auditEvent: model(),
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
    fs: {
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      readFile: vi.fn(),
      unlink: vi.fn(),
    },
  };
});
vi.mock("../src/server/db", () => ({ db: mock.db }));
vi.mock("../src/server/auth", () => ({ requireActor: mock.auth }));
vi.mock("node:fs/promises", () => mock.fs);
import {
  completionError,
  saveChecklistTemplate,
  saveFieldDocumentation,
} from "../src/server/field-documentation";
import { readAttachment, storeAttachment } from "../src/server/attachments";
const doc = {
  report: "Bericht",
  workPerformed: "Montage",
  actualStart: "2026-01-01T08:00:00Z",
  actualEnd: "2026-01-01T10:00:00Z",
};
const time = {
  technicianId: "tech",
  start: doc.actualStart,
  end: doc.actualEnd,
  pauseMinutes: 30,
  activity: "Montage",
};
const material = { description: "Dichtung", quantity: "0.125", unit: "Stück" };
const signature = {
  name: "Techniker",
  role: "TECHNICIAN",
  strokes: [
    [
      [10, 10],
      [20, 20],
    ],
  ],
  accepted: true,
};
const protocol = {
  equipment: "Zähler",
  serialNumber: "123",
  protocol: "Manuell",
  location: "Keller",
  communicationChecked: true,
  readingsPlausible: true,
  clockChecked: true,
  mappingChecked: true,
  gatewayChecked: true,
  result: "PASSED",
};
const actor = { id: "tech", tenantId: "a", role: "USER", name: "Techniker" };
type Entry = { id: string; kind: string; payload: Record<string, unknown> };
let row: {
  id: string;
  tenantId: string;
  propertyId: string;
  meterId: string | null;
  unitId: string | null;
  status: string;
  type: string;
  revision: number;
  documentation: unknown;
  commissioning: unknown;
  replacementId: string | null;
  replacementDetails: unknown;
  requireCustomerSignature: boolean;
  requireTechnicianSignature: boolean;
  entries: Entry[];
  assignments: { userId: string }[];
  checklists: { items: { required: boolean; completed: boolean }[] }[];
};
const request = (
  kind: string,
  value: unknown,
  revision = row.revision,
  requestId = randomUUID(),
) => ({ requestId, revision, mutation: { kind, value } });
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue(actor);
  mock.db.$transaction.mockImplementation((fn) => fn(mock.db));
  row = {
    id: "order",
    tenantId: "a",
    propertyId: "property",
    meterId: null,
    unitId: null,
    status: "IN_PROGRESS",
    type: "MAINTENANCE",
    revision: 0,
    documentation: doc,
    commissioning: null,
    replacementId: null,
    replacementDetails: null,
    requireCustomerSignature: false,
    requireTechnicianSignature: false,
    entries: [{ id: "time", kind: "time", payload: time }],
    assignments: [{ userId: "tech" }],
    checklists: [],
  };
  mock.db.workOrder.findFirst.mockResolvedValue(row);
  mock.db.workOrderReceipt.findUnique.mockResolvedValue(null);
  mock.db.workOrder.update.mockImplementation(({ data }) => {
    const { revision, ...rest } = data;
    Object.assign(row, rest);
    if (revision?.increment) row.revision += revision.increment;
    return row;
  });
  mock.db.workOrderEntry.create.mockImplementation(({ data }) => {
    const entry = { id: randomUUID(), ...data };
    row.entries.push(entry);
    return entry;
  });
  mock.db.attachment.create.mockImplementation(({ data }) => ({
    id: "attachment",
    ...data,
  }));
  mock.fs.unlink.mockResolvedValue(undefined);
  mock.fs.readFile.mockResolvedValue(Buffer.from("test"));
});
describe("Vor-Ort-Verträge", () => {
  it("berechnet Nettozeit, verweigert negative Pausen und fehlende Korrekturbegründung", () => {
    expect(netMinutes(time)).toBe(90);
    for (const value of [
      { ...time, pauseMinutes: 130 },
      { ...time, pauseMinutes: -1 },
      { ...time, end: time.start },
      { ...time, entryId: "entry" },
    ])
      expect(timeSchema.safeParse(value).success).toBe(false);
    expect(
      timeSchema.safeParse({
        ...time,
        entryId: "entry",
        correctionReason: "Pause berichtigt",
      }).success,
    ).toBe(true);
  });
  it("prüft Decimal-Mengen, UTC, unbekannte Felder und sichere Signaturdaten", () => {
    expect(materialSchema.parse(material).quantity).toBe("0.125");
    expect(
      materialSchema.safeParse({ ...material, quantity: 0.125 }).success,
    ).toBe(false);
    expect(
      documentationSchema.safeParse({ ...doc, tenantId: "b" }).success,
    ).toBe(false);
    expect(
      documentationSchema.safeParse({ ...doc, actualStart: "2026-01-01T08:00" })
        .success,
    ).toBe(false);
    expect(
      signatureSchema.safeParse({ ...signature, strokes: "<script>" }).success,
    ).toBe(false);
    expect(
      signatureSchema.safeParse({
        ...signature,
        strokes: [
          [
            [0, 0],
            [601, 0],
          ],
        ],
      }).success,
    ).toBe(false);
  });
  it("prüft MIME, Endung, Magic Bytes, Größe und ausführbare Dateien", () => {
    expect(
      attachmentError(
        "a.png",
        "image/png",
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      ),
    ).toBeNull();
    expect(
      attachmentError(
        "a.pdf",
        "application/pdf",
        new TextEncoder().encode("%PDF-1.7"),
      ),
    ).toBeNull();
    for (const [name, mime, bytes] of [
      ["a.exe", "image/png", [1]],
      ["a.png", "image/png", [77, 90]],
      ["a.txt", "text/plain", [77, 90]],
      ["a.svg", "image/svg+xml", [1]],
      ["a.txt", "text/plain", [255]],
      ["a.pdf", "application/pdf", []],
    ] as const)
      expect(attachmentError(name, mime, new Uint8Array(bytes))).toBeTruthy();
    expect(
      attachmentError(
        "a.txt",
        "text/plain",
        new Uint8Array(10 * 1024 * 1024 + 1),
      ),
    ).toBeTruthy();
  });
});
describe("Abschlussbedingungen", () => {
  it("verlangt Bericht, Zeiten innerhalb Einsatz und erforderliche Signaturen", () => {
    expect(completionError(row)).toBeNull();
    expect(completionError({ ...row, documentation: null })).toBeTruthy();
    expect(completionError({ ...row, entries: [] })).toBeTruthy();
    expect(
      completionError({ ...row, requireCustomerSignature: true }),
    ).toBeTruthy();
    expect(
      completionError({
        ...row,
        documentation: { ...doc, actualStart: "2026-01-01T09:00:00Z" },
      }),
    ).toBeTruthy();
  });
  it("verlangt Wiederverwendung des Zählerwechselmodells und erfolgreiches Inbetriebnahmeprotokoll", () => {
    expect(completionError({ ...row, type: "METER_REPLACEMENT" })).toBeTruthy();
    expect(
      completionError({
        ...row,
        type: "METER_REPLACEMENT",
        replacementId: "existing",
      }),
    ).toBeNull();
    expect(
      completionError({
        ...row,
        type: "INSTALLATION",
        commissioning: protocol,
      }),
    ).toBeNull();
    expect(
      completionError({
        ...row,
        type: "INSTALLATION",
        commissioning: { ...protocol, result: "FAILED" },
      }),
    ).toBeTruthy();
    expect(
      commissioningSchema.safeParse({
        ...protocol,
        communicationChecked: false,
      }).success,
    ).toBe(false);
  });
});
describe("Tenantgesicherte Mutationen und Reconnect", () => {
  it("authentifiziert und erzwingt Tenant, Grant und Zuweisung für sämtliche Mutationsarten", async () => {
    await expect(
      saveFieldDocumentation("order", request("material", material), "b"),
    ).rejects.toMatchObject({ status: 403 });
    mock.db.workOrder.findFirst.mockResolvedValue(null);
    for (const [kind, value] of [
      ["material", material],
      ["time", time],
      ["signature", signature],
      ["documentation", doc],
      ["commissioning", protocol],
      [
        "replacement",
        {
          replacementId: "foreign",
          oldPhotoId: "old",
          newPhotoId: "new",
          customerContact: "Kunde",
        },
      ],
      ["template", { templateId: "foreign" }],
    ]) {
      await expect(
        saveFieldDocumentation("foreign", request(String(kind), value)),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(mock.db.workOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "a",
          property: {
            tenantId: "a",
            grants: { some: { userId: "tech", tenantId: "a" } },
          },
          assignments: { some: { tenantId: "a", userId: "tech" } },
        }),
      }),
    );
    mock.auth.mockRejectedValue(new Error("unauthenticated"));
    await expect(
      saveFieldDocumentation("order", request("material", material)),
    ).rejects.toThrow("unauthenticated");
  });
  it("schreibt Material als Decimal und Audit atomar; Replay erzeugt keine Duplikate", async () => {
    const input = request("material", material);
    await saveFieldDocumentation("order", input);
    expect(mock.db.workOrderEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "a",
          quantity: "0.125",
          actorId: "tech",
        }),
      }),
    );
    const receipt = mock.db.workOrderReceipt.create.mock.calls[0][0].data;
    mock.db.workOrderReceipt.findUnique.mockResolvedValue(receipt);
    row.status = "COMPLETED";
    expect(await saveFieldDocumentation("order", input)).toMatchObject({
      replayed: true,
    });
    expect(mock.db.workOrderEntry.create).toHaveBeenCalledTimes(1);
    await expect(
      saveFieldDocumentation("order", {
        ...input,
        mutation: { kind: "material", value: { ...material, quantity: "2" } },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.db.auditEvent.create).toHaveBeenCalledTimes(1);
  });
  it("verweigert veraltete Revisionen, Rolleneskalation und fremde Techniker", async () => {
    await expect(
      saveFieldDocumentation("order", request("material", material, 8)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveFieldDocumentation(
        "order",
        request("time", { ...time, technicianId: "foreign" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveFieldDocumentation(
        "order",
        request("template", { templateId: "template" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    mock.auth.mockResolvedValue({
      ...actor,
      tenantId: null,
      role: "SUPER_ADMIN",
    });
    await expect(
      saveFieldDocumentation("order", request("material", material), "a"),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("verlangt Begründung und auditierbares Vorher/Nachher bei Zeitkorrektur", async () => {
    const value = {
      ...time,
      entryId: "time",
      pauseMinutes: 20,
      correctionReason: "Pause korrigiert",
    };
    await saveFieldDocumentation("order", request("time", value));
    expect(mock.db.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "work-order.time-corrected",
        details: expect.objectContaining({
          before: time,
          after: expect.objectContaining(value),
          netMinutes: 100,
        }),
      }),
    });
    await expect(
      saveFieldDocumentation(
        "order",
        request("time", { ...value, entryId: "foreign" }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveFieldDocumentation("order", request("time", time)),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("speichert Inbetriebnahme und prüft Profil-Tenant", async () => {
    row.type = "COMMISSIONING";
    await saveFieldDocumentation("order", request("commissioning", protocol));
    expect(row.commissioning).toMatchObject({ result: "PASSED" });
    mock.db.deviceProfile.findFirst.mockResolvedValue(null);
    await expect(
      saveFieldDocumentation(
        "order",
        request("commissioning", { ...protocol, deviceProfileId: "foreign" }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("schützt Unterschriften vor Überschreiben, nach Abschluss und vor nachträglicher Änderung", async () => {
    await saveFieldDocumentation("order", request("signature", signature));
    await expect(
      saveFieldDocumentation("order", request("signature", signature)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveFieldDocumentation("order", request("documentation", doc)),
    ).rejects.toMatchObject({ status: 409 });
    row.status = "COMPLETED";
    await expect(
      saveFieldDocumentation(
        "order",
        request("signature", { ...signature, role: "CUSTOMER" }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.db.workOrderEntry.create).toHaveBeenCalledTimes(1);
  });
  it("verknüpft das vorhandene MeterReplacement und prüft Fotos und Bereich", async () => {
    row.type = "METER_REPLACEMENT";
    const value = {
      replacementId: "replacement",
      oldPhotoId: "old",
      newPhotoId: "new",
      customerContact: "Kunde",
    };
    mock.db.meterReplacement.findFirst.mockResolvedValue(null);
    await expect(
      saveFieldDocumentation("order", request("replacement", value)),
    ).rejects.toMatchObject({ status: 404 });
    const meter = { serialNumber: "123", type: "WATER", measurementUnit: "m³" };
    mock.db.meterReplacement.findFirst.mockResolvedValue({
      id: "replacement",
      oldMeter: meter,
      newMeter: meter,
      removedAt: new Date(doc.actualStart),
      installedAt: new Date(doc.actualEnd),
    });
    mock.db.attachment.findFirst.mockResolvedValue(null);
    await expect(
      saveFieldDocumentation("order", request("replacement", value)),
    ).rejects.toMatchObject({ status: 404 });
    mock.db.attachment.findFirst.mockResolvedValue({ id: "photo" });
    await saveFieldDocumentation("order", request("replacement", value));
    expect(row.replacementId).toBe("replacement");
    expect(mock.db.meterReplacement.create).not.toHaveBeenCalled();
    expect(mock.db.attachment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "a", workOrderId: "order" }),
      }),
    );
  });
  it("erzeugt Zählerwechsel über denselben transaktionalen Kern und verbindet ihn atomar", async () => {
    row.type = "METER_REPLACEMENT";
    const meter = { serialNumber: "123", type: "WATER", measurementUnit: "m³" };
    mock.db.meter.findFirst.mockImplementation(({ where }) => ({
      ...meter,
      id: where.id,
    }));
    mock.db.meterReplacement.create.mockImplementation(({ data }) => ({
      id: "created-replacement",
      ...data,
    }));
    mock.db.meterReplacement.findFirst.mockResolvedValue({
      id: "created-replacement",
      oldMeter: meter,
      newMeter: meter,
      removedAt: new Date(doc.actualStart),
      installedAt: new Date(doc.actualEnd),
    });
    mock.db.attachment.findFirst.mockResolvedValue({ id: "photo" });
    await saveFieldDocumentation(
      "order",
      request("replacement", {
        replacement: {
          oldMeterId: "old",
          newMeterId: "new",
          removedAt: doc.actualStart,
          installedAt: doc.actualEnd,
          removedRegister: "123.123456",
          installedRegister: "0.000001",
          reason: "Defekt",
        },
        oldPhotoId: "photo-old",
        newPhotoId: "photo-new",
        customerContact: "Kunde",
      }),
    );
    expect(row.replacementId).toBe("created-replacement");
    expect(mock.db.meterReplacement.create).toHaveBeenCalledTimes(1);
    expect(mock.db.meterReplacement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "a",
        oldMeterId: "old",
        newMeterId: "new",
        removedRegister: "123.123456",
        installedRegister: "0.000001",
        actorId: "tech",
      }),
    });
    expect(mock.db.meter.update).toHaveBeenCalledWith({
      where: { id: "old" },
      data: { status: "MAINTENANCE" },
    });
    expect(
      mock.db.auditEvent.create.mock.calls.map((call) => call[0].data.action),
    ).toEqual(["meter.replacement", "work-order.replacement-saved"]);
  });
  it("übernimmt unabhängigen Checklistensnapshot und Signaturregeln", async () => {
    mock.auth.mockResolvedValue({ ...actor, role: "MANAGER" });
    const definition = {
      title: "Wartung",
      type: "MAINTENANCE",
      medium: "WATER",
      items: [{ title: "Prüfen", order: 0, required: true }],
      requireCustomerSignature: true,
    };
    mock.db.checklistTemplate.findFirst.mockResolvedValue({
      id: "template",
      version: 3,
      definition,
    });
    await saveFieldDocumentation(
      "order",
      request("template", { templateId: "template" }),
    );
    expect(mock.db.workOrderChecklist.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "a",
        title: "Wartung (Vorlage v3)",
        items: {
          create: [
            expect.objectContaining({
              title: "Prüfen",
              required: true,
              tenantId: "a",
            }),
          ],
        },
      }),
    });
    expect(row.requireCustomerSignature).toBe(true);
    mock.db.checklistTemplate.update.mockResolvedValue({ id: "template" });
    await saveChecklistTemplate(
      { ...definition, title: "Neue Vorlage" },
      "a",
      "template",
    );
    expect(mock.db.workOrderChecklist.create).toHaveBeenCalledTimes(1);
    mock.auth.mockResolvedValue(actor);
    await expect(saveChecklistTemplate(definition)).rejects.toMatchObject({
      status: 403,
    });
  });
});
describe("Attachment-Isolation und Storage", () => {
  const upload = () => {
    const data = new FormData();
    data.set(
      "file",
      new File(["%PDF-1.7"], "protokoll.pdf", { type: "application/pdf" }),
    );
    data.set("targetType", "WORK_ORDER");
    data.set("entityId", "order");
    data.set("requestId", randomUUID());
    return data;
  };
  it("prüft Zugriff vor Dateilesen und verhindert Cross-Tenant-Downloads", async () => {
    mock.db.attachment.findFirst.mockResolvedValue(null);
    await expect(readAttachment("foreign")).rejects.toMatchObject({
      status: 404,
    });
    mock.db.attachment.findFirst.mockResolvedValue({
      tenantId: "a",
      targetType: "WORK_ORDER",
      entityId: "order",
    });
    mock.db.workOrder.findFirst.mockResolvedValue(null);
    await expect(readAttachment("known")).rejects.toMatchObject({
      status: 404,
    });
    expect(mock.fs.readFile).not.toHaveBeenCalled();
    await expect(readAttachment("foreign", "b")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("speichert gleiche Storage-Adresse, Metadaten und Audit; verhindert doppelte Uploads", async () => {
    const data = upload();
    await storeAttachment(data);
    const record = mock.db.attachment.create.mock.calls[0][0].data;
    expect(record).toMatchObject({
      workOrderId: "order",
      tenantId: "a",
      category: "OTHER",
      contentType: "application/pdf",
      uploadedById: "tech",
    });
    mock.db.attachment.findFirst.mockResolvedValue({
      id: "attachment",
      ...record,
    });
    await storeAttachment(data);
    expect(mock.db.attachment.create).toHaveBeenCalledTimes(1);
    await readAttachment("attachment");
    expect(mock.fs.readFile.mock.calls[0][0]).toBe(
      mock.fs.writeFile.mock.calls[0][0],
    );
  });
  it("verweigert ausführbare Dateien, fremde Einsätze und Upload nach Unterschrift", async () => {
    const bad = upload();
    bad.set("file", new File(["MZ"], "bad.exe", { type: "application/pdf" }));
    await expect(storeAttachment(bad)).rejects.toMatchObject({ status: 415 });
    mock.db.workOrder.findFirst.mockResolvedValue(null);
    await expect(storeAttachment(upload())).rejects.toMatchObject({
      status: 404,
    });
    expect(mock.fs.writeFile).not.toHaveBeenCalled();
    mock.db.workOrder.findFirst.mockResolvedValue(row);
    row.entries.push({ id: "sign", kind: "signature", payload: signature });
    await expect(storeAttachment(upload())).rejects.toMatchObject({
      status: 409,
    });
    expect(mock.db.attachment.create).not.toHaveBeenCalled();
  });
});
