import { NextRequest, NextResponse } from "next/server";
import { failure, readBody } from "@/server/http";
import { getGatewayProvisioningReadiness } from "@/server/gateway-readiness";
import { mutateGatewayProvisioning } from "@/server/gateway-provisioning";
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache" };
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await getGatewayProvisioningReadiness(
        (await params).id,
        request.nextUrl.searchParams.get("tenantId"),
      ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await mutateGatewayProvisioning(
        (await params).id,
        await readBody(request),
      ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
