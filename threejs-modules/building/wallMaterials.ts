/**
 * VỊ TRÍ   — building-kit/wallMaterials.ts
 * VAI TRÒ  — Wall material subsystem (ENGINE, dùng chung): surface shader (brick/concrete/wood/metal),
 *            brick-tex PBR triplanar, + cache material theo key (WallMaterialCache) để merge tường.
 * LIÊN HỆ  — NGUỒN SỰ THẬT chung cho editor (archplan) lẫn headless (BuildingFromState). Pure, không host,
 *            KHÔNG phụ thuộc archplan-type — nhận `WallMatInput` (struct), SegmentState/SegmentJSON đều thoả.
 *            Tách từ archplan/build/materials.ts 2026-06-01 (Gap 1 unify — chống drift KI-001).
 *
 * CÁCH DÙNG:
 *   const cache = new WallMaterialCache()
 *   const key = cache.wallKey(seg)                 // seg: bất kỳ thứ gì có đủ field WallMatInput
 *   const mat = cache.ensureMat(key, seg.material, wallColor(seg), seg.matScale, brickOptsOf(seg))
 *   cache.sweep(usedKeys)   // dispose entry không còn dùng cuối mỗi build
 *   cache.dispose()         // dispose toàn bộ + brick textures
 * DISPOSE: WallMaterialCache.dispose() giải phóng mọi material/shader trong cache + brick texture.
 */

import * as THREE from 'three'
import type Node from 'three/src/nodes/core/Node.js'
import {
  faceDirection,
  float,
  normalView,
  normalWorld,
  positionView,
  positionWorld,
  type ShaderNodeObject,
  texture,
  triplanarTexture,
  vec2,
} from 'three/tsl'
import { MeshStandardNodeMaterial, type NodeMaterial } from 'three/webgpu'

import { BrickWall } from '../shaders/fragment/BrickWall'
import { ConcretePanel } from '../shaders/fragment/ConcretePanel'
import { MetalPanel } from '../shaders/fragment/MetalPanel'
import { SeigaihaScreen } from '../shaders/fragment/SeigaihaScreen'
import { ShojiScreen } from '../shaders/fragment/ShojiScreen'
import { WoodPlank } from '../shaders/fragment/WoodPlank'
import { WALL_COLORS } from './tokens'

// Vật liệu bề mặt tường. 'brick'/'concrete'/'wood'/'metal' = procedural shader (lit). 'brick-tex' =
// PBR texture thật (triplanar). 'brick-3d'/'wood-3d'/'wood-strip' = GEOMETRY THẬT (component instanced,
// KHÔNG qua material cache — xử lý ở wall-assembly). 'none' = MeshToon phẳng.
export type WallMaterial =
  | 'none'
  | 'brick'
  | 'concrete'
  | 'wood'
  | 'metal'
  | 'jp-screen' // tường tranh Nhật (fusuma seigaiha) — procedural surface shader lit
  | 'jp-shoji' // tường shoji Nhật (lưới kumiko + giấy washi) — procedural surface shader lit
  | 'jp-shoji-glass' // shoji nhưng ô = KÍNH (roughness thấp, bóng) thay giấy
  | 'brick-tex'
  | 'brick-3d'
  | 'wood-3d'
  | 'wood-strip'

// Input struct cho color/key — chỉ field material-liên-quan. SegmentState (editor, mm) và
// SegmentJSON (headless, m) đều thoả structural → KHÔNG cần biết archplan-type.
export interface WallMatInput {
  material: WallMaterial
  colorIndex: number
  paintColor: number | null
  matScale: number
  mortarColor: number
  brickRelief: number
  glassReflect?: number // jp-shoji-glass — optional (backward-compat)
  glassOpacity?: number
  trucCell?: number // jp-shoji* — khoảng cách trục/nan gỗ + độ nhiễu vân
  nanCell?: number
  woodGrain?: number
}

// AP5 — registry entry: material đã build + shader instance (giữ để dispose). 'none' → null.
export interface WallMatEntry {
  mat: THREE.Material
  shader: { dispose(): void } | null
}

type TSLNode = ShaderNodeObject<Node>

type SurfaceShader = {
  getMaterial(): NodeMaterial
  getNormalNode?(): NodeMaterial['normalNode'] // chỉ shader có bump (vd BrickWall)
  getRoughnessNode?(): MeshStandardNodeMaterial['roughnessNode'] // roughness biến thiên (anti-nhựa)
  getOpacityNode?(): MeshStandardNodeMaterial['opacityNode'] // null = opaque; non-null → transparent (kính shoji)
  dispose(): void
}

// Brick-only tuning: màu rãnh vữa + độ lõm rãnh (normal-relief qua uBumpScale). Default = giá trị
// gốc của BrickWall. Đưa vào matKey để đổi → material mới (cache bust + merge đúng).
export interface BrickOpts {
  mortarColor: number
  relief: number
  glassReflect?: number // jp-shoji-glass: độ phản chiếu [0–1] (tái dùng bag opts đã threaded — né đổi signature)
  glassOpacity?: number // jp-shoji-glass: độ mờ ô kính [0–1] (thấp = trong)
  trucCell?: number // jp-shoji*: khoảng cách trục gỗ dọc (m)
  nanCell?: number // jp-shoji*: khoảng cách nan gỗ (m)
  woodGrain?: number // jp-shoji*: độ nhiễu vân gỗ (nhám koshita) [0–1]
}
export const DEFAULT_BRICK: BrickOpts = { mortarColor: 0xc7c4be, relief: 0.5 }

export function brickOptsOf(seg: WallMatInput): BrickOpts {
  return {
    mortarColor: seg.mortarColor,
    relief: seg.brickRelief,
    glassReflect: seg.glassReflect,
    glassOpacity: seg.glassOpacity,
    trucCell: seg.trucCell,
    nanCell: seg.nanCell,
    woodGrain: seg.woodGrain,
  }
}

// Màu tường thực tế: brush palette (paintColor) ưu tiên; chưa sơn → WALL_COLORS theo colorIndex.
export function wallColor(seg: WallMatInput): number {
  return seg.paintColor ?? WALL_COLORS[seg.colorIndex % WALL_COLORS.length]
}

// Surface shader Phase 6 (world-space triplanar). color = màu chính từ colorIndex;
// patternScale cao = feature TO (brick/concrete nhân size; wood/metal scale là frequency → nghịch đảo).
function buildSurfaceShader(
  material: Exclude<WallMaterial, 'none' | 'brick-tex' | 'brick-3d' | 'wood-3d' | 'wood-strip'>,
  color: number,
  s: number,
  brick: BrickOpts
): SurfaceShader {
  switch (material) {
    case 'brick':
      return new BrickWall({
        brickColor: color,
        brickW: 0.4 * s,
        brickH: 0.2 * s,
        mortarColor: brick.mortarColor,
        bumpScale: brick.relief * 1.5, // relief 0–1 → bumpScale 0–1.5 (rãnh lõm sâu/cạn)
      })
    case 'concrete':
      return new ConcretePanel({ baseColor: color, panelW: 1.2 * s, panelH: 2.4 * s })
    case 'wood':
      return new WoodPlank({ woodColor: color, scale: 1 / s, plankH: 0.14 * s })
    case 'metal':
      return new MetalPanel({ metalColor: color, scale: 1 / s })
    case 'jp-screen':
      return new SeigaihaScreen({ paperColor: color, scale: 1 / s }) // màu tường = nền washi/vàng
    case 'jp-shoji':
      return new ShojiScreen({
        paperColor: color,
        scale: 1 / s,
        trucCell: brick.trucCell,
        nanCell: brick.nanCell,
        grain: brick.woodGrain,
      })
    case 'jp-shoji-glass':
      return new ShojiScreen({
        paperColor: color,
        scale: 1 / s,
        trucCell: brick.trucCell,
        nanCell: brick.nanCell,
        grain: brick.woodGrain,
        glass: true,
        reflect: brick.glassReflect,
        opacity: brick.glassOpacity,
      }) // ô = kính trong (transparent + phản chiếu)
  }
}

// Bọc colorNode của surface shader vào MeshStandardNodeMaterial → nhận sáng + shadow (lit).
export function makeSurfaceMaterial(
  material: Exclude<WallMaterial, 'none' | 'brick-tex' | 'brick-3d' | 'wood-3d' | 'wood-strip'>,
  color: number,
  scale: number,
  brick: BrickOpts = DEFAULT_BRICK
): WallMatEntry {
  const shader = buildSurfaceShader(material, color, scale, brick)
  const mat = new MeshStandardNodeMaterial()
  mat.colorNode = shader.getMaterial().colorNode
  if (shader.getNormalNode) mat.normalNode = shader.getNormalNode() // bump → mạch vữa bắt sáng
  mat.roughness = 0.92
  if (shader.getRoughnessNode) mat.roughnessNode = shader.getRoughnessNode() // varied → bớt nhựa
  mat.metalness = material === 'metal' ? 0.55 : 0
  // Kính shoji: opacityNode (ô mờ, gỗ đặc) → transparent. depthWrite giữ true (kính MỜ/frosted occlude đúng).
  const opacityNode = shader.getOpacityNode?.()
  if (opacityNode) {
    mat.transparent = true
    mat.opacityNode = opacityNode
  }
  mat.polygonOffset = true
  mat.polygonOffsetFactor = 1
  mat.polygonOffsetUnits = 1
  return { mat, shader }
}

// Mikkelsen screen-space bump từ height scalar (port BumpMapNode.perturbNormalArb — không export).
// Dùng cho 'brick-tex': lấy AO làm height → rãnh vữa (AO thấp) lõm → có độ sâu thật.
function perturbNormalFromHeight(h: TSLNode, scaleNode: TSLNode): TSLNode {
  const dHdxy = vec2(h.dFdx(), h.dFdy()).mul(scaleNode)
  const sigmaX = positionView.dFdx().normalize()
  const sigmaY = positionView.dFdy().normalize()
  const r1 = sigmaY.cross(normalView)
  const r2 = normalView.cross(sigmaX)
  const fDet = sigmaX.dot(r1).mul(faceDirection)
  const vGrad = fDet.sign().mul(dHdxy.x.mul(r1).add(dHdxy.y.mul(r2)))
  return fDet.abs().mul(normalView).sub(vGrad).normalize() as TSLNode
}

// Registry material tường theo key (material+color+scale[+brick]) — share qua các build; tường cùng
// key merge thành 1 geometry → ít draw call. Pure: tự quản cache Map + brick textures + dispose.
export class WallMaterialCache {
  private cache = new Map<string, WallMatEntry>()
  private brickTex: { color: THREE.Texture; rough: THREE.Texture; ao: THREE.Texture } | null = null

  matKey(material: WallMaterial, color: number, scale: number, brick: BrickOpts): string {
    if (material === 'none') return `n:${color}`
    if (material === 'brick') return `brick:${color}:${scale}:${brick.mortarColor}:${brick.relief}`
    if (material === 'jp-shoji' || material === 'jp-shoji-glass') {
      const sj = `${color}:${scale}:${brick.trucCell}:${brick.nanCell}:${brick.woodGrain}`
      if (material === 'jp-shoji-glass')
        return `jp-shoji-glass:${sj}:${brick.glassReflect}:${brick.glassOpacity}`
      return `jp-shoji:${sj}`
    }
    return `${material}:${color}:${scale}`
  }

  wallKey(seg: WallMatInput): string {
    return this.matKey(seg.material, wallColor(seg), seg.matScale, brickOptsOf(seg))
  }

  // Lazy tạo + cache material theo key (dùng chung tường + panel decor).
  ensureMat(
    key: string,
    material: WallMaterial,
    color: number,
    matScale: number,
    brick: BrickOpts
  ): THREE.Material {
    let entry = this.cache.get(key)
    if (!entry) {
      entry = this._createMat(material, color, matScale, brick)
      this.cache.set(key, entry)
    }
    return entry.mat
  }

  getEntry(key: string): WallMatEntry | undefined {
    return this.cache.get(key)
  }

  // Material KHUNG opening (C1 Joinery) — RIÊNG tường: DoubleSide vì khung là vòng ỐNG, lớp lót trong
  // nửa-xa quay lưng camera → single-side cull = "thủng/nhìn xuyên qua lỗ" (xác minh render 2026-06-11).
  // Tường giữ single-side (đặc, né shadow-acne). Key 'frame:color' tự nằm trong used-set sweep (bucket).
  frameKey(color: number): string {
    return `frame:${color}`
  }
  ensureFrameMat(color: number): THREE.Material {
    const key = this.frameKey(color)
    let entry = this.cache.get(key)
    if (!entry) {
      entry = { mat: new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide }), shader: null }
      this.cache.set(key, entry)
    }
    return entry.mat
  }

  // Tấm KÍNH cánh trượt (C4 Leaf) — recipe = kính lan can Balcony glass-frame: trong suốt thấy
  // xuyên + roughness thấp → phản chiếu IBL. Key vào keep-set sweep qua bucket rỗng (assembleLeaves).
  glassKey(color: number): string {
    return `glass:${color}`
  }
  ensureGlassMat(color: number): THREE.Material {
    const key = this.glassKey(color)
    let entry = this.cache.get(key)
    if (!entry) {
      const mat = new THREE.MeshStandardMaterial({
        color,
        metalness: 0,
        roughness: 0.05,
        transparent: true,
        opacity: 0.32,
      })
      entry = { mat, shader: null }
      this.cache.set(key, entry)
    }
    return entry.mat
  }

  // none → MeshToon; brick-tex → texture PBR triplanar; còn lại → procedural shader lit.
  private _createMat(
    material: WallMaterial,
    color: number,
    matScale: number,
    brick: BrickOpts
  ): WallMatEntry {
    if (material === 'brick-tex') return this._makeBrickTexMat(matScale)
    if (material === 'none') {
      return {
        mat: new THREE.MeshToonMaterial({
          color,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
        shader: null,
      }
    }
    // brick-3d = geometry thật, KHÔNG qua material cache → xử lý ở wall-assembly.
    if (material === 'brick-3d' || material === 'wood-3d' || material === 'wood-strip') {
      throw new Error(`${material} không dùng _createMat`)
    }
    return makeSurfaceMaterial(material, color, matScale, brick)
  }

  // Texture PBR thật (haunted-house bricks) qua triplanar: color + roughness + AO; AO → height-bump.
  private _makeBrickTexMat(scale: number): WallMatEntry {
    const tex = this._loadBrickTextures()
    const sc = float(0.6 / scale) // matScale cao = texture to hơn (ít lặp)
    const tri = (t: THREE.Texture): TSLNode => {
      const tn = texture(t)
      return triplanarTexture(tn, tn, tn, sc, positionWorld, normalWorld) as TSLNode
    }
    const ao = tri(tex.ao).x
    const mat = new MeshStandardNodeMaterial()
    mat.colorNode = tri(tex.color).xyz
    mat.roughnessNode = tri(tex.rough).x
    mat.aoNode = ao
    mat.normalNode = perturbNormalFromHeight(ao, float(0.6)) // độ sâu rãnh từ AO
    mat.metalness = 0
    mat.polygonOffset = true
    mat.polygonOffsetFactor = 1
    mat.polygonOffsetUnits = 1
    return { mat, shader: null }
  }

  private _loadBrickTextures(): { color: THREE.Texture; rough: THREE.Texture; ao: THREE.Texture } {
    if (this.brickTex) return this.brickTex
    const loader = new THREE.TextureLoader()
    const mk = (url: string, srgb: boolean): THREE.Texture => {
      const t = loader.load(url)
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.RepeatWrapping
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
      return t
    }
    this.brickTex = {
      color: mk(new URL('./textures/bricks/color.jpg', import.meta.url).href, true),
      rough: mk(new URL('./textures/bricks/roughness.jpg', import.meta.url).href, false),
      ao: mk(new URL('./textures/bricks/ambientOcclusion.jpg', import.meta.url).href, false),
    }
    return this.brickTex
  }

  // Dispose + xóa entry không dùng ở build hiện tại (đổi material/scale liên tục → key cũ rò).
  sweep(used: Set<string>): void {
    for (const [key, entry] of this.cache) {
      if (used.has(key)) continue
      entry.mat.dispose()
      entry.shader?.dispose()
      this.cache.delete(key)
    }
  }

  dispose(): void {
    this.sweep(new Set()) // used rỗng → dispose + clear toàn bộ registry
    if (this.brickTex) {
      this.brickTex.color.dispose()
      this.brickTex.rough.dispose()
      this.brickTex.ao.dispose()
      this.brickTex = null
    }
  }
}
