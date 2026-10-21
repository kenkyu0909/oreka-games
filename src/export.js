import { ATTRIBUTES, STATS } from "./game.js";

export async function exportCard({
  character,
  finish,
  name,
  image,
  fingerprint,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1420;
  const c = canvas.getContext("2d");
  const attr = ATTRIBUTES[character.attribute];
  const font = (size, weight = 400) => {
    c.font = `${weight} ${size}px "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif`;
  };
  const text = (value, x, y, size = 22, weight = 400, color = "#222633") => {
    c.fillStyle = color;
    font(size, weight);
    c.fillText(String(value), x, y);
  };
  c.fillStyle =
    finish.id === "prism"
      ? "#e2b95e"
      : finish.id === "silver"
        ? "#b7c4d0"
        : "#c39a48";
  c.fillRect(0, 0, 900, 1420);
  c.fillStyle = "#fff5da";
  c.fillRect(18, 18, 864, 1384);
  if (finish.id !== "normal") {
    const g = c.createLinearGradient(0, 0, 900, 1200);
    const colors =
      finish.id === "silver"
        ? ["#f8fbff", "#dce3eb", "#ffffff"]
        : ["#f2e8ff", "#dcefdc", "#fff0c6", "#fce0ec"];
    colors.forEach((color, i) =>
      g.addColorStop(i / (colors.length - 1), color),
    );
    c.fillStyle = g;
    c.fillRect(26, 26, 848, 1368);
  }
  c.strokeStyle = "#252831";
  c.lineWidth = 5;
  c.strokeRect(28, 28, 844, 1364);
  text(`Lv.${character.level}`, 52, 66, 23, 700);
  text("RE:FRAME", 690, 66, 20, 700);
  const x = 52,
    y = 88,
    w = 796,
    h = 616;
  // 画面のカードと同じく、写真はトリミングせず全体を収める。
  // 余白は同じ写真をぼかして敷き、切り取られた印象をなくす。
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  if (typeof c.filter === "string") c.filter = "blur(26px) brightness(0.82)";
  c.drawImage(
    image,
    x + (w - image.naturalWidth * cover) / 2,
    y + (h - image.naturalHeight * cover) / 2,
    image.naturalWidth * cover,
    image.naturalHeight * cover,
  );
  if (typeof c.filter === "string") c.filter = "none";
  const fit = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  c.drawImage(
    image,
    x + (w - image.naturalWidth * fit) / 2,
    y + (h - image.naturalHeight * fit) / 2,
    image.naturalWidth * fit,
    image.naturalHeight * fit,
  );
  c.restore();
  c.strokeStyle = "#292b35";
  c.lineWidth = 6;
  c.strokeRect(x, y, w, h);
  // Broad lower nameplate and an oversized shield, matching the battle cards.
  c.fillStyle = "#171c26";
  c.fillRect(49, 708, 802, 7);
  c.fillStyle = attr.color;
  c.fillRect(52, 722, 10, 77);
  let nameSize = 44;
  font(nameSize, 700);
  while (c.measureText(name).width > 758 && nameSize > 18) {
    nameSize--;
    font(nameSize, 700);
  }
  text(name, 78, 774, nameSize, 700, "#171c26");
  const shield = (x, y, w, h, color) => {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h * 0.7);
    c.lineTo(x + w / 2, y + h);
    c.lineTo(x, y + h * 0.7);
    c.closePath();
    c.fill();
  };
  shield(744, 98, 92, 112, "#f5d28a");
  shield(750, 104, 80, 99, attr.color);
  text(attr.label, 765, 169, 48, 700, "#fff7de");
  c.fillStyle = "#171c26";
  c.beginPath();
  c.moveTo(30, 30);
  c.lineTo(134, 30);
  c.lineTo(30, 134);
  c.closePath();
  c.fill();
  text("STATUS / 写真に眠る10の個性", 52, 865, 18, 700);
  STATS.forEach(([key, label, max], i) => {
    const sx = 52 + (i % 5) * 162,
      sy = 892 + Math.floor(i / 5) * 53;
    text(label, sx, sy, 14, 700, "#745a3d");
    text(character.stats[key], sx, sy + 26, 27, 700);
    c.fillStyle = "#bbaa7e";
    c.fillRect(sx, sy + 33, 144, 2);
  });
  text("MOVES / 4つの技", 52, 1002, 19, 700);
  character.moves.forEach((move, i) => {
    const sy = 1039 + i * 65;
    text(
      `${move.rarity === "rare" ? "★ " : ""}${move.name}`,
      52,
      sy,
      24,
      700,
      move.rarity === "rare" ? "#895a0b" : "#222633",
    );
    text(
      `${move.category} · 威力 ${move.power ?? "—"}${move.hits ? `×${move.hits}` : ""} · 命中 ${move.accuracy}% · PP ${move.pp}`,
      395,
      sy,
      17,
    );
    text(move.text, 52, sy + 25, 16, 400, "#70544c");
  });
  c.fillStyle = "#a78b53";
  c.fillRect(52, 1314, 796, 1);
  text(finish.short, 52, 1350, 18, 700);
  text(`${character.version.toUpperCase()} / 試作版`, 586, 1350, 17);
  text(
    "記念用カード画像 / 再生成には元の写真が必要です",
    52,
    1380,
    14,
    400,
    "#7a6957",
  );
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("画像を書き出せませんでした。")),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reframe-${fingerprint.slice(0, 8)}-${finish.id}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
