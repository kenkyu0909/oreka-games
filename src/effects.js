// Original, synthesized sound effects. No audio files, tracking or autoplay.
const KEY = "reframe-ui-preferences";
let stored = {};
try {
  stored = JSON.parse(localStorage.getItem(KEY)) || {};
} catch {
  /* optional */
}
// 演出は常にオン。端末の「動きを減らす」設定でも、画面の切り替えでも止めない
// （カードが組み上がる様子や対戦の演出はこのゲームの見どころで、止めると何が
// 起きたか分からなくなる）。検証やテストで静かに進めたい時だけ、保存設定に
// motionOff:true を書けば止まる。旧版の motion:false は無視する。
const motionOn = stored.motionOff !== true;
let soundEnabled = stored.sound === true;
let context;
let lastSound = 0;
function save() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        sound: soundEnabled,
        ...(motionOn ? {} : { motionOff: true }),
      }),
    );
  } catch {
    /* private mode */
  }
}
function update() {
  document.body.dataset.motion = motionOn ? "on" : "off";
  const sound = document.getElementById("sound-toggle");
  sound.setAttribute("aria-pressed", String(soundEnabled));
  sound.setAttribute(
    "aria-label",
    soundEnabled ? "効果音をオフにする" : "効果音をオンにする",
  );
  sound.querySelector("small").textContent = soundEnabled ? "ON" : "OFF";
}
function audio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context ||= new AudioContext();
    if (context.state === "suspended") context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}
function tone(
  ctx,
  frequency,
  end,
  duration,
  volume = 0.035,
  type = "sine",
  delay = 0,
) {
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator(),
    gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, end),
    start + duration,
  );
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
function noise(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.13),
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++)
    data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.value = 950;
  gain.gain.value = 0.07;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}
export const effects = {
  get motion() {
    return motionOn;
  },
  get sound() {
    return soundEnabled;
  },
  play(kind) {
    if (!soundEnabled || document.hidden || performance.now() - lastSound < 65)
      return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive)
      return;
    const ctx = audio();
    if (!ctx) return;
    lastSound = performance.now();
    if (kind === "rare-reveal") {
      [330, 495, 660, 990].forEach((f, i) =>
        tone(ctx, f, f * 1.025, 0.65, 0.024, "triangle", i * 0.13),
      );
    } else if (kind === "finish") {
      noise(ctx);
      tone(ctx, 180, 35, 0.8, 0.055, "triangle");
      tone(ctx, 880, 440, 0.65, 0.02, "sine", 0.12);
    } else if (kind === "charge") {
      tone(ctx, 120, 460, 0.55, 0.035, "triangle");
      tone(ctx, 240, 920, 0.55, 0.016, "sine");
    } else if (kind === "critical") {
      tone(ctx, 1100, 500, 0.35, 0.04, "triangle");
    } else if (kind === "knockout") {
      noise(ctx);
      tone(ctx, 150, 30, 0.6, 0.055, "sawtooth");
    } else if (kind === "miss") {
      tone(ctx, 500, 100, 0.22, 0.02, "sine");
    } else if (kind === "damage") {
      tone(ctx, 110, 38, 0.19, 0.075, "triangle");
      noise(ctx);
    } else if (["status", "debuff"].includes(kind)) {
      tone(ctx, 420, 85, 0.4, 0.025, "triangle");
    } else if (kind === "move") {
      tone(ctx, 170, 680, 0.2, 0.03, "sawtooth");
      tone(ctx, 520, 130, 0.25, 0.015, "triangle", 0.07);
    } else if (["heal", "cleanse", "buff", "guard"].includes(kind)) {
      tone(ctx, 480, 680, 0.24, 0.03);
      tone(ctx, 720, 950, 0.25, 0.025, "sine", 0.12);
    } else if (kind === "switch" || kind === "reveal") {
      tone(ctx, 190, 600, 0.23, 0.035, "triangle");
      tone(ctx, 780, 790, 0.13, 0.02, "sine", 0.18);
    } else if (kind === "win") {
      [480, 640, 960].forEach((f, i) =>
        tone(ctx, f, f, 0.4, 0.028, "triangle", i * 0.11),
      );
    } else if (kind === "lose") {
      tone(ctx, 280, 120, 0.5, 0.035, "triangle");
    } else tone(ctx, 720, 400, 0.075, 0.018, "sine");
  },
};
document.getElementById("sound-toggle").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  save();
  update();
  if (!soundEnabled && context) context.suspend().catch(() => {});
  else effects.play("ui");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && context) context.suspend().catch(() => {});
});
update();
