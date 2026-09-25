import { NextRequest } from "next/server";
import { assertOrigin, failure, readBody } from "@/server/http";
import {
  beginRestoreTest,
  listRecoveryMetadata,
  recoveryDashboard,
} from "@/server/disaster-recovery";
export async function GET() {
  try {
    return Response.json(
      {
        ...(await listRecoveryMetadata()),
        dashboard: await recoveryDashboard(),
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    assertOrigin(request);
    const body = await readBody(request);
    return Response.json(
      await beginRestoreTest(
        String(body.backupId),
        String(body.targetDatabase),
      ),
      { status: 202, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
