"use client";

import { windows } from "@/data/windows";

/** 桌面圖示列：雙擊（或單擊）跳到對應的視窗。 */
export default function DesktopIcons() {
  return (
    <div className="icons">
      {windows.map((w) => (
        <button
          key={w.id}
          className="icons__item"
          onDoubleClick={() =>
            document.getElementById(w.id)?.scrollIntoView({ behavior: "smooth" })
          }
          onClick={() =>
            document.getElementById(w.id)?.scrollIntoView({ behavior: "smooth" })
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/oc/icon/${w.icon}.png`} alt="" />
          {w.desktop}
        </button>
      ))}
    </div>
  );
}
