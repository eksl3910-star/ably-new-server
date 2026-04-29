import { isMaintenanceMode, returnClaim, upsertUserByNickname } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: Request) {
  if (await isMaintenanceMode()) {
    return NextResponse.json({ error: "현재 점검 중입니다." }, { status: 503 });
  }

  let body: { nickname?: string; linkId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const nickname = typeof body.nickname === "string" ? body.nickname : "";
  const linkId = typeof body.linkId === "string" ? body.linkId : "";
  if (!linkId) return NextResponse.json({ error: "linkId가 필요합니다." }, { status: 400 });

  let user;
  try {
    user = await upsertUserByNickname(nickname);
  } catch {
    return NextResponse.json({ error: "닉네임을 확인해주세요." }, { status: 400 });
  }

  const res = await returnClaim(user.id, linkId);
  if (!res.ok) return NextResponse.json({ error: "반납할 수 없어요." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

