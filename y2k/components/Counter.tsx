"use client";

import { useEffect, useState } from "react";
import { profile } from "@/data/profile";

const KEY = "y2k:visits";

/**
 * 純前端的訪客計數器 —— 沒有後端，數字＝開站天數推算的基底＋你自己來訪的次數。
 * 跟 1999 年那些計數器一樣不可信，但氣氛到位。
 */
export default function Counter() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    const days = Math.max(
      0,
      Math.floor((Date.now() - new Date(profile.since).getTime()) / 86_400_000),
    );
    const mine = Number(localStorage.getItem(KEY) ?? 0) + 1;
    localStorage.setItem(KEY, String(mine));
    setN(1337 + days * 7 + mine);
  }, []);

  const digits = String(n ?? 0).padStart(6, "0").split("");

  return (
    <span className="counter">
      <span className="counter__digits" aria-hidden={n === null}>
        {digits.map((d, i) => (
          <b key={i}>{n === null ? "0" : d}</b>
        ))}
      </span>
      <span className="muted tiny">
        本站已被瀏覽 {n === null ? "……" : n.toLocaleString("zh-TW")} 次
      </span>
    </span>
  );
}
