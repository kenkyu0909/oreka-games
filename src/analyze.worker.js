import { decodeImage, sampleImage } from "./decode.js";
import { analyzePixels, generateCharacter } from "./game.js";

self.onmessage = async ({ data: buffer }) => {
  try {
    if (!self.crypto?.subtle)
      throw new Error(
        "写真の解析にはHTTPS接続が必要です。ArenaのHTTPSプレビューをSafari／Chromeで開いてください。",
      );
    const bytes = new Uint8Array(buffer);
    const image = decodeImage(bytes);
    const features = analyzePixels(
      sampleImage(image),
      image.width,
      image.height,
    );
    const fingerprint = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    const ratio = Math.min(1, 720 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * ratio));
    const height = Math.max(1, Math.round(image.height * ratio));
    const preview = sampleImage(image, width, height, true);
    self.postMessage(
      {
        character: generateCharacter(features),
        fingerprint,
        width,
        height,
        sourceWidth: image.width,
        sourceHeight: image.height,
        preview: preview.buffer,
      },
      [preview.buffer],
    );
  } catch (error) {
    self.postMessage({
      error:
        error.message ||
        "画像を読み取れませんでした。別のJPEG・PNGをお試しください。",
    });
  }
};
