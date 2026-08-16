/**
 * Работа с Google Drive напрямую через REST + Google Identity Services.
 * Никаких серверов: приложение статическое, токен живёт только в браузере.
 */

import { GOOGLE_CLIENT_ID } from '../config'

const CLIENT_ID_KEY = 'wtc.google.clientId'
const FILE_ID_KEY = 'wtc.google.fileId'
const ROOT_FOLDER_KEY = 'wtc.google.rootFolderId'
const PHOTO_FOLDER_KEY = 'wtc.google.photoFolderId'

/** Всё приложение живёт в одной папке на Диске, чтобы не мусорить в корне. */
export const APP_FOLDER_NAME = 'Что готовим'
export const PHOTO_FOLDER_NAME = 'Фото'
export const DB_FILE_NAME = 'what-to-cook.json'
const APP_TAG = 'what-to-cook'

/**
 * Нужен полный доступ к Drive, а не drive.file: под drive.file приложение видит только
 * те файлы, которые создало само у конкретного пользователя, и второй человек не смог бы
 * открыть общий файл базы и фотографии. Файл всё равно один и известен по appProperties.
 */
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string; hint?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void
            error_callback?: (error: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class DriveError extends Error {
  constructor(message: string, readonly needsInteraction = false) {
    super(message)
  }
}

/**
 * Client ID один на все устройства и приходит из сборки (см. src/config.ts).
 *
 * Раньше он лежал в localStorage, то есть в конкретном браузере: на телефоне
 * приложение вело себя так, будто Google вообще не настроен, и вводить его
 * приходилось заново на каждом устройстве.
 */
export function getClientId(): string {
  return GOOGLE_CLIENT_ID.trim()
}

// Значение из старых версий больше не используется — убираем, чтобы не путалось.
localStorage.removeItem(CLIENT_ID_KEY)

export function getSavedFileId(): string {
  return localStorage.getItem(FILE_ID_KEY) ?? ''
}

function setSavedFileId(id: string): void {
  localStorage.setItem(FILE_ID_KEY, id)
}

export function forgetFile(): void {
  localStorage.removeItem(FILE_ID_KEY)
  localStorage.removeItem(ROOT_FOLDER_KEY)
  localStorage.removeItem(PHOTO_FOLDER_KEY)
  localStorage.removeItem('wtc.google.historyFolderId')
}

let gisReady: Promise<void> | null = null

function waitForGis(): Promise<void> {
  if (gisReady) return gisReady
  gisReady = new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve()
      if (Date.now() - start > 15000) {
        return reject(new DriveError('Не загрузилась библиотека Google. Проверьте интернет.'))
      }
      setTimeout(tick, 100)
    }
    tick()
  })
  return gisReady
}

let tokenClient: TokenClient | null = null
let tokenClientFor = ''
let accessToken = ''
let expiresAt = 0
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null
/** Общий промис для параллельных запросов токена. */
let inFlight: Promise<string> | null = null

const TOKEN_KEY = 'wtc.google.token'
const EMAIL_KEY = 'wtc.google.email'

/** Почта, под которой входили, — для login_hint, чтобы Google не спрашивал «какой аккаунт?». */
export function getSavedEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY)
}

export function saveEmail(email: string): void {
  localStorage.setItem(EMAIL_KEY, email)
}

/**
 * Токен живёт в localStorage: установленное PWA убивает sessionStorage при каждом
 * запуске, и приложение просило вход заново, хотя токен ещё был действителен.
 */
function restoreToken(): void {
  try {
    const raw = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number }
    if (parsed.expiresAt > Date.now() + 30_000) {
      accessToken = parsed.token
      expiresAt = parsed.expiresAt
    }
  } catch {
    /* игнорируем */
  }
}
restoreToken()

function storeToken(token: string, expiresIn: number): void {
  accessToken = token
  expiresAt = Date.now() + expiresIn * 1000
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt }))
  } catch {
    /* игнорируем */
  }
}

export function hasToken(): boolean {
  return Boolean(accessToken) && expiresAt > Date.now() + 30_000
}

async function ensureTokenClient(): Promise<TokenClient> {
  const clientId = getClientId()
  if (!clientId) throw new DriveError('Не указан Google Client ID — заполните его в настройках.')
  await waitForGis()
  if (tokenClient && tokenClientFor === clientId) return tokenClient
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (response) => {
      const request = pending
      pending = null
      if (!request) return
      if (response.error || !response.access_token) {
        request.reject(new DriveError(response.error ?? 'Google не выдал доступ', true))
        return
      }
      storeToken(response.access_token, response.expires_in ?? 3600)
      request.resolve(response.access_token)
    },
    error_callback: (error) => {
      const request = pending
      pending = null
      request?.reject(new DriveError(error.message ?? 'Окно входа Google закрыто', true))
    },
  })
  tokenClientFor = clientId
  return tokenClient
}

/**
 * Получение токена.
 *
 * Всегда prompt: '' + login_hint с известной почтой: если человек залогинен в Google
 * и согласие уже давал, окно закрывается само за долю секунды — никакого выбора
 * аккаунта и «входа» глазами пользователя. Экран согласия Google показывает сам,
 * только когда его действительно не хватает. Раньше здесь стоял select_account,
 * и каждое переподключение выглядело как полноценный логин — это и был «бред».
 *
 * Параллельные вызовы разделяют один запрос.
 */
export async function getAccessToken(_interactive: boolean, promptMode: '' | 'select_account' = ''): Promise<string> {
  if (promptMode === '' && hasToken()) return accessToken
  const client = await ensureTokenClient()
  if (inFlight) return inFlight

  inFlight = new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    try {
      const hint = getSavedEmail()
      client.requestAccessToken({
        prompt: promptMode,
        ...(promptMode === '' && hint ? { hint } : {}),
      })
    } catch (error) {
      pending = null
      reject(error instanceof Error ? error : new DriveError(String(error), true))
    }
  })

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

/** Явная смена аккаунта — единственное место, где нужен выбор из списка. */
export function switchAccount(): Promise<string> {
  accessToken = ''
  expiresAt = 0
  localStorage.removeItem(TOKEN_KEY)
  return getAccessToken(true, 'select_account')
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY)
  const token = accessToken
  accessToken = ''
  expiresAt = 0
  sessionStorage.removeItem('wtc.google.token')
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token)
  }
}

async function api(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await getAccessToken(false)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`https://www.googleapis.com${path}`, { ...init, headers })
  if (response.status === 401 && retry) {
    accessToken = ''
    expiresAt = 0
    return api(path, init, false)
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new DriveError(`Google Drive ответил ${response.status}: ${text.slice(0, 200)}`)
  }
  return response
}

export interface UserInfo {
  email: string
}

export async function fetchUserInfo(): Promise<UserInfo> {
  const response = await api('/oauth2/v3/userinfo')
  const data = (await response.json()) as { email?: string }
  return { email: data.email ?? '' }
}

export interface DriveFileMeta {
  id: string
  name: string
  modifiedTime: string
  version?: string
  /** false — файл чужой, им с нами поделились. */
  ownedByMe?: boolean
}

/** Базы нет ни своей, ни расшаренной — приложение должно спросить, что делать. */
export class NoDatabaseError extends DriveError {
  constructor() {
    super('База не найдена')
  }
}

async function findAllByAppTag(kind: string, mimeType?: string): Promise<DriveFileMeta[]> {
  const clauses = [
    `appProperties has { key='app' and value='${APP_TAG}' }`,
    `appProperties has { key='kind' and value='${kind}' }`,
    'trashed=false',
  ]
  if (mimeType) clauses.push(`mimeType='${mimeType}'`)
  const query = encodeURIComponent(clauses.join(' and '))
  const response = await api(
    `/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,version,ownedByMe)&orderBy=modifiedTime desc&pageSize=20`,
  )
  const data = (await response.json()) as { files?: DriveFileMeta[] }
  return data.files ?? []
}

async function findByAppTag(kind: string, mimeType?: string): Promise<DriveFileMeta | null> {
  const found = await findAllByAppTag(kind, mimeType)
  // Общий файл важнее своего: если с нами поделились базой, работать надо с ней.
  return found.find((file) => file.ownedByMe === false) ?? found[0] ?? null
}

/** Файлы приложения, которыми с нами поделились (лежат в «Доступные мне»). */
async function findShared(kind: string, mimeType?: string): Promise<DriveFileMeta[]> {
  const clauses = [
    `appProperties has { key='app' and value='${APP_TAG}' }`,
    `appProperties has { key='kind' and value='${kind}' }`,
    'sharedWithMe',
    'trashed=false',
  ]
  if (mimeType) clauses.push(`mimeType='${mimeType}'`)
  const query = encodeURIComponent(clauses.join(' and '))
  const response = await api(
    `/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,version,ownedByMe)&pageSize=20`,
  )
  const data = (await response.json()) as { files?: DriveFileMeta[] }
  return data.files ?? []
}

export async function getFileMeta(fileId: string): Promise<DriveFileMeta> {
  const response = await api(
    `/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,version`,
  )
  return (await response.json()) as DriveFileMeta
}

/** Создаёт папку и запоминает её id. */
async function createFolder(name: string, kind: string, parent?: string): Promise<string> {
  const response = await api('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parent ? { parents: [parent] } : {}),
      appProperties: { app: APP_TAG, kind },
    }),
  })
  const data = (await response.json()) as { id: string }
  return data.id
}

/**
 * Папка приложения на Диске. У второго пользователя своя не создаётся:
 * поиск по appProperties находит папку, которой с ним поделились.
 */
export async function resolveAppFolder(): Promise<string> {
  const saved = localStorage.getItem(ROOT_FOLDER_KEY)
  if (saved) return saved
  const found = (await findByAppTag('root', FOLDER_MIME)) ?? (await findFolderByName(APP_FOLDER_NAME))
  const id = found ? found.id : await createFolder(APP_FOLDER_NAME, 'root')
  localStorage.setItem(ROOT_FOLDER_KEY, id)
  return id
}

/**
 * Находит файл базы: свой или тот, которым с нами поделились.
 *
 * Молча создавать новый нельзя: если второй человек подключится раньше, чем примет
 * приглашение, у него появится собственная база — и две половины истории никогда
 * не сойдутся. Поэтому при отсутствии файла бросаем NoDatabaseError, а решение
 * (создать свою или подождать доступ) принимает пользователь.
 */
export async function resolveDbFile(): Promise<DriveFileMeta> {
  const saved = getSavedFileId()
  if (saved) {
    try {
      return await getFileMeta(saved)
    } catch {
      forgetFile()
    }
  }
  const found =
    (await findByAppTag('db')) ??
    (await findShared('db'))[0] ??
    (await findByName(DB_FILE_NAME))
  if (found) {
    setSavedFileId(found.id)
    return found
  }
  throw new NoDatabaseError()
}

/** Явное создание базы — вызывается только после подтверждения пользователем. */
export async function createDbFile(initialContent: string): Promise<DriveFileMeta> {
  const created = await createJsonFile(DB_FILE_NAME, initialContent, await resolveAppFolder())
  setSavedFileId(created.id)
  return created
}

async function findByName(name: string, mimeType?: string): Promise<DriveFileMeta | null> {
  const clauses = [`name='${name}'`, 'trashed=false']
  if (mimeType) clauses.push(`mimeType='${mimeType}'`)
  const query = encodeURIComponent(clauses.join(' and '))
  const response = await api(
    `/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,version)&orderBy=modifiedTime desc&pageSize=10`,
  )
  const data = (await response.json()) as { files?: DriveFileMeta[] }
  return data.files?.[0] ?? null
}

function findFolderByName(name: string): Promise<DriveFileMeta | null> {
  return findByName(name, FOLDER_MIME)
}

function multipartBody(metadata: object, contentType: string, body: Blob | string) {
  const boundary = `wtc${Math.random().toString(36).slice(2)}`
  const parts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
  ]
  const blob = new Blob([parts[0], parts[1], body, `\r\n--${boundary}--\r\n`], {
    type: `multipart/related; boundary=${boundary}`,
  })
  return blob
}

async function createJsonFile(name: string, content: string, parent: string): Promise<DriveFileMeta> {
  const body = multipartBody(
    {
      name,
      mimeType: 'application/json',
      parents: [parent],
      appProperties: { app: APP_TAG, kind: 'db' },
    },
    'application/json',
    content,
  )
  const response = await api(
    '/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,version',
    { method: 'POST', body },
  )
  return (await response.json()) as DriveFileMeta
}

export async function downloadJson(fileId: string): Promise<unknown> {
  const response = await api(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text)
}

export async function uploadJson(fileId: string, content: string): Promise<DriveFileMeta> {
  const response = await api(
    `/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,modifiedTime,version`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content },
  )
  return (await response.json()) as DriveFileMeta
}

/** Подпапка для фотографий внутри папки приложения. */
async function resolvePhotoFolder(): Promise<string> {
  const saved = localStorage.getItem(PHOTO_FOLDER_KEY)
  if (saved) return saved
  const found = await findByAppTag('photos', FOLDER_MIME)
  const id = found ? found.id : await createFolder(PHOTO_FOLDER_NAME, 'photos', await resolveAppFolder())
  localStorage.setItem(PHOTO_FOLDER_KEY, id)
  return id
}

export async function uploadPhoto(blob: Blob, name: string): Promise<string> {
  const parent = await resolvePhotoFolder()
  const body = multipartBody(
    { name, parents: [parent], appProperties: { app: APP_TAG, kind: 'photo' } },
    blob.type || 'image/jpeg',
    blob,
  )
  const response = await api('/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    body,
  })
  const data = (await response.json()) as { id: string }
  return data.id
}

export async function downloadPhoto(fileId: string): Promise<Blob> {
  const response = await api(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
  return response.blob()
}

export async function deleteFile(fileId: string): Promise<void> {
  await api(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
}

/** Подпапка с автоматическими копиями базы. */
export const HISTORY_FOLDER_NAME = 'История'
const HISTORY_FOLDER_KEY = 'wtc.google.historyFolderId'

async function resolveHistoryFolder(): Promise<string> {
  const saved = localStorage.getItem(HISTORY_FOLDER_KEY)
  if (saved) return saved
  const found = await findByAppTag('history', FOLDER_MIME)
  const id = found ? found.id : await createFolder(HISTORY_FOLDER_NAME, 'history', await resolveAppFolder())
  localStorage.setItem(HISTORY_FOLDER_KEY, id)
  return id
}

export interface SnapshotMeta {
  id: string
  name: string
  /** Дата, за которую сделана копия (YYYY-MM-DD). */
  date: string
  modifiedTime: string
  recipes: number
  entries: number
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const clauses = [
    `appProperties has { key='app' and value='${APP_TAG}' }`,
    `appProperties has { key='kind' and value='snapshot' }`,
    'trashed=false',
  ]
  const query = encodeURIComponent(clauses.join(' and '))
  const response = await api(
    `/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,appProperties)&orderBy=name desc&pageSize=100`,
  )
  const data = (await response.json()) as {
    files?: { id: string; name: string; modifiedTime: string; appProperties?: Record<string, string> }[]
  }
  return (data.files ?? []).map((file) => ({
    id: file.id,
    name: file.name,
    date: file.appProperties?.date ?? file.name.replace(/\D+/g, '').slice(0, 8),
    modifiedTime: file.modifiedTime,
    recipes: Number(file.appProperties?.recipes ?? 0),
    entries: Number(file.appProperties?.entries ?? 0),
  }))
}

export async function createSnapshot(
  date: string,
  content: string,
  counts: { recipes: number; entries: number },
): Promise<void> {
  const parent = await resolveHistoryFolder()
  const body = multipartBody(
    {
      name: `${date}.json`,
      parents: [parent],
      mimeType: 'application/json',
      appProperties: {
        app: APP_TAG,
        kind: 'snapshot',
        date,
        recipes: String(counts.recipes),
        entries: String(counts.entries),
      },
    },
    'application/json',
    content,
  )
  await api('/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body })
}

/**
 * Открыть доступ второму человеку. Делимся папкой целиком — база и фотографии
 * лежат внутри, так что отдельно раздавать права на них не нужно.
 */
export async function shareWith(email: string): Promise<void> {
  const folder = await resolveAppFolder()
  const targets = new Set<string>([folder])
  // Если файл базы почему-то оказался вне папки (например, остался от ранней версии) — делимся и им.
  const dbId = getSavedFileId()
  if (dbId) {
    const parents = await getParents(dbId)
    if (!parents.includes(folder)) targets.add(dbId)
  }
  for (const fileId of targets) {
    await api(
      `/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email.trim() }),
      },
    )
  }
}

async function getParents(fileId: string): Promise<string[]> {
  try {
    const response = await api(`/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents`)
    const data = (await response.json()) as { parents?: string[] }
    return data.parents ?? []
  } catch {
    return []
  }
}
