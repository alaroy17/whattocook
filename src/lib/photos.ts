import { useEffect, useState } from 'react'
import * as drive from './drive'

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

export async function uploadRecipePhoto(file: File, replacing?: string): Promise<string> {
  const blob = await compressImage(file)
  const photoId = await drive.uploadPhoto(blob, `photo-${Date.now()}.jpg`)
  await writeCache(photoId, blob)
  // Старый снимок иначе остался бы на Диске навсегда.
  if (replacing && replacing !== photoId) await discardPhoto(replacing)
  return photoId
}

/** Удаляет фотографию с Диска и из кэша. Ошибки игнорируем: файла могло уже не быть. */
export async function discardPhoto(photoId: string): Promise<void> {
  await drive.deleteFile(photoId).catch(() => {})
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
