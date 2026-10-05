export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}
export function standardNormal(random: () => number): number {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
