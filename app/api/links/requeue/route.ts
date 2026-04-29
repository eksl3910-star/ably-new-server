import { isMaintenanceMode, requeueLatestLink, upsertUserByNickname } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: Request) {
  if (await isMaintenanceMode()) {
    return NextResponse.json({ error: "현재 점검 중입니다." }, { status: 503 });
  }

  let body: { nickname?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const nickname = typeof body.nickname === "string" ? body.nickname : "";
  let user;
  try {
    user = await upsertUserByNickname(nickname);
  } catch {
    return NextResponse.json({ error: "닉네임을 확인해주세요." }, { status: 400 });
  }

  const res = await requeueLatestLink(user.id);
  if (!res.ok) return NextResponse.json({ error: "대기열에 올린 링크가 없어요." }, { status: 400 });
  return NextResponse.json({ ok: true, id: res.id });
}

