// 32bit xorshift。同じシードから同じ列を返す。
// 戦闘・CPU編成・技抽選で共通利用する。
// このアルゴリズムを変えると、シード再現や既存カードの技抽選が変わる。
export function xorshiftStep(value) {
  let x = value | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

// 0 は固定点になってしまうため 1 に置き換える。
export function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = xorshiftStep(state);
    return state / 4294967296;
  };
}
