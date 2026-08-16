/** Мелкие утилиты общего назначения. */

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return prefix + rnd
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Нормализация названия продукта: по ней связываем ингредиенты рецептов с каталогом цен. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')
}

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatMoney(value: number | null | undefined, currency = '₽'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  return `${rounded.toLocaleString('ru-RU')} ${currency}`
}

export function formatQty(qty: number | null | undefined): string {
  if (qty == null || !Number.isFinite(qty)) return ''
  const rounded = Math.round(qty * 100) / 100
  return rounded.toLocaleString('ru-RU')
}

/** «3 дня», «21 день», «5 дней» */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function daysWord(n: number): string {
  return `${n} ${pluralRu(n, ['день', 'дня', 'дней'])}`
}

export function timesWord(n: number): string {
  return `${n} ${pluralRu(n, ['раз', 'раза', 'раз'])}`
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => timer && clearTimeout(timer)
  return wrapped
}
