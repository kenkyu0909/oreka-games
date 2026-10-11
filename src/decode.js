import jpeg from "jpeg-js";
import { decode as decodePng, hasPngSignature } from "fast-png";

import { MAX_BYTES, MAX_PIXELS } from "./limits.js";

function validateSize(width, height) {
  if (
    !width ||
    !height ||
    width * height > MAX_PIXELS ||
    width > 20000 ||
    height > 20000
  ) {
    throw new Error("画像は2,400万画素以下・各辺20,000px以下にしてください。");
  }
}

// Fixed JS decoders avoid browser-specific color management / resampling.
// v1 ignores ICC, gamma, EXIF rotation and animation; samples the stored raster.
export function decodeImage(bytes) {
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("画像は12MB以下にしてください。");
  let image;
  if (bytes.length >= 33 && hasPngSignature(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    validateSize(view.getUint32(16), view.getUint32(20));
    image = decodePng(bytes, { checkCrc: true });
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    image = {
      ...jpeg.decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: 24,
        maxMemoryUsageInMB: 256,
        tolerantDecoding: false,
      }),
      channels: 4,
      depth: 8,
    };
  } else {
    throw new Error(
      "JPEG・PNG形式を選んでください。HEIC・WebP・GIFはこの試作では未対応です。",
    );
  }
  validateSize(image.width, image.height);
  return image;
}

function packedValue(image, x, y) {
  const rowBytes = Math.ceil((image.width * image.depth) / 8);
  const bit = x * image.depth;
  return (
    (image.data[y * rowBytes + (bit >> 3)] >> (8 - image.depth - (bit % 8))) &
    ((1 << image.depth) - 1)
  );
}
function pixel(image, x, y) {
  const { data, channels, depth, width, palette, transparency } = image;
  if (palette) {
    const index = depth < 8 ? packedValue(image, x, y) : data[y * width + x];
    const color = palette[index];
    if (!color) throw new Error("PNGの色データを読み取れませんでした。");
    return [color[0], color[1], color[2], color[3] ?? 255];
  }
  const offset = (y * width + x) * channels;
  const values =
    depth < 8
      ? [packedValue(image, x, y)]
      : Array.from(data.subarray(offset, offset + channels));
  const max = 2 ** depth - 1;
  const channel = (i) => Math.round((values[i] * 255) / max);
  const transparent =
    transparency?.length &&
    transparency.every((value, i) => value === values[i]);
  if (channels <= 2) {
    const gray = channel(0);
    return [
      gray,
      gray,
      gray,
      transparent ? 0 : channels === 2 ? channel(1) : 255,
    ];
  }
  return [
    channel(0),
    channel(1),
    channel(2),
    transparent ? 0 : channels === 4 ? channel(3) : 255,
  ];
}

export function sampleImage(image, width = 64, height = 64, rgba = false) {
  const channels = rgba ? 4 : 3;
  const output = new Uint8ClampedArray(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(
        image.width - 1,
        Math.floor(((2 * x + 1) * image.width) / (2 * width)),
      );
      const sourceY = Math.min(
        image.height - 1,
        Math.floor(((2 * y + 1) * image.height) / (2 * height)),
      );
      const [r, g, b, a] = pixel(image, sourceX, sourceY);
      const index = (y * width + x) * channels;
      output[index] = Math.round((r * a + 255 * (255 - a)) / 255);
      output[index + 1] = Math.round((g * a + 255 * (255 - a)) / 255);
      output[index + 2] = Math.round((b * a + 255 * (255 - a)) / 255);
      if (rgba) output[index + 3] = 255;
    }
  }
  return output;
}
