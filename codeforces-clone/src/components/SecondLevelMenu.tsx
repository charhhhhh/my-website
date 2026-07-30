"use client";

import { useEffect, useRef, useState } from "react";
import { CONTEST_ID, ROOM_ID } from "@/lib/contest";

export type TabKey =
  | "problems"
  | "submit"
  | "my"
  | "status"
  | "hacks"
  | "room"
  | "standings"
  | "customtest";

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "problems", label: "Problems", href: `/contest/${CONTEST_ID}` },
  { key: "submit", label: "Submit Code", href: `/contest/${CONTEST_ID}/submit` },
  { key: "my", label: "My Submissions", href: `/contest/${CONTEST_ID}/my` },
  { key: "status", label: "Status", href: `/contest/${CONTEST_ID}/status` },
  { key: "hacks", label: "Hacks", href: `/contest/${CONTEST_ID}/hacks` },
  { key: "room", label: "Room", href: `/contest/${CONTEST_ID}/room/${ROOM_ID}` },
  { key: "standings", label: "Standings", href: `/contest/${CONTEST_ID}/standings` },
  { key: "customtest", label: "Custom Invocation", href: `/contest/${CONTEST_ID}/customtest` },
];

/**
 * Codeforces' contest tab bar. The highlight behind the active tab is a separate
 * absolutely-positioned <li class="backLava"> that their JS sizes and moves to match the
 * selected item; we measure the active tab and place it the same way.
 */
export function SecondLevelMenu({ active }: { active: TabKey }) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const [lava, setLava] = useState({ left: 0, top: 0, width: 63, height: 20 });

  useEffect(() => {
    const place = () => {
      const li = activeRef.current;
      const ul = listRef.current;
      if (!li || !ul) return;
      setLava({
        left: li.offsetLeft,
        top: li.offsetTop,
        width: li.offsetWidth,
        height: li.offsetHeight,
      });
    };
    place();
    window.addEventListener("resize", place);
    // Webfonts (PT Sans Narrow) land after first paint and change tab widths.
    document.fonts?.ready.then(place).catch(() => {});
    return () => window.removeEventListener("resize", place);
  }, [active]);

  return (
    <div className="second-level-menu">
      <ul className="second-level-menu-list" ref={listRef}>
        <li
          className="backLava"
          style={{
            position: "absolute",
            display: "block",
            margin: 0,
            padding: 0,
            left: lava.left,
            top: lava.top,
            width: lava.width,
            height: lava.height,
          }}
        >
          <div className="leftLava" />
          <div className="bottomLava" />
          <div className="cornerLava" />
        </li>
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <li
              key={tab.key}
              ref={isActive ? activeRef : undefined}
              className={isActive ? "current selectedLava" : undefined}
            >
              <a href={tab.href}>{tab.label}</a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
