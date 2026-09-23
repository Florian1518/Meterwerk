import { FieldServiceList } from "@/components/field-service-list";
export const metadata = { title: "Meine Einsätze · Meterwerk" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; view?: string }>;
}) {
  return <FieldServiceList {...await searchParams} technician />;
}
