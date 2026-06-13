/**
 * VỊ TRÍ   — threejs-modules/components/PondFish/PondPredation.ts
 * VAI TRÒ  — Coordinator SĂN MỒI giữa các đàn cá CÙNG 1 hồ: cá bậc CAO (tier số nhỏ) phát hiện cá bậc THẤP
 *            (tier số lớn) ở gần → ra lệnh LAO TỚI ĐỚP (bản năng tự nhiên: tăng tốc → đớp → mồi biến mất).
 *            CHỈ săn khi slider Đói của đàn predator ở vùng VÀNG (level 6..10 — `PondFish.canHunt()`).
 * LIÊN HỆ  — Ngoài PondFish (mỗi đàn = 1 InstancedMesh). Caller (ArchPlanLab) gom mọi đàn + nhóm theo HỒ,
 *            tick update(dt) MỖI frame (sau khi mọi PondFish.update chạy). Cùng hồ = CHUNG gốc mesh (tâm hồ)
 *            → toạ độ LOCAL các đàn so sánh TRỰC TIẾP (không cần đổi world). MVP per-con (1 đớp 1); cluster +
 *            boids tụm bầy + reversible reset = Phase sau. Predation 1-on-1: tier 4 (koi) đớp tier 5 (cá nhỏ).
 *
 * CÁCH DÙNG: const pred = new PondPredation(entries); // mỗi frame: pred.update(dt)
 * DISPOSE: không giữ tài nguyên GPU — bỏ tham chiếu là xong (PondFish tự dispose qua siteShaders).
 */
import type { PondFish } from './index'

// 1 đàn tham gia chuỗi săn: pond = ref nhóm (WaterConfig — cùng ref = cùng hồ, chung gốc mesh) + đàn + bậc.
export interface PredationEntry {
  pond: object
  fish: PondFish
  tier: number
}

type FishView = { x: number; z: number; yFrac: number; heading: number; alive: boolean }
interface PreyHit {
  x: number
  z: number
  yFrac: number
  dist: number
  school: PondFish
  j: number
}

const DETECT_K = 5 // bán kính PHÁT HIỆN mồi (từ TÂM thân) = chiều-dài-predator × K (koi 0.24m → ~1.2m)
const MOUTH_K = 0.5 // MIỆNG predator (đầu cá) cách TÂM ~½ thân theo heading → đi-đớp tính từ đây (không tâm/đuôi)
const EAT_GAPE = 0.1 // độ "há miệng" thêm = chiều-dài-predator × K (mũi có tầm với nhỏ) — cộng vào bán kính thân mồi
// 🦈 ĐỚP khi MŨI predator chạm BẤT KỲ đâu trên THÂN mồi: dist(mũi, tâm mồi) < ½·dài-MỒI + EAT_GAPE·dài-predator.
// Điểm bị-đớp = TOÀN THÂN mồi (mồi to → dễ chạm, hết xoay vòng tìm điểm); điểm đi-đớp = MŨI predator (NgQuan).
const EAT_COOLDOWN = 1 // s — nghỉ NGẮN sau đớp (chase timer mới là độ trễ chính). Vẫn tránh vét sạch tức thì.
const CHASE_MIN = 2.5 // s — predator phải RƯỢT (đang đuổi mồi) ≥ ngần này MỚI được cắn → "rượt 2-3 giây" giống đời thật, không snap tức thì
const FLEE_K = 17 // bán kính CHẠY TRỐN của prey = chiều-dài-PREY × K — thấy predator bậc cao trong tầm này → bơi ngược ra
// (tăng 12→17: mồi PHẢN ỨNG SỚM hơn, "muốn chạy" rõ hơn khi bị dí)

// Mồi gần nhất (alive) trong bán kính detect quanh predator p — quét mọi đàn bậc thấp. null = không có.
function nearestPrey(
  p: { x: number; z: number },
  preyData: { fish: PondFish; v: FishView[] }[],
  detect: number
): PreyHit | null {
  let best: PreyHit | null = null
  let bd = detect
  for (const { fish, v } of preyData) {
    for (let j = 0; j < v.length; j++) {
      const g = v[j]
      if (!g.alive) continue
      const dist = Math.hypot(g.x - p.x, g.z - p.z)
      if (dist >= bd) continue
      bd = dist
      best = { x: g.x, z: g.z, yFrac: g.yFrac, dist, school: fish, j }
    }
  }
  return best
}

export class PondPredation {
  private readonly groups: PredationEntry[][]
  private readonly cd = new WeakMap<PondFish, number[]>() // cooldown sau-đớp per-con mỗi đàn predator
  private readonly chaseT = new WeakMap<PondFish, number[]>() // 🦈 giây đã RƯỢT per-con (gate CHASE_MIN trước khi cắn)

  constructor(entries: PredationEntry[]) {
    const byPond = new Map<object, PredationEntry[]>()
    for (const e of entries) {
      const g = byPond.get(e.pond) ?? []
      g.push(e)
      byPond.set(e.pond, g)
    }
    this.groups = [...byPond.values()].filter((g) => g.length >= 2) // cần ≥2 đàn mới có ăn nhau
  }

  update(dt: number): void {
    for (const group of this.groups) this._huntPond(group, dt)
  }

  // 1 hồ: mỗi đàn vừa là PREDATOR (săn bậc thấp hơn = tier số lớn hơn) vừa là PREY (chạy trốn bậc cao hơn =
  // tier số nhỏ hơn). Bậc cao nhất chỉ săn; bậc thấp nhất chỉ trốn; bậc giữa làm cả 2 (flee ưu tiên ở _swim).
  private _huntPond(group: PredationEntry[], dt: number): void {
    for (const e of group) {
      const preys = group.filter((q) => q.tier > e.tier)
      if (preys.length > 0) this._huntSchool(e, preys, dt)
      const predators = group.filter((q) => q.tier < e.tier)
      if (predators.length > 0) this._fleeSchool(e, predators)
    }
  }

  // 1 đàn PREY: mỗi con (còn sống) thấy predator gần nhất trong tầm FLEE → setFlee (bơi NGƯỢC ra); else clearFlee.
  private _fleeSchool(prey: PredationEntry, predators: PredationEntry[]): void {
    const flee = prey.fish.getFishLength() * FLEE_K
    const views = prey.fish.getFishView()
    const predData = predators.map((q) => ({ fish: q.fish, v: q.fish.getFishView() }))
    for (let i = 0; i < views.length; i++) {
      const p = views[i]
      const near = p.alive ? nearestPrey(p, predData, flee) : null
      if (near) prey.fish.setFlee(i, near.x, near.z)
      else prey.fish.clearFlee(i)
    }
  }

  // Mảng số theo PondFish (cooldown / chase) — lazy init, length = số con. WeakMap → đàn dispose là rụng theo.
  private _track(map: WeakMap<PondFish, number[]>, fish: PondFish, n: number): number[] {
    let arr = map.get(fish)
    if (!arr) {
      arr = new Array<number>(n).fill(0)
      map.set(fish, arr)
    }
    return arr
  }

  // 1 đàn predator: CHỈ săn khi Đói vùng VÀNG (canHunt). Mỗi con (hết cooldown) tìm mồi gần nhất → setHunt (lao
  // tới) + đếm giây RƯỢT; chỉ CẮN khi đã rượt ≥ CHASE_MIN (2-3s, giống đời thật) + mũi chạm thân mồi → consume +
  // cooldown. Không mồi / không-vàng / đang cooldown → clearHunt + reset chase. Tách _tryBite giữ rule-50/complexity.
  private _huntSchool(pred: PredationEntry, preys: PredationEntry[], dt: number): void {
    const active = pred.fish.canHunt() // 🟡 gate: chỉ đớp khi slider Đói ở vùng vàng (6..10)
    const detect = pred.fish.getFishLength() * DETECT_K
    const views = pred.fish.getFishView()
    const cds = this._track(this.cd, pred.fish, views.length)
    const chase = this._track(this.chaseT, pred.fish, views.length)
    const preyData = preys.map((q) => ({ fish: q.fish, v: q.fish.getFishView() }))
    for (let i = 0; i < views.length; i++) {
      if (cds[i] > 0) {
        cds[i] -= dt // đang tiêu hoá → nghỉ săn
        chase[i] = 0
        pred.fish.clearHunt(i)
        continue
      }
      const near = active && views[i].alive ? nearestPrey(views[i], preyData, detect) : null
      if (!near) {
        chase[i] = 0
        pred.fish.clearHunt(i)
        continue
      }
      pred.fish.setHunt(i, near.x, near.z, near.yFrac)
      chase[i] += dt // đang rượt → đếm giây
      this._tryBite(pred.fish, views[i], near, i, chase, cds)
    }
  }

  // CẮN nếu đã rượt ≥ CHASE_MIN giây + MŨI predator (tâm + heading×½thân) chạm THÂN mồi (dist < ½·dài-mồi + gape).
  // Mồi to → vùng bị-đớp rộng theo thân → predator không xoay vòng canh điểm. consume + vào cooldown + reset chase.
  private _tryBite(
    fish: PredationEntry['fish'],
    p: FishView,
    near: PreyHit,
    i: number,
    chase: number[],
    cds: number[]
  ): void {
    if (chase[i] < CHASE_MIN) return // rượt chưa đủ 2-3s → chưa cắn (chase giống đời thật)
    const len = fish.getFishLength()
    const mx = p.x + Math.cos(p.heading) * len * MOUTH_K // mũi predator
    const mz = p.z - Math.sin(p.heading) * len * MOUTH_K
    const reach = near.school.getFishLength() * 0.5 + len * EAT_GAPE // ½ thân MỒI + tầm-với mũi
    if (Math.hypot(near.x - mx, near.z - mz) < reach) {
      near.school.consume(near.j) // 🦈 cắn — mồi biến mất
      cds[i] = EAT_COOLDOWN // nghỉ ngắn trước con kế
      chase[i] = 0
    }
  }
}
