"use client";

import { useState } from "react";

const TOTAL = 31;

/** 看圖程式：翻 image/verify1 那 31 張圖。 */
export default function Gallery() {
  const [i, setI] = useState(0);
  const step = (d: number) => setI((v) => (v + d + TOTAL) % TOTAL);

  return (
    <div className="gallery">
      <div className="cutout gallery__stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/oc/full/${i}.webp`} alt={`插圖 ${i + 1}／${TOTAL}`} />
      </div>

      <div>
        <p className="muted">
          這隻藍白狼是我，至少在網路上是。共 {TOTAL} 張，慢慢翻。
        </p>
        <div className="paper mono tiny" style={{ marginBottom: 12 }}>
          檔名：verify1/{i}.webp
          <br />
          位置：{i + 1} / {TOTAL}
          <br />
          狀態：{i === 0 ? "第一張" : i === TOTAL - 1 ? "最後一張" : "瀏覽中"}
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => step(-1)}>
            ◀ 上一張
          </button>
          <button className="btn" onClick={() => step(1)}>
            下一張 ▶
          </button>
          <button className="btn" onClick={() => setI((Math.random() * TOTAL) | 0)}>
            🎲 隨機
          </button>
        </div>
      </div>
    </div>
  );
}
