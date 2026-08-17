import type { Database, Syncable } from '../types'
import { alive, normalizeDatabase, serialize } from './db'
import { today } from './date'
import * as drive from './drive'
import { removeSeedArtifacts } from './seed'
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

  /*
   * Два телефона могли пройти проверку одновременно и создать по копии за один день.
   * Схлопываем детерминированно: выживает копия с меньшим id, лишние удаляются —
   * оба устройства придут к одному и тому же набору.
   */
  const after = await drive.listSnapshots().catch(() => [] as drive.SnapshotMeta[])
  const byDate = new Map<string, drive.SnapshotMeta[]>()
  for (const snapshot of after) {
    const list = byDate.get(snapshot.date) ?? []
    list.push(snapshot)
    byDate.set(snapshot.date, list)
  }
  for (const list of byDate.values()) {
    if (list.length < 2) continue
    const extras = [...list].sort((a, b) => a.id.localeCompare(b.id)).slice(1)
    for (const extra of extras) await drive.deleteFile(extra.id).catch(() => {})
  }

  // Старые копии убираем, чтобы папка не росла бесконечно.
  const kept = [...byDate.keys()].sort().reverse()
  for (const oldDate of kept.slice(KEEP)) {
    for (const snapshot of byDate.get(oldDate) ?? []) {
      await drive.deleteFile(snapshot.id).catch(() => {})
    }
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
  // Старые копии несут выдуманную сидом историю и оценки — вычищаем ДО наложения:
  // внутри копии отпечаток сида ещё цел, а после восстановления он бы потерялся.
  const snapshot = removeSeedArtifacts(normalizeDatabase(raw))
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
