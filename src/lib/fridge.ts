import type { Database } from '../types'
import { alive } from './db'
import { diffDays, today } from './date'

/** Когда список продуктов дома трогали в последний раз. */
export function fridgeUpdatedAt(db: Database): string | null {
  let latest = db.settings.fridgeReviewedAt ?? null
  for (const product of alive(db.products)) {
    if (product.stockUpdatedAt && (!latest || product.stockUpdatedAt > latest)) {
      latest = product.stockUpdatedAt
    }
  }
  return latest
}

export function fridgeStaleDays(db: Database): number | null {
  const at = fridgeUpdatedAt(db)
  if (!at) return null
  return Math.max(0, diffDays(at.slice(0, 10), today()))
}

/** Пора ли напомнить, что список холодильника устарел. */
export function fridgeNeedsReview(db: Database): boolean {
  const remind = db.settings.fridgeRemindDays
  if (!remind) return false
  if (alive(db.products).length === 0) return false
  const stale = fridgeStaleDays(db)
  return stale == null || stale >= remind
}
