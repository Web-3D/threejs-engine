/**
 * VỊ TRÍ   — threejs-modules/components/SkyGradient/index.ts
 * VAI TRÒ  — Bầu trời gradient WebGPU-native qua scene.backgroundNode — KHÔNG mesh (nên KHÔNG bao giờ "thấy
 *            quả cầu từ ngoài", luôn phủ kín + tự theo camera): zenith→horizon, LERP ngày↔đêm theo độ-cao
 *            mặt trời + quầng nắng (đĩa + halo ấm lúc thấp = hoàng hôn). Dùng positionWorldDirection (hướng view).
 * LIÊN HỆ  — caller: scene.backgroundNode = sky.getBackgroundNode(); sky.setSun(dir). getDayFactor() để mờ đèn.
 *
 * CÁCH DÙNG: const sky = new SkyGradient(); scene.backgroundNode = sky.getBackgroundNode(); sky.setSun(x,y,z)
 * DISPOSE: dispose() — KHÔNG sở hữu GPU resource (node do renderer compile/quản); caller set backgroundNode=null.
 */

import * as THREE from 'three'
import { mix, positionWorldDirection, uniform } from 'three/tsl'

export interface SkyGradientOptions {
  zenithDay?: THREE.ColorRepresentation // đỉnh trời ban ngày. Default xanh dương
  horizonDay?: THREE.ColorRepresentation // chân trời ban ngày. Default xanh nhạt
  zenithNight?: THREE.ColorRepresentation // đỉnh trời ban đêm. Default xanh đen
  horizonNight?: THREE.ColorRepresentation // chân trời ban đêm. Default tím-than
  sunColor?: THREE.ColorRepresentation // màu quầng nắng. Default trắng-ấm
}

const C = (v: THREE.ColorRepresentation): THREE.Color => new THREE.Color(v)

export class SkyGradient {
  private isDisposed = false
  private day = 1

  private readonly uDay = uniform(1) // 0 = đêm, 1 = ngày
  private readonly uSun = uniform(new THREE.Vector3(0, 1, 0)) // hướng TỚI mặt trời (đã normalize)
  private readonly uGlow = uniform(1) // quầng nắng: 1 khi sun trên cao, tắt dần khi sát chân trời
  private readonly colorNode

  constructor(opts: SkyGradientOptions = {}) {
    const uZenDay = uniform(C(opts.zenithDay ?? 0x2f6fd0))
    const uHorDay = uniform(C(opts.horizonDay ?? 0xbcd8f0))
    const uZenNight = uniform(C(opts.zenithNight ?? 0x05070f))
    const uHorNight = uniform(C(opts.horizonNight ?? 0x18203a))
    const uSunCol = uniform(C(opts.sunColor ?? 0xfff0cf))

    const dir = positionWorldDirection // hướng view (camera → pixel nền) trong world
    const up = dir.y.clamp(0, 1) // 0 chân trời .. 1 đỉnh
    const grad = mix(
      mix(uHorNight, uHorDay, this.uDay),
      mix(uZenNight, uZenDay, this.uDay),
      up.pow(0.45) // dồn gradient về phía chân trời cho dày
    )
    const sd = dir.dot(this.uSun).clamp(0, 1) // gần hướng sun = 1
    const disc = sd.pow(300).mul(this.uGlow) // đĩa mặt trời
    const halo = sd.pow(7).mul(0.5).mul(this.uGlow) // quầng ấm hoàng hôn
    this.colorNode = grad.add(uSunCol.mul(disc.add(halo)))
  }

  /** Node màu cho scene.backgroundNode. */
  getBackgroundNode() {
    return this.colorNode
  }

  /** Truyền hướng TỚI mặt trời (vd sunLight.position khi target ở gốc). Cập nhật quầng nắng + day-factor.
   *  Trả day-factor [0..1] (1=trưa, 0=đêm/hoàng hôn) để caller mờ đèn fill/env. LIVE (uniform). */
  setSun(x: number, y: number, z: number): number {
    if (this.isDisposed) return this.day
    const len = Math.hypot(x, y, z) || 1
    const ny = y / len
    this.uSun.value.set(x / len, ny, z / len)
    // ny = sin(độ cao). Gizmo kẹp sun ≥5° → map dải [5°→40°] = [tối/hoàng-hôn → sáng-trưa].
    this.day = clamp01((ny - 0.087) / 0.556) // 5°→0 (tối) .. ≥40°→1 (trưa)
    this.uGlow.value = clamp01(ny / 0.1) // quầng tắt dần khi sun sát/dưới chân trời
    this.uDay.value = this.day
    return this.day
  }

  /** Day-factor hiện tại [0..1] (1 = trưa, 0 = đêm/hoàng hôn). */
  getDayFactor(): number {
    return this.day
  }

  dispose(): void {
    this.isDisposed = true // KHÔNG sở hữu GPU resource; caller tự set scene.backgroundNode = null
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}
