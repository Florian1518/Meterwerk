import { FieldServiceList } from "@/components/field-service-list";
export const metadata = { title: "Einsätze · Meterwerk" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string }>;
}) {
  return <FieldServiceList {...await searchParams} />;
}
