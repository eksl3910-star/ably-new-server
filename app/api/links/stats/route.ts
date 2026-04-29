import { getStats, isMaintenanceMode, upsertUserByNickname } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: Request) {
  if (await isMaintenanceMode()) {
    return NextResponse.json({ error: "현재 점검 중입니다." }, { status: 503 });
  }

  const url = new URL(req.url);
  const nickname = url.searchParams.get("nickname") ?? "";

  let user;
  try {
    user = await upsertUserByNickname(nickname);
  } catch {
    return NextResponse.json({ error: "닉네임을 확인해주세요." }, { status: 400 });
  }

  const stats = await getStats(user.id);
  return NextResponse.json({ ok: true, ...stats });
}

