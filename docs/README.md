# docs/ — Thư viện TRA CỨU (knowledge base)

> Khu **kiến thức tra cứu** cắt ngang nhiều mảng — KHÁC `playbooks/` (recipe dựng code 1 mảng) và
> `deferred/` (tính năng hoãn). Đây là nơi gom **kiến thức nền** (sinh học, lý thuyết, bảng tham chiếu) để
> mô phỏng/thiết kế cho đúng, tích lũy dần — đọc khi cần "thật thế nào", không phải "code ra sao".

## Ranh giới (đừng trùng)
| Loại | Nguồn chân lý của | docs/ làm gì |
|---|---|---|
| `playbooks/<slug>.md` | recipe dựng + tầng/toạ-độ 1 mảng code | docs link, không chép |
| `deferred/` | tính năng đã nghiên cứu, hoãn (gồm SPEC kiến trúc) | docs link |
| module `README.md` | API/props module | docs link |
| **docs/ (đây)** | **kiến thức NỀN tra cứu** (sinh học/lý thuyết/bảng) cắt-ngang | ← phần không sống ở đâu khác |

## Trang
| Trang | Nội dung | Trạng thái |
|---|---|---|
| [animal-behavior.md](animal-behavior.md) | Thư viện HÀNH VI ĐỘNG VẬT theo loài (ethogram + sinh học + vận động) để mô phỏng. Cá = mục đầy đủ; chim/thú/bò-sát/côn-trùng/biển = stub | đang xây |
| [pbr-texture-maps.md](pbr-texture-maps.md) | Bộ 4 map PBR (albedo/normal/rough/ao) — vai trò từng map, luật sampler (1/texture, trần 16), ORM packing (gộp rough+ao −1 sampler) + gộp ở đâu (Factory→kho→load) | tham chiếu |
| [performance.md](performance.md) | **Master perf production** — tư duy production (GPU yếu/lạ), bản đồ MỌI nguồn ăn perf (draw/geo/VRAM/fill/CPU/load), đo-đạc, ngân sách + **checklist nghiêm ngặt trước deploy**. Router → GPU-BUDGETS/PERFORMANCE/pbr-texture-maps | tham chiếu + gate |

## Thêm trang
- 1 chủ đề tra-cứu cắt-ngang mới → 1 file `docs/<chủ-đề>.md` + thêm dòng vào bảng trên.
- Mỗi file tự chứa template "thêm mục" để mở rộng dần (như per-loài trong animal-behavior).
