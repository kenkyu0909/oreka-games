// Local, original demo illustrations. No external image request is made.
export async function createSample(index = 0) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 900;
  const c = canvas.getContext("2d");
  const palette = [
    {
      sky: ["#a3c9bf", "#e9e6bf"],
      sea: "#669b8b",
      mountain: "#6b8663",
      foreground: "#3b6450",
      name: "凪の灯台",
      sun: "#f8edc0",
    },
    {
      sky: ["#e2aa85", "#f4d9ac"],
      sea: "#b67c62",
      mountain: "#915d4e",
      foreground: "#744b3e",
      name: "夕映えの岬",
      sun: "#ffe5a8",
    },
    {
      sky: ["#202b48", "#4f667b"],
      sea: "#354f64",
      mountain: "#263e52",
      foreground: "#162c3e",
      name: "月を待つ岬",
      sun: "#d8e2da",
    },
  ][index % 3];
  const sky = c.createLinearGradient(0, 0, 0, 650);
  sky.addColorStop(0, palette.sky[0]);
  sky.addColorStop(1, palette.sky[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, 900, 900);
  c.fillStyle = palette.sun;
  c.beginPath();
  c.arc(640, 215, 74, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ffffff22";
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.ellipse(180 + i * 80, 150 + i * 9, 100, 12, -0.08, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = palette.sea;
  c.fillRect(0, 430, 900, 470);
  c.strokeStyle = "#eff2cd40";
  c.lineWidth = 2;
  for (let i = 0; i < 35; i++) {
    const x = (i * 139) % 860,
      y = 448 + ((i * 79) % 450);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 30 + (i % 6) * 13, y);
    c.stroke();
  }
  c.fillStyle = palette.mountain;
  c.beginPath();
  c.moveTo(0, 520);
  c.bezierCurveTo(180, 410, 290, 355, 430, 490);
  c.bezierCurveTo(520, 525, 580, 540, 690, 585);
  c.lineTo(0, 800);
  c.fill();
  c.fillStyle = "#bdc4a0";
  c.beginPath();
  c.moveTo(0, 742);
  c.bezierCurveTo(200, 550, 405, 530, 626, 602);
  c.bezierCurveTo(490, 580, 145, 690, 60, 900);
  c.lineTo(0, 900);
  c.fill();
  c.fillStyle = palette.foreground;
  c.beginPath();
  c.moveTo(0, 650);
  c.bezierCurveTo(200, 536, 366, 569, 515, 623);
  c.bezierCurveTo(690, 710, 800, 679, 900, 756);
  c.lineTo(900, 900);
  c.lineTo(0, 900);
  c.fill();
  // Lighthouse and its shadow.
  c.fillStyle = "#233b3233";
  c.beginPath();
  c.moveTo(392, 610);
  c.lineTo(460, 606);
  c.lineTo(612, 697);
  c.lineTo(556, 710);
  c.fill();
  c.fillStyle = "#f3efcf";
  c.beginPath();
  c.moveTo(397, 382);
  c.lineTo(444, 382);
  c.lineTo(458, 610);
  c.lineTo(383, 610);
  c.closePath();
  c.fill();
  c.fillStyle = "#d0d4bb";
  c.beginPath();
  c.moveTo(426, 382);
  c.lineTo(444, 382);
  c.lineTo(458, 610);
  c.lineTo(430, 610);
  c.fill();
  c.fillStyle = "#d9b78c";
  c.fillRect(392, 369, 57, 17);
  c.fillStyle = "#254e48";
  c.fillRect(397, 336, 47, 33);
  c.fillStyle = "#d7e9cb";
  c.fillRect(404, 342, 13, 20);
  c.fillRect(424, 342, 13, 20);
  c.fillStyle = "#385647";
  c.beginPath();
  c.moveTo(388, 336);
  c.lineTo(420, 315);
  c.lineTo(453, 336);
  c.fill();
  c.fillStyle = "#51645b";
  c.fillRect(409, 555, 18, 55);
  c.fillRect(411, 422, 11, 23);
  c.fillRect(411, 484, 11, 23);
  c.strokeStyle = "#c0cf9b45";
  c.lineWidth = 2;
  for (let i = 0; i < 110; i++) {
    const x = (i * 71) % 900,
      y = 725 + ((i * 33) % 175);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 5, y - 12);
    c.stroke();
  }
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  return {
    file: new File([blob], `sample-${index % 3}.png`, { type: "image/png" }),
    name: palette.name,
  };
}
