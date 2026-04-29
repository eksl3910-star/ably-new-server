import { getRequestContext } from "@cloudflare/next-on-pages";

export type User = {
  id: string;
  nickname: string;
  createdAt: number;
};

type D1Env = { DB?: D1Database };

function requireDb() {
  // Primary source: Cloudflare binding from next-on-pages context.
  const fromContext = (getRequestContext().env as D1Env).DB;
  // Fallback: runtime global binding (for some worker runtimes).
  const fromGlobal = (globalThis as { DB?: D1Database }).DB;
  const db = fromContext ?? fromGlobal;
  if (!db) {
    throw new Error("D1 binding `DB` is missing. Check wrangler.toml [[d1_databases]] binding.");
  }
  return db;
}

export function getDb() {
  return requireDb();
}

export function normalizeNickname(raw: string) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 24);
}

export async function upsertUserByNickname(nickname: string) {
  const db = requireDb();
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

export async function isMaintenanceMode() {
  const db = requireDb();
  const row = await db
    .prepare(`SELECT is_maintenance as isMaintenance FROM settings WHERE key = 'global'`)
    .first<{ isMaintenance: number }>();
  return Boolean(row?.isMaintenance ?? 0);
}

export async function updateMaintenanceMode(next: boolean) {
  const db = requireDb();
  const now = Date.now();
  await db
    .prepare(`UPDATE settings SET is_maintenance = ?, updated_at = ? WHERE key = 'global'`)
    .bind(next ? 1 : 0, now)
    .run();
  return { isMaintenance: next, updatedAt: now };
}

export async function getMaintenanceSetting() {
  const db = requireDb();
  const row = await db
    .prepare(`SELECT is_maintenance as isMaintenance, updated_at as updatedAt FROM settings WHERE key = 'global'`)
    .first<{ isMaintenance: number; updatedAt: number }>();
  return {
    isMaintenance: Boolean(row?.isMaintenance ?? 0),
    updatedAt: row?.updatedAt ?? 0,
  };
}

async function cleanupExpiredClaims(nowMs: number) {
  const db = requireDb();
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

export function extractAblyUrl(raw: string) {
  const text = raw.trim();
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    if (!url.hostname.toLowerCase().endsWith("a-bly.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function checkDuplicateLink(ownerUserId: string, url: string) {
  const db = requireDb();
  const existing = await db
    .prepare(`SELECT id FROM links WHERE url = ? AND owner_user_id = ? AND state IN ('queued', 'claimed')`)
    .bind(url, ownerUserId)
    .first<{ id: string }>();
  return existing ? true : false;
}

export async function submitLink(ownerUserId: string, url: string) {
  const db = requireDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  await cleanupExpiredClaims(now);
  await db
    .prepare(
      `
      INSERT INTO links(id, url, owner_user_id, state, queued_at, created_at, updated_at)
      VALUES (?, ?, ?, 'queued', ?, ?, ?)
    `.trim()
    )
    .bind(id, url, ownerUserId, now, now, now)
    .run();
  return { id };
}

export async function requeueLatestLink(ownerUserId: string) {
  const db = requireDb();
  const now = Date.now();
  const row = await db
    .prepare(
      `
      SELECT id
      FROM links
      WHERE owner_user_id = ? AND state = 'queued'
      ORDER BY queued_at DESC
      LIMIT 1
    `.trim()
    )
    .bind(ownerUserId)
    .first<{ id: string }>();

  if (!row) return { ok: false as const, reason: "NO_QUEUED_LINK" as const };

  await db
    .prepare(`UPDATE links SET queued_at = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND state = 'queued'`)
    .bind(0, now, row.id, ownerUserId)
    .run();

  return { ok: true as const, id: row.id };
}

export async function getStats(userId: string) {
  const db = requireDb();
  await cleanupExpiredClaims(Date.now());
  const queued = await db.prepare(`SELECT COUNT(*) as c FROM links WHERE state = 'queued'`).first<{ c: number }>();
  const myQueued = await db
    .prepare(`SELECT COUNT(*) as c FROM links WHERE state = 'queued' AND owner_user_id = ?`)
    .bind(userId)
    .first<{ c: number }>();
  return { queued: queued?.c ?? 0, myQueued: myQueued?.c ?? 0 };
}

export async function getAdminStats() {
  const db = requireDb();
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startOfToday = now - (now % oneDayMs);

  const totalUsers = await db.prepare(`SELECT COUNT(*) as c FROM users`).first<{ c: number }>();
  const todayUsers = await db
    .prepare(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`)
    .bind(startOfToday)
    .first<{ c: number }>();
  const totalLinks = await db.prepare(`SELECT COUNT(*) as c FROM links`).first<{ c: number }>();
  const queuedLinks = await db.prepare(`SELECT COUNT(*) as c FROM links WHERE state = 'queued'`).first<{ c: number }>();
  const consumedLinks = await db.prepare(`SELECT COUNT(*) as c FROM links WHERE state = 'consumed'`).first<{ c: number }>();

  return {
    totalUsers: totalUsers?.c ?? 0,
    todayUsers: todayUsers?.c ?? 0,
    totalLinks: totalLinks?.c ?? 0,
    queuedLinks: queuedLinks?.c ?? 0,
    consumedLinks: consumedLinks?.c ?? 0,
  };
}

export async function claimNextLink(receiverUserId: string) {
  const db = requireDb();
  const now = Date.now();
  const expiresAt = now + 5_000;
  await cleanupExpiredClaims(now);

  await db.exec("BEGIN");
  try {
    const candidate = await db
      .prepare(
        `
        SELECT l.id, l.url
        FROM links l
        WHERE
          l.state = 'queued'
          AND l.owner_user_id != ?
          AND NOT EXISTS (
            SELECT 1 FROM receipts r
            WHERE r.link_id = l.id AND r.receiver_user_id = ?
          )
        ORDER BY l.queued_at ASC
        LIMIT 1
      `.trim()
      )
      .bind(receiverUserId, receiverUserId)
      .first<{ id: string; url: string }>();

    if (!candidate) {
      await db.exec("COMMIT");
      return { ok: false as const, reason: "NO_LINK" as const };
    }

    const updated = await db
      .prepare(
        `
        UPDATE links
        SET state = 'claimed', claimed_by_user_id = ?, claim_expires_at = ?, claimed_at = ?, updated_at = ?
        WHERE id = ? AND state = 'queued'
      `.trim()
      )
      .bind(receiverUserId, expiresAt, now, now, candidate.id)
      .run();

    if (updated.meta.changes !== 1) {
      await db.exec("ROLLBACK");
      return { ok: false as const, reason: "RACE" as const };
    }

    await db
      .prepare(`INSERT OR IGNORE INTO receipts(link_id, receiver_user_id, created_at) VALUES(?, ?, ?)`)
      .bind(candidate.id, receiverUserId, now)
      .run();

    await db.exec("COMMIT");
    return { ok: true as const, link: { id: candidate.id, url: candidate.url, expiresAt } };
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}

export async function consumeClaim(receiverUserId: string, linkId: string) {
  const db = requireDb();
  const now = Date.now();
  await cleanupExpiredClaims(now);

  const row = await db
    .prepare(
      `
      SELECT id, url, claimed_by_user_id as claimedBy, claim_expires_at as expiresAt, state
      FROM links
      WHERE id = ?
    `.trim()
    )
    .bind(linkId)
    .first<{ id: string; url: string; claimedBy: string | null; expiresAt: number | null; state: string }>();

  if (!row || row.state !== "claimed" || row.claimedBy !== receiverUserId) {
    return { ok: false as const, reason: "NOT_CLAIMED" as const };
  }
  if (!row.expiresAt || row.expiresAt < now) {
    return { ok: false as const, reason: "EXPIRED" as const };
  }

  await db
    .prepare(
      `
      UPDATE links
      SET state = 'consumed', consumed_at = ?, updated_at = ?
      WHERE id = ? AND state = 'claimed' AND claimed_by_user_id = ?
    `.trim()
    )
    .bind(now, now, linkId, receiverUserId)
    .run();

  return { ok: true as const, url: row.url };
}

export async function returnClaim(receiverUserId: string, linkId: string) {
  const db = requireDb();
  const now = Date.now();
  const res = await db
    .prepare(
      `
      UPDATE links
      SET state = 'queued', claimed_by_user_id = NULL, claim_expires_at = NULL, claimed_at = NULL, updated_at = ?
      WHERE id = ? AND state = 'claimed' AND claimed_by_user_id = ?
    `.trim()
    )
    .bind(now, linkId, receiverUserId)
    .run();
  if (res.meta.changes !== 1) return { ok: false as const };
  return { ok: true as const };
}

