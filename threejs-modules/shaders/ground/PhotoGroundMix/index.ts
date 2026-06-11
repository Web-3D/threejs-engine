/**
 * VỊ TRÍ   — threejs-modules/shaders/ground/PhotoGroundMix/index.ts
 * VAI TRÒ  — Ground MIX nhiều texture (port bộ nền Lab archplan sang TSL/WebGPU — NgQuan 2026-06-10
 *            "bê nguyên bộ nền Lab vào thay texture trong Z1"): BASE + ≤4 SLOT lớp, mỗi lớp mask fbm
 *            (ngưỡng/mềm biên/seed riêng) + HEIGHT-LERP (chênh luminance albedo ≈ cao độ — lớp lấn theo
 *            viên thay vì fade đều) + mask VẼ TAY optional (DataTexture, kênh R/G/B/A = slot, uv zone-local)
 *            + TEXTURE BOMBING per-ô (xoay 90°×k|tự do + offset + jitter scale — iq stochastic) + MACRO
 *            (sáng/tối + loang úa) + TRỘN XA dual-scale theo khoảng cách camera. Node material →
 *            lighting/shadow/ngày-đêm của app ăn TỰ NHIÊN (khác bản Lab GLSL tự chiếu sáng).
 * LIÊN HỆ  — Kiến trúc kế thừa PhotoGround (world-XZ uv + normal dựng tay T=+X B=+Z N=+Y, né NormalMapNode
 *            default-uv). Bản tham chiếu GLSL: archplan/gui/ground-lab.ts (Lab 🟫 — giữ song song có chủ đích).
 *            Plan port: Factory/deferred/ground-mix-port-plan.md. Consumer: site-kit zone surface (stage 2).
 *
 * GIỚI HẠN stage 1: roughness/ao lấy của BASE cho cả mặt (không per-lớp — đỡ 8 tap); far chỉ pha albedo.
 * STAGE 3 (2026-06-10): bias/seed per-slot + rect paint = UNIFORM live (setSlot/setPaintRect — kéo Ngưỡng/
 * dời zone KHÔNG recompile; chỉ đổi TEXTURE/số slot mới dựng lại graph). paint = 1 DataTexture caller đưa vào.
 * STAGE 4 (2026-06-11): mapping 'xz'|'uv'|'wall' — mix lên MẶT ĐỨNG (vách hồ uv mét chu-vi×cao / tường rào
 * planar đứng theo normal); normal frame TBN tại-mặt khi không phải 'xz'. Móng cho mix tường rêu phong.
 * CHI PHÍ: nặng nhất hệ ground (4 tap × A+N × 5 bộ + far) — chỉ mặt bật mix mới trả.
 *
 * CÁCH DÙNG: const g = new PhotoGroundMix({ base: maps, slots: [{ maps, bias: 0.5, seed: 13.7 }], paint: tex })
 *            g.setPaintRect(ox, oz, sx, sz) // rect world-XZ của zone (uv mask = (world − o)/s)
 *            mesh.material = g.getMaterial() // texture caller load (PROTOCOL) + set wrap Repeat
 * DISPOSE: dispose() — NodeMaterial; KHÔNG dispose texture (caller sở hữu, như PhotoGround).
 */

import type * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import type UniformNode from 'three/src/nodes/core/UniformNode.js'
import type { ShaderNodeObject } from 'three/tsl'
import {
  cameraPosition,
  cross,
  float,
  luminance,
  max,
  mix,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  normalWorld,
  positionWorld,
  rotate,
  select,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

import type { PhotoGroundMaps } from '../PhotoGround'

type TSLNode = ShaderNodeObject<Node>
type UniformNum = ShaderNodeObject<UniformNode<number>> // uniform(number) — set .value live
type AN = { A: TSLNode; N: TSLNode } // albedo (vec3) + normal tangent-space (vec3, z = blue)

/** 🧱 Quy luật TRỌNG LỰC/VỊ TRÍ per-slot trên MẶT ĐỨNG (tường rêu phong — kiểu Substance generators).
 *  Chỉ ăn khi mapping ≠ 'xz' (cần trục y tường: footY/wallH qua setWallRange). Đổi rule = dựng lại graph. */
export type MixGravityRule = 'foot' | 'streak' | 'moss'

/** 1 SLOT lớp trộn: bộ map + ngưỡng mask + seed fbm riêng (loang khác chỗ giữa các slot).
 *  bias/seed = giá trị ĐẦU — sau đó chỉnh live qua setSlot(i, bias, seed), không dựng lại. */
export interface MixSlot {
  maps: PhotoGroundMaps
  bias: number // ngưỡng mask 0..1 (cao = ít xuất hiện)
  seed: number // seed fbm riêng slot
  rule?: MixGravityRule // 🧱 'foot' chân bùn · 'streak' vệt chảy dọc · 'moss' rêu ẩm — undefined = none
}

/** Hệ tọa độ trải texture + mask (stage 4 — mix lên mặt ĐỨNG, NgQuan 2026-06-11):
 *  'xz'   = world-XZ planar (mặt NẰM: nền/zone/đáy hồ — như cũ, default).
 *  'uv'   = attribute uv MÉT baked trong geometry (mặt ĐỨNG có uv thật: vách hồ chu-vi×cao). Paint theo uv.
 *  'wall' = world planar ĐỨNG tự chọn trục (|N.x|>|N.z| → (z,y), ngược lại (x,y)) — mặt đứng KHÔNG uv
 *           (tường rào boxes/stone). KHÔNG hỗ trợ paint vẽ tay (u không phải chu-vi — vẽ sẽ mirror 2 cạnh đối). */
export type MixMapping = 'xz' | 'uv' | 'wall'

export interface PhotoGroundMixOptions {
  base: PhotoGroundMaps
  slots?: MixSlot[] // ≤ 4 (kênh paint R/G/B/A)
  /** Mask VẼ TAY (stage 3): DataTexture RGBA, kênh i = slot i; uv zone-local = (coord − paintO)/paintS —
   *  rect qua 4 uniform (setPaintRect) → zone dời/resize KHÔNG dựng lại graph. coord theo mapping
   *  ('xz' = worldXZ; 'uv' = uv mét; 'wall' = paint TẮT). */
  paint?: THREE.Texture
  tileSizeMeters?: number // default 2 (PROTOCOL kho)
  mapping?: MixMapping // default 'xz'
}

const CH = ['r', 'g', 'b', 'a'] as const // kênh paint theo slot

export class PhotoGroundMix {
  private material: MeshStandardNodeMaterial | null = null
  private isDisposed = false

  // Live uniforms — setter không dựng lại material (đổi texture/slot count = dựng PhotoGroundMix mới)
  private readonly u = {
    invTile: uniform(0.5),
    bomb: uniform(1), // 0 = lát thẳng · 1 = full bombing
    rotFree: uniform(0), // 0 = xoay 90°×k · 1 = góc tự do
    seed: uniform(0),
    scaleJit: uniform(0),
    margin: uniform(0.12), // mép trộn 4 ô
    macro: uniform(0.35),
    macroScale: uniform(0.35), // 1/m world (Lab dùng theo tile — app theo mét)
    tint: uniform(0.25), // loang úa
    maskScale: uniform(0.6), // 1/m world cho fbm mask lớp
    maskSoft: uniform(0.18),
    heightK: uniform(0.3), // height-lerp proxy (0 = fade đều)
    farOn: uniform(0.6),
    farRange: uniform(16),
    normalScale: uniform(1),
    paintOX: uniform(0), // rect world-XZ của mask vẽ (setPaintRect) — origin
    paintOZ: uniform(0),
    paintSX: uniform(1), // size (m) — clamp ≥1e-6 trong setter (né chia 0)
    paintSZ: uniform(1),
    gravity: uniform(0.6), // 🧱 cường độ rule trọng lực (slot.rule, mặt đứng) — 0 = tắt
    footY: uniform(0), // m — chân tường world-Y (setWallRange; hệ y = trục v của _surfUV)
    wallH: uniform(1), // m — chiều cao tường (chuẩn hóa yN cho rule)
  }

  // Uniform PER-SLOT (stage 3): kéo Ngưỡng = setSlot → đổi .value, KHÔNG dựng lại material (hết khựng recompile).
  private readonly slotU: { bias: UniformNum; seed: UniformNum }[]
  private readonly mapping: MixMapping // hệ tọa độ trải — chốt lúc dựng (đổi = dựng material mới)

  constructor(opts: PhotoGroundMixOptions) {
    this.u.invTile.value = 1 / Math.max(0.01, opts.tileSizeMeters ?? 2)
    this.mapping = opts.mapping ?? 'xz'
    this.slotU = (opts.slots ?? [])
      .slice(0, 4)
      .map((s) => ({ bias: uniform(s.bias), seed: uniform(s.seed) }))
    this.material = this._build(opts)
  }

  // Tọa độ 2D (MÉT) trải texture + fbm mask theo mapping: 'xz' world nằm · 'uv' attribute mét (vách hồ) ·
  // 'wall' planar đứng chọn trục theo normal (|N.x|>|N.z| → mặt nhìn ±X → (z,y); ngược lại (x,y)).
  private _surfUV(): TSLNode {
    if (this.mapping === 'uv') return uv() as unknown as TSLNode
    if (this.mapping === 'wall') {
      const horiz = select(
        normalWorld.x.abs().greaterThan(normalWorld.z.abs()),
        positionWorld.z,
        positionWorld.x
      )
      return vec2(horiz, positionWorld.y) as TSLNode
    }
    return positionWorld.xz as TSLNode
  }

  // Normal tangent-space (nrm: x,y = đỏ/lục, z = blue) → world. 'xz': frame cứng T=+X B=+Z N=+Y (mặt nằm,
  // như PhotoGround). 'uv'/'wall': TBN tại-mặt từ normalWorld — T = cross(up,N) ngang tường (+eps né suy biến
  // ở mặt ngửa như đỉnh tường rào), B = cross(N,T) ≈ +Y. Hướng T có thể lật trên vài cạnh (đá gần isotropic —
  // chấp nhận v1).
  private _worldNormal(nrm: TSLNode): TSLNode {
    const s = this.u.normalScale
    if (this.mapping === 'xz') return vec3(nrm.x.mul(s), nrm.z, nrm.y.mul(s)).normalize() as TSLNode
    const N = normalWorld
    const T = cross(vec3(0, 1, 0), N)
      .add(vec3(1e-5, 0, 0))
      .normalize() as TSLNode
    const B = cross(N, T) as TSLNode
    return T.mul(nrm.x.mul(s))
      .add(B.mul(nrm.y.mul(s)))
      .add(N.mul(nrm.z))
      .normalize() as TSLNode
  }

  // 1 Ô bombing: hash per-ô (mx_cell_noise ổn định theo id) → góc + offset + jitter scale; albedo sample
  // tại q = rotate(p,ang)·sc + off; normal.xy xoay NGƯỢC góc đưa vector trong ảnh về mặt (bài học Lab —
  // thiếu là đèn sai hướng ở ô xoay). Không normal map → N phẳng (0,0,1), khỏi xoay.
  private _cellAN(maps: PhotoGroundMaps, id: TSLNode, p: TSLNode): AN {
    const sid = vec3(id.add(this.u.seed.mul(0.1231)), 7.7) as TSLNode
    const h = mx_cell_noise_float(sid).mul(0.5).add(0.5) as TSLNode // ~[0,1] per-ô
    const h2 = mx_cell_noise_float(sid.add(vec3(5.7, 9.1, 0)))
      .mul(0.5)
      .add(0.5) as TSLNode
    const ang = mix(
      h
        .mul(3.999)
        .floor()
        .mul(Math.PI / 2),
      h.mul(Math.PI * 2),
      this.u.rotFree
    ) as TSLNode
    const sc = float(1).add(h2.sub(0.5).mul(2).mul(this.u.scaleJit)) as TSLNode
    const off = vec2(h2, h).mul(7.31) as TSLNode
    const q = rotate(p, ang).mul(sc).add(off) as TSLNode
    const A = texture(maps.baseColor, q).rgb as TSLNode
    if (!maps.normal) return { A, N: vec3(0, 0, 1) as TSLNode }
    const n = texture(maps.normal, q).xyz.mul(2).sub(1) as TSLNode
    return { A, N: vec3(rotate(n.xy, ang.negate()), n.z) as TSLNode }
  }

  // Trộn 4 ô lân cận theo mép smoothstep (margin) — albedo + normal CHUNG trọng số; pha thẳng↔bombing theo uBomb.
  private _bombAN(maps: PhotoGroundMaps, p: TSLNode): AN {
    const s = p.sub(0.5) as TSLNode
    const id = s.floor() as TSLNode
    const f = s.fract() as TSLNode
    const w = smoothstep(float(0.5).sub(this.u.margin), float(0.5).add(this.u.margin), f) as TSLNode
    const c00 = this._cellAN(maps, id, p)
    const c10 = this._cellAN(maps, id.add(vec2(1, 0)) as TSLNode, p)
    const c01 = this._cellAN(maps, id.add(vec2(0, 1)) as TSLNode, p)
    const c11 = this._cellAN(maps, id.add(vec2(1, 1)) as TSLNode, p)
    const A4 = mix(mix(c00.A, c10.A, w.x), mix(c01.A, c11.A, w.x), w.y) as TSLNode
    const N4 = mix(mix(c00.N, c10.N, w.x), mix(c01.N, c11.N, w.x), w.y) as TSLNode
    const A0 = texture(maps.baseColor, p).rgb as TSLNode
    const N0 = (maps.normal ? texture(maps.normal, p).xyz.mul(2).sub(1) : vec3(0, 0, 1)) as TSLNode
    return {
      A: mix(A0, A4, this.u.bomb) as TSLNode,
      N: mix(N0, N4, this.u.bomb) as TSLNode,
    }
  }

  // 1 BỘ texture tại uvw: bombing + TRỘN XA (albedo pha bản scale 0.23 theo khoảng cách camera — chu kỳ
  // lệch pha diệt lặp ở xa; normal giữ bản gần, relief xa không thấy).
  private _setAN(maps: PhotoGroundMaps, uvw: TSLNode, far: TSLNode): AN {
    const near = this._bombAN(maps, uvw)
    const fa = this._bombAN(maps, uvw.mul(0.23) as TSLNode)
    return { A: mix(near.A, fa.A, far) as TSLNode, N: near.N }
  }

  // 🧱 Mask quy luật TRỌNG LỰC 1 slot trên mặt đứng (0..1). yN = cao chuẩn hóa (0=chân 1=đỉnh, footY/wallH).
  // 'foot' = bùn bám chân (1 − smoothstep 8..60% cao) · 'streak' = vệt nước chảy dọc (fbm NÉN trục y 3.1:0.22
  // → sọc dài; sharpen 0.52..0.78 thành vệt; đậm dần xuống dưới — nước dồn) · 'moss' = rêu ẩm chân tường
  // (gradient sát chân × fbm mép nham nhở). "Hướng ít nắng" (moss theo sun) = deferred — cần sun dir uniform.
  private _ruleMask(rule: MixGravityRule, p: TSLNode, seed: UniformNum): TSLNode {
    const yN = p.y.sub(this.u.footY).div(this.u.wallH.max(0.01)).clamp(0, 1) as TSLNode
    if (rule === 'foot') return float(1).sub(smoothstep(0.08, 0.6, yN)) as TSLNode
    if (rule === 'streak') {
      const st = mx_fractal_noise_float(vec3(p.x.mul(3.1), p.y.mul(0.22), seed.mul(0.31).add(4.7)))
        .mul(0.5)
        .add(0.5) as TSLNode
      return smoothstep(0.52, 0.78, st).mul(yN.oneMinus().mul(0.5).add(0.5)) as TSLNode
    }
    const m = mx_fractal_noise_float(vec3(p.mul(1.7), seed.mul(0.53).add(9.1)))
      .mul(0.5)
      .add(0.5) as TSLNode
    return float(1)
      .sub(smoothstep(0.0, 0.45, yN))
      .mul(m.mul(0.65).add(0.35)) as TSLNode
  }

  // Mask 1 lớp: fbm world (seed riêng) + CHÊNH luminance(lớp − màu tích lũy)·heightK đẩy vào TRƯỚC smoothstep
  // (height-lerp proxy — biên bám cấu trúc vật liệu), rồi MAX với kênh vẽ tay (chủ đích thắng loang).
  // bias/seed = uniform per-slot (stage 3). 🧱 slot.rule + mặt đứng → cộng (ruleMask−0.5)·2·gravity vào raw
  // TRƯỚC smoothstep (rule đẩy/ghìm fbm theo vị trí — gravity=0 trả về thuần fbm).
  private _layerMask(
    i: number,
    A: TSLNode,
    col: TSLNode,
    wxz: TSLNode,
    pv: TSLNode,
    rule?: MixGravityRule
  ): TSLNode {
    const su = this.slotU[i]
    const fb = mx_fractal_noise_float(vec3(wxz.mul(this.u.maskScale), su.seed))
      .mul(0.5)
      .add(0.5) as TSLNode
    let raw = fb.add(luminance(A).sub(luminance(col)).mul(this.u.heightK)) as TSLNode
    if (rule && this.mapping !== 'xz')
      raw = raw.add(
        this._ruleMask(rule, wxz, su.seed).sub(0.5).mul(this.u.gravity.mul(2))
      ) as TSLNode
    const m = smoothstep(su.bias.sub(this.u.maskSoft), su.bias.add(this.u.maskSoft), raw) as TSLNode
    return max(m, pv) as TSLNode
  }

  // Kênh vẽ tay của slot i — không có paint tex / mapping 'wall' → 0 (mask chỉ fbm). Rect = uniform →
  // setPaintRect live. Coord theo mapping: 'xz' = worldXZ; 'uv' = uv mét (vách hồ — stamp dùng isect.uv khớp).
  private _paintCh(opts: PhotoGroundMixOptions, i: number): TSLNode {
    if (!opts.paint || this.mapping === 'wall') return float(0) as TSLNode
    const coord = (this.mapping === 'uv' ? uv() : positionWorld.xz) as TSLNode
    const uvP = coord
      .sub(vec2(this.u.paintOX, this.u.paintOZ))
      .div(vec2(this.u.paintSX, this.u.paintSZ)) as TSLNode
    return texture(opts.paint, uvP)[CH[i]] as TSLNode
  }

  // Ráp graph: base → 4 lớp → macro/úa → colorNode; normal blend → world ('xz': T=+X B=+Z N=+Y như
  // PhotoGround; 'uv'/'wall': TBN từ normalWorld + up — T=cross(up,N) ngang tường, B≈+Y)
  // → transformNormalToView. rough/ao của BASE (stage 1).
  private _build(opts: PhotoGroundMixOptions): MeshStandardNodeMaterial {
    const wxz = this._surfUV() // 'xz' = world-XZ (như cũ) · 'uv'/'wall' = tọa độ mặt đứng (mét)
    const uvw = wxz.mul(this.u.invTile) as TSLNode
    const far = this.u.farOn.mul(
      smoothstep(
        this.u.farRange.mul(0.45),
        this.u.farRange,
        cameraPosition.sub(positionWorld).length()
      )
    ) as TSLNode
    const base = this._setAN(opts.base, uvw, far)
    let col = base.A
    let nrm = base.N
    const slots = (opts.slots ?? []).slice(0, 4)
    slots.forEach((slot, i) => {
      const L = this._setAN(slot.maps, uvw, far)
      const m = this._layerMask(i, L.A, col, wxz, this._paintCh(opts, i), slot.rule)
      col = mix(col, L.A, m) as TSLNode
      nrm = mix(nrm, L.N, m) as TSLNode
    })
    // macro sáng/tối tần thấp + loang úa nhuộm ấm từng vạt (công thức Lab, scale theo MÉT world)
    const mm = mx_fractal_noise_float(vec3(wxz.mul(this.u.macroScale), 3.3))
      .mul(0.5)
      .add(0.5) as TSLNode
    col = col.mul(float(1).add(this.u.macro.mul(mm.sub(0.5)).mul(1.4))) as TSLNode
    const tm = smoothstep(
      0.35,
      0.75,
      mx_fractal_noise_float(vec3(wxz.mul(this.u.macroScale.mul(0.5)), 9.9))
        .mul(0.5)
        .add(0.5)
    ) as TSLNode
    col = mix(col, col.mul(vec3(1.18, 1.02, 0.55)), this.u.tint.mul(tm)) as TSLNode

    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = col
    mat.normalNode = transformNormalToView(this._worldNormal(nrm)) as TSLNode
    if (opts.base.roughness) mat.roughnessNode = texture(opts.base.roughness, uvw).r as TSLNode
    if (opts.base.ao) mat.aoNode = texture(opts.base.ao, uvw).r as TSLNode
    mat.metalness = 0
    return mat
  }

  /** Set 1 uniform live theo tên (bomb/rotFree/seed/scaleJit/margin/macro/macroScale/tint/maskScale/
   *  maskSoft/heightK/farOn/farRange/normalScale) — khớp slider mixer board. */
  set(name: keyof PhotoGroundMix['u'], v: number): void {
    if (!this.isDisposed) this.u[name].value = v
  }

  /** Bias/seed live của slot i (uniform — KHÔNG recompile; đổi texture/số slot mới dựng lại graph). */
  setSlot(i: number, bias: number, seed: number): void {
    const su = this.slotU[i]
    if (!su || this.isDisposed) return
    su.bias.value = bias
    su.seed.value = seed
  }

  /** 🧱 Dải cao tường (m): footY = chân (world-Y), h = chiều cao — chuẩn hóa yN cho rule trọng lực
   *  (foot/streak/moss). Uniform live — đổi depth hồ/cao rào chỉ set lại. Chỉ có nghĩa khi mapping ≠ 'xz'. */
  setWallRange(footY: number, h: number): void {
    if (this.isDisposed) return
    this.u.footY.value = footY
    this.u.wallH.value = Math.max(0.01, h)
  }

  /** Rect world-XZ của mask vẽ (origin + size m) — uniform live, gọi lại mỗi khi zone dời/resize. */
  setPaintRect(ox: number, oz: number, sx: number, sz: number): void {
    if (this.isDisposed) return
    this.u.paintOX.value = ox
    this.u.paintOZ.value = oz
    this.u.paintSX.value = Math.max(1e-6, sx)
    this.u.paintSZ.value = Math.max(1e-6, sz)
  }

  setTileSizeMeters(v: number): void {
    if (!this.isDisposed) this.u.invTile.value = 1 / Math.max(0.01, v)
  }

  getMaterial(): MeshStandardNodeMaterial {
    if (!this.material) throw new Error('PhotoGroundMix: already disposed')
    return this.material
  }

  dispose(): void {
    if (this.isDisposed) return
    this.material?.dispose()
    this.material = null
    this.isDisposed = true // texture KHÔNG dispose — caller sở hữu
  }
}
