import { getD1 } from "@/lib/d1";

export async function isMaintenanceMode() {
  const db = getD1();
  const row = await db
    .prepare(`SELECT is_maintenance as isMaintenance FROM settings WHERE key = 'global'`)
    .first<{ isMaintenance: number }>();
  return Boolean(row?.isMaintenance ?? 0);
}

