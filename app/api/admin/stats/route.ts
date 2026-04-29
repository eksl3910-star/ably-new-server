import { getAdminStats } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function verifyAdminPassword(input: string) {
  const expected = process.env.ADMIN_TOGGLE_PASS || process.env.ADMIN_BASIC_PASS || "";
  if (!expected) return false;
  return safeEqual(input, expected);
}

export async function POST(req: Request) {
  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const stats = await getAdminStats();
  return NextResponse.json({ ok: true, stats });
}
