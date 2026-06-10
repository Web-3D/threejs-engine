/**
 * VỊ TRÍ   — threejs-modules/building/render/fromState.ts  (building-kit)
 * VAI TRÒ  — RENDERER canonical: BuildingState (mm) → dựng walls + structure + roof + stairs +
 *            balcony + PAINT vào ctx (group + arrays caller sở hữu). Trả Placement[] (vị trí pick-box)
 *            cho caller tự gắn lớp tương tác. Dùng chung editor (archplan) + headless (Phase 2).
 * LIÊN HỆ  — Lift từ ArchPlanLab._renderScene (Phase 1b thin-out, 2026-06-01). KHÔNG sở hữu GPU
 *            resource (ctx truyền vào → caller dispose, giống assembleWall). KHÔNG DOM, không pick-mesh
 *            (chỉ trả toạ độ Placement) → lõi headless thuần.
 *
 * CÁCH DÙNG:
 *   const placements = renderBuildingState(state, { wallCache, group, geos, mats, brick3d, wood, strip })
 *   for (const p of placements) addPickBox(p)   // caller (editor) tự tạo pick mesh
 * DISPOSE: ctx.* do caller dispose (geos/mats/components/wallCache). Renderer không giữ gì.
 */

import * as THREE from 'three'

import type { InstancedBrickWall } from '../../components/InstancedBrickWall'
import type { WoodSidingStrip } from '../../components/WoodSidingStrip'
import type { WoodSidingWall } from '../../components/WoodSidingWall'
import {
  computeLocalBbox,
  computeWallConfigs,
  footprintXZ,
  type FootXZ,
  instOutlineLocal,
  instWorldAABB,
  stairFootprintWorld,
  type WorldRect,
  worldRectToSlabOpening,
} from '../build'
import { makeRoof } from '../parts/RoofShape'
import {
  type GroundDrop,
  makePositionedBalcony,
  makePositionedColumn,
  makePositionedFoundation,
  makePositionedSlab,
  makePositionedStairs,
} from '../parts/Structure'
import {
  type BalconyState,
  type BuildingState,
  FRAME_DEFAULTS,
  type OpeningState,
  type SegmentState,
  type ShapeInstance,
  type StructureState,
  type WallConfig,
} from '../state'
import { type PartResult } from '../tokens'
import {
  assembleWall,
  mergeWalls,
  type WallAsmCtx,
  type WallPlace,
  type WallSpec,
} from '../wallAssembly'
import { DEFAULT_BRICK, WallMaterialCache } from '../wallMaterials'

// Vị trí + kích thước 1 pick-box (caller tạo mesh vô hình từ đây). cx/cy/cz tâm, sx/sy/sz size, rotDeg
// xoay quanh Y, ud = userData định danh element (instId + segIdx/opIdx/key).
export interface Placement {
  cx: number
  cy: number
  cz: number
  sx: number
  sy: number
  sz: number
  rotDeg: number
  ud: Record<string, unknown>
}

// Resource caller sở hữu — renderer build vào đây, KHÔNG dispose (giống WallAsmCtx).
export interface BuildRenderCtx {
  wallCache: WallMaterialCache
  group: THREE.Group
  geos: THREE.BufferGeometry[]
  mats: THREE.Material[]
  brick3d: InstancedBrickWall[]
  wood: WoodSidingWall[]
  strip: WoodSidingStrip[]
  // Material sàn texture ('walnut-tex') do CALLER tạo+sở hữu (PhotoGround, cache 1 lần → KHÔNG recompile mỗi
  // build/frame kéo) + dispose. Lõi KHÔNG load URL. Thiếu (chưa load xong) → slab rơi về bê tông tạm.
  slabTexMat?: THREE.Material
  // Material GỖ DECK móng (foundType wood-deck/stone-pillar + foundMaterial='wood-tex') = Wooden Planks — caller
  // tạo+sở hữu (TexturedSurface triplanar, cache). DÙNG CHUNG cho slab 'planks-tex'. Thiếu → móng MeshToon gỗ
  // phẳng. KHÔNG push ctx.mats (caller dispose).
  foundWoodMat?: THREE.Material
  // Material gỗ KHUNG-DƯỚI stone-pillar (understructMaterial='wood-tex') = Old Plywood — caller tạo+sở hữu
  // (TexturedSurface triplanar, cache). TÁCH deck → texture riêng. Thiếu → khung-dưới MeshToon. KHÔNG push ctx.mats.
  underWoodMat?: THREE.Material
  // Material VỎ CÂY KHUNG-DƯỚI stone-pillar (understructMaterial='bark-tex') = Tree Bark — tuỳ chọn thứ 2 cho
  // khung-dưới (TexturedSurface triplanar, cache). Thiếu → MeshToon. KHÔNG push ctx.mats.
  underBarkMat?: THREE.Material
  // Vùng nền tụt (lòng hồ pool/pond) trong WORLD mét — caller (integrator) tính từ site.waters rồi bơm vào.
  // Cột chống móng (wood-deck post / stone-pillar trụ giữa) nằm trên đâm sâu tới đáy hồ. Thiếu → cột tới rim.
  groundDrops?: GroundDrop[]
}

// C1 khung opening: resolve style→spec mét (field thiếu → FRAME_DEFAULTS); none/undefined = không khung.
function frameOf(op: OpeningState): { w: number; out: number; color: number } | undefined {
  const st = op.frameStyle
  if (!st || st === 'none') return undefined
  const d = FRAME_DEFAULTS[st]
  return {
    w: (op.frameW ?? d.w) / 1000,
    out: (op.frameOut ?? d.out) / 1000,
    color: op.frameColor ?? d.color,
  }
}

// C2 cánh cửa: resolve leaf→spec; none/undefined = không cánh (save cũ nguyên trạng).
function leafOf(op: OpeningState): { double: boolean; open: number; color: number } | undefined {
  const t = op.leafType
  if (!t || t === 'none') return undefined
  return { double: op.leafDouble ?? false, open: op.leafOpen ?? 0, color: op.leafColor ?? 0x7a5a3a }
}

// SegmentState (mm) → WallSpec (m) cho shared assembler. (Lift _segToSpec — đơn vị /1000 ở biên.)
// keyBase = `${instId}:${segIdx}` (editor) → key per-opening cho live-tune cánh; headless bỏ trống.
function segToSpec(seg: SegmentState, keyBase?: string): WallSpec {
  return {
    material: seg.material,
    colorIndex: seg.colorIndex,
    paintColor: seg.paintColor,
    matScale: seg.matScale,
    mortarColor: seg.mortarColor,
    brickRelief: seg.brickRelief,
    style: seg.style,
    woodReveal: seg.woodReveal / 1000,
    woodButt: seg.woodButt / 1000,
    woodStepTilt: seg.woodStepTilt,
    openings: seg.openings.map((op, i) => ({
      kind: op.kind,
      x: op.x / 1000,
      w: op.w / 1000,
      h: op.h / 1000,
      yOffset: op.yOffset / 1000,
      round: op.round,
      frame: frameOf(op), // C1 khung bao — undefined = không khung
      leaf: leafOf(op), // C2 cánh cửa — undefined = không cánh
      key: keyBase ? `${keyBase}:${i}` : undefined,
    })),
    panels: seg.panels.map((p) => ({
      x: p.x / 1000,
      y: p.y / 1000,
      w: p.w / 1000,
      h: p.h / 1000,
      depth: p.depth / 1000,
      mode: p.mode,
      material: p.material,
      colorIndex: p.colorIndex,
    })),
  }
}

// Transient — giữ ctx + out + asm trong 1 lần build. KHÔNG sở hữu resource (ctx của caller).
class StateRenderer {
  private out: Placement[] = []
  private asm!: WallAsmCtx
  private plainWalls = false // LOD lúc kéo: ép mọi tường về phẳng ('none') — bỏ brick-3d/gỗ instanced (rất nặng)
  private plainFoundation = false // LOD móng RIÊNG: ép concrete (bỏ lưới cột deck/trụ). TÁCH plainWalls để xem-tĩnh
  // & kéo-nguyên-nhà VẪN thấy cột (định vị trên hồ); chỉ element-drag (rebuild/frame) mới bật. Default = plainWalls.
  private hidden = new Set<string>() // floor.id ẩn — bỏ dựng mesh/pick nhưng GIỮ chiều cao (stacking đúng)
  private filter?: (instId: string) => boolean // lọc instance để dựng (split-render lúc kéo); giữ stacking
  private floorInstances: ShapeInstance[] = [] // instance CÙNG TẦNG đang dựng — cho đục-lỗ shape lồng (#3)
  private slabMatKeys = new Set<string>() // key material slab (gỗ) đã lấy từ cache — thêm vào sweep keep-set kẻo bị evict

  constructor(private readonly ctx: BuildRenderCtx) {}

  run(
    state: BuildingState,
    plainWalls = false,
    hidden = new Set<string>(),
    filter?: (instId: string) => boolean,
    plainFoundation = plainWalls // mặc định móng theo tường (backward-compat); caller bơm false để giữ cột
  ): Placement[] {
    this.plainWalls = plainWalls
    this.plainFoundation = plainFoundation
    this.hidden = hidden
    this.filter = filter
    this.asm = {
      cache: this.ctx.wallCache,
      buckets: new Map(),
      group: this.ctx.group,
      geos: this.ctx.geos,
      brick3d: this.ctx.brick3d,
      wood: this.ctx.wood,
      strip: this.ctx.strip,
    }
    const stairHoles = this.collectStairHoles(state)
    let yAcc = 0
    for (let fi = 0; fi < state.floors.length; fi++) {
      yAcc += this.buildFloor(state, fi, yAcc, stairHoles.get(fi) ?? [])
    }
    mergeWalls(this.asm)
    // plainWalls (live-drag): KHÔNG sweep → giữ material brick/gỗ trong cache để buông tay KHÔNG recompile.
    // Keep-set = key tường (buckets) + key material SLAB (gỗ) → sweep không evict material sàn đang dùng.
    if (!this.plainWalls) {
      this.ctx.wallCache.sweep(new Set([...this.asm.buckets.keys(), ...this.slabMatKeys]))
    }
    return this.out
  }

  // Build 1 tầng → trả độ cao (lift + floorH) cộng dồn cho tầng kế.
  private buildFloor(state: BuildingState, fi: number, yAcc: number, holes: WorldRect[]): number {
    const floor = state.floors[fi]
    this.floorInstances = floor.instances // cho nestedOpenings (đục lỗ shape lồng) biết các khối cùng tầng
    const isGround = fi === 0
    const hidden = this.hidden.has(floor.id) // ẩn: giữ chiều cao (cộng dồn dưới) nhưng KHÔNG dựng mesh/pick
    let maxLift = 0
    let maxFloorH = 0
    for (const inst of floor.instances) {
      const yLift = isGround && inst.structure.showFoundation ? inst.structure.foundH / 1000 : 0
      if (yLift > maxLift) maxLift = yLift
      const wallBase = yAcc + yLift
      const instHm =
        inst.segments.length > 0 ? Math.max(...inst.segments.map((s) => s.wallH)) / 1000 : 3
      if (instHm > maxFloorH) maxFloorH = instHm
      if (hidden) continue // tầng ẩn → bỏ dựng (chiều cao maxLift/maxFloorH đã cộng ở trên cho stacking)
      if (this.filter && !this.filter(inst.id)) continue // split-render: instance bị lọc → bỏ dựng (chiều cao đã cộng)
      computeWallConfigs(inst, wallBase).forEach((cfg, si) => {
        this.assembleFromConfig(cfg, `${inst.id}:${si}`)
        this.pushWallPick(cfg, inst.id, si)
        this.pushOpeningPicks(cfg, inst.id, si)
      })
      this.buildStructure(inst, wallBase, isGround, instHm, holes)
    }
    return maxLift + maxFloorH
  }

  // Footprint cầu thang mọi tầng → map[targetFloor] = lỗ cần khoét slab tầng trên.
  private collectStairHoles(state: BuildingState): Map<number, WorldRect[]> {
    const holes = new Map<number, WorldRect[]>()
    for (let fi = 0; fi < state.floors.length; fi++) {
      for (const inst of state.floors[fi].instances) {
        const fp = stairFootprintWorld(inst)
        if (!fp) continue
        const target = fi + 1
        let arr = holes.get(target)
        if (!arr) {
          arr = []
          holes.set(target, arr)
        }
        arr.push(fp)
      }
    }
    return holes
  }

  private assembleFromConfig(cfg: WallConfig, keyBase: string): void {
    const place: WallPlace = {
      w: cfg.w,
      h: cfg.h,
      depth: cfg.depth,
      rotationY: cfg.rotationY,
      xOffset: cfg.xOffset,
      zOffset: cfg.zOffset,
      yBase: cfg.yBase,
    }
    let spec = segToSpec(cfg.seg, keyBase)
    // LOD live-drag: tường phẳng 'none' (giữ MÀU) + bỏ panel decor → KHÔNG dựng brick-3d/gỗ instanced
    // (per-brick matrices = thủ phạm CPU). Khúc xạ/khoét cửa vẫn giữ. Full chi tiết khi buông (rebuild thường).
    if (this.plainWalls) spec = { ...spec, material: 'none', panels: [] }
    assembleWall(place, spec, this.asm)
  }

  // Tường: box ôm đúng WallConfig.
  private pushWallPick(cfg: WallConfig, instId: string, segIdx: number): void {
    const { xOffset: x, zOffset: z, yBase: y, w, h, depth, rotationY } = cfg
    this.push(x, y + h / 2, z, w, h, depth, rotationY, { instId, segIdx })
  }

  // Mỗi cửa/cửa sổ: box nhỏ trên mặt NGOÀI tường (+Z local), nhô 2cm để hit TRƯỚC box tường.
  private pushOpeningPicks(cfg: WallConfig, instId: string, segIdx: number): void {
    const { xOffset, zOffset, yBase, w, depth, rotationY, seg } = cfg
    const th = (rotationY * Math.PI) / 180
    seg.openings.forEach((op, opIdx) => {
      const lx = (op.x + op.w / 2) / 1000 - w / 2
      const lz = depth / 2 + 0.02
      const wx = xOffset + lx * Math.cos(th) + lz * Math.sin(th)
      const wz = zOffset - lx * Math.sin(th) + lz * Math.cos(th)
      const wy = yBase + (op.yOffset + op.h / 2) / 1000
      this.push(wx, wy, wz, op.w / 1000, op.h / 1000, 0.04, rotationY, { instId, segIdx, opIdx })
    })
  }

  private buildStructure(
    inst: ShapeInstance,
    wallBase: number,
    isGround: boolean,
    instHm: number,
    holes: WorldRect[]
  ): void {
    const { w, d } = computeLocalBbox(inst)
    const wx = inst.posX / 1000
    const wz = inst.posZ / 1000
    const ry = inst.rotY
    const fp = footprintXZ(computeWallConfigs(inst, wallBase))
    this.buildBase(inst, wallBase, isGround, holes, fp)
    this.buildColumns(inst, wallBase)
    this.buildStairs(inst, wallBase, instHm)
    this.buildBalconies(inst, wallBase)
    this.buildRoof(inst, wx, wz, ry, w, d, wallBase, instHm)
    if (inst.roof.show) {
      this.push(fp.cx, wallBase + instHm + 0.75, fp.cz, fp.sx, 1.5, fp.sz, 0, {
        instId: inst.id,
        key: 'roof',
      })
    }
  }

  private buildBase(
    inst: ShapeInstance,
    wallBase: number,
    isGround: boolean,
    holes: WorldRect[],
    fp: FootXZ
  ): void {
    if (isGround && inst.structure.showFoundation) this.buildFoundation(inst, wallBase, fp)
    if (inst.structure.showSlab) this.buildSlab(inst, wallBase, holes, fp)
  }

  // Shape 'round': slab/móng theo ĐÚNG đa giác N-gon — bbox chữ nhật sẽ thò 4 góc ra ngoài chân tường tròn.
  private instOutline(inst: ShapeInstance): [number, number][] | undefined {
    return inst.shapeKey === 'round' ? instOutlineLocal(inst) : undefined
  }

  private buildFoundation(inst: ShapeInstance, wallBase: number, fp: FootXZ): void {
    const { w, d } = computeLocalBbox(inst)
    const fh = inst.structure.foundH / 1000
    this.pushPainted(
      makePositionedFoundation({
        bboxW: w,
        bboxD: d,
        outline: this.instOutline(inst),
        wallDepth: inst.wallDepth / 1000,
        oh: inst.structure.foundOh,
        h: fh,
        worldX: inst.posX / 1000,
        worldZ: inst.posZ / 1000,
        rotY: inst.rotY,
        openings: this.nestedOpenings(inst, (s) => s.showFoundation), // #3: khoét chỗ shape nhỏ lồng (cũng có móng)
        // LOD móng (plainFoundation, TÁCH plainWalls): ép 'concrete' = box phẳng, BỎ lưới cột deck/trụ (nặng khi
        // rebuild/frame element-drag). Xem-tĩnh & kéo-nguyên-nhà → plainFoundation=false → GIỮ cột (định vị trên hồ).
        foundType: this.plainFoundation ? 'concrete' : inst.structure.foundType, // #6 wood-deck/stone-pillar
        deckPostSpacing: inst.structure.deckPostSpacing, // #10: mật độ lưới cột deck
        deckPostInset: inst.structure.deckPostInset, // mm — cột chống lùi vào từ mép deck (wood-deck)
        deckPostSize: inst.structure.deckPostSize, // mm — cạnh tiết diện cột chống vuông (wood-deck)
        groundDrops: this.ctx.groundDrops, // lòng hồ pool/pond → cột chống đâm sâu tới đáy
        pillarRadius: inst.structure.pillarRadius, // bán kính trụ đá giữa (stone-pillar)
        beamWidth: inst.structure.beamWidth, // bề rộng tiết diện 16 xà (stone-pillar)
        beamHeight: inst.structure.beamHeight, // bề cao tiết diện 16 xà (stone-pillar)
        strutSegments: inst.structure.strutSegments, // số đốt thanh chống xiên (stone-pillar)
        strutCurve: inst.structure.strutCurve, // độ cong thanh chống xiên (stone-pillar)
        woodMaterial: this.foundWoodMaterial(inst), // gỗ móng 'wood-tex' (TexturedSurface) hoặc undefined = MeshToon
        postRadius: inst.structure.postRadius, // bán kính 8 cột trụ (stone-pillar)
        postLength: inst.structure.postLength, // chiều dài cột = gap 2 tầng xà (xà dưới + xiên đi theo)
        understructHalf: (inst.structure.understructSize ?? 5000) / 2000, // nửa-span khung-dưới (ĐỘC LẬP deck)
        understructMat: this.foundUnderMaterial(inst), // gỗ khung-dưới 'wood-tex' (riêng deck) hoặc undefined
        deckRailShow: inst.structure.deckRailShow, // lan can 4 mặt quanh deck
        deckRailH: inst.structure.deckRailH, // cao lan can
        deckRailLength: inst.structure.deckRailLength, // dài khung lan can (X, độc lập)
        deckRailWidth: inst.structure.deckRailWidth, // rộng khung lan can (Z, độc lập)
      }),
      inst,
      'found'
    )
    this.push(fp.cx, wallBase - fh / 2, fp.cz, fp.sx, fh, fp.sz, 0, {
      instId: inst.id,
      key: 'found',
    })
  }

  private buildSlab(inst: ShapeInstance, wallBase: number, holes: WorldRect[], fp: FootXZ): void {
    const { w, d } = computeLocalBbox(inst)
    const wx = inst.posX / 1000
    const wz = inst.posZ / 1000
    const st = inst.structure.slabThick / 1000
    this.pushPainted(
      makePositionedSlab({
        bboxW: w,
        bboxD: d,
        outline: this.instOutline(inst),
        thick: st,
        yBase: wallBase,
        worldX: wx,
        worldZ: wz,
        rotY: inst.rotY,
        material: this.slabMaterial(inst), // #4: gỗ (procedural từ cache) hoặc undefined = bê tông MeshToon
        openings: [
          ...this.slabOpenings(holes, wx, wz, inst.rotY, w, d), // lỗ cầu thang
          ...this.nestedOpenings(inst, (s) => s.showSlab), // #3: lỗ shape nhỏ lồng (cũng có slab)
        ],
      }),
      inst,
      'slab'
    )
    this.push(fp.cx, wallBase + st / 2, fp.cz, fp.sx, st, fp.sz, 0, {
      instId: inst.id,
      key: 'slab',
    })
  }

  // #4 Material sàn: 'none' → undefined (makePositionedSlab tự tạo MeshToon bê tông). Khác → lấy material
  // procedural TỪ CACHE (gỗ demo: nâu + scale 1) + ghi key vào slabMatKeys (sweep keep-set kẻo bị evict =
  // recompile mỗi frame / dispose nhầm). Cache sở hữu dispose → makePositionedSlab KHÔNG đưa vào ctx.mats.
  private slabMaterial(inst: ShapeInstance): THREE.Material | undefined {
    const sm = inst.structure.slabMaterial ?? 'none'
    if (sm === 'none') return undefined
    // 'walnut-tex' = material texture ảnh do caller bơm (PhotoGround cache, KHÔNG qua wallCache → KHÔNG push
    // ctx.mats: caller dispose). Chưa load xong (undefined) → rơi về bê tông tạm; load xong caller re-render.
    if (sm === 'walnut-tex') return this.ctx.slabTexMat
    // 'planks-tex' = Wooden Planks — DÙNG CHUNG material gỗ deck móng (caller bơm foundWoodMat; cùng look deck+sàn).
    if (sm === 'planks-tex') return this.ctx.foundWoodMat
    const color = 0x9b6b43 // nâu gỗ demo
    const scale = 1
    const key = this.ctx.wallCache.matKey(sm, color, scale, DEFAULT_BRICK)
    this.slabMatKeys.add(key)
    return this.ctx.wallCache.ensureMat(key, sm, color, scale, DEFAULT_BRICK)
  }

  // Gỗ móng: 'wood-tex' → material caller bơm (TexturedSurface triplanar cache, KHÔNG push ctx.mats: caller
  // dispose). Chưa load xong (undefined) → móng rơi về MeshToon gỗ phẳng. 'none'/undefined → undefined.
  private foundWoodMaterial(inst: ShapeInstance): THREE.Material | undefined {
    return inst.structure.foundMaterial === 'wood-tex' ? this.ctx.foundWoodMat : undefined
  }

  // Vật liệu KHUNG-DƯỚI stone-pillar — texture RIÊNG deck: 'wood-tex' = Old Plywood (underWoodMat); 'bark-tex' =
  // Tree Bark (underBarkMat). Chưa load → undefined = MeshToon. Tách hẳn deck → khung-dưới vân riêng.
  private foundUnderMaterial(inst: ShapeInstance): THREE.Material | undefined {
    const um = inst.structure.understructMaterial
    if (um === 'wood-tex') return this.ctx.underWoodMat
    if (um === 'bark-tex') return this.ctx.underBarkMat
    return undefined
  }

  private buildBalconies(inst: ShapeInstance, wallBase: number): void {
    const bals = inst.structure.balconies
    if (!bals?.length) return
    const configs = computeWallConfigs(inst, wallBase)
    bals.forEach((b, i) => {
      const cfg = configs[b.wallIdx]
      if (!cfg) return
      this.pushPainted(
        makePositionedBalcony({
          wallX: cfg.xOffset,
          wallZ: cfg.zOffset,
          wallRotDeg: cfg.rotationY,
          wallDepth: cfg.depth,
          alongOffset: (b.x + b.width / 2) / 1000 - cfg.w / 2,
          width: b.width / 1000,
          projection: b.depth / 1000,
          y: wallBase + b.y / 1000,
          slabT: b.slabT / 1000,
          railH: b.railH / 1000,
          // LOD lúc kéo (plainWalls): ép 'solid' (3 box rẻ) — metal/wood/glass = nhiều cylinder/sphere/
          // RoundedBox + material, dựng lại 60×/s khi kéo = tụt fps. Buông tay → style thật lại (KI-009).
          railStyle: this.plainWalls ? 'solid' : b.railStyle,
        }),
        inst,
        `bal:${i}`
      )
      this.pushBalconyPick(inst, cfg, b, wallBase, i)
    })
  }

  private pushBalconyPick(
    inst: ShapeInstance,
    cfg: WallConfig,
    b: BalconyState,
    wallBase: number,
    i: number
  ): void {
    const lx = (b.x + b.width / 2) / 1000 - cfg.w / 2
    const lz = cfg.depth / 2 + b.depth / 2000
    const th = (cfg.rotationY * Math.PI) / 180
    const wx = cfg.xOffset + lx * Math.cos(th) + lz * Math.sin(th)
    const wz = cfg.zOffset - lx * Math.sin(th) + lz * Math.cos(th)
    const wy = wallBase + b.y / 1000 + (b.railH - b.slabT) / 2000
    const sy = (b.railH + b.slabT) / 1000
    this.push(wx, wy, wz, b.width / 1000, sy, b.depth / 1000, cfg.rotationY, {
      instId: inst.id,
      key: `bal:${i}`,
    })
  }

  private slabOpenings(
    holes: WorldRect[],
    wx: number,
    wz: number,
    ry: number,
    w: number,
    d: number
  ): { x: number; z: number; w: number; d: number; rot: number }[] {
    if (holes.length === 0) return []
    const swap = ry === 90 || ry === 270
    const halfX = (swap ? d : w) / 2
    const halfZ = (swap ? w : d) / 2
    const out: { x: number; z: number; w: number; d: number; rot: number }[] = []
    for (const h of holes) {
      if (Math.abs(h.cx - wx) <= halfX && Math.abs(h.cz - wz) <= halfZ) {
        out.push(worldRectToSlabOpening(h, wx, wz, ry))
      }
    }
    return out
  }

  // #3 "đục lỗ shape lớn": instance khác CÙNG TẦNG nằm GỌN trong footprint inst (AABB chứa trọn) → khoét
  // nền/slab inst đúng chỗ shape nhỏ để nhét vào (né z-fight 2 lớp móng/sàn trùng). `needs` lọc theo loại
  // (chỉ khoét khi shape nhỏ CŨNG có móng/slab — cùng cao độ mới chồng). Trả SlabOpening (local frame inst).
  private nestedOpenings(
    inst: ShapeInstance,
    needs: (s: StructureState) => boolean
  ): ReturnType<typeof worldRectToSlabOpening>[] {
    const me = instWorldAABB(inst)
    const out: ReturnType<typeof worldRectToSlabOpening>[] = []
    for (const other of this.floorInstances) {
      if (other.id === inst.id || !needs(other.structure)) continue
      const o = instWorldAABB(other)
      if (o.minX < me.minX || o.maxX > me.maxX || o.minZ < me.minZ || o.maxZ > me.maxZ) continue
      const rect: WorldRect = {
        cx: (o.minX + o.maxX) / 2,
        cz: (o.minZ + o.maxZ) / 2,
        w: o.maxX - o.minX,
        d: o.maxZ - o.minZ,
        rot: 0,
      }
      out.push(worldRectToSlabOpening(rect, inst.posX / 1000, inst.posZ / 1000, inst.rotY))
    }
    return out
  }

  private buildStairs(inst: ShapeInstance, wallBase: number, instHm: number): void {
    const s = inst.structure.stairs
    if (!s.show) return
    this.pushPainted(
      makePositionedStairs({
        localX: s.x / 1000,
        localZ: s.z / 1000,
        runL: s.runL / 1000,
        width: s.width / 1000,
        totalH: instHm,
        steps: s.steps,
        rotDeg: s.rotDeg,
        worldX: inst.posX / 1000,
        worldZ: inst.posZ / 1000,
        rotY: inst.rotY,
        yBase: wallBase,
        // LOD lúc kéo: ép 'solid' (bậc đặc, BỎ planks/ván nhiều mảnh) → rebuild rẻ; buông tay → style thật.
        style: this.plainWalls ? 'solid' : s.style, // #8: solid | wood-plank | wood-float
      }),
      inst,
      'stairs'
    )
    const th = (inst.rotY * Math.PI) / 180
    const cx = (s.x / 1000) * Math.cos(th) - (s.z / 1000) * Math.sin(th) + inst.posX / 1000
    const cz = (s.x / 1000) * Math.sin(th) + (s.z / 1000) * Math.cos(th) + inst.posZ / 1000
    this.push(
      cx,
      wallBase + instHm / 2,
      cz,
      s.runL / 1000,
      instHm,
      s.width / 1000,
      inst.rotY + s.rotDeg,
      {
        instId: inst.id,
        key: 'stairs',
      }
    )
  }

  private buildColumns(inst: ShapeInstance, wallBase: number): void {
    const wx = inst.posX / 1000
    const wz = inst.posZ / 1000
    const ry = inst.rotY
    const cosR = Math.cos((ry * Math.PI) / 180)
    const sinR = Math.sin((ry * Math.PI) / 180)
    inst.structure.columns.forEach((col, i) => {
      const cx = (col.x / 1000) * cosR - (col.z / 1000) * sinR + wx
      const cz = (col.x / 1000) * sinR + (col.z / 1000) * cosR + wz
      const ch = col.h / 1000
      this.pushPainted(
        makePositionedColumn({
          type: col.type,
          worldX: cx,
          worldZ: cz,
          h: ch,
          r: col.r / 1000,
          size: col.size / 1000,
          yBase: wallBase,
        }),
        inst,
        `col:${i}`
      )
      const sz = (col.type === 'round' ? col.r * 2 : col.size) / 1000
      this.push(cx, wallBase + ch / 2, cz, sz, ch, sz, 0, { instId: inst.id, key: `col:${i}` })
    })
  }

  private buildRoof(
    inst: ShapeInstance,
    wx: number,
    wz: number,
    ry: number,
    w: number,
    d: number,
    wallBase: number,
    instHm: number
  ): void {
    if (!inst.roof.show) return
    this.pushPainted(
      makeRoof(
        {
          type: inst.roof.type,
          pitch: inst.roof.pitch,
          overhang: inst.roof.overhang,
          ridgeDir: inst.roof.rotDeg % 180 === 0 ? 'EW' : 'NS',
          parapetH: inst.roof.parapetH,
          worldX: wx,
          worldZ: wz,
          rotY: ry + (inst.roof.rotDeg >= 180 ? 180 : 0),
        },
        w,
        d,
        instHm + wallBase
      ),
      inst,
      'roof'
    )
  }

  // Element KHÔNG-tường: recolor MeshToon theo inst.paint[key] (override) rồi push vào ctx.
  private pushPainted(r: PartResult, inst: ShapeInstance, key: string): void {
    const c = inst.paint?.[key]
    if (c !== undefined) {
      for (const mat of r.mats) {
        const m = mat as THREE.Material & { color?: THREE.Color }
        if (m.color instanceof THREE.Color) m.color.setHex(c)
      }
    }
    this.pushResult(r)
  }

  private pushResult(r: PartResult): void {
    this.ctx.geos.push(...r.geos)
    this.ctx.mats.push(...r.mats)
    for (const m of r.meshes) {
      m.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      this.ctx.group.add(m)
    }
  }

  // Gom 1 Placement (toạ độ pick-box) — caller dựng mesh sau.
  private push(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    rotDeg: number,
    ud: Record<string, unknown>
  ): void {
    this.out.push({ cx, cy, cz, sx, sy, sz, rotDeg, ud })
  }
}

// Dựng BuildingState vào ctx (caller sở hữu resource) → trả Placement[] cho caller gắn pick-box.
// plainWalls=true (editor lúc live-drag): LOD — tường phẳng, bỏ brick-3d/gỗ instanced → rebuild rẻ hơn nhiều.
export function renderBuildingState(
  state: BuildingState,
  ctx: BuildRenderCtx,
  plainWalls = false,
  hiddenFloors?: Set<string>, // floor.id ẩn (editor) — bỏ dựng, giữ stacking. undefined = hiện tất cả
  // Lọc instance để DỰNG (vẫn cộng chiều cao stacking cho instance bị lọc). Cho editor SPLIT-render lúc kéo:
  // shape đang kéo → 1 group riêng (translate/rebuild rẻ), shape khác → group static (dựng 1 lần). undefined = dựng tất cả.
  filter?: (instId: string) => boolean,
  // LOD móng RIÊNG: undefined → theo plainWalls (backward-compat); false → GIỮ cột (wood-deck/stone-pillar) dù
  // tường phẳng → xem-tĩnh & kéo-nguyên-nhà thấy cột để định vị trên hồ. true → concrete (element-drag/frame).
  plainFoundation?: boolean
): Placement[] {
  return new StateRenderer(ctx).run(state, plainWalls, hiddenFloors, filter, plainFoundation)
}

/**
 * Wrapper HEADLESS — tự sở hữu ctx (group + arrays + WallMaterialCache) + dispose. Cho consumer NGOÀI
 * editor (Doraemon-từ-archplan, warehouse bake): `new BuildingRenderer(state)` → `getGroup()` → `dispose()`.
 * Editor KHÔNG dùng class này (nó tự quản resource + lớp pick, gọi thẳng renderBuildingState).
 * Thay thế BuildingFromPlan (đã retire) — đọc BuildingState lossless thay vì AP4 lossy → full fidelity.
 * DISPOSE: dispose() giải phóng geos + mats + components (brick3d/wood/strip) + wallCache; group tự clear.
 */
export class BuildingRenderer {
  private readonly group = new THREE.Group()
  private readonly wallCache = new WallMaterialCache()
  private geos: THREE.BufferGeometry[] = []
  private mats: THREE.Material[] = []
  private brick3d: InstancedBrickWall[] = []
  private wood: WoodSidingWall[] = []
  private strip: WoodSidingStrip[] = []
  private isDisposed = false

  constructor(state?: BuildingState) {
    if (state) this.rebuild(state)
  }

  getGroup(): THREE.Group {
    return this.group
  }

  // Dựng lại từ state (clear bản cũ trước). Trả Placement[] nếu caller cần lớp pick (vd editor nhúng).
  rebuild(state: BuildingState): Placement[] {
    if (this.isDisposed) throw new Error('BuildingRenderer: đã dispose')
    this.clear()
    return renderBuildingState(state, {
      wallCache: this.wallCache,
      group: this.group,
      geos: this.geos,
      mats: this.mats,
      brick3d: this.brick3d,
      wood: this.wood,
      strip: this.strip,
    })
  }

  private clear(): void {
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
    for (const w of this.brick3d) w.dispose()
    for (const w of this.wood) w.dispose()
    for (const w of this.strip) w.dispose()
    this.geos = []
    this.mats = []
    this.brick3d = []
    this.wood = []
    this.strip = []
    this.group.clear()
  }

  dispose(): void {
    if (this.isDisposed) return
    this.clear()
    this.wallCache.dispose() // material cache + brick textures
    this.isDisposed = true
  }
}
