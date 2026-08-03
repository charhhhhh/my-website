"use client";

import { useState } from "react";
import { bands, playlistUrl } from "@/data/profile";

/**
 * 假的媒體播放器 —— 不會真的出聲（沒有人想被自動播放的 BGM 嚇到），
 * 但 EQ 會跳，選曲會亮，按鈕會動。
 */
export default function MediaPlayer() {
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(true);

  return (
    <div className="player">
      <div className="player__lcd">
        <span>
          {playing ? "▶" : "❚❚"} {bands[track]}
        </span>
        <span className={`eq ${playing ? "" : "eq--paused"}`} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>

      <ul className="player__list" style={{ listStyle: "none", padding: 0, margin: "9px 0 0" }}>
        {bands.map((b, i) => (
          <li key={b}>
            <button
              className={`player__track ${i === track ? "player__track--on" : ""}`}
              onClick={() => {
                setTrack(i);
                setPlaying(true);
              }}
              style={{ width: "100%", background: "none", border: 0, textAlign: "left", font: "inherit", cursor: "pointer" }}
            >
              <b>{String(i + 1).padStart(2, "0")}</b>
              {b}
            </button>
          </li>
        ))}
      </ul>

      <div className="btn-row">
        <button className="btn" onClick={() => setTrack((t) => (t + bands.length - 1) % bands.length)}>
          ⏮
        </button>
        <button className="btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? "❚❚ 暫停" : "▶ 播放"}
        </button>
        <button className="btn" onClick={() => setTrack((t) => (t + 1) % bands.length)}>
          ⏭
        </button>
        <a className="btn" href={playlistUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          ♫ 完整歌單
        </a>
      </div>
      <p className="tiny" style={{ color: "#7f8aa5", margin: "9px 0 0" }}>
        ※ 這台播放器不會出聲，2026 年了沒人想被自動播放的 BGM 嚇到。
      </p>
    </div>
  );
}
