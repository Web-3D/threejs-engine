# Hệ "câu giờ" — Progressive scene assembly (vật xuất hiện TUẦN TỰ thay vì chờ load)

> Trạng thái: **IDEA 2026-06-14** (NgQuan). Biến độ-trễ-load thành TÍNH NĂNG: vật thể hiện ra TUẦN TỰ theo thứ tự
> sẵn-sàng (cái load nhanh ra trước, nặng ra sau) + animation "lắp ráp" → cảm giác đang **XEM cảnh được dựng lên**,
> không phải chờ load. Revisit: sau khi defer/fill mặt nước (viên gạch đầu) chạy ổn, hoặc khi đánh bóng UX load cho production.

---

## Bối cảnh
Scene nặng load lâu (compile TSL→WGSL shader, transcode KTX2, reflector RTT — xem số đo 2026-06-14: mặt nước compile/RTT
= freeze; texture 2K transcode ~24s nền). Thay vì che bằng spinner/đứng hình → **dàn dựng reveal**: mỗi thứ hiện khi
sẵn sàng, có animation vào, theo thứ tự cố ý → latency thành trải nghiệm "thi công cảnh".

## Viên gạch ĐẦU (đã làm / đang làm 2026-06-14)
- **Mặt nước defer 3s** — `ArchPlanLab._buildSceneInitial` tắt surfaceOn lúc load (né compile/RTT = load nhanh) →
  `_revealAutoWater` tự bật sau 3s.
- **(kế hoạch) Fill-up "đổ đầy + sóng sánh"** — reveal nước từ ĐÁY basin (đặt frame-compile vào lúc nước cạn → hitch
  vô hình) → lerp mực nước dâng lên ~1.5s ease-out + nghiêng dao-động tắt dần (sóng sánh) → "đầy dần rồi lặng".
- **(kế hoạch) Cá thả SAU khi nước đầy** — cá giấu/spawn ở **GÓC KHUẤT** (ẩn lúc load → né compile/setup PondFish +
  vẫy), nước đầy xong mới **THẢ bơi từ từ ra** (disperse dần từ điểm spawn) → narrative "hồ đầy rồi cá mới có" + che
  spawn. Cần API PondFish: spawn-point + release/disperse (threejs-modules/components/PondFish).
→ Cả 3 (nước defer → fill → cá thả) là 1 CHUỖI reveal = INSTANCE đầu của hệ tổng quát dưới.

## Phác hệ tổng quát
- **Theo dõi sẵn-sàng** mỗi object/group: geometry dựng? texture loaded? shader compiled? (hook vào loading flags + first-render).
- **Hàng đợi reveal** xếp theo: (a) thời điểm sẵn-sàng (nhanh ra trước) HOẶC (b) kịch bản dàn dựng cố ý (nền → lô → nhà → chi tiết → cây/cá → NƯỚC cuối).
- **Animation vào** mỗi item (thư viện entrance tái dùng): fade-in · rise/fill (nước) · scale-in · slide-assemble · drop-in.
- **Mask compile/hitch** đặt vào khoảnh-khắc ít-lộ (nước ở đáy, vật nhỏ/mờ/xa) — học từ fill-up.

## Thứ tự reveal theo KHOẢNG-CÁCH camera-spawn [NgQuan 2026-06-14]
Cụ thể hóa "thứ tự reveal" cho ĐA HỒ (mỗi nhà 1 hồ — khu phố): mở trang, camera spawn 1 điểm →
- **Reveal hồ GẦN nhất TRƯỚC** (cái mắt thấy đầu) → tương tác ngay; rồi **tuần tự xa dần** (sort dist tới camera-spawn), từng hồ 1 → "ripple lan ra từ chỗ mình đứng".
- **Trải đều spike compile shader nước + RTT-first-render PER-HỒ** (per-instance, KHÔNG share) thay vì N cái nổ cùng lúc = freeze.

**Honest:** (1) Texture phần lớn SHARED-cache → hồ sau tái dùng catalog (nhanh) → cái stagger giúp = compile/RTT, không phải texture. (2) Sequential chỉ dàn LÚC LOAD — **KHÔNG giảm tường RUNTIME** (reveal hết = vẫn N reflector RTT/frame → cần probe/LOD).

**★ Synergy:** `dist-tới-camera` lái CẢ 2 trục — (a) **load**: thứ tự reveal (gần trước); (b) **runtime LOD**: gần = planar gương thật, xa = probe/fake ([[water-reflection-probe-tier]]). 1 thước đo, 2 việc → đây là cách gộp load+runtime cho khu phố. Liên hệ [[neighborhood-block-assembly-lod]].

## Lớp ĐO — Load profiler (data nền cho dàn dựng) [NgQuan 2026-06-14]
Bộ kiểm tra/đo để **BIẾT mà dàn, không đoán**:
- **Per-asset load time** — đứa nào nhanh nhất / chậm nhất (MẦM đã có: log `[tex]` + `texturesPending()` trong `scene/texture-set.ts`).
- **Concurrency** — cặp/nhóm nào load CHUNG mà KHÔNG làm chậm nhau, đứa nào phải **TÁCH RIÊNG về CUỐI** (chậm + nặng, kéo cả mẻ) để không ảnh hưởng tất cả.
- **Output**: bảng tổng hợp (tên · ms · đỉnh-đồng-thời · nhóm) → phân tích → quyết **thứ tự reveal** + chọn **hiệu ứng câu-giờ PER-TYPE**.
- **Cơ chế**: timestamp start/end mỗi asset + đếm đồng-thời (mở rộng `texturesPending`) + phân loại (texture / mesh / shader-compile). Mở rộng non-texture sau (nếu có GLB/model).
→ Đây là LỚP DATA cho "Phác hệ tổng quát" ở trên: có số rồi mới dàn đúng + gắn hiệu ứng hợp từng loại.

## Cân nhắc / bẫy
- **Ưu tiên** = f(cost-load, tầm-quan-trọng-thị-giác). Nặng + ít quan trọng → ra cuối, animation che.
- **KHÔNG làm chậm THỰC SỰ** — chỉ dàn lại THỨ TỰ HIỆN; load vẫn chạy nền song song (async). Reveal = khi ready, không phải "chờ thêm".
- **Tránh pop layout** — đặt chỗ/bbox trước, chỉ animate opacity/transform khi hiện.
- **Compile vẫn xảy ra 1 lần** — animation chỉ DỜI + CHE thời điểm, không xóa cost (muốn xóa cost: probe nước / 1K texture / giảm shader).

## Industry signal
- Game: LOD streaming + fade-in vật xa; "pop-in" giấu bằng dither/fade. Web: skeleton → content progressive. Archviz/CG: reveal kiểu "thi công/lắp ráp". → Biến latency thành trải nghiệm là pattern phổ biến.

## Liên hệ
- Mặt nước defer/fill: `ArchPlanLab._buildSceneInitial` / `_revealAutoWater` (viên gạch đầu).
- [[water-reflection-probe-tier]] — giảm cost runtime reflector (bổ trợ: ít phải che hơn).
- Texture 2K→1K (Factory) — giảm transcode nền (ít thứ phải dàn).
