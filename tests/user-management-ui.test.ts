import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Actor } from "@/server/policy";

const mocks = vi.hoisted(() => ({
  actor: {
    id: "admin",
    role: "SUPER_ADMIN",
    tenantId: null,
    name: "Admin",
    email: "admin@example.invalid",
  } as Actor,
  list: vi.fn(),
  tenants: vi.fn(),
  mutate: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/server/auth", () => ({
  requirePageActor: async () => mocks.actor,
  requireActor: async () => mocks.actor,
}));
vi.mock("@/server/presentation", () => ({
  presentation: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/server/page-context", () => ({
  pageContext: async (requested?: string) => {
    const { tenantScope } = await import("@/server/policy");
    const tenantId = tenantScope(mocks.actor, requested);
    return {
      actor: mocks.actor,
      tenantId,
      tenant: { id: tenantId, name: "Selected customer" },
      tenants: [],
    };
  },
}));
vi.mock("@/server/data", () => ({
  listResource: mocks.list,
  listTenants: mocks.tenants,
}));
vi.mock("@/server/mutations", () => ({ mutate: mocks.mutate }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/users",
}));
import SectionPage from "@/app/(platform)/[section]/page";
import { createAction } from "@/app/actions";
import { AccessError } from "@/server/policy";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor = { ...mocks.actor, role: "SUPER_ADMIN", tenantId: null };
  mocks.list.mockImplementation(async (_actor, resource) =>
    resource === "users"
      ? [
          {
            id: "u1",
            name: "Example",
            email: "user@example.invalid",
            role: "TENANT_ADMIN",
            active: true,
            grants: [],
          },
        ]
      : [],
  );
  mocks.tenants.mockResolvedValue([
    {
      id: "tenant-a",
      name: "Customer A",
      slug: "customer-a",
      _count: { users: 1, properties: 0 },
    },
  ]);
});
const page = (section: string, tenantId?: string) =>
  SectionPage({
    params: Promise.resolve({ section }),
    searchParams: Promise.resolve({ tenantId }),
  });

it("links each customer to its selected user management without losing customer CRUD", async () => {
  const html = renderToStaticMarkup(await page("tenants"));
  expect(html).toContain('href="/users?tenantId=tenant-a"');
  expect(html).toContain("Benutzer verwalten");
  expect(html).toContain("Kunden anlegen");
  expect(html).toContain("Customer A bearbeiten");
});

it("renders the selected customer's list, create form and optional-password editor", async () => {
  const html = renderToStaticMarkup(await page("users", "tenant-a"));
  for (const text of [
    "Selected customer",
    "Benutzer anlegen",
    "Example",
    "user@example.invalid",
    "Aktiv",
    "Bearbeiten",
    "Löschen",
    "bestehende Passwort beizubehalten",
  ])
    expect(html).toContain(text);
  expect(html).toContain('type="hidden" name="tenantId" value="tenant-a"');
  expect(html).toContain('minLength="14"');
  expect(html).toContain('value="true" selected=""');
  expect(html).toContain('value="TENANT_ADMIN"');
  expect(html).toContain('value="MANAGER"');
  expect(html).toContain('value="USER"');
  expect(html).not.toContain('value="SUPER_ADMIN"');
  expect(html).not.toContain("passwordHash");
  expect(mocks.list).toHaveBeenCalledWith(mocks.actor, "users", "tenant-a");
});

it("requires explicit platform selection and restricts tenant admins to their session tenant", async () => {
  await expect(page("users")).rejects.toMatchObject({ status: 400 });
  mocks.actor = { ...mocks.actor, role: "TENANT_ADMIN", tenantId: "tenant-a" };
  expect(renderToStaticMarkup(await page("users"))).toContain(
    "Benutzer anlegen",
  );
  await expect(page("users", "tenant-b")).rejects.toMatchObject({
    status: 403,
  });
});

it.each(["MANAGER", "USER"] as const)(
  "denies %s before loading user data",
  async (role) => {
    mocks.actor = { ...mocks.actor, role, tenantId: "tenant-a" };
    await expect(page("users")).rejects.toThrow("NOT_FOUND");
    expect(mocks.list).not.toHaveBeenCalled();
  },
);

it("revalidates after saving and exposes policy errors through publicError", async () => {
  const form = new FormData();
  form.set("kind", "users");
  form.set("tenantId", "tenant-a");
  expect(await createAction({}, form)).toHaveProperty("success");
  expect(mocks.mutate).toHaveBeenCalledWith(
    mocks.actor,
    { kind: "users", tenantId: "tenant-a" },
    "tenant-a",
  );
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  mocks.mutate.mockRejectedValueOnce(
    new AccessError(403, "Keine Verwaltungsberechtigung."),
  );
  expect(await createAction({}, form)).toEqual({
    error: "Keine Verwaltungsberechtigung.",
  });
});
