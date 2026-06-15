/**
 * VỊ TRÍ   — threejs-modules/components/PondFish/index.ts
 * VAI TRÒ  — Đàn cá koi PROCEDURAL bơi trong LÒNG HỒ (bounds polygon thật — đụng vách quay lại, rải giữa
 *            mặt↔đáy theo gò; fallback vòng tròn nếu thiếu bounds) + bứt tốc ngẫu nhiên: thân low-poly tay (~131 tri/con,
 *            đơn vị thân dài 1 — scale per-con), đuôi vẫy = TSL vertex-bend sine chạy GPU (0 CPU/0 rig),
 *            màu koi trắng + mảng cam + đốm đen per-con (triNoise3D + hash(instanceIndex) — không texture),
 *            di chuyển = wander CPU rẻ (writes instanceMatrix, N ≤ 40, cả đàn 1 draw).
 * LIÊN HỆ  — components/ tự chứa (không import ../). Phase B ráp archplan: đặt mesh vào basin hồ
 *            (caller set position = tâm hồ, depthY chìm dưới mặt nước) + GUI. Industry: đàn cá realtime
 *            dùng vertex sine-bend, KHÔNG skeletal per-con (skinned chỉ đáng cho cá hero cận cảnh).
 *            Vertex-bend theo bài KI-003: positionLocal.add(...) — GIỮ instanceMatrix, không replace.
 *
 * CÁCH DÙNG: const f = new PondFish({ count: 8, areaRadius: 1.6 })
 *            scene.add(f.getMesh()); mesh.position.set(tâm hồ)   // mỗi frame: f.update(dt)
 * DISPOSE: dispose() giải phóng geometry + material + gỡ mesh khỏi parent.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  attribute,
  float,
  hash,
  instanceIndex,
  mix,
  positionGeometry,
  positionLocal,
  smoothstep,
  step,
  triNoise3D,
  uniform,
  uniformArray,
  vec3,
} from 'three/tsl'
import { MeshLambertNodeMaterial } from 'three/webgpu'

type TSLNode = ShaderNodeObject<Node>

export interface PondFishOptions {
  /** Số cá trong đàn (cap 64 — budget; bậc thấp đông). Đổi count = tạo instance mới. Default: 8 */
  count?: number
  /** Bán kính vùng bơi (m, quanh gốc mesh). Default: 1.6 */
  areaRadius?: number
  /** Cao độ bơi so với gốc mesh (m, ÂM = chìm dưới). Default: -0.25 */
  depthY?: number
  /** Chiều dài cá (m) — per-con biến hoá ±20%. Default: 0.28 */
  fishLength?: number
  /** Tốc độ bơi gốc (m/s) — per-con biến hoá. Default: 0.25 */
  speed?: number
  /** Đổi seed → xáo bộ mảng màu cam/đốm đen cả đàn. Default: 0 */
  colorSeed?: number
  /** 🐟 Bề DÀY bơi ĐỨNG (m) — cá rải trong khối trụ radius×swimDepth (không còn đĩa phẳng). Default: 0 (1 mặt) */
  swimDepth?: number
  /** 🐟 Độ MẬP thân (×profile bán kính) — 1 = gốc; <1 thon, >1 mập. Default: 1 */
  bodyWidth?: number
  /** 🎢 NGHIÊNG thân vào cua (bank, ×) — 0 = không nghiêng, cao = lượn nghiêng rõ (đẹp khi zic-zac). Default: 1 */
  bankAmp?: number
  /** 🎢 CHÚI mũi khi lặn/ngoi (pitch, ×) — 0 = thân luôn ngang, cao = chúi rõ khi đổi tầng sâu. Default: 1 */
  pitchAmp?: number
  /** 🎨 Màu NỀN thân (hex). Default: kem 0xeee8db */
  baseColor?: number
  /** 🎨 Màu MẢNG (hex — koi cam). Default: 0xe36112 */
  patchColor?: number
  /** 🎨 Màu ĐỐM (hex — đốm đậm). Default: 0x141312 */
  spotColor?: number
  /** 🎨 Tỉ lệ MẢNG màu 0..1 (cao = nhiều mảng cam, thấp = nhiều nền). Default: 0.5 */
  patchAmount?: number
  /** 🐟 Biên độ LƯỢN chữ S (×) — 0 = bơi thẳng, cao = uốn mạnh. Default: 1 */
  swayAmp?: number
  /** 🐟 Độ LĂNG XĂNG (× random dart) — thấp = điềm tĩnh, cao = đổi hướng bất chợt. Default: 1 */
  wanderAmp?: number
  /** 🐟 NHẤP NHÔ dọc (× biên ±3cm) — 0 = phẳng, cao = trồi sụt. Default: 1 */
  bobAmp?: number
  /** 🐟 Tần suất BỨT TỐC ngẫu nhiên (0..1; 0 = tắt) — vài con phóng vọt rồi khựng. Default: 0 */
  burstRate?: number
  /** 🐟 BƠI THEO ĐÀN (boids cohesion+alignment) — true = tụm cụm + bơi đồng hướng. Pond ít con → Default: false */
  schooling?: boolean
  /** 🍽 MÒ ĂN (forage) — đói thì sinh điểm thức-ăn nổi mặt, cá tới ăn → satiation tự hồi. Default: false */
  forage?: boolean
  /** 🍽 Số viên mỗi lần rải (rải tay/click/auto). Default: 10 */
  foodCount?: number
  /** 🍽 Giãn cách RƠI giữa các viên (s) — nhỏ = rơi dồn nhanh, lớn = thưa. Default: 0.12 */
  foodDrop?: number
  /** 🍽 Độ rộng vùng toả viên quanh điểm rải (m). Default: 0.7 */
  foodSpread?: number
  /** 🐟 Độ NO (0..1): 1 = no/bơi thường; 0 = đói lả → CHẾT phơi bụng (trôi dưới mặt, behavior off). Default: 1 */
  satiation?: number
  /** 🐟 VÙNG BƠI = lòng hồ THẬT (polygon local + mặt nước + đáy theo gò). Có → cá bám hình hồ, đụng vách
   *  quay lại, rải giữa mặt↔đáy; thiếu → vòng tròn areaRadius + swimDepth (như cũ). */
  bounds?: PondBounds
  /** 🐟 BẬC (tier 1..6) — Phase 1 chỉ LƯU + getTier() (predation lớn-ăn-bé = Phase 3). Default: 4 */
  tier?: number
  /** 🐟 "Chỗ đã chiếm" CHUNG hồ (local {x,z,r}) — spawn né trùng CẢ ĐÀN KHÁC. Caller (buildFishSchools) tạo 1 mảng/
   *  hồ, mỗi đàn đọc + ĐẨY claim của mình vào → đàn sau né đàn trước. Thiếu → chỉ né trong đàn này. */
  occupied?: SpawnClaim[]
}

// 🐟 1 "chỗ đã chiếm" lúc spawn: tâm (local) + bán kính thân (½ chiều dài) → cá mới giữ khoảng ≥ r_a+r_b (không chồng).
export interface SpawnClaim {
  x: number
  z: number
  r: number
}

// 🐟 VÙNG BƠI = lòng hồ thật (thay vòng tròn): polygon LOCAL (m, so gốc mesh = tâm hồ tại MẶT nền) + cao độ
// mặt nước (đỉnh khối) + closure cao độ đáy theo (x,z) (đáy gò). Caller (site-kit render/water) dựng từ WaterConfig.
export interface PondBounds {
  polygon: { x: number; z: number }[] // đỉnh LOCAL (m) — cá đụng cạnh quay lại, không xuyên
  surfaceY: number // m (local) — cao độ MẶT NƯỚC = đỉnh khối bơi
  floorYAt: (x: number, z: number) => number // m (local) — cao độ ĐÁY tại điểm (bám gò lồi lõm)
}

// Trạng thái wander 1 con (CPU) — toạ độ LOCAL quanh gốc mesh.
interface FishState {
  x: number
  z: number
  heading: number // rad — hướng bơi; forward local = +X, dir world = (cos h, 0, -sin h)
  wander: number // rad/s — tốc quay hiện tại (random walk có kẹp)
  swayF: number // rad/s — tần lượn chữ S per-con (cá không bao giờ bơi thẳng)
  speed: number // hệ số per-con × speed gốc
  size: number // hệ số per-con × fishLength
  bob: number // pha nhấp nhô dọc Y + pha lượn/tốc
  yFrac: number // 0..1 — mức ĐỨNG trong khối bơi (0 = sát mặt, 1 = sát đáy) per-con
  burstCd: number // s — đếm ngược tới lần BỨT TỐC kế (random theo burstRate); lệch pha giữa các con
  burst: number // s — thời lượng bứt còn lại (>0 = đang phóng/khựng); 0 = bơi thường
  dp: number // 🐟 deadProgress RIÊNG con (0=sống → 1=chết hẳn). Chia chết theo tỉ lệ: con i<deadCount = chết
  wake: number // 🐟 0..1 — vừa hồi sinh: 1=còn bám mặt (đúng XYZ chết) → ease 0 = bơi xuống dần (không rớt thẳng)
  // 🦈 SĂN MỒI (predation — coordinator PondPredation set/đọc): hunt = đang lao tới mồi (override wander); (hx,hz,
  // hyFrac) = target LOCAL; consumed = bị đớp → ẩn instance (biến mất khỏi hồ). Per-con MVP (1 đớp 1).
  hunt: boolean
  hx: number
  hz: number
  hyFrac: number
  consumed: boolean
  // 🏃 CHẠY TRỐN (prey — coordinator set): flee = đang bỏ chạy KHỎI predator bậc cao gần (override hunt/wander);
  // (fx,fz) = vị trí predator LOCAL để bơi NGƯỢC ra. Bậc thấp né bậc cao tránh bị đớp.
  flee: boolean
  fx: number
  fz: number
  fleeT: number // 🏃 giây đã CHẠY TRỐN (đếm từ lúc BẮT ĐẦU bị săn) — gate cửa sổ SPRINT 2s đầu
  fleeBurst: number // 🏃 ×tốc NGẪU NHIÊN cho 2s sprint đầu (roll 1 lần lúc chớm flee) — số phận: thoát hay bị đớp ngay
  spinAcc: number // 🌀 góc đã quay CỘNG DỒN (có dấu) khi flee — |acc| > 1 vòng (2π) = xoay tại chỗ → ép đi thẳng
  straightT: number // 🌀 giây còn lại của "đi thẳng cưỡng bức" 2s (>0 = KHÔNG quay theo predator → thoát kẹt vòng)
  // 🎢 NGHIÊNG THÂN (bank vào cua + pitch chúi mũi khi lặn/ngoi) — mượt hoá per-con, đọc tốc-quay + tốc-đứng.
  bank: number // rad — roll quanh trục thân (+X) hiện tại (lerp tới target ∝ tốc quay)
  pitch: number // rad — chúi mũi quanh trục bên (+Z) hiện tại (lerp tới target ∝ tốc đứng)
  prevHeading: number // heading frame trước → suy ra tốc quay (bank)
  py: number // yFrac (TẦNG bơi) frame trước → suy ra tốc đổi-tầng cho pitch (chúi mũi); KHÔNG dính bob/gò đáy
  chomp: number // 🦈 giây còn lại của 1 cú CHỚP há miệng (>0 = đang há→ngậm; predator set khi đớp)
}

const MAX_FISH = 64 // cap số cá/đàn (bậc thấp đông — cá nhỏ/tép). _lifeArr/_uLife/_mouthArr cấp theo hằng này.
const SEG = 8 // cạnh quanh thân
const TAIL_AMP = 0.09 // biên độ vẫy chót đuôi (đơn vị thân) — fade về 0 khi chết (đuôi duỗi mềm, hết giật)
// Profile thân: [x dọc trục (đầu +X), bán kính] — đơn vị thân dài 1 (đầu 0.5 → cuống đuôi -0.38). 2 vòng đầu PHÌNH
// to (lip 0.03 + snout 0.056) → đầu đầy đặn + có VOLUME cho MIỆNG mở (jaw gape) thấy rõ (NgQuan: phẫu thuật đầu cá).
const PROFILE: [number, number][] = [
  [0.5, 0.03],
  [0.43, 0.056],
  [0.3, 0.082],
  [0.16, 0.092],
  [0.0, 0.085],
  [-0.16, 0.062],
  [-0.3, 0.04],
  [-0.38, 0.02],
]
// 🦈 MIỆNG mở (jaw gape): vùng x∈[MOUTH_BACK, MOUTH_FRONT] = hàm; hàm TRÊN (y>0) nhếch nhẹ, hàm DƯỚI (y<0) rớt mạnh
// hơn (JAW_LOW > JAW_UP — "há miệng" tự nhiên). Bake vào attribute 'jaw'; shader đẩy y theo jaw × mouthOpen × MOUTH_GAPE.
const MOUTH_FRONT = 0.5 // x đầu vùng miệng (lip ring) — mask = 1
const MOUTH_BACK = 0.3 // x cuối vùng miệng — sau mốc này jaw = 0 (thân không mở)
const JAW_UP = 0.5 // hệ số mở hàm TRÊN (lip trên hơi nhếch)
const JAW_LOW = 1 // hệ số mở hàm DƯỚI (rớt mạnh hơn → gape rõ)
const MOUTH_GAPE = 0.13 // ×đơn vị thân — biên độ MỞ tối đa (× jaw_attr × mouthOpen, đẩy theo trục y)
const MOUTH_REST = 0.3 // 🦈 HÉ MIỆNG nghỉ (luôn hé chút → đầu THẤY RÕ là miệng, không còn 1 khối); chomp cộng thêm
const MOUTH_DARK = 0.7 // độ TỐI vùng môi/miệng (mix theo |jaw|) → khe miệng nổi rõ trên thân sáng
const CHOMP_DUR = 0.28 // s — 1 cú "chớp" há→ngậm (sin 0→1→0); ngắn = đớp dứt khoát
// 👁 MẮT: 2 đĩa nhỏ 2 bên đầu (x≈0.34), tô tối qua attribute 'feat' → đầu cá "ra mặt" (cue mạnh nhất). z ĐẶT NGAY
// MẶT THÂN (≈0.037 tại x/y này) → đĩa chìm sát vào thân, KHÔNG lơ lửng (NgQuan: mắt chưa dính). Tâm lồi nhẹ 0.006.
const EYE_X = 0.34 // vị trí dọc trục (trên đầu)
const EYE_Y = 0.04 // hơi cao hơn trục giữa
const EYE_Z = 0.037 // ±z = ĐÚNG mặt thân tại (x,y) trên (ellipse rz≈0.044, ở y=0.04 còn ~0.037) → đĩa dính sát
const EYE_R = 0.02 // bán kính đĩa mắt (nhỏ gọn, không tràn khỏi đầu)

// LCG mulberry32 — wander/layout tái lập theo seed (không Math.random).
function makeRng(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 🦈 jaw weight 1 vertex thân: vùng miệng (mask theo x) × hướng (hàm trên + / dưới −, |cos| để bên hông ≈ 0).
function jawAt(x: number, cosA: number): number {
  const mask = Math.max(0, Math.min(1, (x - MOUTH_BACK) / (MOUTH_FRONT - MOUTH_BACK)))
  return mask * (cosA >= 0 ? cosA * JAW_UP : cosA * JAW_LOW)
}

// Thân cá: vòng ellipse (dẹp ngang rz=0.6r — cá nén bên) dọc trục X + chóp mũi/cuống đuôi. jaw[] = trọng số mở miệng.
function pushBody(pos: number[], idx: number[], uv: number[], jaw: number[]): void {
  pos.push(0.54, 0, 0) // 0 = chóp mũi (seam giữa miệng — jaw 0, đứng yên)
  uv.push(0, 0.5)
  jaw.push(0)
  for (let i = 0; i < PROFILE.length; i++) {
    const [x, r] = PROFILE[i]
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      pos.push(x, Math.cos(a) * r, Math.sin(a) * r * 0.6)
      uv.push((0.54 - x) / 1.1, j / SEG)
      jaw.push(jawAt(x, Math.cos(a))) // 🦈 mở miệng theo vùng đầu + trên/dưới
    }
  }
  const tailC = pos.length / 3
  pos.push(-0.4, 0, 0) // tâm cuống đuôi
  uv.push(0.85, 0.5)
  jaw.push(0)
  const ring = (i: number, j: number): number => 1 + i * SEG + (j % SEG)
  for (let j = 0; j < SEG; j++) idx.push(0, ring(0, j), ring(0, j + 1)) // quạt mũi
  for (let i = 0; i < PROFILE.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = ring(i, j)
      const b = ring(i, j + 1)
      const c = ring(i + 1, j + 1)
      const d = ring(i + 1, j)
      idx.push(a, c, b, a, d, c) // winding hướng pháp tuyến RA ngoài (computeVertexNormals)
    }
  }
  for (let j = 0; j < SEG; j++)
    idx.push(tailC, ring(PROFILE.length - 1, j + 1), ring(PROFILE.length - 1, j))
}

// Vây phẳng z=0 (DoubleSide): đuôi chẻ 2 thuỳ + vây lưng — nằm trong vùng bend mạnh → vẫy theo thân. jaw 0 (không mở).
function pushFins(pos: number[], idx: number[], uv: number[], jaw: number[]): void {
  const v = (x: number, y: number): number => {
    pos.push(x, y, 0)
    uv.push((0.54 - x) / 1.1, 0.5)
    jaw.push(0)
    return pos.length / 3 - 1
  }
  const b = v(-0.38, 0) // gốc cuống đuôi
  const t1 = v(-0.56, 0.16)
  const m = v(-0.47, 0.01)
  const t2 = v(-0.56, -0.15)
  idx.push(b, t1, m, b, m, t2) // đuôi chẻ
  const d1 = v(0.18, 0.08)
  const d2 = v(0.02, 0.17)
  const d3 = v(-0.06, 0.07)
  idx.push(d1, d2, d3) // vây lưng
}

// 👁 2 MẮT = 2 đĩa nhỏ (7 cạnh) 2 bên đầu, tâm hơi LỒI ra (eye bulge). jaw 0 (không mở theo miệng). Tô tối =
// colorNode đọc 'feat' (buildFishGeometry gán feat=1 cho verts từ đây trở đi). DoubleSide nên winding không tới hạn.
function pushEyes(pos: number[], idx: number[], uv: number[], jaw: number[]): void {
  for (const side of [1, -1]) {
    const ez = side * EYE_Z
    const c = pos.length / 3
    pos.push(EYE_X, EYE_Y, ez + side * 0.006) // tâm lồi NHẸ ra (rìa nằm sát mặt thân → dính, không lơ lửng)
    uv.push(0.08, 0.5)
    jaw.push(0)
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * Math.PI * 2
      pos.push(EYE_X + Math.cos(a) * EYE_R, EYE_Y + Math.sin(a) * EYE_R, ez)
      uv.push(0.08, 0.5)
      jaw.push(0)
    }
    for (let j = 0; j < 7; j++) idx.push(c, c + 1 + j, c + 1 + ((j + 1) % 7)) // quạt đĩa mắt
  }
}

function buildFishGeometry(): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  const uv: number[] = []
  const jaw: number[] = [] // 🦈 trọng số mở miệng per-vertex (shader đẩy y khi chomp)
  pushBody(pos, idx, uv, jaw)
  pushFins(pos, idx, uv, jaw)
  const eyeStart = pos.length / 3 // verts TRƯỚC mắt = thân/vây (feat 0); từ đây = mắt (feat 1)
  pushEyes(pos, idx, uv, jaw)
  const feat = new Array<number>(pos.length / 3).fill(0) // 👁 0 = thân, 1 = mắt (tô tối ở colorNode)
  for (let v = eyeStart; v < pos.length / 3; v++) feat[v] = 1
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('jaw', new THREE.Float32BufferAttribute(jaw, 1)) // 🦈 mở miệng
  g.setAttribute('feat', new THREE.Float32BufferAttribute(feat, 1)) // 👁 đánh dấu mắt
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Scratch — không alloc trong update loop.
const _mtx = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scl = new THREE.Vector3()
const _UP = new THREE.Vector3(0, 1, 0)
// 🐟 Trục thân (+X forward) + quat roll động: chết = xoay bụng TỪ TỪ lên (roll 0→π quanh +X).
const _XAXIS = new THREE.Vector3(1, 0, 0)
const _qRoll = new THREE.Quaternion()
// 🎢 Pitch (chúi mũi) = roll quanh trục BÊN (+Z, trục dẹp ngang của thân). Bank dùng chung _XAXIS với xoay bụng.
const _ZAXIS = new THREE.Vector3(0, 0, 1)
const _qPitch = new THREE.Quaternion()
const DEATH_DUR = 7 // s — CHẾT/HỒI SINH chung tốc (xoay bụng hồi sinh = xoay bụng chết — NgQuan 2026-06-13);
// nổi chậm vì NƯỚC (buoyancy G≪9.8). Hồi sinh = đảo ngược qua cùng DEATH_DUR (cùng tốc xoay).
const WAKE_DUR = 2.6 // s — sau hồi sinh: giữ Ở MẶT (đúng XYZ chết) rồi BƠI từ từ xuống (ease, KHÔNG rớt thẳng Y).
const HUNT_DART = 1.8 // ×tốc khi SĂN — predator lao tới mồi (vừa phải, không vọt quá nhanh). PondPredation lái + cooldown.
const FLEE_DART = 1.65 // ×tốc khi CHẠY TRỐN (đã MỆT, sau cửa sổ sprint) — prey bơi ngược predator nhưng VẪN
// nhỏ hơn HUNT_DART 1.8 → predator bắt kịp dần → "sau 2s tốc về mặc định chậm hơn bậc 4, dễ bị đớp" (NgQuan).
// 🏃 CỬA SỔ "VÙNG VẪY" 2s ĐẦU khi prey chớm bị săn: chạy tốc NGẪU NHIÊN (fleeBurst) thay vì FLEE_DART cố định —
// roll thấp ≈/chậm hơn predator → BỊ ĐỚP NGAY; roll cao > predator → VỌT LÊN thoát liền. Hết 2s → về FLEE_DART (mệt).
const SPRINT_DUR = 2 // s — độ dài cửa sổ random sprint kể từ lúc bắt đầu flee
const SPRINT_MIN = 2.1 // ×tốc đáy roll — ≈ NGANG predator-effective → roll xui vẫn "bị đớp ngay" (khi về tốc mệt)
const SPRINT_MAX = 3.4 // ×tốc đỉnh roll — VỌT MẠNH trên predator → "vượt lên trên liền". Cả 2 > FLEE_DART 1.65 (sprint > lúc mệt)
const ZIG_FREQ = 9 // 🪡 rad/s — tần BẺ CUA zic-zac trong cửa sổ sprint 2s (cao = quẹo gấp liên tục để né)
const ZIG_AMP = 1.2 // rad (~69°) — biên độ lệch hướng mỗi nhịp zic-zac (bẻ cua mạnh → đường chạy ngoằn ngoèo né mồi)
const SPIN_LIMIT = Math.PI * 2 // 🌀 prey xoay > 1 VÒNG (2π) CÙNG CHỖ = kẹt vòng tròn với predator → buộc thoát ra
const STRAIGHT_DUR = 2 // s — "đi thẳng cưỡng bức" sau khi xoay quá 1 vòng (phá deadlock cả 2 bậc cùng xoay tại chỗ)
const SEP_K = 0.7 // bán kính TÁCH-THÂN = chiều dài cá × K — gần hơn ngưỡng này thì đẩy ra (cá không nhập vào nhau)
const SEP_SPD = 1.6 // ×chiều dài cá (m/s) — tốc đẩy tách tối đa (nhân với độ chồng 0..1). Va chạm "mềm", không cứng
// 🎢 NGHIÊNG THÂN: bank = nghiêng vào cua (∝ tốc-quay), pitch = chúi mũi khi lặn/ngoi (∝ tốc-đứng) — ×amp slider.
const BANK_K = 0.32 // rad cho mỗi (rad/s) tốc-quay → nghiêng thân; ×bankAmp rồi kẹp BANK_MAX
const BANK_MAX = 0.7 // rad (~40°) nghiêng tối đa (kẻo lật úp lúc bẻ cua gấp/zic-zac)
const PITCH_K = 0.3 // rad cho mỗi (đơn-vị yFrac / s) đổi-TẦNG → chúi mũi; ×pitchAmp rồi kẹp PITCH_MAX. Đọc yFrac
// (TẦNG bơi chủ ý) chứ KHÔNG đọc cao-độ-thật → KHÔNG gật theo bob / gò đáy / separation (NgQuan: cá gật đầu liên tục).
const PITCH_MAX = 0.6 // rad (~34°) chúi tối đa khi lặn/ngoi nhanh (vd predator lao xuống tầng mồi)
const TILT_LERP = 6 // /s — mượt hoá bank/pitch (lerp tới target, không giật theo nhiễu tốc-quay từng frame)
// 🐟 BOIDS bơi-theo-đàn (Reynolds — BẬT/TẮT qua schooling): separation ĐÃ có (_separate); thêm cohesion (về tâm
// cụm) + alignment (theo hướng chung). CHỈ áp lúc bơi thường (flee/hunt override). Pond ít con → mặc định TẮT.
const SCHOOL_R = 4 // bán kính CẢM NHẬN đàn = chiều dài cá × K — neighbor trong tầm này mới tính cohesion/alignment
const COH_W = 1 // trọng số COHESION (hướng về tâm cụm) khi tổng hợp hướng đàn
const ALIGN_W = 1.4 // trọng số ALIGNMENT (theo hướng chung) — nhỉnh hơn → đàn bơi đồng hướng, mượt (không co cụm quá)
const SCHOOL_TURN = 2.5 // /s — tốc lerp heading về hướng đàn (vừa phải, vẫn để wander/sway phá đều)
// 🍽 MÒ ĂN (forage) — homeostasis độ-no school-level: đói (drain) → sinh điểm thức-ăn nổi mặt → cá tới ăn → no lại.
const FORAGE_DRAIN = 0.04 // satiation/s rút khi forageOn (full→cạn ~25s nếu không ăn)
const FORAGE_HUNGRY = 0.5 // satiation < mức này (= mép VÀNG level 10) → TỰ rải nhúm (đói → ăn ở vùng vàng)
const FORAGE_BITE = 0.14 // satiation hồi mỗi VIÊN bị ăn (≈7 viên = no lại từ rỗng)
const FORAGE_DART = 1.35 // ×tốc khi đi mò ăn (nhanh hơn wander, chậm hơn HUNT_DART săn mồi)
const FORAGE_YFRAC = 0.05 // tầng ăn = sát MẶT (thức-ăn nổi)
const FOOD_R = 0.022 // m — bán kính viên thức-ăn nổi mặt
const FOOD_MAX = 16 // 🍽 cap số viên cùng lúc/đàn (= slot InstancedMesh)
const FORAGE_AUTO_N = 4 // 🍽 tự rải nhúm nhỏ khi đói (forageOn)
const FOOD_SCATTER_N = 10 // 🍽 nút "Rải thức ăn" / click thả → 1 vốc
const DROP_H = 0.28 // 🍽 m — viên RƠI từ độ cao này xuống mặt nước (rắc cám)
const DROP_DUR = 0.5 // 🍽 s — thời gian rơi (gia tốc); rơi xong mới ăn được
const FOOD_SPREAD = 0.7 // 🍽 m — toả viên quanh ĐIỂM CLICK (tách xa nhau, không chụm 1 đống)
const FOOD_STAGGER = 0.12 // 🍽 s — giãn cách RƠI giữa các viên (thả TỪNG viên nối tiếp, không cả chùm)

// smoothstep 0..1 — "từ từ" cho lật bụng + trồi lên.
function smooth01(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

// Wrap góc về [-π, π].
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

type XZ = { x: number; z: number }

// Point-in-polygon ray-cast — toạ độ LOCAL (m). PondFish TỰ CHỨA (không import ../shapes — components độc lập).
function pointInPoly(x: number, z: number, poly: XZ[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

// Khoảng cách (m) từ (x,z) tới CẠNH polygon gần nhất (point-to-segment) — đo "sát vách" để quay đầu sớm.
function distToEdges(x: number, z: number, poly: XZ[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)))
  }
  return best
}

export class PondFish {
  private mesh: THREE.InstancedMesh | null = null
  private geometry: THREE.BufferGeometry | null = null
  private material: MeshLambertNodeMaterial | null = null
  private isDisposed = false

  private readonly fish: FishState[] = []
  private areaRadius: number
  private depthY: number
  private fishLength: number
  private speed: number
  private swimDepth: number // m — bề dày bơi đứng (0 = đĩa phẳng như cũ)
  private swayAmp = 1 // 🐟 biên độ lượn chữ S (×) — hành vi, dùng trong _steer
  private wanderAmp = 1 // 🐟 độ lăng xăng (× random dart)
  private bobAmp = 1 // 🐟 nhấp nhô dọc (× ±3cm)
  private bankAmp = 1 // 🎢 độ nghiêng thân vào cua (×)
  private pitchAmp = 1 // 🎢 độ chúi mũi khi lặn/ngoi (×)
  private schooling = false // 🐟 boids bơi-theo-đàn (cohesion+alignment) — bật/tắt; separation luôn chạy
  private forageOn = false // 🍽 MÒ ĂN tự động — đói tự rải nhúm + rút độ-no (opt-in). Nút "Rải" tay chạy BẤT KỂ toggle.
  private _foodCount = FOOD_SCATTER_N // 🍽 số viên/lần rải (config)
  private _foodStagger = FOOD_STAGGER // 🍽 giãn rơi giữa viên (s, config)
  private _foodSpread = FOOD_SPREAD // 🍽 độ rộng vùng toả viên (m, config)
  private _food: { x: number; z: number; t0: number }[] = [] // 🍽 viên thức-ăn (LOCAL) — t0=lúc THẢ (rơi); cá ăn viên GẦN nhất
  private _foodNextRelease = 0 // 🍽 mốc thời gian thả viên KẾ (xếp hàng so le → rơi từng viên, không cả chùm)
  private _foodMesh: THREE.InstancedMesh | null = null // 🍽 N viên nổi (InstancedMesh; slot thừa scale-0)
  private _onEat: ((x: number, z: number) => void) | null = null // 🌊 callback ĐỚP mồi (x,z local) → caller bắn sóng lan
  private burstRate = 0 // 🐟 tần suất bứt tốc ngẫu nhiên (0..1; 0 = tắt)
  private satiation = 1 // 🐟 độ no (slider Đói). >6/20 = sống; 0..6/20 = vùng CHẾT theo tỉ lệ (xem _deadCount)
  private tier = 4 // 🐟 BẬC (1..6) — Phase 1 chỉ lưu (getTier); predation lớn-ăn-bé dùng ở Phase 3
  // 🐟 đuôi LIMP per-con khi chết: uniformArray 1=sống vẫy / 0=chết duỗi, index theo instanceIndex (auto re-pack
  // mỗi RENDER). _lifeArr = mảng raw (mutate trực tiếp); _uLife = node đọc trong material.
  private readonly _lifeArr: number[] = new Array<number>(MAX_FISH).fill(1)
  private readonly _uLife = uniformArray(this._lifeArr, 'float')
  // 🦈 MỞ MIỆNG per-con (0 = ngậm, 1 = há tối đa) — predator chớp 1 cú khi đớp; shader đọc theo instanceIndex.
  private readonly _mouthArr: number[] = new Array<number>(MAX_FISH).fill(0)
  private readonly _uMouth = uniformArray(this._mouthArr, 'float')
  // 🐟 TÁCH-THÂN (separation): scratch đẩy X/Z mỗi con — tính 2 pha (đọc hết vị trí → áp) để khỏi lệ thuộc thứ tự.
  private readonly _sepX: number[] = new Array<number>(MAX_FISH).fill(0)
  private readonly _sepZ: number[] = new Array<number>(MAX_FISH).fill(0)
  private bounds: PondBounds | null = null // 🐟 vùng bơi = lòng hồ (polygon+mặt+đáy); null = vòng tròn (cũ)
  private _cx = 0 // centroid LOCAL polygon — steer quay-về-tâm khi sát vách
  private _cz = 0
  private readonly rng: () => number

  // Uniform nodes — update qua .value (shader-tsl), KHÔNG material.uniforms.
  private readonly uTime = uniform(0)
  private readonly uSeed = uniform(0)
  private readonly uFlap = uniform(6) // tần vẫy (rad/s) — theo speed qua setSpeed
  private readonly uAmp = uniform(TAIL_AMP) // biên độ vẫy chót đuôi (đơn vị thân) — fade→0 khi chết
  private readonly uWidth = uniform(1) // 🐟 độ mập thân (×bán kính tiết diện) — live
  private readonly uColBase = uniform(new THREE.Color(0xeee8db)) // 🎨 màu nền thân
  private readonly uColPatch = uniform(new THREE.Color(0xe36112)) // 🎨 màu mảng (cam)
  private readonly uColSpot = uniform(new THREE.Color(0x141312)) // 🎨 màu đốm (đậm)
  private readonly uPatchAmt = uniform(0.5) // 🎨 tỉ lệ mảng 0..1

  constructor(opts: PondFishOptions = {}) {
    const count = Math.max(1, Math.min(MAX_FISH, Math.round(opts.count ?? 8)))
    this.areaRadius = Math.max(0.3, opts.areaRadius ?? 1.6)
    this.depthY = opts.depthY ?? -0.25
    this.fishLength = Math.max(0.05, opts.fishLength ?? 0.28)
    this.speed = Math.max(0, opts.speed ?? 0.25)
    this.swimDepth = Math.max(0, opts.swimDepth ?? 0)
    this.uSeed.value = opts.colorSeed ?? 0
    this.uWidth.value = Math.max(0.2, opts.bodyWidth ?? 1)
    this._initTuning(opts) // 🎨 3 màu + tỉ lệ + 🐟 hành vi (sway/wander/bob/burst) + bounds — giữ constructor ≤10
    this.setSpeed(this.speed)
    this.rng = makeRng(1)

    this.geometry = buildFishGeometry()
    this.material = this._buildMaterial()
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count)
    this.mesh.castShadow = false // cá chìm dưới nước — bóng xuyên mặt nước nhìn sai, lại rẻ
    this.mesh.receiveShadow = false
    this._spawn(count, opts.occupied) // 🐟 occupied = chỗ-đã-chiếm chung hồ → né trùng cả đàn khác lúc spawn
    this.update(0) // đặt matrix lần đầu (kẻo frame 0 dồn về gốc)
  }

  // 🎨 3 màu koi từ opts — tách khỏi _initTuning giữ complexity ≤10.
  private _initColors(opts: PondFishOptions): void {
    if (opts.baseColor !== undefined) this.uColBase.value.setHex(opts.baseColor)
    if (opts.patchColor !== undefined) this.uColPatch.value.setHex(opts.patchColor)
    if (opts.spotColor !== undefined) this.uColSpot.value.setHex(opts.spotColor)
  }

  // 🐟🎢 Init biên độ HÀNH VI/DÁNG: lượn (sway) + lăng xăng (wander) + nhấp nhô (bob) + nghiêng cua (bank) + chúi
  // mũi (pitch). Tách khỏi _initTuning giữ complexity ≤10.
  private _initBehavior(opts: PondFishOptions): void {
    this.swayAmp = Math.max(0, opts.swayAmp ?? 1)
    this.wanderAmp = Math.max(0, opts.wanderAmp ?? 1)
    this.bobAmp = Math.max(0, opts.bobAmp ?? 1)
    this.bankAmp = Math.max(0, opts.bankAmp ?? 1) // 🎢 nghiêng vào cua
    this.pitchAmp = Math.max(0, opts.pitchAmp ?? 1) // 🎢 chúi mũi khi lặn/ngoi
    this._foodCount = Math.max(1, Math.round(opts.foodCount ?? FOOD_SCATTER_N)) // 🍽 cách thả mồi
    this._foodStagger = Math.max(0, opts.foodDrop ?? FOOD_STAGGER)
    this._foodSpread = Math.max(0, opts.foodSpread ?? FOOD_SPREAD)
  }

  // 🎨 Init 3 màu + tỉ lệ mảng + 🐟 hành vi/dáng + 🐟 bứt tốc/đói + bounds từ opts. Giữ constructor ≤10.
  private _initTuning(opts: PondFishOptions): void {
    this._initColors(opts)
    this._initBehavior(opts) // 🐟🎢 sway/wander/bob + bank/pitch
    this.uPatchAmt.value = Math.max(0, Math.min(1, opts.patchAmount ?? 0.5))
    this.burstRate = Math.max(0, Math.min(1, opts.burstRate ?? 0))
    this.schooling = opts.schooling ?? false // 🐟 bơi theo đàn (mặc định tắt — pond ít con)
    this.forageOn = opts.forage ?? false // 🍽 mò ăn (mặc định tắt — opt-in)
    this.satiation = Math.max(0, Math.min(1, opts.satiation ?? 1))
    this.tier = Math.round(opts.tier ?? 4) // 🐟 bậc — lưu cho Phase 3 (predation)
    if (opts.bounds) this.setBounds(opts.bounds) // 🐟 vùng bơi = lòng hồ thật (polygon+mặt+đáy)
  }

  // ── Material: vẫy đuôi (vertex) + màu koi (fragment) — tất cả per-instance từ hash(instanceIndex) ──
  private _buildMaterial(): MeshLambertNodeMaterial {
    // perf-ok: gọi 1 LẦN trong constructor (không per-rebuild) — compile 1 shader cho cả vòng đời module.
    // 🪶 LAMBERT (không PBR): cá chìm dưới nước, stylized → không cần roughness/metalness. Compile NHANH hơn +
    // fragment RẺ hơn hẳn MeshStandard (NgQuan: làm sạch phần cá). Vẫn DoubleSide vì vây phẳng cần thấy 2 mặt.
    const mat = new MeshLambertNodeMaterial({ side: THREE.DoubleSide })
    const fi = instanceIndex.toFloat()
    const p = positionLocal
    // Vẫy: sóng sine dọc thân cuộn về đuôi, biên độ tăng bậc 2 từ đầu (≈0) tới chót đuôi.
    const sTail = float(0.5).sub(p.x).div(1.06).clamp(0, 1) as TSLNode // 0 đầu → 1 chót đuôi
    // 🐟 đuôi LIMP per-con: ×aLife (1=sống vẫy, 0=chết duỗi mềm) — đọc uniformArray theo instanceIndex.
    const aLife = this._uLife.element(instanceIndex) as unknown as TSLNode
    const amp = sTail.mul(sTail).mul(0.94).add(0.06).mul(this.uAmp).mul(aLife)
    const phase = hash(fi.add(float(31.7))).mul(6.2832)
    const wave = p.x.mul(6).sub(this.uTime.mul(this.uFlap)).add(phase).sin()
    // 🦈 MỞ MIỆNG: jaw (bake per-vertex) × (HÉ nghỉ MOUTH_REST + chomp per-con _uMouth) × MOUTH_GAPE → đẩy y (hàm
    // trên/dưới tách). Hé nghỉ = luôn mở chút → đầu thấy rõ là miệng (không 1 khối); đớp thì chomp cộng thêm.
    const aMouth = (this._uMouth.element(instanceIndex) as unknown as TSLNode).add(MOUTH_REST)
    const gape = (attribute('jaw', 'float') as unknown as TSLNode).mul(aMouth).mul(MOUTH_GAPE)
    // 🐟 Độ MẬP: nhân tiết diện (y,z) ×uWidth GIỮ trục x (dài) + 🦈 gape lên y; rồi ADD vẫy lên z (KI-003 giữ instanceMatrix).
    const shaped = vec3(p.x, p.y.mul(this.uWidth).add(gape), p.z.mul(this.uWidth))
    mat.positionNode = shaped.add(vec3(0, 0, wave.mul(amp)))
    // Pattern màu sample theo positionGeometry (ATTRIBUTE GỐC pre-displacement) — positionLocal là
    // VARYING bị positionNode GHI ĐÈ (Position.js: toVarying + NodeMaterial assign) → dùng nó trong
    // colorNode = sample theo toạ độ ĐANG VẪY = hoạ tiết "trượt khỏi thân" khi bơi (NgQuan thấy 2026-06-11).
    mat.colorNode = this._koiColor(fi, positionGeometry as unknown as TSLNode)
    return mat
  }

  // Màu koi per-con: NỀN (uColBase) + MẢNG (uColPatch — ngưỡng hạ theo uPatchAmt → nhiều/ít mảng) + ĐỐM
  // (uColSpot, thưa ~nửa đàn) + bụng sáng. uSeed xáo cả đàn; 3 màu + tỉ lệ = uniform LIVE (0 rebuild).
  private _koiColor(fi: TSLNode, p: TSLNode): TSLNode {
    const h1 = hash(fi.add(this.uSeed)) // offset noise per-con — mỗi con 1 bộ mảng
    const h2 = hash(fi.add(this.uSeed).add(float(57.31))) // bias mảng + có/không đốm
    const n1 = triNoise3D(
      p.mul(vec3(1.6, 3.2, 3.2)).add(vec3(h1.mul(43.7), h1.mul(17.3), float(0))),
      float(0),
      float(0)
    )
    // ngưỡng mảng = 0.6 − patchAmt·0.42 (+ lệch per-con) → patchAmt cao = ngưỡng thấp = nhiều mảng.
    const thr = float(0.6).sub(this.uPatchAmt.mul(0.42)).add(h2.mul(0.18))
    const patch = step(thr, n1)
    let col = mix(this.uColBase, this.uColPatch, patch) as TSLNode
    const n2 = triNoise3D(
      p.mul(vec3(2.3, 4.1, 4.1)).add(vec3(h1.mul(91.7), float(0), h1.mul(31.1))),
      float(0),
      float(0)
    )
    const spot = step(float(0.48), n2).mul(step(h2, float(0.5)))
    col = mix(col, this.uColSpot, spot) as TSLNode
    // Bụng sáng: 1−smoothstep (KHÔNG đảo ngưỡng smoothstep — undefined WGSL). Sáng = nền ×1.12.
    const belly = float(1)
      .sub(smoothstep(float(-0.06), float(0), p.y))
      .mul(0.5)
    col = mix(col, this.uColBase.mul(1.12), belly) as TSLNode
    // 🦈 MÔI/MIỆNG tối: vùng lip (|jaw| cao = đầu trước) tô tối dần → khe miệng nổi rõ trên thân sáng.
    const jawMag = (attribute('jaw', 'float') as unknown as TSLNode)
      .abs()
      .mul(MOUTH_DARK)
      .clamp(0, 1)
    col = mix(col, vec3(0.16, 0.05, 0.04), jawMag) as TSLNode
    // 👁 MẮT: feat=1 → đen (cue "ra mặt"). step cứng nên rìa đĩa sắc nét.
    const feat = attribute('feat', 'float') as unknown as TSLNode
    return mix(col, vec3(0.03, 0.03, 0.05), step(float(0.5), feat)) as TSLNode
  }

  // Rải đàn TRẢI RỘNG cả vùng, mỗi con 1 hướng/tốc/cỡ/pha/tần lượn/lệch-pha-bứt riêng. Spawn CÁCH NHAU (không
  // trùng vị trí lúc load/reload) qua _spacedSpawn: né MỌI claim trong `claims` (chung hồ → cả đàn khác) + tự đẩy
  // claim của mình vào → đàn/con sau né. Khoảng cách = tổng bán kính thân (không chồng dù cỡ khác nhau).
  private _spawn(count: number, occupied?: SpawnClaim[]): void {
    const claims = occupied ?? [] // shared cross-đàn nếu caller bơm; else local (chỉ trong đàn này)
    const myR = this.fishLength * 0.5 // bán kính thân con đang spawn (½ chiều dài)
    for (let i = 0; i < count; i++) {
      const pt = this._spacedSpawn(claims, myR)
      claims.push({ x: pt.x, z: pt.z, r: myR }) // chiếm chỗ → con sau (cùng/khác đàn) tránh
      const heading = this.rng() * Math.PI * 2
      this.fish.push({
        x: pt.x,
        z: pt.z,
        heading,
        wander: 0,
        swayF: 0.5 + this.rng() * 0.7,
        speed: 0.75 + this.rng() * 0.5,
        size: 0.8 + this.rng() * 0.4,
        bob: this.rng() * Math.PI * 2,
        yFrac: this.rng(), // mức đứng trong khối bơi — rải đều theo độ sâu
        burstCd: this.rng() * 6, // lệch pha bứt tốc giữa các con (không bứt đồng loạt)
        burst: 0,
        dp: 0,
        wake: 0,
        hunt: false, // 🦈 chưa săn
        hx: 0,
        hz: 0,
        hyFrac: 0,
        consumed: false, // 🦈 chưa bị đớp
        flee: false, // 🏃 chưa chạy trốn
        fx: 0,
        fz: 0,
        fleeT: 0,
        fleeBurst: FLEE_DART, // roll lại lúc chớm flee (setFlee); giá trị này chỉ là chỗ giữ trước cú roll đầu
        spinAcc: 0,
        straightT: 0,
        bank: 0, // 🎢 nghiêng thân = 0 lúc spawn
        pitch: 0,
        prevHeading: heading, // = heading ban đầu → frame đầu tốc-quay ≈ 0 (không giật nghiêng)
        py: 0, // yFrac frame trước (cập nhật frame đầu trong _bodyTilt)
        chomp: 0, // 🦈 miệng ngậm lúc spawn
      })
    }
    const dc = this._deadCount() // load sẵn-chết: con i<deadCount khởi tạo chết hẳn (không replay animation)
    for (let i = 0; i < dc; i++) this.fish[i].dp = 1
  }

  // Điểm spawn CÁCH mọi claim ≥ tổng bán kính (rejection ≤24 lần; quá chật thì nhận điểm cuối) → không trùng vị trí.
  private _spacedSpawn(claims: SpawnClaim[], myR: number): { x: number; z: number } {
    let pt = this._spawnPoint()
    for (let k = 0; k < 24 && this._tooClose(pt, claims, myR); k++) pt = this._spawnPoint()
    return pt
  }

  // pt có quá sát claim nào (con đã spawn — CÙNG hoặc KHÁC đàn)? Ngưỡng = tổng bán kính (không chồng thân dù khác cỡ).
  private _tooClose(pt: { x: number; z: number }, claims: SpawnClaim[], myR: number): boolean {
    for (const c of claims) {
      const dx = c.x - pt.x
      const dz = c.z - pt.z
      const min = c.r + myR
      if (dx * dx + dz * dz < min * min) return true
    }
    return false
  }

  // 🐟 SỐ con CHẾT theo slider Đói. Chết CHỈ ở vùng ĐỎ (level < 6): level 5 → 1/6 đàn, 4 → 2/6, …, 0 → cả đàn.
  // Vùng VÀNG (6-10) + xanh = SỐNG HẾT (đói nhưng chưa chết → tới đây tất cả đi ăn). NgQuan 2026-06-15 (vàng phải ăn hết).
  private _deadCount(): number {
    const level = Math.round(this.satiation * 20)
    if (level >= 6) return 0 // vàng/xanh: không con nào chết → cả đàn còn bơi (đi ăn được)
    return Math.round(Math.min((6 - level) / 6, 1) * this.fish.length) // đỏ (<6): chết theo tỉ lệ
  }

  // Điểm spawn trong VÙNG: bounds → rejection-sample trong bbox polygon (fallback centroid); else đĩa tròn
  // (r = R·√u — phân bố đều theo diện tích).
  private _spawnPoint(): { x: number; z: number } {
    const poly = this.bounds?.polygon
    if (poly && poly.length >= 3) {
      let minX = Infinity
      let maxX = -Infinity
      let minZ = Infinity
      let maxZ = -Infinity
      for (const p of poly) {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minZ = Math.min(minZ, p.z)
        maxZ = Math.max(maxZ, p.z)
      }
      for (let k = 0; k < 12; k++) {
        const x = minX + this.rng() * (maxX - minX)
        const z = minZ + this.rng() * (maxZ - minZ)
        if (pointInPoly(x, z, poly)) return { x, z }
      }
      return { x: this._cx, z: this._cz }
    }
    const a = this.rng() * Math.PI * 2
    const r = Math.sqrt(this.rng()) * this.areaRadius * 0.9
    return { x: Math.cos(a) * r, z: Math.sin(a) * r }
  }

  // 🐟 BOIDS cohesion + alignment cho 1 con (CHỈ khi schooling bật): gom neighbor trong SCHOOL_R → lái heading về
  // hỗn hợp (hướng-tới-tâm-cụm × COH_W + hướng-chung-đàn × ALIGN_W). Separation = _separate lo riêng. O(n²), n≤64 rẻ.
  // Không neighbor → giữ nguyên (wander thường). Gọi TRƯỚC wander để wander/sway phá đều trên nền hướng đàn.
  private _schoolBias(f: FishState, dt: number): void {
    const r = this.fishLength * SCHOOL_R
    let cx = 0
    let cz = 0
    let hx = 0
    let hz = 0
    let n = 0
    for (const b of this.fish) {
      if (b === f || b.consumed || b.dp > 0) continue
      const dx = b.x - f.x
      const dz = b.z - f.z
      if (dx * dx + dz * dz >= r * r) continue
      cx += b.x
      cz += b.z
      hx += Math.cos(b.heading) // alignment: tích vector hướng (circular mean)
      hz += Math.sin(b.heading)
      n++
    }
    if (n === 0) return
    const coh = Math.atan2(f.z - cz / n, cx / n - f.x) // hướng TỚI tâm cụm (cùng quy ước _huntStep)
    const align = Math.atan2(hz, hx) // hướng CHUNG đàn
    const ux = Math.cos(coh) * COH_W + Math.cos(align) * ALIGN_W
    const uz = Math.sin(coh) * COH_W + Math.sin(align) * ALIGN_W
    f.heading += angleDelta(Math.atan2(uz, ux), f.heading) * Math.min(1, SCHOOL_TURN * dt)
  }

  // Lái 1 con: SÁT VÁCH → quay đầu về tâm (lerp góc, không xuyên); trong vùng = (🐟 boids nếu bật) + LƯỢN CHỮ S
  // liên tục (sine per-con — cá thật không bơi thẳng) + wander random-walk mạnh (đổi hướng bất chợt).
  private _steer(f: FishState, dt: number, t: number): void {
    if (this._nearWall(f)) {
      // hướng về TÂM (dir = (cos h, -sin h)) — bounds: centroid polygon; else gốc (0,0)
      const desired = this.bounds
        ? Math.atan2(f.z - this._cz, this._cx - f.x)
        : Math.atan2(f.z, -f.x)
      f.heading += angleDelta(desired, f.heading) * Math.min(1, 2.8 * dt)
      return
    }
    if (this.schooling) this._schoolBias(f, dt) // 🐟 bơi theo đàn (cohesion+alignment) trước, wander phá đều sau
    f.wander += (this.rng() - 0.5) * 7 * this.wanderAmp * dt // 🐟 lăng xăng (random dart)
    f.wander = Math.max(-1.5, Math.min(1.5, f.wander))
    f.heading += (f.wander + Math.sin(t * f.swayF + f.bob) * 0.9 * this.swayAmp) * dt // 🐟 lượn chữ S
  }

  // Cá cần quay đầu? bounds → NGOÀI polygon hoặc cách cạnh < margin (≈ thân cá). Vòng tròn (cũ) → r > 85% R.
  private _nearWall(f: FishState): boolean {
    const poly = this.bounds?.polygon
    if (poly && poly.length >= 3) {
      if (!pointInPoly(f.x, f.z, poly)) return true
      return distToEdges(f.x, f.z, poly) < Math.max(0.15, this.fishLength * 0.8)
    }
    return Math.hypot(f.x, f.z) > this.areaRadius * 0.85
  }

  // 🐟 Bứt tốc ngẫu nhiên: hết cooldown → khởi động burst ~0.9s = pha PHÓNG VỌT (×4) rồi pha KHỰNG (×0.08).
  // Trả HỆ SỐ nhân tốc. cooldown kế tỉ lệ NGHỊCH burstRate (rate cao = bứt thường xuyên). burstRate 0 = tắt.
  private _burstFactor(f: FishState, dt: number): number {
    if (this.burstRate <= 0) return 1
    if (f.burst > 0) {
      f.burst -= dt
      return f.burst > 0.35 ? 4 : 0.08 // 0.55s phóng vọt → 0.35s khựng lại
    }
    f.burstCd -= dt
    if (f.burstCd <= 0) {
      f.burst = 0.9
      f.burstCd = (3 + this.rng() * 11) / this.burstRate
    }
    return 1
  }

  // 🐟 Cao độ bơi GỐC 1 con (KHÔNG bob): bounds → rải giữa MẶT NƯỚC (top) và ĐÁY theo gò (floorYAt, kẹp mỏng khi gò
  // nhô cao); else khối trụ depthY/swimDepth (cũ). Pitch (chúi mũi) đọc baseY NÀY → chỉ chúi khi đổi tầng THẬT (lặn
  // theo mồi / bám gò), KHÔNG gật theo bob cosmetic. Bob ±3cm cộng vào RIÊNG ở vị trí (caller), không vào pitch.
  private _baseLevelY(f: FishState): number {
    if (this.bounds) {
      const top = this.bounds.surfaceY - 0.08 // chìm dưới mặt nước
      const bot = Math.min(this.bounds.floorYAt(f.x, f.z) + 0.06, top - 0.02) // trên đáy, không vượt mặt
      return top + (bot - top) * f.yFrac
    }
    return this.depthY - f.yFrac * this.swimDepth
  }

  // 🎢 Cập nhật NGHIÊNG THÂN per-con: bank ∝ tốc-QUAY (nghiêng vào cua), pitch ∝ tốc-ĐỨNG (chúi mũi khi lặn/ngoi).
  // Lerp mượt (TILT_LERP) để không giật theo nhiễu từng frame. Cá chết (alive=false) → target 0 (thân về ngang,
  // death-pose lo xoay bụng). Luôn cập nhật prevHeading/py để hồi sinh không giật. d≤0 (frame 0) bỏ qua.
  private _bodyTilt(f: FishState, d: number, alive: boolean): void {
    if (d <= 0) return
    const turnRate = angleDelta(f.heading, f.prevHeading) / d // rad/s — dấu = chiều quay (trái/phải)
    f.prevHeading = f.heading
    const vy = (f.yFrac - f.py) / d // đổi TẦNG (yFrac)/s — dương = LẶN xuống đáy, âm = NGOI lên mặt
    f.py = f.yFrac
    const bankTo = alive
      ? THREE.MathUtils.clamp(-turnRate * BANK_K * this.bankAmp, -BANK_MAX, BANK_MAX)
      : 0
    // lặn (vy>0) → chúi mũi XUỐNG (pitch âm) → dùng -vy. CHỈ ≠0 khi đổi tầng CHỦ Ý (hunt), không nhiễu bob/gò/separation.
    const pitchTo = alive
      ? THREE.MathUtils.clamp(-vy * PITCH_K * this.pitchAmp, -PITCH_MAX, PITCH_MAX)
      : 0
    const k = Math.min(1, TILT_LERP * d)
    f.bank += (bankTo - f.bank) * k
    f.pitch += (pitchTo - f.pitch) * k
  }

  /** Gọi mỗi frame với dt giây — tiến vẫy + dời đàn; CHẾT THEO TỈ LỆ (deadCount con đầu) ramp riêng per-con. */
  update(dt: number): void {
    if (this.isDisposed || !this.mesh) return
    const d = Math.min(Math.max(0, dt), 0.1) // kẹp dt — né nhảy vọt khi tab quay lại
    this.uTime.value = (this.uTime.value as number) + d
    const t = this.uTime.value as number
    const dc = this._deadCount() // số con chết (theo slider Đói): con i<dc = chết, còn lại sống
    const surfTop = (this.bounds ? this.bounds.surfaceY : this.depthY) - 0.03 // ngay dưới mép surface
    const calmSpeed = 0.35 + 0.65 * this.satiation // đói = bơi chậm (sống)
    this._tickForage(d) // 🍽 mò ăn: rút no + sinh/ăn điểm thức-ăn nổi (no-op nếu forage tắt)
    this._separate(d) // 🐟 đẩy tách cá chồng nhau (đụng → tách, không nhập) TRƯỚC khi _swim + compose frame này
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i]
      if (f.consumed) {
        this.mesh.setMatrixAt(i, _mtx.makeScale(0, 0, 0)) // 🦈 bị đớp → scale 0 = biến mất khỏi hồ
        continue
      }
      const dying = i < dc // đích của con này: chết (true) hay sống (false)
      const prev = f.dp
      f.dp = Math.max(0, Math.min(1, f.dp + (dying ? d : -d) / DEATH_DUR)) // CÙNG tốc 2 chiều (xoay bụng đều)
      f.wake = this._wake(f, dying, prev, d) // vừa hồi sinh → bám mặt rồi ease bơi xuống (không rớt thẳng Y)
      if (f.dp <= 0) this._swim(f, d, t, calmSpeed) // chỉ con SỐNG hẳn mới bơi; chết/hấp hối/hồi sinh = đứng tại chỗ
      const ph = f.bob
      const pose = this._deathPose(f.dp, dying)
      const fl = dying ? pose.rise : 0 // float (đung đưa/đong đưa/lắc) CHỈ khi chết; hồi sinh = không rung
      const eRise = Math.max(pose.rise, f.wake) // wake giữ ở mặt sau hồi sinh → ease xuống (bơi xuống, không rớt)
      this._bodyTilt(f, d, f.dp <= 0) // 🎢 bank (∝ tốc-quay) + pitch (∝ đổi-TẦNG yFrac — KHÔNG gật theo bob/gò đáy)
      const aliveY = this._baseLevelY(f) + Math.sin(t * 0.7 + f.bob) * 0.03 * this.bobAmp // cao độ bơi + bob ±3cm
      _pos.set(
        f.x + Math.sin(t * 0.5 + ph) * 0.03 * fl, // đung đưa ngang theo làn nước
        aliveY + (surfTop - aliveY) * eRise + Math.sin(t * 0.6 + ph) * 0.03 * fl, // nổi/lặn + đong đưa Y
        f.z + Math.cos(t * 0.4 + ph * 1.3) * 0.03 * fl
      )
      _qRoll.setFromAxisAngle(_XAXIS, pose.flip + f.bank + Math.sin(t * 0.7 + ph) * 0.12 * fl) // xoay bụng + 🎢 bank + lắc
      _qPitch.setFromAxisAngle(_ZAXIS, f.pitch) // 🎢 chúi mũi (lặn/ngoi)
      _quat
        .setFromAxisAngle(_UP, f.heading + this._throe(f.dp, ph, dying)) // yaw
        .multiply(_qPitch) // · pitch
        .multiply(_qRoll) // · roll (xoay bụng + bank) — throe = body GIẬT trong yaw
      _scl.setScalar(this.fishLength * f.size)
      this.mesh.setMatrixAt(i, _mtx.compose(_pos, _quat, _scl))
      this._lifeArr[i] = 1 - smooth01(Math.min(f.dp * 2, 1)) // đuôi limp per-con (chết = duỗi mềm)
      this._mouthArr[i] = this._mouthAt(f, d) // 🦈 chớp há miệng (chomp) khi vừa đớp
    }
    this.mesh.instanceMatrix.needsUpdate = true // _uLife/_uMouth tự re-pack mỗi RENDER (NodeUpdateType.RENDER)
  }

  // 🦈 Độ MỞ miệng 0..1 frame này (sin 0→1→0 suốt CHOMP_DUR — há rồi ngậm dứt khoát). Đếm ngược chomp. 0 = ngậm.
  private _mouthAt(f: FishState, d: number): number {
    if (f.chomp <= 0) return 0
    const open = Math.sin((1 - f.chomp / CHOMP_DUR) * Math.PI) // CHOMP_DUR→0 ↦ 0→1→0
    f.chomp = Math.max(0, f.chomp - d)
    return open
  }

  // 🐟 Tư thế. flip=roll bụng (0=bụng xuống, π=bụng lên) — CÙNG công thức 2 chiều → xoay bụng hồi sinh ĐÚNG TỐC
  // xoay khi chết. rise=cao độ (0=độ sâu bơi, 1=dưới mặt). CHẾT (p 0→1): [0,0.3] giật → [0.3,1] xoay bụng lên →
  // [0.6,1] nổi. HỒI SINH (p 1→0): xoay bụng xuống, GIỮ Ở MẶT (rise=1, đúng XYZ chết) — KHÔNG rớt Y (wake lo ease).
  private _deathPose(p: number, dying: boolean): { flip: number; rise: number } {
    const flip = Math.PI * smooth01((p - 0.3) / 0.7)
    if (dying) return { flip, rise: smooth01((p - 0.6) / 0.4) }
    return { flip, rise: p > 0 ? 1 : 0 }
  }

  // 🐟 GIẬT (yaw flick, rad). CHẾT = ~2-3 cú CHẬM (ease-out) NHẸ; HỒI SINH = ~2-3 cú NHANH dần (ease-in) nhịp
  // GIÃN hơn, tắt sạch 2 đầu (không rung sau). Pha ×con → đàn không giật đồng loạt.
  private _throe(p: number, ph: number, dying: boolean): number {
    if (dying) {
      const a = Math.min(p / 0.3, 1) // cửa sổ giật [0,0.3] TRƯỚC khi xoay bụng
      return Math.sin((1 - (1 - a) * (1 - a)) * Math.PI * 2.5 + ph * 3) * (1 - a) * 0.25
    }
    if (p <= 0) return 0 // đã sống hẳn = bơi, hết giật
    const b = Math.min((1 - p) / 0.2, 1) // cửa sổ giật hồi sinh [p 1→0.8] (đầu, trước khi xoay bụng xong)
    return Math.sin(b * b * Math.PI * 3 + ph * 3) * Math.min(b, 1 - b) * 2 * 0.45
  }

  // 🐟 wake sau hồi sinh: vừa về sống (dp 0, trước đó >0) → 1 (bám mặt đúng XYZ chết); else ease 0 dần (bơi xuống
  // từ từ, KHÔNG rớt thẳng Y). Tách giữ update complexity ≤10.
  private _wake(f: FishState, dying: boolean, prev: number, d: number): number {
    if (!dying && prev > 0 && f.dp <= 0) return 1
    return Math.max(0, f.wake - d / WAKE_DUR)
  }

  // 🐟 1 con SỐNG: lái + dời theo tốc (đói→chậm ×calmSpeed, ×bứt tốc). Chết (p>0) KHÔNG gọi → đứng tại chỗ.
  // ƯU TIÊN: 🏃 CHẠY TRỐN (prey né predator) > 🦈 SĂN (predator lao mồi) > wander thường. PondPredation set flee/hunt.
  private _swim(f: FishState, d: number, t: number, calmSpeed: number): void {
    if (f.flee) {
      this._fleeStep(f, d, t)
      return
    }
    if (f.hunt) {
      this._huntStep(f, d, t)
      return
    }
    if (this._food.length > 0) {
      const fp = this._nearestFood(f) // chỉ viên ĐÃ THẢ; chưa thả → null → rơi xuống wander
      if (fp) {
        this._forageStep(f, fp, d, t) // 🍽 có thức-ăn đã thả → tới ăn viên gần nhất (ưu tiên dưới flee/hunt)
        return
      }
    }
    this._steer(f, d, t)
    // tốc NHẤP NHÔ theo thời gian (lướt↔rướn) × bứt tốc (1 thường; ×4 phóng / ×0.08 khựng) × đói(chậm)
    const sp =
      f.speed *
      (0.8 + 0.25 * Math.sin(t * 0.6 + f.bob * 2)) *
      this.speed *
      this._burstFactor(f, d) *
      calmSpeed
    f.x += Math.cos(f.heading) * sp * d
    f.z -= Math.sin(f.heading) * sp * d
  }

  // 🦈 SĂN: lao THẲNG tới mồi (heading seek dứt khoát + tốc ×HUNT_DART) + lặn/trồi tới đúng TẦNG mồi (yFrac lerp).
  // Bản năng tự nhiên: phát hiện → tăng tốc → đớp. Bỏ qua wander/đói/bứt-tốc (predator dồn lực vào cú lao).
  private _huntStep(f: FishState, d: number, t: number): void {
    const desired = Math.atan2(f.z - f.hz, f.hx - f.x) // hướng tới (hx,hz) — dir=(cos h,−sin h)
    f.heading += angleDelta(desired, f.heading) * Math.min(1, 7 * d) // quay nhanh, dứt khoát
    f.yFrac += (f.hyFrac - f.yFrac) * Math.min(1, 3 * d) // lặn/trồi tới đúng tầng sâu của mồi
    const sp = f.speed * this.speed * HUNT_DART * (0.9 + 0.2 * Math.sin(t * 9 + f.bob)) // dart + rung tốc
    f.x += Math.cos(f.heading) * sp * d
    f.z -= Math.sin(f.heading) * sp * d
  }

  // 🍽 MÒ ĂN: bơi tới viên fp + TRỒI lên tầng mặt. Quay vừa (không gấp như săn), tốc ×FORAGE_DART. fp do _swim chọn.
  private _forageStep(f: FishState, fp: { x: number; z: number }, d: number, t: number): void {
    const desired = Math.atan2(f.z - fp.z, fp.x - f.x) // hướng tới viên (dir=(cos h,−sin h))
    f.heading += angleDelta(desired, f.heading) * Math.min(1, 4 * d)
    f.yFrac += (FORAGE_YFRAC - f.yFrac) * Math.min(1, 2 * d) // trồi lên tầng MẶT
    const sp = f.speed * this.speed * FORAGE_DART * (0.85 + 0.2 * Math.sin(t * 5 + f.bob))
    f.x += Math.cos(f.heading) * sp * d
    f.z -= Math.sin(f.heading) * sp * d
  }

  // 🍽 Viên ĐÃ THẢ (t ≥ t0) gần con f nhất; bỏ qua viên còn xếp hàng chưa rơi. null = chưa có viên nào thả.
  private _nearestFood(f: FishState): { x: number; z: number } | null {
    const t = this.uTime.value as number
    let best: { x: number; z: number } | null = null
    let bd = Infinity
    for (const fp of this._food) {
      if (t < fp.t0) continue // chưa tới lượt thả
      const dd = Math.hypot(fp.x - f.x, fp.z - f.z)
      if (dd < bd) {
        bd = dd
        best = fp
      }
    }
    return best
  }

  // 🍽 1 frame: (forageOn) rút độ-no + đói thì TỰ rải nhúm; LUÔN ăn viên cá chạm (cả khi rải TAY lúc forage tắt);
  // cập nhật mesh. satiation = school-level → mỗi viên hồi FORAGE_BITE.
  private _tickForage(d: number): void {
    if (this.forageOn) {
      this.satiation = Math.max(0, this.satiation - FORAGE_DRAIN * d) // đói dần (homeostasis)
      if (this._food.length === 0 && this.satiation < FORAGE_HUNGRY) this.scatterFood(FORAGE_AUTO_N)
    }
    if (this._food.length > 0) this._eatFood()
    this._updateFoodMesh()
  }

  // 🍽 Cá chạm viên ĐÃ ĐÁP (rơi xong) → ăn viên đó (xoá) + satiation hồi. Quét NGƯỢC để splice an toàn.
  private _eatFood(): void {
    const r = this.fishLength * 0.7
    const t = this.uTime.value as number
    for (let k = this._food.length - 1; k >= 0; k--) {
      if (t - this._food[k].t0 < DROP_DUR) continue // còn đang RƠI → chưa ăn được (đợi đáp mặt)
      if (this._fishNear(this._food[k].x, this._food[k].z, r)) {
        this._onEat?.(this._food[k].x, this._food[k].z) // 🌊 đớp → sóng lan tại điểm viên (caller: WaterSurface.emitImpact)
        this._food.splice(k, 1)
        this.satiation = Math.min(1, this.satiation + FORAGE_BITE)
      }
    }
  }

  // 🍽 Có con SỐNG nào trong bán kính r của (x,z)?
  private _fishNear(x: number, z: number, r: number): boolean {
    for (const f of this.fish) {
      if (f.consumed || f.dp > 0) continue
      if (Math.hypot(f.x - x, f.z - z) < r) return true
    }
    return false
  }

  /** 🍽 RẢI thức-ăn: n viên (mặc định _foodCount) ở điểm NGẪU NHIÊN trong vùng bơi (tự động khi đói). Viên rơi từ cao. */
  scatterFood(n?: number): void {
    if (this.isDisposed) return
    const k = n ?? this._foodCount
    for (let i = 0; i < k; i++) {
      const pt = this._spawnPoint()
      this._pushFood(pt.x, pt.z)
    }
  }

  /** 🍽 THẢ thức-ăn TẠI ĐIỂM (x,z local) — click hồ: toả _foodCount viên trong bán kính _foodSpread. Viên rơi từ cao. */
  scatterFoodAt(x: number, z: number, n?: number): void {
    if (this.isDisposed) return
    const k = n ?? this._foodCount
    for (let i = 0; i < k; i++) {
      this._pushFood(
        x + (this.rng() - 0.5) * this._foodSpread,
        z + (this.rng() - 0.5) * this._foodSpread
      )
    }
  }

  // 🍽 Thêm 1 viên (cap FOOD_MAX). t0 XẾP HÀNG so le (max giờ, mốc-thả-kế) → các viên RƠI TỪNG cái nối tiếp, không
  // cả chùm. Gap = _foodStagger (config). Dựng InstancedMesh lần đầu.
  private _pushFood(x: number, z: number): void {
    if (this._food.length >= FOOD_MAX) return
    const t0 = Math.max(this.uTime.value as number, this._foodNextRelease)
    this._food.push({ x, z, t0 })
    this._foodNextRelease = t0 + this._foodStagger
    if (!this._foodMesh) this._buildFoodMesh()
  }

  /** 🍽 Cách thả mồi (live): số viên/lần · giãn rơi (s) · độ rộng vùng (m). */
  setFoodCount(n: number): void {
    if (this.isDisposed || Number.isNaN(n)) return
    this._foodCount = Math.max(1, Math.round(n))
  }
  setFoodDrop(s: number): void {
    if (this.isDisposed || Number.isNaN(s)) return
    this._foodStagger = Math.max(0, s)
  }
  setFoodSpread(m: number): void {
    if (this.isDisposed || Number.isNaN(m)) return
    this._foodSpread = Math.max(0, m)
  }

  // 🍽 InstancedMesh N viên (sphere nâu-vàng) = CHILD fish mesh → cùng local space (gốc tâm hồ). Slot thừa scale-0.
  private _buildFoodMesh(): void {
    if (!this.mesh) return
    const geo = new THREE.SphereGeometry(FOOD_R, 8, 6)
    const mat = new MeshLambertNodeMaterial({ color: 0xc89048 }) // viên nâu-vàng (pellet/vụn nổi)
    this._foodMesh = new THREE.InstancedMesh(geo, mat, FOOD_MAX)
    this._foodMesh.castShadow = false
    this._foodMesh.receiveShadow = false
    this._foodMesh.frustumCulled = false // nhiều viên dẹt nổi → né cull nhầm
    this.mesh.add(this._foodMesh)
  }

  // 🍽 Đặt matrix mỗi viên: RƠI từ DROP_H xuống mặt (gia tốc ease-in) rồi bồng bềnh; slot thừa scale-0 (ẩn).
  private _updateFoodMesh(): void {
    const m = this._foodMesh
    if (!m) return
    const surf = this.bounds ? this.bounds.surfaceY : 0
    const t = this.uTime.value as number
    for (let i = 0; i < FOOD_MAX; i++) {
      const fp = this._food[i]
      if (fp && t >= fp.t0) {
        const p = Math.min(1, (t - fp.t0) / DROP_DUR) // 0→1 tiến trình rơi
        const drop = DROP_H * (1 - p * p) // gia tốc (ease-in): cao→0 (đáp mặt)
        _mtx.makeTranslation(fp.x, surf - 0.01 + drop + Math.sin(t * 2 + i) * 0.006, fp.z)
      } else _mtx.makeScale(0, 0, 0) // không có HOẶC chưa tới lượt thả → ẩn
      m.setMatrixAt(i, _mtx)
    }
    m.instanceMatrix.needsUpdate = true
  }

  // 🏃 CHẠY TRỐN: bơi NGƯỢC hướng predator (fx,fz) + panic (giật mạnh, quay đầu GẤP). Tốc theo cửa sổ SPRINT:
  // 2s đầu (fleeT < SPRINT_DUR) = ×fleeBurst NGẪU NHIÊN + BẺ CUA zic-zac (né panic; thoát hay bị đớp ngay); sau =
  // ×FLEE_DART chạy thẳng away (mệt, dễ bị đớp).
  // 🌀 CHỐNG XOAY TẠI CHỖ: cộng dồn góc quay; > 1 vòng (SPIN_LIMIT) = kẹt vòng với predator → "đi thẳng cưỡng bức"
  // STRAIGHT_DUR giây (không quay theo predator nữa) để thoát ra, rồi reset đếm. Phá deadlock cả 2 bậc cùng xoay.
  private _fleeStep(f: FishState, d: number, t: number): void {
    f.fleeT += d // đếm giây đã chạy → còn trong cửa sổ random hay đã về tốc mệt
    const dart = f.fleeT < SPRINT_DUR ? f.fleeBurst : FLEE_DART
    if (f.straightT > 0) {
      f.straightT -= d // đang đi thẳng cưỡng bức → giữ nguyên heading, không quay theo predator
      if (f.straightT <= 0) f.spinAcc = 0 // hết dash → cho phép quay lại từ đầu
    } else {
      const away = Math.atan2(f.fz - f.z, f.x - f.fx) // hướng NGƯỢC predator (đảo so _huntStep)
      const zig = f.fleeT < SPRINT_DUR ? Math.sin(t * ZIG_FREQ + f.bob * 5) * ZIG_AMP : 0 // 🪡 2s đầu = bẻ cua zic-zac né
      const turn = angleDelta(away + zig, f.heading) * Math.min(1, 8 * d) // quay gấp tới (away + lệch zic-zac)
      f.heading += turn
      f.spinAcc += turn // cộng dồn có dấu — zic-zac đối xứng tự triệt; chỉ xoay 1 CHIỀU liên tục (vòng tròn) mới tích
      if (Math.abs(f.spinAcc) > SPIN_LIMIT) f.straightT = STRAIGHT_DUR // > 1 vòng tại chỗ → buộc đi thẳng 2s
    }
    const sp = f.speed * this.speed * dart * (0.85 + 0.35 * Math.sin(t * 13 + f.bob)) // panic, giật mạnh
    f.x += Math.cos(f.heading) * sp * d
    f.z -= Math.sin(f.heading) * sp * d
  }

  // 🐟 TÁCH-THÂN (separation Reynolds): con lọt trong bán kính SEP của con khác → đẩy RA (đụng tách, KHÔNG nhập
  // vào nhau). 2 PHA: tính lực đẩy mọi con (đọc vị trí hiện tại) → áp 1 lượt (không lệ thuộc thứ tự). Bỏ con
  // chết/bị-ăn. O(n²), n≤64 = rẻ.
  private _separate(d: number): void {
    const r = this.fishLength * SEP_K
    for (let i = 0; i < this.fish.length; i++) {
      this._sepX[i] = 0
      this._sepZ[i] = 0
      const a = this.fish[i]
      if (!a.consumed && a.dp <= 0) this._accumPush(i, a, r)
    }
    const spd = this.fishLength * SEP_SPD * d
    for (let i = 0; i < this.fish.length; i++) {
      this.fish[i].x += this._sepX[i] * spd
      this.fish[i].z += this._sepZ[i] * spd
    }
  }

  // Cộng dồn lực đẩy con i RA khỏi mọi con khác trong bán kính r (hướng chuẩn hoá × độ chồng 0..1). Tách giữ rule-50.
  private _accumPush(i: number, a: FishState, r: number): void {
    for (let j = 0; j < this.fish.length; j++) {
      if (j === i) continue
      const b = this.fish[j]
      if (b.consumed || b.dp > 0) continue
      const dx = a.x - b.x
      const dz = a.z - b.z
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r || d2 < 1e-8) continue
      const dist = Math.sqrt(d2)
      const push = (r - dist) / r // gần hơn = đẩy mạnh hơn (0 ở mép, →1 khi gần trùng tâm)
      this._sepX[i] += (dx / dist) * push
      this._sepZ[i] += (dz / dist) * push
    }
  }

  /** Tốc độ bơi gốc (m/s). Range [0, 2]. Tần vẫy đuôi theo tốc. */
  setSpeed(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.speed = Math.max(0, Math.min(2, v))
    this.uFlap.value = 4 + this.speed * 10
  }

  /** Bán kính vùng bơi (m). Min 0.3 — cá ngoài vùng tự lượn về. */
  setAreaRadius(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.areaRadius = Math.max(0.3, v)
  }

  /** Cao độ bơi so với gốc mesh (m, âm = chìm). */
  setDepthY(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.depthY = v
  }

  /** Chiều dài cá (m). Min 0.05. Áp frame kế (matrix compose mỗi update). */
  setFishLength(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.fishLength = Math.max(0.05, v)
  }

  /** Xáo bộ màu cam/đốm cả đàn (uniform live — 0 rebuild). */
  setColorSeed(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.uSeed.value = v
  }

  /** 🐟 Bề dày bơi đứng (m, ≥0) — cá rải trong khối trụ radius×swimDepth. Áp frame kế. */
  setSwimDepth(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.swimDepth = Math.max(0, v)
  }

  /** 🐟 Độ mập thân (×tiết diện, ≥0.2) — uniform live. */
  setBodyWidth(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.uWidth.value = Math.max(0.2, v)
  }

  /** 🎨 3 màu koi (hex) — uniform live, 0 rebuild. */
  setColors(base: number, patch: number, spot: number): void {
    if (this.isDisposed) return
    this.uColBase.value.setHex(base)
    this.uColPatch.value.setHex(patch)
    this.uColSpot.value.setHex(spot)
  }

  /** 🎨 Tỉ lệ mảng màu 0..1 (cao = nhiều mảng) — uniform live. */
  setPatchAmount(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.uPatchAmt.value = Math.max(0, Math.min(1, v))
  }

  /** 🐟 Hành vi (×, ≥0): biên độ lượn chữ S / lăng xăng / nhấp nhô dọc — field CPU, áp frame kế. */
  setSwayAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.swayAmp = Math.max(0, v)
  }

  setWanderAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.wanderAmp = Math.max(0, v)
  }

  setBobAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.bobAmp = Math.max(0, v)
  }

  /** 🎢 Độ NGHIÊNG thân vào cua (bank, ×, ≥0) — field CPU, áp frame kế. */
  setBankAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.bankAmp = Math.max(0, v)
  }

  /** 🎢 Độ CHÚI mũi khi lặn/ngoi (pitch, ×, ≥0) — field CPU, áp frame kế. */
  setPitchAmp(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.pitchAmp = Math.max(0, v)
  }

  /** 🐟 Bật/tắt BƠI THEO ĐÀN (boids cohesion+alignment) — tắt = wander độc lập (separation vẫn chạy). */
  setSchooling(on: boolean): void {
    if (this.isDisposed) return
    this.schooling = !!on
  }

  /** 🍽 Bật/tắt MÒ ĂN TỰ ĐỘNG (đói tự rải + rút độ-no). Tắt = no tĩnh; thức-ăn rải TAY vẫn ăn được. Field CPU. */
  setForage(on: boolean): void {
    if (this.isDisposed) return
    this.forageOn = !!on
  }

  /** 🌊 Đăng ký callback "đớp mồi tại (x,z) LOCAL" → caller (ArchPlanLab) bắn sóng lan trên WaterSurface (emitImpact). */
  setEatRipple(fn: ((x: number, z: number) => void) | null): void {
    if (this.isDisposed) return
    this._onEat = fn
  }

  /** 🐟 Tần suất BỨT TỐC ngẫu nhiên (0..1; 0 = tắt) — field CPU, áp frame kế. */
  setBurstRate(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.burstRate = Math.max(0, Math.min(1, v))
  }

  /** 🐟 Độ NO (0..1): 1 = no/bơi thường; →0 = đói càng nhanh/frantic; 0 = CHẾT phơi bụng. Field CPU, áp frame kế. */
  setSatiation(v: number): void {
    if (this.isDisposed || Number.isNaN(v)) return
    this.satiation = Math.max(0, Math.min(1, v))
  }

  /** 🐟 VÙNG BƠI = lòng hồ thật (polygon local + mặt nước + đáy theo gò). null = về vòng tròn areaRadius.
   *  Tính sẵn centroid (steer quay-về-tâm). Cá đang ngoài polygon mới → _steer tự kéo về frame kế. */
  setBounds(b: PondBounds | null): void {
    this.bounds = b
    if (b && b.polygon.length >= 3) {
      let sx = 0
      let sz = 0
      for (const p of b.polygon) {
        sx += p.x
        sz += p.z
      }
      this._cx = sx / b.polygon.length
      this._cz = sz / b.polygon.length
    } else {
      this._cx = 0
      this._cz = 0
    }
  }

  getMesh(): THREE.InstancedMesh {
    if (!this.mesh) throw new Error('PondFish: đã dispose')
    return this.mesh
  }

  getCount(): number {
    return this.fish.length
  }

  /** 🐟 BẬC của đàn (1..6) — predation dùng để xếp ai-ăn-ai (bậc nhỏ-số ăn bậc lớn-số). */
  getTier(): number {
    return this.tier
  }

  // ── 🦈 PREDATION API (coordinator PondPredation gọi) — toạ độ LOCAL (mọi đàn CÙNG pond chung gốc mesh = tâm hồ) ──

  /** Snapshot vị trí + heading cá (mảng MỚI, N≤64 rẻ). heading → coordinator tính MIỆNG (đầu cá) để đớp đúng
   *  sát. alive = bơi thật (chưa chết đói dp≤0, chưa bị đớp). */
  getFishView(): { x: number; z: number; yFrac: number; heading: number; alive: boolean }[] {
    return this.fish.map((f) => ({
      x: f.x,
      z: f.z,
      yFrac: f.yFrac,
      heading: f.heading,
      alive: !f.consumed && f.dp <= 0,
    }))
  }

  /** Chiều dài cá gốc (m) — coordinator tính bán kính phát hiện/đớp theo cỡ predator. */
  getFishLength(): number {
    return this.fishLength
  }

  /** 🟡 Đàn CÓ ĐI SĂN không = slider Đói ở vùng VÀNG (level 6..10). No (>10) = không đói; đỏ (<6) = đang chết. */
  canHunt(): boolean {
    const lvl = Math.round(this.satiation * 20)
    return lvl >= 6 && lvl <= 10
  }

  /** 🦈 Bật SĂN cá i → lao tới target LOCAL (x,z,yFrac). Coordinator gọi mỗi frame (đổi target = mồi gần nhất). */
  setHunt(i: number, x: number, z: number, yFrac: number): void {
    const f = this.fish[i]
    if (!f || f.consumed) return
    f.hunt = true
    f.hx = x
    f.hz = z
    f.hyFrac = yFrac
  }

  /** Tắt SĂN cá i (không còn mồi trong tầm) → về wander thường. */
  clearHunt(i: number): void {
    const f = this.fish[i]
    if (f) f.hunt = false
  }

  /** 🏃 Bật CHẠY TRỐN cá i → bơi NGƯỢC khỏi predator tại (x,z) LOCAL. Coordinator gọi mỗi frame (predator gần nhất).
   *  Lần CHỚM flee (đang không chạy → chạy) mở cửa sổ SPRINT 2s + roll tốc ngẫu nhiên (số phận: thoát / bị đớp ngay). */
  setFlee(i: number, x: number, z: number): void {
    const f = this.fish[i]
    if (!f || f.consumed) return
    if (!f.flee) {
      f.fleeT = 0
      f.fleeBurst = SPRINT_MIN + this.rng() * (SPRINT_MAX - SPRINT_MIN)
      f.spinAcc = 0 // 🌀 reset đếm xoay cho lượt chạy mới
      f.straightT = 0
    }
    f.flee = true
    f.fx = x
    f.fz = z
  }

  /** Tắt CHẠY TRỐN cá i (không còn predator gần) → về hunt/wander. */
  clearFlee(i: number): void {
    const f = this.fish[i]
    if (f) f.flee = false
  }

  /** 🦈 ĐỚP: cá i bị ăn → biến mất (ẩn instance frame kế, scale 0). Hồi lại = resetSchool. */
  consume(i: number): void {
    const f = this.fish[i]
    if (f) f.consumed = true
  }

  /** 🦈 CHỚP há miệng cá i 1 cú (CHOMP_DUR ~0.28s, há→ngậm) — predator gọi ĐÚNG LÚC đớp mồi (PondPredation). */
  chomp(i: number): void {
    const f = this.fish[i]
    if (f && !f.consumed) f.chomp = CHOMP_DUR
  }

  /** 🦈 RESET đàn: HỒI mọi cá bị đớp (consumed→false) + tắt săn → cá hiện lại frame kế. Nút "Reset đàn" GUI. */
  resetSchool(): void {
    for (const f of this.fish) {
      f.consumed = false
      f.hunt = false
    }
  }

  getTriangleCount(): number {
    if (!this.geometry || !this.mesh) return 0
    const index = this.geometry.getIndex()
    return index ? (index.count / 3) * this.mesh.count : 0
  }

  dispose(): void {
    if (this.isDisposed) return
    if (this.mesh) this.mesh.parent?.remove(this.mesh)
    this.geometry?.dispose()
    this.material?.dispose()
    if (this._foodMesh) {
      this._foodMesh.geometry.dispose() // 🍽 viên thức-ăn (InstancedMesh child) — geo+mat+buffer riêng
      ;(this._foodMesh.material as THREE.Material).dispose()
      this._foodMesh.dispose()
      this._foodMesh = null
    }
    this._onEat = null // 🌊 bỏ ref callback (giữ WaterSurface) → né stale sau dispose
    this.mesh?.dispose() // InstancedMesh giữ buffer instanceMatrix riêng
    this.mesh = null
    this.geometry = null
    this.material = null
    this.fish.length = 0
    this.isDisposed = true
  }
}
