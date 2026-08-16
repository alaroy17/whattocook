// Генерация PNG-иконок приложения без внешних зависимостей.
// Рисуем в буфер RGBA с 4-кратным суперсэмплингом и кодируем PNG вручную (zlib из Node).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const ACCENT = [0xc1, 0x61, 0x3f, 0xff]
const CREAM = [0xfa, 0xf7, 0xf2, 0xff]

/** Простой холст RGBA. */
function createCanvas(size) {
  return { size, data: new Uint8Array(size * size * 4) }
}

function blend(canvas, x, y, color, alpha) {
  if (alpha <= 0) return
  const i = (y * canvas.size + x) * 4
  const a = Math.min(1, alpha)
  for (let c = 0; c < 3; c++) {
    canvas.data[i + c] = Math.round(canvas.data[i + c] * (1 - a) + color[c] * a)
  }
  canvas.data[i + 3] = Math.round(canvas.data[i + 3] * (1 - a) + 255 * a)
}

/** Заливка по функции «принадлежит ли точка фигуре». */
function fill(canvas, color, inside) {
  for (let y = 0; y < canvas.size; y++) {
    for (let x = 0; x < canvas.size; x++) {
      if (inside(x + 0.5, y + 0.5)) blend(canvas, x, y, color, 1)
    }
  }
}

/** Прямоугольник со скруглениями: радиусы сверху и снизу задаются отдельно. */
function roundRect(x0, y0, x1, y1, rTop, rBottom) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const corners = [
      [x0 + rTop, y0 + rTop, rTop],
      [x1 - rTop, y0 + rTop, rTop],
      [x0 + rBottom, y1 - rBottom, rBottom],
      [x1 - rBottom, y1 - rBottom, rBottom],
    ]
    for (const [cx, cy, r] of corners) {
      if (r <= 0) continue
      const outX = (x < cx && cx === x0 + r) || (x > cx && cx === x1 - r)
      const outY = (y < cy && cy === y0 + r) || (y > cy && cy === y1 - r)
      if (outX && outY) return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    }
    return true
  }
}

function circle(cx, cy, r) {
  return (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** Кастрюля: корпус, крышка, ручка на крышке и две боковые ручки. */
function drawIcon(canvas, { inset = 0, bgRadius = 0.22 } = {}) {
  const S = canvas.size
  const u = (v) => (inset + v * (1 - inset * 2)) * S

  fill(canvas, ACCENT, roundRect(0, 0, S, S, bgRadius * S, bgRadius * S))

  // боковые ручки
  fill(canvas, CREAM, roundRect(u(0.145), u(0.485), u(0.275), u(0.565), u(0.04) - u(0), u(0.04) - u(0)))
  fill(canvas, CREAM, roundRect(u(0.725), u(0.485), u(0.855), u(0.565), u(0.04) - u(0), u(0.04) - u(0)))
  // корпус
  fill(canvas, CREAM, roundRect(u(0.235), u(0.44), u(0.765), u(0.775), u(0.02) - u(0), u(0.1) - u(0)))
  // крышка
  fill(canvas, CREAM, roundRect(u(0.185), u(0.352), u(0.815), u(0.422), u(0.025) - u(0), u(0.025) - u(0)))
  // ручка крышки
  fill(canvas, CREAM, circle(u(0.5), u(0.315), u(0.055) - u(0)))
  // «пар» — прорези в корпусе, чтобы форма читалась
  fill(canvas, ACCENT, roundRect(u(0.335), u(0.56), u(0.665), u(0.6), u(0.02) - u(0), u(0.02) - u(0)))
  fill(canvas, ACCENT, roundRect(u(0.335), u(0.645), u(0.545), u(0.685), u(0.02) - u(0), u(0.02) - u(0)))
}

/** Уменьшение с усреднением (антиалиасинг). */
function downsample(src, factor) {
  const size = src.size / factor
  const out = createCanvas(size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * src.size + (x * factor + dx)) * 4
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]
        }
      }
      const n = factor * factor
      const o = (y * size + x) * 4
      out.data[o] = Math.round(r / n)
      out.data[o + 1] = Math.round(g / n)
      out.data[o + 2] = Math.round(b / n)
      out.data[o + 3] = Math.round(a / n)
    }
  }
  return out
}

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })())
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(canvas) {
  const { size, data } = canvas
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(data.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8      // бит на канал
  ihdr[9] = 6      // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function render(size, options) {
  const factor = size <= 64 ? 8 : 4
  const big = createCanvas(size * factor)
  drawIcon(big, options)
  return encodePng(downsample(big, factor))
}

mkdirSync(OUT_DIR, { recursive: true })
const files = [
  ['icon-32.png', 32, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['apple-touch-icon.png', 180, { bgRadius: 0 }],
  ['maskable-512.png', 512, { inset: 0.12, bgRadius: 0 }],
]
for (const [name, size, options] of files) {
  writeFileSync(resolve(OUT_DIR, name), render(size, options))
  console.log('icons:', name)
}
