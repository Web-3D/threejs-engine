/**
 * VỊ TRÍ   — building-kit/turtle.ts
 * VAI TRÒ  — Pure plan geometry: turtle-walk + center-về-tâm-bbox + xoay/dời → vị trí world
 *            của TỪNG tường. NGUỒN SỰ THẬT DUY NHẤT cho cả editor (archplan build.ts) lẫn
 *            headless (BuildingFromState.ts / BuildingRenderer).
 * LIÊN HỆ  — Không Three.js, không state-type. Unit-agnostic: caller truyền METERS + độ.
 *
 * WHY tách: trước đây editor + headless mỗi nơi chép 1 bản walkTurtle/applyTransform →
 *           đã drift (headless ép wallH=floorH). Gộp 1 core → sửa 1 nơi, chặn KI-001
 *           (copy-paste-fix-not-propagated).
 *
 * DISPOSE: không giữ resource — pure function, không state.
 */

export interface SegPlan {
  length: number // m — chiều dài segment
  turnBefore: number // deg — góc rẽ TRƯỚC khi vẽ segment này
}

export interface PlanXform {
  posX: number // m — world offset tâm shape
  posZ: number // m
  rotY: number // deg — xoay shape quanh Y
}

export interface WallPlacement {
  index: number // chỉ số segment gốc → caller zip ngược dữ liệu (seg, wallH, material…)
  w: number // m — chiều dài tường
  rotationY: number // deg — heading world (đã cộng rotY)
  xOffset: number // m — tâm tường, world
  zOffset: number // m
}

// Turtle walk: đỉnh polygon + heading mỗi segment.
// pts[i] = điểm BẮT ĐẦU segment i; pts.length = segs.length + 1 (gồm gốc [0,0]).
// headings[i] = heading sau khi áp turnBefore của segment i.
function walk(segs: SegPlan[]): { pts: [number, number][]; headings: number[] } {
  let heading = 0
  let curX = 0
  let curZ = 0
  const pts: [number, number][] = [[0, 0]]
  const headings: number[] = []
  for (const seg of segs) {
    heading = (((heading + seg.turnBefore) % 360) + 360) % 360
    headings.push(heading)
    const rad = (heading * Math.PI) / 180
    curX += Math.cos(rad) * seg.length
    curZ += -Math.sin(rad) * seg.length
    pts.push([curX, curZ])
  }
  return { pts, headings }
}

/** AABB (m) của footprint trong hệ cục bộ (chưa center/xoay/dời). */
export function planBbox(segs: SegPlan[]): { w: number; d: number } {
  const { pts } = walk(segs)
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) }
}

/**
 * Đỉnh polygon (m) đã center về tâm bbox — frame LOCAL trước rotY/pos (cùng phép center planWalls).
 * Dùng cho slab/móng theo ĐÚNG footprint đa giác (shape round N-gon) thay AABB chữ nhật.
 * Trả về đúng segs.length đỉnh (bỏ điểm đóng vòng trùng điểm đầu).
 */
export function planOutline(segs: SegPlan[]): [number, number][] {
  const { pts } = walk(segs)
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  return pts.slice(0, segs.length).map(([x, z]) => [x - cx, z - cz])
}

/**
 * Vị trí world (tâm + heading) của từng tường. Quy trình KHỚP editor build.ts cũ:
 * turtle-walk → đặt tâm tường giữa segment → center về tâm bbox → xoay quanh Y rồi dời ra world.
 */
export function planWalls(segs: SegPlan[], x: PlanXform): WallPlacement[] {
  const { pts, headings } = walk(segs)
  const out: WallPlacement[] = []
  for (let i = 0; i < segs.length; i++) {
    const heading = headings[i]
    const len = segs[i].length
    const rad = (heading * Math.PI) / 180
    const [startX, startZ] = pts[i]
    out.push({
      index: i,
      w: len,
      rotationY: heading,
      xOffset: startX + (Math.cos(rad) * len) / 2,
      zOffset: startZ + (-Math.sin(rad) * len) / 2,
    })
  }
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2
  const rotRad = (x.rotY * Math.PI) / 180
  const cosR = Math.cos(rotRad)
  const sinR = Math.sin(rotRad)
  for (const p of out) {
    const ox = p.xOffset - cx
    const oz = p.zOffset - cz
    p.xOffset = ox * cosR - oz * sinR + x.posX
    p.zOffset = ox * sinR + oz * cosR + x.posZ
    p.rotationY = (p.rotationY + x.rotY + 360) % 360
  }
  return out
}
