import { getMaintenanceSetting } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const row = await getMaintenanceSetting();

  return NextResponse.json(
    {
      isMaintenance: row.isMaintenance,
      updatedAt: row.updatedAt,
    },
    {
      headers: {
        // Short edge cache to reduce D1 reads from middleware checks.
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
      },
    }
  );
}

