/**
 * VỊ TRÍ   — threejs-modules/site/terrain.ts  (site-kit)
 * VAI TRÒ  — HEIGHT-FIELD lồi-lõm cho sân vườn: 1 NGUỒN cao-độ `heightAt(hf, x, z)` (mét) =
 *            mask · (FBM noise nền + Σ gò nặn-tay). mask = 0 ở pad nhà / quanh hồ / viền lô (smoothstep →1
 *            ở garden) ⇒ móng/hồ/rào/lot-edge GIỮ PHẲNG → Phase 1 không đụng building-kit/hồ/rào.
 * LIÊN HỆ  — Dùng bởi griddedGroundGeometry (displace lưới base ground) + buildSiteGrass (cỏ bám gò, Phase 2).
 *            Mirror shapes.ts: PURE, không GPU. Đổi 1 chỗ này = mọi consumer theo cùng địa hình.
 *
 * CÁCH DÙNG: const hf = makeHeightField(terrain, maskRects, lotHalfW, lotHalfD); const y = heightAt(hf, x, z)
 * DISPOSE: thuần hàm — không giữ GPU resource.
 */

import type { TerrainConfig } from './state'

// Rect (m, world XZ, có xoay) để mask về phẳng: footprint nhà (caller bơm) + bbox hồ (fromState dựng). Khớp
// structural với GrassExcludeRect (components/GrassBlades) → caller truyền thẳng, terrain.ts không import component.
export interface MaskRect {
  cx: number
  cz: number
  halfW: number
  halfD: number
  rot: number
}

// Gói height-field đã precompute (build 1 lần/rebuild rồi sample nhiều vạn lần) — né dựng lại maskRects mỗi vertex.
export interface HeightField {
  t: TerrainConfig
  maskRects: MaskRect[] // pad nhà + hồ (m, world)
  lotHalfW: number // m — nửa bề ngang lô (cho viền-phẳng)
  lotHalfD: number // m — nửa chiều sâu lô
}

export function makeHeightField(
  t: TerrainConfig,
  maskRects: MaskRect[],
  lotHalfW: number,
  lotHalfD: number
): HeightField {
  return { t, maskRects, lotHalfW, lotHalfD }
}

// ── Noise (value-noise hash-based, seeded — KHÔNG dependency) ─────────────────────

// Hash 2 toạ độ nguyên + seed → [0,1). Bit-mix kiểu Wang/xorshift (>>>0 giữ unsigned 32-bit).
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 362437) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

function smoothstep01(t: number): number {
  return t * t * (3 - 2 * t)
}

// Value noise 2D ∈ [-1,1]: bilinear 4 góc lattice, nội suy smoothstep. Lattice cách nhau 1 đơn-vị (x đã ×freq).
function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const u = smoothstep01(fx)
  const v = smoothstep01(fz)
  const n00 = hash2(ix, iz, seed)
  const n10 = hash2(ix + 1, iz, seed)
  const n01 = hash2(ix, iz + 1, seed)
  const n11 = hash2(ix + 1, iz + 1, seed)
  const nx0 = n00 + (n10 - n00) * u
  const nx1 = n01 + (n11 - n01) * u
  return (nx0 + (nx1 - nx0) * v) * 2 - 1
}

// FBM ∈ [-1,1] (chuẩn-hoá ÷Σamp): cộng octave (freq ×lacunarity, amp ×gain mỗi lớp). warp>0 → domain-warp
// (méo miền bằng noise trước khi lấy mẫu) cho gò trông tự nhiên hơn, hết "lưới đều".
function fbm(t: TerrainConfig, x: number, z: number): number {
  let wx = x
  let wz = z
  if (t.warp > 0) {
    const f = t.frequency
    wx = x + t.warp * valueNoise2D(x * f + 11.3, z * f + 7.1, t.seed + 101)
    wz = z + t.warp * valueNoise2D(x * f + 5.9, z * f + 19.7, t.seed + 211)
  }
  let sum = 0
  let amp = 1
  let freq = t.frequency
  let norm = 0
  for (let o = 0; o < t.octaves; o++) {
    sum += amp * valueNoise2D(wx * freq, wz * freq, t.seed + o * 17)
    norm += amp
    freq *= t.lacunarity
    amp *= t.gain
  }
  return norm > 0 ? sum / norm : 0
}

// ── Mask về phẳng (pad/hồ/viền) ──────────────────────────────────────────────────

// Khoảng cách điểm → ngoài rect (có xoay), 0 nếu BÊN TRONG. smoothstep(0,margin) → 0 trong rect, 1 khi đủ xa.
function rectFalloff(x: number, z: number, r: MaskRect, marginM: number): number {
  const cos = Math.cos(-r.rot)
  const sin = Math.sin(-r.rot)
  const dx = x - r.cx
  const dz = z - r.cz
  const lx = Math.abs(dx * cos - dz * sin) - r.halfW
  const lz = Math.abs(dx * sin + dz * cos) - r.halfD
  const ex = Math.max(lx, 0)
  const ez = Math.max(lz, 0)
  const dist = Math.hypot(ex, ez)
  if (marginM <= 0) return dist > 0 ? 1 : 0
  return smoothstep01(Math.min(dist / marginM, 1))
}

// Viền lô phẳng: d = khoảng cách tới biên gần nhất (≥0 trong lô). smoothstep(0,band) → 0 ở mép, 1 vào trong.
function edgeFalloff(x: number, z: number, hw: number, hd: number, bandM: number): number {
  const d = Math.min(hw - Math.abs(x), hd - Math.abs(z))
  if (d <= 0) return 0
  if (bandM <= 0) return 1
  return smoothstep01(Math.min(d / bandM, 1))
}

// Mask tổng ∈ [0,1] tại (x,z): 0 = phẳng cứng (pad/hồ/mép), 1 = gò đầy đủ. min mọi nguồn (chỗ nào cần phẳng thắng).
export function groundHeightMask(hf: HeightField, x: number, z: number): number {
  const padM = hf.t.padMargin / 1000
  let m = edgeFalloff(x, z, hf.lotHalfW, hf.lotHalfD, hf.t.edgeFlat / 1000)
  for (const r of hf.maskRects) {
    if (m <= 0) return 0
    m = Math.min(m, rectFalloff(x, z, r, padM))
  }
  return m
}

// ── Gò nặn-tay (Phase 3 ghi terrain.mounds; Phase 1 mảng rỗng) ────────────────────

// Σ gò radial: mỗi gò = cao(mm) · bump(dist/radius). bump = (1−smoothstep) → đỉnh ở tâm, 0 ở rìa. falloff mềm rìa.
function moundsHeightMm(hf: HeightField, x: number, z: number): number {
  let sum = 0
  for (const md of hf.t.mounds) {
    const r = md.radius / 1000
    if (r <= 0) continue
    const dist = Math.hypot(x - md.x / 1000, z - md.z / 1000)
    if (dist >= r) continue
    const tt = dist / r
    const soft = md.falloff ?? 1
    // soft=1 → smoothstep mượt; soft→0 → đỉnh phẳng rộng (plateau) rồi rớt nhanh ở rìa.
    const edge = soft > 0 ? smoothstep01(Math.min(tt / soft, 1)) : tt < 1 ? 0 : 1
    sum += md.height * (1 - edge)
  }
  return sum
}

// ── API chính ────────────────────────────────────────────────────────────────────

// Cao-độ Δy (MÉT) tại (x,z) world. = mask · (amplitude·FBM + Σgò) ÷1000. terrain tắt → 0 (caller giữ path phẳng).
export function heightAt(hf: HeightField, x: number, z: number): number {
  if (!hf.t.enabled) return 0
  const mask = groundHeightMask(hf, x, z)
  if (mask <= 0) return 0
  const rawMm = hf.t.amplitude * fbm(hf.t, x, z) + moundsHeightMm(hf, x, z)
  return (mask * rawMm) / 1000
}
