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
const LAST_SNAPSHOT_KEY = 'wtc.snapshot.lastDate'

export async function ensureDailySnapshot(db: Database): Promise<void> {
  const date = today()
  // Синхронизация случается после каждой правки — не дёргаем Drive без нужды.
  if (localStorage.getItem(LAST_SNAPSHOT_KEY) === date) return

  const existing = await drive.listSnapshots()
  if (existing.some((snapshot) => snapshot.date === date)) {
    localStorage.setItem(LAST_SNAPSHOT_KEY, date)
    return
  }

  await drive.createSnapshot(date, serialize(db), {
    recipes: alive(db.recipes).length,
    entries: alive(db.entries).length,
  })
  localStorage.setItem(LAST_SNAPSHOT_KEY, date)

  // Старые копии убираем, чтобы папка не росла бесконечно. Только что созданная
  // тоже занимает слот, поэтому от прежних оставляем на одну меньше.
  const stale = existing.sort((a, b) => b.date.localeCompare(a.date)).slice(KEEP - 1)
  for (const snapshot of stale) {
    await drive.deleteFile(snapshot.id).catch(() => {})
  }
}

export function listSnapshots(): Promise<drive.SnapshotMeta[]> {
  return drive.listSnapshots()
}

export interface RestoreResult {
  db: Database
  /** Сколько записей вернулось из копии. */
  restored: number
}

/**
 * Мягкое восстановление: возвращает то, что было в копии и потерялось потом,
 * и не трогает всё остальное.
 *
 * Правила:
 *  - записи из копии, которых сейчас нет или которые лежат в корзине, возвращаются;
 *  - записи, отредактированные ПОСЛЕ даты копии, остаются в текущем виде — иначе
 *    восстановление молча откатывало бы свежие правки;
 *  - надгробия из копии не переносятся, иначе повторно удалялось бы то,
 *    что уже вернули из корзины;
 *  - настройки не трогаем совсем: тема и разделы к содержимому отношения не имеют.
 */
export async function restoreSnapshot(snapshotId: string, current: Database): Promise<RestoreResult> {
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
  let restored = 0

  for (const name of COLLECTIONS) {
    const target = result[name] as Record<string, Syncable>
    const source = snapshot[name] as Record<string, Syncable>
    for (const [id, item] of Object.entries(source)) {
      if (item.deletedAt) continue

      const existing = target[id]
      // Запись живёт и её правили не раньше копии — свежая версия важнее.
      if (existing && !existing.deletedAt && existing.updatedAt >= item.updatedAt) continue

      // Метку времени обновляем, иначе слияние сочтёт восстановленную версию устаревшей.
      const revived: Syncable = { ...item, updatedAt: at }
      delete revived.deletedAt
      target[id] = revived
      restored++
    }
  }

  return { db: result, restored }
}
