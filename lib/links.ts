import { cleanupExpiredClaims, getD1 } from "@/lib/d1";

export type LinkRow = {
  id: string;
  url: string;
  ownerUserId: string;
  state: "queued" | "claimed" | "consumed";
  queuedAt: number;
  createdAt: number;
  updatedAt: number;
  claimedByUserId: string | null;
  claimExpiresAt: number | null;
  claimedAt: number | null;
  consumedAt: number | null;
};

export function extractAblyUrl(raw: string) {
  const text = raw.trim();
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  try {
    const url = new URL(match[0]);
    const host = url.hostname.toLowerCase();
    // allow both a-bly.com and www.a-bly.com etc.
    if (!host.endsWith("a-bly.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function submitLink(ownerUserId: string, url: string) {
  const db = getD1();
  const now = Date.now();
  const id = crypto.randomUUID();

  await cleanupExpiredClaims(db, now);

  await db
    .prepare(
      `
      INSERT INTO links(
        id, url, owner_user_id, state,
        queued_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', ?, ?, ?)
    `.trim()
    )
    .bind(id, url, ownerUserId, now, now, now)
    .run();

  return { id };
}

export async function requeueLatestLink(ownerUserId: string) {
  const db = getD1();
  const now = Date.now();

  // Pick the most recent queued link by the owner and move it to the front.
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

  // "맨 앞으로" = smaller queued_at wins
  const front = 0;
  await db
    .prepare(`UPDATE links SET queued_at = ?, updated_at = ? WHERE id = ? AND owner_user_id = ? AND state = 'queued'`)
    .bind(front, now, row.id, ownerUserId)
    .run();

  return { ok: true as const, id: row.id };
}

export async function getStats(userId: string) {
  const db = getD1();
  const now = Date.now();
  await cleanupExpiredClaims(db, now);

  const queued = await db
    .prepare(`SELECT COUNT(*) as c FROM links WHERE state = 'queued'`)
    .first<{ c: number }>();

  const myQueued = await db
    .prepare(`SELECT COUNT(*) as c FROM links WHERE state = 'queued' AND owner_user_id = ?`)
    .bind(userId)
    .first<{ c: number }>();

  return {
    queued: queued?.c ?? 0,
    myQueued: myQueued?.c ?? 0,
  };
}

export async function claimNextLink(receiverUserId: string) {
  const db = getD1();
  const now = Date.now();
  await cleanupExpiredClaims(db, now);

  const expiresAt = now + 5_000;

  // Transaction for atomic claim.
  await db.exec("BEGIN");
  try {
    const candidate = await db
      .prepare(
        `
        SELECT l.id, l.url, l.owner_user_id as ownerUserId
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
      .first<{ id: string; url: string; ownerUserId: string }>();

    if (!candidate) {
      await db.exec("COMMIT");
      return { ok: false as const, reason: "NO_LINK" as const };
    }

    const updated = await db
      .prepare(
        `
        UPDATE links
        SET
          state = 'claimed',
          claimed_by_user_id = ?,
          claim_expires_at = ?,
          claimed_at = ?,
          updated_at = ?
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
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}

export async function consumeClaim(receiverUserId: string, linkId: string) {
  const db = getD1();
  const now = Date.now();
  await cleanupExpiredClaims(db, now);

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
      SET
        state = 'consumed',
        consumed_at = ?,
        updated_at = ?
      WHERE id = ? AND state = 'claimed' AND claimed_by_user_id = ?
    `.trim()
    )
    .bind(now, now, linkId, receiverUserId)
    .run();

  return { ok: true as const, url: row.url };
}

export async function returnClaim(receiverUserId: string, linkId: string) {
  const db = getD1();
  const now = Date.now();

  const res = await db
    .prepare(
      `
      UPDATE links
      SET
        state = 'queued',
        claimed_by_user_id = NULL,
        claim_expires_at = NULL,
        claimed_at = NULL,
        updated_at = ?
      WHERE id = ? AND state = 'claimed' AND claimed_by_user_id = ?
    `.trim()
    )
    .bind(now, linkId, receiverUserId)
    .run();

  if (res.meta.changes !== 1) return { ok: false as const };
  return { ok: true as const };
}

