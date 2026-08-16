/** Работа с датами в формате YYYY-MM-DD (локальная дата, без часовых поясов). */

export type IsoDate = string

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromIsoDate(value: IsoDate): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function today(): IsoDate {
  return toIsoDate(new Date())
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const date = fromIsoDate(value)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

export function diffDays(from: IsoDate, to: IsoDate): number {
  const ms = fromIsoDate(to).getTime() - fromIsoDate(from).getTime()
  return Math.round(ms / 86400000)
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(value: IsoDate): IsoDate {
  const date = fromIsoDate(value)
  const shift = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - shift)
  return toIsoDate(date)
}

export function startOfMonth(value: IsoDate): IsoDate {
  const date = fromIsoDate(value)
  date.setDate(1)
  return toIsoDate(date)
}

export function endOfMonth(value: IsoDate): IsoDate {
  const date = fromIsoDate(value)
  date.setMonth(date.getMonth() + 1, 0)
  return toIsoDate(date)
}

export function addMonths(value: IsoDate, months: number): IsoDate {
  const date = fromIsoDate(value)
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  return toIsoDate(date)
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const MONTHS_NOM = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function formatDate(value: IsoDate, options: { weekday?: boolean; year?: boolean } = {}): string {
  const date = fromIsoDate(value)
  let text = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  if (options.year) text += ` ${date.getFullYear()}`
  if (options.weekday) text += `, ${WEEKDAYS[date.getDay()]}`
  return text
}

export function formatMonth(value: IsoDate): string {
  const date = fromIsoDate(value)
  return `${MONTHS_NOM[date.getMonth()]} ${date.getFullYear()}`
}

export function formatDateShort(value: IsoDate): string {
  const date = fromIsoDate(value)
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** «Сегодня» / «Вчера» / «Завтра» / дата. */
export function formatRelativeDay(value: IsoDate): string {
  const delta = diffDays(today(), value)
  if (delta === 0) return 'Сегодня'
  if (delta === -1) return 'Вчера'
  if (delta === 1) return 'Завтра'
  if (delta === -2) return 'Позавчера'
  return formatDate(value)
}

export function isWeekend(value: IsoDate): boolean {
  const day = fromIsoDate(value).getDay()
  return day === 0 || day === 6
}

/** Массив дат от from до to включительно. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const result: IsoDate[] = []
  let cursor = from
  let guard = 0
  while (cursor <= to && guard++ < 1000) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}
