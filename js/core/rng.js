// core/rng.js — deterministic PRNG (mulberry32). Every generation/sim call in
// this project must draw from a stream created here, never Math.random(),
// so that a save's seed fully reproduces its world (ground rule #3 in
// fable-plans/plan1.md).

/**
 * mulberry32: tiny, fast, well-distributed 32-bit PRNG.
 * @param {number} seed - unsigned 32-bit integer seed
 * @returns {() => number} function returning a float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A named RNG stream that can be serialized (seed + call count) and restored,
 * so a save file reproduces exactly the same sequence of draws. Multiple
 * independent streams (e.g. "world-gen", "match-sim") avoid one system's
 * extra/missing draws desyncing another's.
 */
export class RngStream {
  constructor(seed, calls = 0) {
    this.seed = seed >>> 0;
    this.calls = calls;
    this._next = mulberry32(this.seed);
    for (let i = 0; i < calls; i++) this._next();
  }

  /** Float in [0, 1) */
  next() {
    this.calls++;
    return this._next();
  }

  /** Integer in [min, max] inclusive */
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Float in [min, max) */
  float(min, max) {
    return this.next() * (max - min) + min;
  }

  /** true with probability p (0..1) */
  chance(p) {
    return this.next() < p;
  }

  /** Random element of a non-empty array */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Fisher-Yates shuffle, returns a new array */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Approximate normal(mean, sd) via sum of 3 uniforms (fast, bounded, no NaN tails) */
  gaussian(mean, sd) {
    const u = this.next() + this.next() + this.next() - 1.5;
    return mean + u * sd * (2 / Math.sqrt(3));
  }

  /** Serializable snapshot: {seed, calls} — enough to reconstruct this exact stream */
  toJSON() {
    return { seed: this.seed, calls: this.calls };
  }

  static fromJSON(json) {
    return new RngStream(json.seed, json.calls);
  }
}

/** Derive a child seed from a parent seed + string key (e.g. "world-gen"). */
export function deriveSeed(parentSeed, key) {
  let h = parentSeed >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h ^ key.charCodeAt(i), 0x01000193)) >>> 0;
  }
  return h >>> 0;
}
