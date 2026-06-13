# audio-web-procedural — kế hoạch âm thanh cho web-3D (procedural + positional)

> NgQuan hỏi 2026-06-13: "bác tự tạo audio được không hay cần ElevenLabs?" → chốt: LÊN KẾ HOẠCH, làm sau.
> Trả lời cốt lõi: **Claude KHÔNG sinh file waveform**, nhưng phần lớn audio web-3D KHÔNG cần ElevenLabs —
> **SFX môi trường tự synth bằng Web Audio API** (đúng triết lý procedural của project). Chỉ GIỌNG NÓI mới cần TTS.

---

## Ranh giới khả năng

| Nhu cầu | Cách | Tự code? | Cần ngoài? |
|---|---|---|---|
| SFX môi trường (mưa/gió/nước/sấm) | Web Audio API procedural (oscillator + noise buffer + BiquadFilter) | ✅ 100% | ❌ |
| SFX thực chất lượng cao | file CC0 (freesound.org) → `THREE.Audio`/`PositionalAudio` | ✅ wire | file CC0 (không sinh) |
| Giọng nói / thuyết minh | TTS | ❌ | ✅ ElevenLabs **hoặc** Web Speech `SpeechSynthesis` (free, chất lượng thấp hơn) |

→ ElevenLabs CHỈ cần khi muốn voice. Tiếng động môi trường = tự làm.

## Phase A — WeatherAudio (procedural, khớp mạch thời tiết đang làm)

Module `effects/WeatherAudio` (hoặc `utils/audio/`) — Web Audio thuần, loose-couple với weather mode đã có
(`rain`/`snow`/`storm` ở ArchPlanLab `_weather`):
- **Mưa** = white-noise buffer → BiquadFilter lowpass; cường độ (gain + cutoff) theo `heavy`/mode.
- **Gió bão** = noise + LFO (OscillatorNode mod gain) → rít lên xuống; mạnh khi `storm`.
- **Sấm** = burst noise + lowpass sweep + decay dài (~3s) — **TRIGGER đồng bộ cú sét** (`_updateLightning`
  đã có timer flash → gọi audio.thunder() khi flash=1, delay ngẫu nhiên 0.5–4s = "thấy chớp rồi mới nghe ầm").
- **Tuyết** = gần như câm (gió nhẹ) — đúng thực tế.

**Gotcha bắt buộc:** AudioContext bị browser CHẶN tới khi có **user gesture** (click) → phải `resume()` trong
1 event click đầu (vd nút 🌅 hoặc 1 nút "🔊"). Không có gesture = im lặng câm, không lỗi.

## Phase B — PositionalAudio cho vật thể (sau)

`THREE.PositionalAudio` gắn vào hồ/thác → tiếng nước to dần khi camera lại gần (panner 3D). Cần `AudioListener`
trên camera. File nước = CC0 loop hoặc procedural bubble noise.

## Phase C — Voice/UI (nếu cần, mới đụng ElevenLabs)

Thuyết minh tour / narration → ElevenLabs (chất lượng) hoặc `SpeechSynthesis` (free). Chỉ làm nếu sản phẩm
cần dẫn chuyện. Không cần cho archviz tĩnh.

## Liên hệ
- Mạch [[weather]] (playbook) — sấm đồng bộ `_updateLightning`, gió/mưa theo `_weather.mode`.
- Industry: game web thường trộn SFX-asset (CC0, realism) + procedural (biến hoá vô hạn, 0 download).
