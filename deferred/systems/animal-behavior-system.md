# Hệ Hành Vi Động Vật — chuyên đề mô phỏng hành vi CHÍNH XÁC (cá là ca #1)

> **CHUYÊN ĐỀ / SPEC 2026-06-15** (NgQuan). Không phải 1 feature đơn — là **bộ môn + kiến trúc** để
> *học → phân tích → mô phỏng lại* hành động động vật cho đúng. Cá = **ca nghiên cứu #1** (đã có instance
> trưởng thành: PondFish + PondPredation). Mục tiêu kép: (1) một **quy trình lặp** áp được cho mọi loài;
> (2) một **kiến trúc phân tầng** mà code cá hiện có là hiện thân đầu tiên.
> Liên quan: [[fish-tier-taxonomy]] (nội dung riêng của cá) · `pond.md` · [[progressive-scene-assembly]].

---

## 0. Định nghĩa "CHÍNH XÁC" — chốt thang trước khi làm (FORK chính)

"Mô phỏng chính xác" có 2 nghĩa rất khác nhau — quyết định này định hình toàn bộ kiến trúc:

| Thang | Nghĩa | Cost | Dùng |
|---|---|---|---|
| **A — ĐÚNG HÀNH VI** (ethogram-accurate) ★ default | Đúng *bộ hành vi* + *điều kiện kích hoạt* + *thống kê* (tụ đàn thế nào, phản ứng kẻ thù bao lâu, kiếm ăn ra sao). Locomotion = kinematic "đủ thuyết phục". | rẻ, scale được | **mặc định** cho engine stylized |
| **B — ĐÚNG CƠ-SINH** (biomechanically-accurate) | Mô phỏng cơ/thủy-động-lực thật (spring-mass + lực vây) như *Artificial Fishes* → dáng bơi tự nổi lên từ vật lý. | đắt (mỗi con 1 solver) | hero/showcase 1-2 con cận cảnh |

→ **Thesis: làm A.** "Chính xác" = **khớp ethogram** (con vật làm ĐÚNG việc, đúng lúc, đúng tần suất), KHÔNG phải đúng từng sợi cơ. B = deferred per-asset hero (1 koi cận cảnh có thể nâng cơ-sinh sau). Đây là cùng triết lý **hero vs mass** của [[building-warehouse-pipeline]] / [[water-reflection-probe-tier]].

**"Đúng" đo bằng gì** → xem §6 Validation. Không có thước đo thì "chính xác" chỉ là cảm tính.

---

## 1. Tiền lệ — KHÔNG bịa từ đầu (industry/academic signal)

Bài toán này có nền học thuật sâu. Neo vào đây thay vì tự nghĩ:

- **Tu & Terzopoulos, "Artificial Fishes" (SIGGRAPH 1994)** — KINH ĐIỂN, đúng bài toán này, cá cũng là ví dụ đầu. Mô hình **phân tầng**: vật lý/cơ → motor controllers → **perception (sensors)** → **behavior (intention generator + action selection)** → (học/nhận thức ở bản sau). Lấy nguyên cấu trúc tầng này làm xương sống (ta dừng ở kinematic motor = thang A).
- **Reynolds — Boids (1987) + Steering Behaviors (1999)** — tầng locomotion/bầy đàn: separation · alignment · cohesion · seek/flee/wander/arrival. Cá ĐÃ dùng (separation luôn chạy; cohesion+alignment qua `schooling`).
- **Ethology / Ethogram (Tinbergen, Lorenz)** — PHƯƠNG PHÁP "phân tích": quan sát → **ethogram** = catalog hành vi rời rạc + **releaser/sign-stimulus** (kích hoạt) + thống kê chuyển trạng thái. Tinbergen 4 câu hỏi → ta chỉ cần **causation** (cơ chế + trigger) để mô phỏng. Đây chính là phần "học phân tích".
- **Action selection (game AI)** — FSM · Behavior Tree · **Utility AI** (chấm điểm hành vi theo drive) · subsumption (Brooks) · **drive/homeostasis model** (đói/sợ/mệt là biến trạng thái lái hành vi). Cá hiện = FSM ngầm (wander↔hunt↔flee) + 1 drive (satiation).
- **Couzin et al. — collective motion metrics** — thước đo bầy ĐỊNH LƯỢNG: **polarization** (độ đồng hướng) + **nearest-neighbor distance** + chuyển pha swarm↔torus↔polarized. Dùng để validate schooling (§6).

---

## 2. PHƯƠNG PHÁP — vòng lặp chuyên đề (làm cho MỌI loài)

Quy trình lặp, áp y hệt khi thêm loài mới — đây là "bộ môn":

1. **Quan sát** — gom tham chiếu: video thật + tài liệu sinh học loài đó. (Không có reference → không validate được → đừng làm.)
2. **Dựng ETHOGRAM** — liệt kê hành vi RỜI RẠC (wander/forage/school/flee/hunt/rest/court…) + **trigger** mỗi cái (thấy mồi? thấy địch? đói? đêm?) + thống kê thô (tần suất, cái gì chuyển sang cái gì).
3. **Map xuống TẦNG** (§3) — mỗi hành vi → repertoire (L4); cần giác quan gì (L1); drive nào lái (L2); motor nào (L0); luật chọn (L3).
4. **Slice TỐI THIỂU** — code 1-2 hành vi cốt lõi trước (MVP), soi mắt. KHÔNG dựng cả ethogram 1 lượt.
5. **VALIDATE** — so sim vs reference: định tính (mắt) + định lượng (§6 metrics). Tune.
6. **Mở rộng repertoire** — thêm hành vi từng cái, lặp 4-5.
7. **Tổng quát hoá** — CHỈ khi loài #2/#3 ép ra seam thật → rút engine chung (xem §7 cảnh báo).

---

## 3. KIẾN TRÚC phân tầng (sensorimotor loop — theo Artificial Fishes)

Vòng mỗi frame mỗi con: **Perception → Drives → Action-selection → Behavior → Motor → World** → lặp.

| Tầng | Vai trò | Cá hiện có? |
|---|---|---|
| **L0 Locomotion / Motor** | Biến "muốn đi hướng/tốc X" → pose + dời thân (gait). Cá: sway chữ-S, bank cua, pitch chúi/ngoi, bob. Chim: flap. Chân: gait+IK. | ✅ trưởng thành (`_steer`: sway/bank/pitch/bob) |
| **L1 Perception** | Lọc thế giới → percept: hàng xóm, mồi, kẻ thù, biên/vách. Có **tầm + FOV + điểm mù**. | ⚠️ một phần (bán kính đàn `SCHOOL_R`, rada predator ~2.6m, vách-centroid) — **thiếu FOV/điểm-mù, thiếu percept MỒI thật** |
| **L2 Internal state / Drives** | Biến nội tại đổi theo thời gian + sự kiện: đói (satiation) · sợ/arousal · mệt · sinh sản. Lái chọn hành vi. | ⚠️ chỉ `satiation` (đói→chết). **Sợ = event (flee), chưa phải biến liên tục; chưa có mệt/sinh-sản** |
| **L3 Action selection** | Chọn hành vi đang-chạy từ repertoire theo percept+drive. FSM / utility / BT. | ⚠️ **FSM NGẦM** (wander↔hunt↔flee, ưu tiên override) — chưa hình thức hoá, khó mở |
| **L4 Behavior repertoire** | Catalog hành vi rời rạc, mỗi cái xuất 1 *ý-định* steering/motor. = nội dung RIÊNG mỗi loài. | wander · school(boids) · flee+sprint · hunt · death-float ✅ — **thiếu forage/rest/court** |
| **L5 Social / Coordination** | Đa-agent: boids bầy · thứ bậc trội · lãnh thổ · điều phối săn. Vài hành vi vốn cấp-NHÓM. | ✅ boids + `PondPredation` điều phối + tier ladder — thiếu dominance/territory/đa-loài |
| *(L6 Learning/Memory)* | Quen mồi/địa hình, thích nghi. | ✗ deferred |

**Nguyên tắc tách:** L0/L1/L3 = **engine dùng chung** (rút sau); L2/L4 = **nội dung per-loài** (data + vài hàm); L5 = mixed. Càng đẩy khác-biệt-loài về DATA, engine càng tái dùng.

---

## 4. CA NGHIÊN CỨU #1 — CÁ: ethogram + bản đồ code

**Ethogram cá hồ (pond, bậc 4-6)** — hành vi → trigger → tầng:

| Hành vi | Trigger | Tầng | Trạng thái |
|---|---|---|---|
| Wander (lảng vảng) | mặc định, không kích thích | L4+L0 | ✅ random-walk kẹp (`wander`) |
| Schooling (tụ đàn) | thấy ≥N đồng loại trong `SCHOOL_R` | L5 | ✅ boids (toggle `schooling`) |
| Flee / startle (giật mình bỏ chạy) | predator vào tầm flee (~1.5m) | L4 | ✅ sprint-window 2s tốc-ngẫu-nhiên rồi mệt |
| Hunt (đi săn) | đói VÀNG (6-10) + thấy mồi bậc thấp | L3+L4 | ✅ seek mồi gần nhất, cắn khi mũi chạm |
| Death-float (chết phơi bụng) | satiation < ngưỡng đỏ (0-6) | L2→L4 | ✅ trôi dưới mặt, behavior off |
| Wall-avoid (tránh vách) | sát biên polygon hồ | L1+L0 | ✅ steer về centroid |
| **Forage (mò ăn rong/đáy)** | đói nhẹ, không có mồi sống | L4 | ❌ **thiếu** — chưa mô hình NGUỒN THỨC ĂN (chỉ có prey-cá) |
| **Rest / day-night** | đêm / mệt | L2+L4 | ❌ thiếu (chưa có nhịp ngày-đêm cho cá) |
| **Schooling startle (flash expansion)** | predator táp vào cụm | L5 | ❌ thiếu — cụm chưa "nổ tung" khi bị táp |
| **Court / breed** | mùa + no + có bạn tình | L2+L5 | ❌ deferred (taxonomy đã nhắc breeding) |

**Khoảng cách lớn nhất hiện tại:** L1 perception nghèo (không FOV, không nguồn-thức-ăn) + L2 chỉ 1 drive + L3 FSM ngầm khó mở. 3 cái này là nơi đầu tư để cá "đúng" hơn — không phải thêm motor (L0 đã tốt).

---

## 5. Determinism & data — kỷ luật bắt buộc
- **Seeded RNG (không `Math.random`)** — cá đã dùng LCG mulberry32 (`_initTuning` seed). GIỮ: validate cần tái lập + scene reproducible.
- **Hành vi = DATA chỉnh được** — biên độ sway/wander/bob/bank, tầm cảm nhận, trọng số boids đều là tham số GUI. Loài mới = bộ tham số + ethogram, KHÔNG hard-code.

---

## 6. VALIDATION — đo "đúng" (nếu không sẽ ship theo cảm tính)
- **Schooling** (Couzin): **polarization** (|trung bình vector hướng|, 0..1) + **nearest-neighbor distance** trung bình → so dải sinh học loài. Overlay HUD số khi debug.
- **Predator-response**: độ-trễ giật mình (ms từ địch-vào-tầm → đổi hướng) + có flash-expansion không.
- **Foraging**: tỉ lệ săn thành công / thời gian no — không quá dễ (cá bất tử) cũng không quá khó (chết sạch).
- **Reference**: video koi/đàn cá nhỏ thật + số sinh học. Đối chiếu mắt TRƯỚC, số CHỐT.
- ⭐ Tận dụng **lớp ĐO** của [[progressive-scene-assembly]] (profiler) làm hạ tầng overlay metric chung.

---

## 7. ⚠ CẢNH BÁO over-abstraction (Simplicity Over Abstraction)
**Mới CÓ 1 instance (cá).** Tuyệt đối KHÔNG dựng engine generic `AnimalBrain<T>` lúc này — sẽ design cho "loài tương lai" chưa tồn tại = sai luật "không abstract tới khi ≥3 nơi dùng".
- **Bây giờ:** cá GIỮ concrete. Doc này chỉ **ĐẶT TÊN các tầng** (L0-L5) lên code cá đang có → nhìn thấy seam, chưa cắt.
- **Loài #2:** làm concrete loài #2 (đừng ép vào engine cá). Chỗ nào LẶP thật giữa #1 và #2 mới là seam thật.
- **Loài #3 / lặp lần 3:** mới rút `behavior-kit` chung (L0/L1/L3). Tới lúc đó seam đã tự lộ, không phải đoán.
→ Giá trị doc lúc này = **bản đồ tư duy + quy trình**, KHÔNG phải lệnh viết engine.

---

## 8. Roadmap (MVP slice từng bước)
0. ✅ **Chuyên đề doc này** (2026-06-15) — phương pháp + tầng + map cá + cảnh báo.
1. ⏳ **Đặt tên tầng lên cá** — comment/nhóm code PondFish theo L0-L5 (light, không rewrite) → seam hiện rõ. (Làm cùng lần đụng PondFish kế.)
2. ⏳ **Lấp gap cá ưu tiên** (theo §4): L1 nguồn-thức-ăn + percept FOV → L4 **forage** → L3 hình thức hoá action-selection (utility nhỏ thay FSM ngầm). Từng cái 1 + validate.
3. ⏳ **Validation harness** — overlay polarization/NN-distance/response-latency (dùng profiler [[progressive-scene-assembly]]).
4. ⏳ **Hoàn tất ethogram cá** — flash-expansion · rest/day-night · (court/breed defer).
5. ⏳ **Loài #2** (§9) — pressure-test tổng quát → CHỈ KHI ĐÓ cân nhắc rút engine chung.

## 9. Test tổng quát — chọn loài #2 (chốt khi tới)
- **Chim (flock)** — REUSE boids/steering nhiều nhất (L0 đổi: flap+glide thay sway; L1/L5 gần cá) → *xác nhận engine bay không bị fish-specific*. **Dễ, tín hiệu tổng-quát vừa.**
- **Thú 4 chân (đất)** — ép L0 mới hẳn (gait+IK+bám-đất `heightAt` [[character-terrain-follow]]) + L1 pathfinding → *tín hiệu tổng-quát MẠNH nhất* nhưng đắt.
→ Đề xuất: chim trước (rẻ, vẫn ép seam L0/L4), thú 4 chân là test cứng sau.

## 10. Deferred / novel (ghi để khỏi quên, KHÔNG làm)
- **L6 Learning/Memory** — cá quen mồi/né vùng nguy (RL nhẹ / habituation). Novel cho engine ta.
- **Biomechanical motor (thang B)** — spring-mass + lực vây kiểu Artificial Fishes cho 1 hero cận cảnh.
- **GPU brains** — bậc 5-6 đông >64 (taxonomy fork #3): hành vi chạy compute shader thay CPU per-con.
- **Đa loài shape** — procedural variants / GLB (taxonomy đã nêu).

## Liên hệ
- **`docs/animal-behavior.md`** — THƯ VIỆN LOÀI (ethogram + sinh học THẬT để tra cứu); spec này = PHƯƠNG PHÁP mô hình hoá nó. Cặp đôi: loài-làm-gì ↔ cách-build.
- [[fish-tier-taxonomy]] — NỘI DUNG riêng của cá (6 bậc, predation) = L4/L5 content của ca #1.
- [[progressive-scene-assembly]] — lớp ĐO/profiler tái dùng cho validation harness.
- [[building-warehouse-pipeline]] · [[water-reflection-probe-tier]] — cùng triết lý hero-vs-mass (thang A/B + tier perf).
- [[character-terrain-follow]] — nền bám-đất cho loài #2 đi bộ.
- Code ca #1: `threejs-modules/components/PondFish/index.ts` (L0-L4) + `PondFish/PondPredation.ts` (L5) + `pond.md`.
