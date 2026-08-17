import { useEffect, useState } from 'react'
import * as drive from './drive'
import { uid } from './util'

const CACHE_NAME = 'wtc-photos-v1'
const MAX_SIDE = 1200
const QUALITY = 0.82

/** Уменьшает фото перед загрузкой: с телефона снимок весит мегабайты, нам хватит 1200 px. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  return blob ?? file
}

function cacheKey(photoId: string): string {
  return `https://wtc.local/photo/${photoId}`
}

async function readCache(photoId: string): Promise<Blob | null> {
  if (!('caches' in window)) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(cacheKey(photoId))
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

async function writeCache(photoId: string, blob: Blob): Promise<void> {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(cacheKey(photoId), new Response(blob))
  } catch {
    /* кэш не критичен */
  }
}

/*
 * Офлайн-очередь. Без сети фото получает временный идентификатор pending-…,
 * снимок лежит в кэше, а после успешной синхронизации загружается на Диск,
 * и записи в базе переключаются на настоящий идентификатор.
 */
const PENDING_PREFIX = 'pending-'
const PENDING_KEY = 'wtc.photos.pending'

export interface PendingPhoto {
  id: string
  /**
   * К какому рецепту снимок относится. Нужно на случай, когда второй человек
   * успел отредактировать рецепт, пока мы были офлайн: его правка побеждает
   * по свежести и вытесняет pending-ссылку из рецепта — без recipeId загруженное
   * фото было бы не к чему прикрепить и оно молча пропадало.
   */
  recipeId: string | null
}

export function isPendingPhoto(photoId: string | undefined | null): boolean {
  return Boolean(photoId?.startsWith(PENDING_PREFIX))
}

export function listPendingPhotos(): PendingPhoto[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .map((item): PendingPhoto | null => {
        // Старый формат — просто строки идентификаторов.
        if (typeof item === 'string') return { id: item, recipeId: null }
        if (item && typeof item === 'object' && typeof (item as PendingPhoto).id === 'string') {
          const recipeId = (item as PendingPhoto).recipeId
          return { id: (item as PendingPhoto).id, recipeId: typeof recipeId === 'string' ? recipeId : null }
        }
        return null
      })
      .filter((item): item is PendingPhoto => item !== null)
  } catch {
    return []
  }
}

function savePending(items: PendingPhoto[]): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(items))
}

function removePending(photoId: string): void {
  savePending(listPendingPhotos().filter((item) => item.id !== photoId))
}

/** Дозаписывает привязку к рецепту, когда он стал известен (новый рецепт получил id при сохранении). */
export function bindPendingPhoto(photoId: string, recipeId: string): void {
  if (!isPendingPhoto(photoId)) return
  savePending(
    listPendingPhotos().map((item) => (item.id === photoId ? { ...item, recipeId } : item)),
  )
}

export async function readPhotoBlob(photoId: string): Promise<Blob | null> {
  return readCache(photoId)
}

/** Загружает отложенный снимок на Диск. Возвращает настоящий идентификатор. */
export async function uploadPendingPhoto(pendingId: string): Promise<string | null> {
  const blob = await readCache(pendingId)
  if (!blob) {
    // Кэш почистили — загружать нечего, забываем.
    removePending(pendingId)
    return null
  }
  const photoId = await drive.uploadPhoto(blob, `photo-${Date.now()}.jpg`)
  await writeCache(photoId, blob)
  await deleteCacheEntry(pendingId)
  removePending(pendingId)
  return photoId
}

export async function uploadRecipePhoto(
  file: File,
  replacing?: string,
  recipeId?: string,
): Promise<string> {
  const blob = await compressImage(file)

  let photoId: string
  if (drive.hasToken()) {
    try {
      photoId = await drive.uploadPhoto(blob, `photo-${Date.now()}.jpg`)
    } catch {
      // Сеть пропала на середине — откладываем, как и при офлайне.
      photoId = `${PENDING_PREFIX}${uid()}`
      savePending([...listPendingPhotos(), { id: photoId, recipeId: recipeId ?? null }])
    }
  } else {
    photoId = `${PENDING_PREFIX}${uid()}`
    savePending([...listPendingPhotos(), { id: photoId, recipeId: recipeId ?? null }])
  }

  await writeCache(photoId, blob)
  // Старый снимок иначе остался бы на Диске навсегда.
  if (replacing && replacing !== photoId) await discardPhoto(replacing)
  return photoId
}

/** Удаляет фотографию с Диска и из кэша. Ошибки игнорируем: файла могло уже не быть. */
export async function discardPhoto(photoId: string): Promise<void> {
  // В корзину Диска, а не насовсем: ошибочно заменённое фото можно вернуть руками.
  if (isPendingPhoto(photoId)) removePending(photoId)
  else await drive.trashFile(photoId).catch(() => {})
  await deleteCacheEntry(photoId)
}

async function deleteCacheEntry(photoId: string): Promise<void> {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(cacheKey(photoId))
  } catch {
    /* кэш не критичен */
  }
}

/** Отдаёт ссылку на фото: сначала из кэша (работает офлайн), затем из Drive. */
export function usePhoto(photoId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setUrl(null)
    if (!photoId) return

    const show = (blob: Blob) => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }

    void (async () => {
      const cached = await readCache(photoId)
      if (cached) {
        show(cached)
        return
      }
      // Отложенные снимки живут только в кэше — в Drive за ними идти рано.
      if (isPendingPhoto(photoId)) return
      if (!drive.hasToken()) return
      try {
        const blob = await drive.downloadPhoto(photoId)
        await writeCache(photoId, blob)
        show(blob)
      } catch {
        /* фото недоступно — покажем заглушку */
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoId])

  return url
}
