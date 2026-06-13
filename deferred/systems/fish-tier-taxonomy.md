# Fish-tier taxonomy — chuỗi thức ăn 6 bậc + predation theo bầy

> **SPEC 2026-06-13** (NgQuan). Khung phân loại cá 6 bậc làm nền cho hệ sinh thái nước (predation
> lớn-ăn-bé + thủy sinh sau này). "Phân loại như thế trước, chia sâu + bổ sung về sau."
> Liên quan: [[water-type-ecosystem-features]] (luật 3 loại nước) · playbook `pond.md`.

## Quyết định ĐÃ chốt

- **Ăn = REVERSIBLE** (#3): mỗi đàn có "nuốt + **reset đàn**" — con bị táp ẩn đi, reset/kéo đói lên = hồi
  lại. Không cần lưu per-fish consumed state. ("Vĩnh viễn" để dành khi có breeding/auto-decay sau.)
- **Đói RIÊNG mỗi đàn** (#4): mỗi đàn 1 nút Đói tự chỉnh theo mức — đói của *chính đàn predator* quyết nó
  có đi săn không (KHÔNG phải 1 slider pond-level chung — bỏ đề xuất pond-level cũ).
- **tier set size + count + cap mặc định, vẫn chỉnh tay** (#5): bậc cao = to + ít con; bậc thấp = nhỏ + đông.

## Bảng 6 bậc

| Bậc | Loài ví dụ | Số con/đàn | Cỡ (tương đối) | Bị ăn ra sao |
|---|---|---|---|---|
| **1** | cá voi, cá nhà táng | **1–2** | to nhất | (đỉnh chuỗi — không bị ăn) |
| **2** | cá heo, cá mập, cá voi sát thủ (orca) | **1–5** | lớn | bị bậc 1 táp |
| **3** | cá thu & tương tự | **1–10** | ~½–⅓ bậc 2 | bị bậc 2 táp **½–⅓ cơ thể** (KHÔNG trọn con) |
| **4** | cá chép, cá rô, cá tai tượng, cá koi | **10–20** | vừa | bị bậc trên táp |
| **5** | cá vàng, cá đá & loài nhỏ đi đàn | **5–100** (tùy loài) | nhỏ | bị táp **cả cụm** |
| **6** | tép, phù du | bầy (làm kỹ sau) | li ti | bị táp cả mảng |

Luật săn: bậc N ăn mọi bậc > N (số càng lớn càng thấp). Cùng bậc không ăn nhau.

## Kích thước THẬT (tra cứu 2026-06-13 — căn cứ thiết kế size/tỉ lệ)

| Bậc | Loài tiêu biểu | Kích thước THẬT (dài) | Số con/đàn | Engine gợi ý (mm) |
|---|---|---|---|---|
| **1** | Cá voi xanh 24–30m · **cá nhà táng 16–20m** (apex răng) · lưng gù 14–17m | **16–30 m** | 1–2 | (sea — defer) |
| **2** | **Orca 6–9.8m** · cá mập trắng 4.6–6.1m · cá heo mũi chai 2–4m | **2–10 m** | 1–5 | (sea — defer) |
| **3** | Cá ngừ vây xanh 0.8–2m · cá nhồng 1–1.8m · cá ngừ ó ~0.76m · **cá thu 0.3–0.45m** | **0.3–2 m** | 1–10 | (sea — defer) |
| **4** | **Koi 60–90cm** (jumbo ~1m) · cá chép 0.3–0.5m (max 1.2m) · cá tai tượng 0.45–0.7m · cá rô 0.1–0.25m | **0.1–0.9 m** | 10–20 | **240–450** |
| **5** | Cá vàng 0.1–0.4m · **cá đá/betta 5–7cm** · neon/bảy màu 3–6cm | **3–40 cm** | 5–100 | **70–120** |
| **6** | Tép cherry 2.5–4cm · krill ~1.5cm · **copepod/phù du 1–2mm** · phytoplankton µm | **1mm–4cm** | bầy | **20–50** (tép); points (phù du) |

**2 lưu ý CHÍNH XÁC (đính kèm để khỏi hiểu lầm):**
1. **Chuỗi "1 ăn 2 ăn 3…" là STYLIZED, không khớp sinh thái thật:** ngoài đời 2 con TO NHẤT (cá voi
   xanh + cá mập voi) lại ăn con NHỎ NHẤT (krill/phù du bậc 6 — filter feeder); orca mới là apex thật (ăn
   cả cá mập + cá voi). Giữ ladder của NgQuan làm LUẬT GAME, biết caveat này khi cần "thật".
2. **Span size khổng lồ → chốt tách sea/pond:** voi 30m ↔ copepod 1mm ≈ **30.000×** (không 1 vùng nước nào
   chứa nổi) ⇒ **sea** (bậc 1–3, span ~0.3–30m) tách khỏi **pond** (bậc 4–6, span ~1mm–0.9m ≈ 900×). Pond
   stylized: koi ~24–45cm (cá non), không dựng koi 90cm trong hồ nhỏ.

## Câu hỏi kiến trúc CÒN MỞ (chốt trước khi build sâu)

1. **Container/scale — pond KHÔNG chứa nổi cá voi.** Bậc 1–2 (voi/cá mập/orca, chục mét) là **quy mô
   BIỂN**, không phải pond. Tỉ lệ voi(~16m) ↔ phù du(~mm) ≈ 10⁴:1 trong 1 vùng nước. ⇒ hoặc thêm
   **water-kind "sea/ocean"** (vùng nước lớn) bên cạnh pool/pond/puddle, hoặc **gate tier theo cỡ hồ**
   (pond chỉ chứa bậc 4–6; sea mới mở bậc 1–3). → fork thật, cần chốt.
2. **Táp một-phần (bậc 3 mất ½–⅓ thân).** Phá mô hình ẩn-instance nhị phân (sống/biến mất). Đề xuất
   GỘP whole-gulp & partial-bite thành **1 luật**: `gulp fraction = f(size predator / size prey)` —
   ratio lớn → nuốt trọn cụm; ratio nhỏ → mỗi cú chỉ ăn 1 phần (multi-bite, instance **scale giảm dần**
   rồi vanish ở 0). Một luật cover mọi cặp bậc.
3. **Count vượt cap.** `MAX_FISH=40` hiện tại; bậc 5 tới 100, bậc 6 phù du = bầy lớn. ⇒ bậc nhỏ (5–6)
   nên đổi sang **billboard/GPU-points** (như Precipitation dùng `THREE.Points`) thay vì 131-tri/con
   InstancedMesh; bậc lớn (1–4) giữ InstancedMesh count thấp. Representation tách theo bậc.
4. **Hình loài.** PondFish hiện chỉ 1 thân koi procedural. Đa loài (voi/mập/koi/vàng khác hẳn shape) =
   **procedural variants** hoặc **GLB asset** per loài — defer ("chia sâu sau").
5. **Schooling thật.** Hành vi hiện = wander ĐỘC LẬP per-con (`_steer`, không cohesion). Cluster-gulp
   ("há miệng táp cả bầy") BẮT BUỘC cá bậc thấp tụm bầy thật ⇒ thêm **boids Reynolds** (cohesion +
   alignment + separation), ít nhất cho bậc 4–6. Bước 1.5 trước predation.

## Build order (tiến độ)

1. ✅ **Data+GUI khung** (2026-06-13): `WaterConfig.fishSchools[]` (+`tier`), tab F1/F2＋/xoá đàn, Đói riêng mỗi đàn.
2. ✅ **PREDATION per-con MVP** (2026-06-13, `PondPredation`): **1 đớp 1** (KHÔNG cluster) — predator (tier nhỏ, Đói
   VÀNG) seek mồi gần nhất → **rượt ≥2.5s** → cắn khi MŨI chạm THÂN mồi → consume (reset đàn hồi lại). + **flee**
   (prey né predator), **tách-thân** (separation per-con), **spawn-spacing** (claims chung hồ), **hành-vi/size theo bậc**.
3. ⏳ **Boids đàn thật** (cohesion + alignment; separation ĐÃ có) → bậc thấp tụm CỤM (tiền đề cluster-gulp).
4. ⏳ **Cluster-gulp:** voi/predator-lớn há miệng táp CẢ CỤM theo `gulp fraction = f(size predator/prey)` (whole-gulp
   ratio lớn / multi-bite ratio nhỏ — bậc 3 mất ½-⅓ thân). Hiện per-con đã nuốt-trọn 1 con bất kể ratio.
5. ⏳ **Nối đỏ:** vùng đỏ (đói 0–6) giết bậc sống sót sau khi vàng ăn cạn (`_deadCount` nhắm số còn).
6. ⏳ **Sau:** animation đớp · đa loài shape · bậc 5–6 GPU-points (count >64) · sea water-kind (fork #1).

## Revisit khi

Tiếp Bước 3+ (boids cohesion → cluster-gulp), hoặc chốt fork #1 (sea water-kind cho bậc 1-3). MVP slice từng bước.
