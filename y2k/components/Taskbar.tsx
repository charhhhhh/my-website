"use client";

import { useEffect, useRef, useState } from "react";

export type TaskItem = { id: string; label: string; icon: number };

/**
 * 下方工作列：開始鈕、已開啟視窗、即時時鐘。
 * tasks = 工作列上那排（只放常用的），menu = 開始選單（全部）。
 */
export default function Taskbar({ tasks, menu }: { tasks: TaskItem[]; menu: TaskItem[] }) {
  const [open, setOpen] = useState(false);
  const [bsod, setBsod] = useState(false);
  const [clock, setClock] = useState<string>("");
  const menuRef = useRef<HTMLDivElement>(null);

  // 時鐘：先留白，掛載後才寫入，避免 hydration 對不上
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const t = setInterval(tick, 1000 * 15);
    return () => clearInterval(t);
  }, []);

  // 點外面 / 按 Esc 收起選單
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {bsod && (
        <div
          className="bsod"
          role="alertdialog"
          aria-label="系統錯誤"
          onClick={() => setBsod(false)}
        >
          <p style={{ textAlign: "center" }}>
            <b>Windows</b>
          </p>
          <p>
            電腦已關閉，以免受到損害。此問題是由下列項目所導致：
          </p>
          <p>*** STOP: 0x000000FF (0xDEADBEEF, 0x00000000, 0xCAFEBABE)</p>
          <p>*** HUYAN.SYS — 使用者試圖早起，作業已中止。</p>
          <p>&nbsp;</p>
          <p>如果這是您第一次看到此畫面，請重新開機。</p>
          <p>如果不是，請不要再按關機了。</p>
          <p>&nbsp;</p>
          <p className="blink">按任意處繼續 _</p>
        </div>
      )}

      {open && (
        <div className="startmenu" ref={menuRef} role="menu">
          <div className="startmenu__head">胡言 · Millennium Edition</div>
          <div className="startmenu__list">
            {menu.map((t) => (
              <button
                key={t.id}
                className="startmenu__item"
                role="menuitem"
                onClick={() => go(t.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/oc/icon/${t.icon}.png`} alt="" />
                {t.label}
              </button>
            ))}
            <div className="startmenu__sep" />
            <button
              className="startmenu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setBsod(true);
              }}
            >
              <span style={{ width: 22, textAlign: "center" }}>⏻</span>
              關機 Shut Down…
            </button>
          </div>
        </div>
      )}

      <nav className="taskbar" aria-label="工作列">
        <button
          className="start"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="start__flag" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          開始
        </button>

        <div className="taskbar__tasks">
          {tasks.map((t) => (
            <button
              key={t.id}
              className="taskbar__task"
              onClick={() => go(t.id)}
              title={t.label}
              aria-label={t.label}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/oc/icon/${t.icon}.png`} alt="" />
              {/* 手機上只留圖示，文字用 CSS 收起來 */}
              <span className="taskbar__label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="tray">
          <span aria-hidden="true">🔊</span>
          <span className="tray__clock">{clock || "--:--"}</span>
        </div>
      </nav>
    </>
  );
}
