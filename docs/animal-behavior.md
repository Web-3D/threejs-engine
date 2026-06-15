# 🧠 Hành vi động vật — THƯ VIỆN LOÀI (tra cứu để mô phỏng)

> **Trang nghiên cứu/tra cứu 2026-06-15.** Nơi gom HÀNH VI THẬT của từng loài (ethogram + sinh học + đặc tính
> vận động) làm nguyên liệu để mô phỏng chính xác trong engine. **Mỗi loài = 1 mục**, bổ sung dần khi nghiên cứu.
>
> **Khác 2 doc anh em — đừng lẫn:**
> - `deferred/systems/animal-behavior-system.md` = **PHƯƠNG PHÁP + KIẾN TRÚC** (cách BUILD engine: 6 tầng L0-L5, vòng lặp, roadmap).
> - **Trang này** = **THƯ VIỆN LOÀI** (con vật THẬT LÀM GÌ: tra cứu, đối chiếu sim vs đời thực).
> - `playbooks/pond.md`, code `PondFish` = HIỆN THỰC cụ thể.
> Mạch: trang này (loài làm gì) → spec (cách mô hình hoá) → code (chạy).

---

## Cách dùng trang này
- **Tra cứu:** vào mục loài → đọc Ethogram + Vận động + Xã hội để biết "thật" thế nào trước khi code.
- **Đối chiếu:** mục "Trạng thái mô phỏng" ghi engine đã làm tới đâu (✅/gap) so với ethogram thật → biết còn thiếu gì.
- **Thêm loài:** copy khối *Template mục loài* dưới → điền → thêm dòng vào §Mục lục. Chưa nghiên cứu = để stub "🔜".

### Template mục loài (copy khi thêm loài mới)
```
## <Loài>  <emoji>
**Tổng quan sinh học** — môi trường, cỡ, ăn gì, tuổi thọ (1-2 dòng cốt lõi).
**Ethogram** (bảng: Hành vi · Trigger · Ghi chú) — danh mục hành vi RỜI RẠC + cái gì kích hoạt.
**Vận động (locomotion)** — kiểu di chuyển đặc trưng (gait/undulation/flap…) → ánh xạ tầng L0.
**Giác quan (perception)** — thấy/nghe/ngửi/đường-bên… tầm + điểm mù → L1.
**Xã hội** — đàn/lãnh thổ/thứ bậc → L5.
**Trạng thái mô phỏng** — engine đã làm gì (✅) + gap (❌) so ethogram.
**Tham chiếu** — paper/nguồn.
```

---

## Mục lục
| Loài | Trạng thái nghiên cứu | Sim |
|---|---|---|
| [Cá (nước ngọt/hồ)](#cá-) | ✅ mục đầy đủ | đang build (forage vừa thêm) |
| [Chim](#chim-) | 🔜 stub | — |
| [Thú 4 chân](#thú-4-chân-) | 🔜 stub | — |
| [Bò sát & lưỡng cư](#bò-sát--lưỡng-cư-) | 🔜 stub | — |
| [Côn trùng & chân khớp](#côn-trùng--chân-khớp-) | 🔜 stub | — |
| [Sinh vật biển lớn](#sinh-vật-biển-lớn-) | 🔜 stub (taxonomy đã có) | — |

---

## Cá 🐟
**Tổng quan sinh học** — Cá hồ cảnh (koi/chép/vàng) = động vật biến nhiệt, ăn tạp thiên đáy (mò mùn + đớp vụn
nổi mặt), sống theo bầy lỏng. Koi 24–90cm (hồ stylized dùng cá non ~24–45cm). Bậc ăn: xem [fish-tier-taxonomy](../deferred/systems/fish-tier-taxonomy.md).

**Ethogram**
| Hành vi | Trigger | Ghi chú (đời thực) |
|---|---|---|
| Wander/cruise | mặc định | bơi lảng vảng tốc thấp, không bao giờ thẳng tuyệt đối (uốn liên tục) |
| Shoaling/Schooling | thấy đồng loại gần | **shoal** = tụ xã hội lỏng (koi); **school** = bơi đồng-hướng đồng-tốc (cá nhỏ mồi). Couzin: swarm↔torus↔polarized |
| Foraging (mò ăn) | đói | benthic: rúc đáy mò mùn; surface: ngoi đớp vụn nổi (koi nổi đớp pellet rất rõ) |
| Startle / C-start | địch/động đột ngột | né cực nhanh: thân bẻ chữ **C** (Mauthner cell) rồi phóng — escape latency ~5-15ms |
| Predator-avoid (flee) | địch trong tầm | bơi ngược ra; bầy "flash expansion" (nổ tung) khi bị lao vào |
| Hunt/strike | predator đói + thấy mồi | lao tăng tốc → đớp (lớn ăn bé) |
| Dominance/feeding hierarchy | tranh mồi | con trội chiếm chỗ ăn tốt; đuổi con dưới |
| Rest / night | đêm/lạnh | giảm hoạt động, lửng lơ đáy (cá không nhắm mắt) |
| Spawning | mùa + nhiệt độ + bạn tình | rượt đuổi sinh sản theo mùa |

**Vận động (L0)** — **BCF undulation** (body-caudal fin); koi/chép = *subcarangiform* (uốn ⅔ thân sau + đuôi).
Phụ: bank (nghiêng vào cua) + pitch (chúi khi đổi tầng). → engine: sway chữ-S + bank + pitch + đuôi vẫy.

**Giác quan (L1)** — **đường bên** (lateral line: cảm áp/dòng nước → nền của schooling + báo địch) · **thị giác**
gần-360° (mắt 2 bên) nhưng **điểm mù** ngay trước mõm + ngay sau đuôi · khứu giác (tìm mồi). → mô hình FOV + điểm mù.

**Xã hội (L5)** — shoal lỏng (koi) ↔ school chặt (cá mồi); chuỗi ăn nhiều bậc (predation lớn-ăn-bé); thứ bậc khi ăn.

**Trạng thái mô phỏng**
- ✅ Wander (random-walk kẹp) · ✅ Shoaling/Schooling (boids: separation luôn + cohesion/alignment toggle) ·
  ✅ Flee + cửa sổ SPRINT 2s tốc-ngẫu-nhiên (xấp xỉ C-start/escape) · ✅ Hunt/predation theo bậc (cluster-gulp ⏳) ·
  ✅ Death phơi-bụng (đói cạn) · ✅ **Forage** (đói → sinh vụn nổi mặt → cả đàn tới ăn → satiation tự hồi; 2026-06-15) ·
  ✅ Bank/pitch + mặt cá (mắt/miệng há).
- ❌ Gap: **perception FOV/điểm-mù** (hiện cảm 360°) · **flash-expansion** (cụm chưa nổ khi bị táp) · **rest/ngày-đêm** ·
  **benthic foraging** (mới surface) · **spawning/breed** · action-selection hình-thức-hoá (đang FSM ngầm).

**Tham chiếu** — Tu & Terzopoulos *Artificial Fishes* (SIGGRAPH 1994) · Reynolds Boids/Steering · Couzin et al.
collective motion · Mauthner-cell C-start (escape) · ethology/ethogram (Tinbergen). Code: [`PondFish`](../threejs-modules/components/PondFish/index.ts) · [pond.md](../playbooks/pond.md).

---

## Chim 🐦
🔜 **Sẽ bổ sung khi nghiên cứu.** Dự kiến: flocking (murmuration — boids gốc Reynolds), locomotion flap+glide
(L0 mới), đậu/cất/hạ cánh, lãnh thổ + hót. → ứng viên LOÀI #2 (reuse boids nhiều nhất, ép seam L0).

## Thú 4 chân 🦊
🔜 **Sẽ bổ sung.** Dự kiến: gait (đi/chạy/phi) + IK bám đất ([character-terrain-follow](../deferred/systems/character-terrain-follow.md)),
pathfinding, bầy/lãnh thổ, săn-mồi/gặm cỏ. → test tổng-quát MẠNH nhất (L0 + L1 pathfinding mới hẳn).

## Bò sát & lưỡng cư 🦎
🔜 **Sẽ bổ sung.** Dự kiến: phơi nắng (điều nhiệt — biến nhiệt), rình-vồ (ambush), bơi (ếch/rùa), undulation (rắn).

## Côn trùng & chân khớp 🦋
🔜 **Sẽ bổ sung.** Dự kiến: bầy lớn (GPU points/instancing — như Precipitation), bay lượn ngẫu nhiên (bướm),
hành quân (kiến — pheromone trail), đậu/bay.

## Sinh vật biển lớn 🐋
🔜 **Sẽ bổ sung.** Bậc 1-3 (cá voi/mập/orca) — quy mô BIỂN, đã tách & ghi khung ở [fish-tier-taxonomy](../deferred/systems/fish-tier-taxonomy.md)
(fork sea water-kind). Phản chiếu mặt biển: [water-reflection-probe-tier](../deferred/rendering/water-reflection-probe-tier.md) §Biển+đảo.

---

## Liên hệ
- **Phương pháp + kiến trúc:** [animal-behavior-system.md](../deferred/systems/animal-behavior-system.md) (6 tầng L0-L5, vòng lặp, validation).
- **Cá — chi tiết:** [fish-tier-taxonomy.md](../deferred/systems/fish-tier-taxonomy.md) (6 bậc, predation) · [pond.md](../playbooks/pond.md) · code [`PondFish`](../threejs-modules/components/PondFish/index.ts).
