import { getD1 } from "@/lib/d1";

export type User = {
  id: string;
  nickname: string;
  createdAt: number;
};

export function normalizeNickname(raw: string) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 24);
}

export async function upsertUserByNickname(nickname: string) {
  const db = getD1();
  const now = Date.now();

  const normalized = normalizeNickname(nickname);
  if (!normalized) throw new Error("NICKNAME_REQUIRED");

  const existing = await db
    .prepare(`SELECT id, nickname, created_at as createdAt FROM users WHERE nickname = ?`)
    .bind(normalized)
    .first<User>();

  if (existing) return existing;

  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO users(id, nickname, created_at) VALUES(?, ?, ?)`)
    .bind(id, normalized, now)
    .run();

  return { id, nickname: normalized, createdAt: now } satisfies User;
}

