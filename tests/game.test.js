import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "fast-png";
import jpeg from "jpeg-js";
import {
  analyzePixels,
  generateCharacter,
  STATS,
  drawFinish,
  FINISHES,
  assignMoves,
  selectAttribute,
} from "../src/game.js";
import { decodeImage, sampleImage } from "../src/decode.js";
import { MAX_BYTES } from "../src/limits.js";

function solid(r, g, b, alpha = 255, width = 8, height = 8) {
  return {
    width,
    height,
    channels: 4,
    depth: 8,
    data: new Uint8Array(
      Array.from({ length: width * height }, () => [r, g, b, alpha]).flat(),
    ),
  };
}
function character(bytes, version) {
  const image = decodeImage(bytes);
  return generateCharacter(
    analyzePixels(sampleImage(image), image.width, image.height),
    version,
  );
}

test("same PNG produces identical abilities, level, attribute and moves", () => {
  const file = encode(solid(200, 70, 20));
  const first = character(file);
  for (let i = 0; i < 4; i++) assert.deepEqual(character(file), first);
  assert.equal(first.attribute, "fire");
  assert.equal(first.moves.length, 4);
  assert.equal(new Set(first.moves.map((move) => move.id)).size, 4);
  assert.equal(first.stats.accuracy, undefined);
  assert.equal(first.stats.evasion, undefined);
});

test("same JPEG is deterministic and decodes without browser APIs", () => {
  const file = jpeg.encode(solid(20, 80, 230), 90).data;
  assert.deepEqual(character(file), character(file));
  assert.equal(character(file).attribute, "water");
});

test("photo edits can change characteristics", () => {
  const red = character(encode(solid(255, 0, 0)));
  const green = character(encode(solid(0, 255, 0)));
  assert.notDeepEqual(red.stats, green.stats);
  assert.equal(red.attribute, "fire");
  assert.equal(green.attribute, "wind");
});

test("transparent pixels are composited on white", () => {
  const sample = sampleImage(decodeImage(encode(solid(123, 12, 21, 0))));
  assert.ok(sample.every((value) => value === 255));
});

test("PNG grayscale, RGB and 16-bit inputs use the same normalization", () => {
  const gray = decodeImage(
    encode({
      width: 1,
      height: 1,
      channels: 1,
      depth: 8,
      data: new Uint8Array([128]),
    }),
  );
  assert.deepEqual(Array.from(sampleImage(gray, 1, 1)), [128, 128, 128]);
  const rgb = decodeImage(
    encode({
      width: 1,
      height: 1,
      channels: 3,
      depth: 8,
      data: new Uint8Array([20, 30, 40]),
    }),
  );
  assert.deepEqual(Array.from(sampleImage(rgb, 1, 1)), [20, 30, 40]);
  const sixteen = decodeImage(
    encode({
      width: 1,
      height: 1,
      channels: 3,
      depth: 16,
      data: new Uint16Array([65535, 0, 32896]),
    }),
  );
  assert.deepEqual(Array.from(sampleImage(sixteen, 1, 1)), [255, 0, 128]);
});

test("packed grayscale and indexed pixels respect row padding", () => {
  const gray = {
    width: 3,
    height: 2,
    channels: 1,
    depth: 1,
    data: new Uint8Array([0b10100000, 0b01000000]),
  };
  assert.deepEqual(
    Array.from(sampleImage(gray, 3, 2)),
    [255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0],
  );
  const indexed = {
    ...gray,
    palette: [
      [255, 0, 0, 0],
      [0, 128, 0, 255],
    ],
  };
  assert.deepEqual(
    Array.from(sampleImage(indexed, 3, 2).slice(0, 6)),
    [0, 128, 0, 255, 255, 255],
  );
});

test("PNG transparency color keys are composited on white", () => {
  const image = {
    width: 1,
    height: 1,
    channels: 3,
    depth: 8,
    data: new Uint8Array([30, 40, 50]),
    transparency: new Uint16Array([30, 40, 50]),
  };
  assert.deepEqual(Array.from(sampleImage(image, 1, 1)), [255, 255, 255]);
});

test("all six attributes are reachable from image features", () => {
  const colors = [
    [0, 0, 0, "dark"],
    [255, 255, 255, "light"],
    [20, 50, 255, "water"],
    [255, 40, 0, "fire"],
    [0, 255, 0, "wind"],
    [150, 145, 130, "earth"],
  ];
  for (const [r, g, b, expected] of colors) {
    assert.equal(character(encode(solid(r, g, b))).attribute, expected);
  }
});

test("invalid input and oversized image headers fail before allocation", () => {
  assert.throws(() => decodeImage(new Uint8Array()), /JPEG/);
  assert.throws(() => decodeImage(new Uint8Array(MAX_BYTES + 1)), /12MB/);
  assert.throws(() => decodeImage(new Uint8Array([0xff, 0xd8, 0xff])), Error);
  const png = encode(solid(0, 0, 0));
  const modified = new Uint8Array(png);
  const view = new DataView(modified.buffer);
  view.setUint32(16, 24000001);
  assert.throws(() => decodeImage(modified), /2,400万画素/);
  const broken = new Uint8Array(png);
  broken[45] ^= 0xff;
  assert.throws(() => decodeImage(broken));
});

test("100 varied feature sets keep levels and all stats in bounds", () => {
  for (let n = 0; n < 100; n++) {
    const features = Object.fromEntries(
      [
        "brightness",
        "saturation",
        "contrast",
        "detail",
        "symmetry",
        "diversity",
        "red",
        "green",
        "blue",
        "resolution",
        "portrait",
      ].map((key, index) => [key, (n * (97 + index * 21)) % 1001]),
    );
    const before = { ...features };
    const c = generateCharacter(features);
    assert.deepEqual(features, before);
    assert.equal(Object.keys(c.stats).length, 10);
    assert.ok(c.level >= 1 && c.level <= 12);
    for (const [key, , max] of STATS) {
      assert.ok(Number.isInteger(c.stats[key]));
      assert.ok(c.stats[key] >= 1 && c.stats[key] <= max);
    }
    for (const move of c.moves) {
      assert.ok(move.pp > 0);
      assert.ok(move.accuracy > 0 && move.accuracy <= 100);
    }
    assert.equal(c.attribute, selectAttribute(features));
  }
});

test("level conditions and recovery/support are assigned by a fixed rule", () => {
  const stats = {
    attack: 100,
    specialAttack: 50,
    recovery: 80,
    resistance: 30,
  };
  assert.equal(assignMoves("earth", stats, 1)[2].condition, "lower-level");
  assert.equal(assignMoves("earth", stats, 6)[2].condition, "same-level");
  assert.equal(assignMoves("earth", stats, 12)[2].condition, "higher-level");
  assert.equal(assignMoves("earth", stats, 1)[3].id, "restore");
  assert.equal(
    assignMoves("earth", { ...stats, resistance: 90 }, 1)[3].id,
    "ward",
  );
});

test("finish lottery is bounded, weighted, and separate from character generation", () => {
  assert.equal(
    FINISHES.reduce((sum, finish) => sum + finish.weight, 0),
    100,
  );
  assert.equal(drawFinish(0).id, "normal");
  assert.equal(drawFinish(0.5499999).id, "normal");
  assert.equal(drawFinish(0.55).id, "silver");
  assert.equal(drawFinish(0.8).id, "holo");
  assert.equal(drawFinish(0.9999999).id, "prism");
  for (const n of [-1, 1, NaN, Infinity])
    assert.throws(() => drawFinish(n), RangeError);
  const file = encode(solid(130, 90, 20));
  const before = character(file);
  for (const n of [0, 0.6, 0.9, 0.99]) {
    drawFinish(n);
    assert.deepEqual(character(file), before);
  }
  assert.equal("finish" in before, false);
});

test("photo-v1 regression fixture stays stable (change version when changing rules)", () => {
  const c = character(encode(solid(190, 60, 25, 255, 80, 60)), "photo-v1");
  assert.equal(c.version, "photo-v1");
  assert.equal(c.attribute, "fire");
  assert.equal(c.level, 5);
  assert.deepEqual(c.stats, {
    hp: 148,
    attack: 137,
    defense: 215,
    specialAttack: 97,
    specialDefense: 191,
    speed: 35,
    critical: 1,
    resistance: 66,
    recovery: 38,
    piercing: 1,
  });
  assert.deepEqual(
    c.moves.map((m) => m.id),
    ["fire-strike", "fire-wave", "resonance", "ward"],
  );
});
