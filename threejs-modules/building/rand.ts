// Seeded pseudo-random — deterministic, shared across building sub-system
// Công thức giống CityLayout.ts: intentional duplicate (chỉ 2 nơi dùng, chưa đủ 3 để extract lên cao hơn)
export function rand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
