import type { Database, Syncable } from '../types'
import { alive, normalizeDatabase, serialize } from './db'
import { today } from './date'
import * as drive from './drive'
import { nowIso } from './util'

/** Сколько ежедневных копий держим на Диске. */
const KEEP = 30

const COLLECTIONS = ['recipes', 'entries', 'products', 'comments'] as const

/**
 * Раз в сутки складывает копию базы в папку «История» на Диске.
 * Ничего не спрашивает и ничего не качает на устройство — просто ещё один файл рядом.
 */
export async function ensureDailySnapshot(db: Database): Promise<void> {
  const date = today()
  const existing = await drive.listSnapshots()
  if (existing.some((snapshot) => snapshot.date === date)) return

  await drive.createSnapshot(date, serialize(db), {
    recipes: alive(db.recipes).length,
    entries: alive(db.entries).length,
  })

  // Старые копии убираем, чтобы папка не росла бесконечно.
  const stale = [...existing, { date, id: '' }]
    .filter((snapshot) => snapshot.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(KEEP)
  for (const snapshot of stale) {
    await drive.deleteFile(snapshot.id).catch(() => {})
  }
}

export function listSnapshots(): Promise<drive.SnapshotMeta[]> {
  return drive.listSnapshots()
}

/**
 * Накладывает копию поверх текущей базы: всё, что было в копии, возвращается
 * (в том числе удалённое после неё), а записи, появившиеся позже, остаются на месте.
 * Так восстановление никогда ничего не теряет.
 */
export async function restoreSnapshot(snapshotId: string, current: Database): Promise<Database> {
  const raw = await drive.downloadJson(snapshotId)
  const snapshot = normalizeDatabase(raw)
  const at = nowIso()

  const result: Database = {
    ...current,
    recipes: { ...current.recipes },
    entries: { ...current.entries },
    products: { ...current.products },
    comments: { ...current.comments },
  }

  for (const name of COLLECTIONS) {
    const target = result[name] as Record<string, Syncable>
    const source = snapshot[name] as Record<string, Syncable>
    for (const [id, item] of Object.entries(source)) {
      // Метку времени обновляем, иначе слияние сочтёт восстановленную версию устаревшей.
      const restored: Syncable = { ...item, updatedAt: at }
      if (!item.deletedAt) delete restored.deletedAt
      target[id] = restored
    }
  }

  return result
}
