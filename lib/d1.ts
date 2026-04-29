import { getRequestContext } from "@cloudflare/next-on-pages";

type Env = {
  DB: D1Database;
};

export function getD1() {
  const { env } = getRequestContext();
  const db = (env as Env).DB;
  if (!db) throw new Error("D1 binding `DB` is missing. Check wrangler.toml bindings.");
  return db;
}

export async function cleanupExpiredClaims(db: D1Database, nowMs: number) {
  await db
    .prepare(
      `
      UPDATE links
      SET
        state = 'queued',
        claimed_by_user_id = NULL,
        claim_expires_at = NULL,
        claimed_at = NULL,
        updated_at = ?
      WHERE
        state = 'claimed'
        AND claim_expires_at IS NOT NULL
        AND claim_expires_at < ?
    `.trim()
    )
    .bind(nowMs, nowMs)
    .run();
}

