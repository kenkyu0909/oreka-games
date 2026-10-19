// 演出のオン／オフはUIから外し、常にオンにした（カードが組み上がる様子や
// 対戦の演出が見どころのため）。テストや検証で静かに進めたいときだけ、この
// 保存設定で演出を止める。対象は page / context のどちらでもよい。
// 再読み込みのたびに走るので、他の設定（効果音など）は消さずに残す。
export const motionOff = (target) =>
  target.addInitScript(() => {
    try {
      const key = "reframe-ui-preferences";
      let stored = {};
      try {
        stored = JSON.parse(localStorage.getItem(key)) || {};
      } catch {
        /* 壊れていたら作り直す */
      }
      localStorage.setItem(key, JSON.stringify({ ...stored, motionOff: true }));
    } catch {
      /* private mode */
    }
  });
