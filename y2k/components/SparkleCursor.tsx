"use client";

import { useEffect } from "react";

const GLYPHS = ["✦", "✧", "★", "✺", "･ﾟ"];
const COLORS = ["#fff6a8", "#ffd6ef", "#c9f4ff", "#e2d5ff"];

/** 滑鼠拖尾的小星星。觸控裝置與偏好減少動態時不啟用。 */
export default function SparkleCursor() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || calm) return;

    let last = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - last < 70) return; // 節流，不然一秒噴幾百顆
      last = now;

      const s = document.createElement("span");
      s.className = "spark";
      s.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
      s.style.color = COLORS[(Math.random() * COLORS.length) | 0];
      s.style.left = `${e.clientX + (Math.random() * 14 - 7)}px`;
      s.style.top = `${e.clientY + (Math.random() * 14 - 7)}px`;
      document.body.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return null;
}
