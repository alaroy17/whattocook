/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google OAuth Client ID, вшиваемый в сборку. Задаётся переменной репозитория
   * GOOGLE_CLIENT_ID и подставляется workflow. Не секрет: доступ ограничен
   * списком Authorized JavaScript origins в Google Cloud.
   */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
