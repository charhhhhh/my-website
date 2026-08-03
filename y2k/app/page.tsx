import Win from "@/components/Win";
import Taskbar from "@/components/Taskbar";
import DesktopIcons from "@/components/DesktopIcons";
import Gallery from "@/components/Gallery";
import MediaPlayer from "@/components/MediaPlayer";
import Meter from "@/components/Meter";
import Counter from "@/components/Counter";
import { pinned, windows } from "@/data/windows";
import {
  about,
  boardMix,
  cp,
  friendPolicy,
  games,
  links,
  profile,
  skills,
  timeline,
} from "@/data/profile";

const TICKER =
  "★ 歡迎光臨 ★　本站最佳瀏覽解析度 1024×768　★　私訊慢回不是已讀不回　★　廢文與笑話各半　★　本頁面永遠施工中　★　";

export default function Home() {
  return (
    <>
      <main className="desktop">
        <div className="marquee" aria-hidden="true">
          <div className="marquee__track">
            <span>{TICKER}</span>
            <span>{TICKER}</span>
          </div>
        </div>

        <DesktopIcons />

        <div className="grid">
          {/* ---------- about.exe ---------- */}
          <Win
            id="about"
            title="about.exe — 關於我"
            icon={0}
            className="span-2"
            status={`${profile.name}｜${profile.location}`}
            statusRight="就緒"
          >
            <div className="hero">
              <span className="cutout cutout--avatar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/oc/full/0.webp" alt={`${profile.name}的角色圖`} />
              </span>

              <div>
                <h1 className="chrome-text">{profile.name}</h1>
                <p className="lead" style={{ marginTop: 6 }}>
                  {profile.slogan}
                </p>
                <div className="hero__meta">
                  <span className="chip">📍 {profile.location}</span>
                  <span className="chip chip--candy">🏆 專長：{profile.skill}</span>
                  <span className="chip chip--aqua">💤 私訊慢回</span>
                </div>

                {/* 「系統內容」小卡，拿來填標題右邊的空白 */}
                <div className="spec">
                  <div className="spec__row">
                    <b>作業系統</b>
                    <span>胡言 Millennium Edition</span>
                  </div>
                  <div className="spec__row">
                    <b>處理器</b>
                    <span>台中 ⇄ 板橋 雙核心（通勤加速）</span>
                  </div>
                  <div className="spec__row">
                    <b>記憶體</b>
                    <span>廢文 50% ／ 笑話 50%</span>
                  </div>
                  <div className="spec__row">
                    <b>顯示卡</b>
                    <span>一隻藍白狼</span>
                  </div>
                  <div className="spec__row">
                    <b>已知問題</b>
                    <span>早起功能尚未實作</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="paper" style={{ marginTop: 16 }}>
              {about.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </Win>

          {/* ---------- viewer.exe ---------- */}
          <Win
            id="gallery"
            title="viewer.exe — 我的圖片"
            icon={13}
            className="span-2"
            status="C:\\我的文件\\我的圖片\\"
            statusRight="31 個項目"
          >
            <Gallery />
          </Win>

          {/* ---------- cp.exe ---------- */}
          <Win
            id="cp"
            title="cp.exe — 競技程式"
            icon={4}
            status="Codeforces"
            statusRight={cp.cfRank}
          >
            <div className="paper">
              <div className="tl">
                <div className="tl__row">
                  <span className="tl__year">handle</span>
                  <span className="mono">{cp.cfHandle}</span>
                </div>
                <div className="tl__row">
                  <span className="tl__year">rating</span>
                  <span className="mono">
                    {cp.cfRating}（max {cp.cfMaxRating}）
                  </span>
                </div>
                <div className="tl__row">
                  <span className="tl__year">語言</span>
                  <span>{cp.languages.join("、")}</span>
                </div>
              </div>
            </div>
            <ul className="tiny muted" style={{ margin: "12px 0 0", paddingLeft: 18 }}>
              {cp.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Win>

          {/* ---------- sysmon.exe ---------- */}
          <Win
            id="skills"
            title="sysmon.exe — 系統資源"
            icon={18}
            status="使用率"
            statusRight="即時"
          >
            <Meter items={[...skills]} />
            <p className="tiny muted" style={{ marginTop: 12 }}>
              ※ 數字是我自己給的，沒有經過任何第三方認證。
            </p>
          </Win>

          {/* ---------- resume.doc ---------- */}
          <Win
            id="resume"
            title="resume.doc — 學經歷"
            icon={11}
            status="唯讀"
            statusRight={`${timeline.length} 筆`}
          >
            <div className="paper">
              <div className="tl">
                {timeline.map((t, i) => (
                  <div className="tl__row" key={i}>
                    <span className="tl__year">{t.year}</span>
                    <span>
                      <b>{t.title}</b>
                      <br />
                      <span className="muted tiny">{t.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Win>

          {/* ---------- messenger.exe ---------- */}
          <Win
            id="friends"
            title="messenger.exe — 交友守則"
            icon={7}
            status={friendPolicy.personalMessage}
            statusRight={friendPolicy.status}
          >
            <div className="paper" style={{ padding: 0 }}>
              <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {friendPolicy.lines.map((l, i) => (
                  <li className="list__item" key={i}>
                    <span className={`dot dot--${l.icon}`} aria-hidden="true" />
                    {l.text}
                  </li>
                ))}
              </ul>
            </div>
          </Win>

          {/* ---------- player.exe ---------- */}
          <Win
            id="music"
            title="player.exe — 聽團清單"
            icon={25}
            status="通勤用"
            statusRight="重複播放"
          >
            <MediaPlayer />
          </Win>

          {/* ---------- programs.cpl ---------- */}
          <Win
            id="games"
            title="programs.cpl — 新增/移除程式"
            icon={9}
            status="目前安裝的程式"
            statusRight={`${games.length} 個`}
          >
            <div className="paper" style={{ padding: 0 }}>
              <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {games.map((g) => (
                  <li className="list__item" key={g.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/oc/icon/${(g.name.length * 7) % 31}.png`}
                      alt=""
                      width={26}
                      height={26}
                      style={{ flex: "none", border: "1px solid rgba(0,0,0,.2)" }}
                    />
                    <span className="prog">
                      <b>
                        {g.name}
                        <span className="muted" style={{ fontWeight: 400 }}>
                          {" "}
                          {g.en}
                        </span>
                      </b>
                      <span className="prog__size">{g.size}</span>
                      <span className="prog__note">{g.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Win>

          {/* ---------- board.txt ---------- */}
          <Win
            id="board"
            title="board.txt — 版面成分"
            icon={21}
            status={boardMix.caption}
            statusRight="100%"
          >
            <Meter items={[...boardMix.items]} />
          </Win>

          {/* ---------- contact.hlp ---------- */}
          <Win
            id="contact"
            title="contact.hlp — 聯絡我"
            icon={28}
            status="回覆時間：不保證"
            statusRight="線上"
          >
            <div className="paper" style={{ padding: 0 }}>
              <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {links.map((l) => (
                  <li className="list__item" key={l.label}>
                    <span className="dot dot--online" aria-hidden="true" />
                    <span className="kv">
                      <b>{l.label}</b>
                      <a href={l.href} target="_blank" rel="noreferrer">
                        {l.text}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="btn-row">
              <a className="btn" href={links[0].href} style={{ textDecoration: "none" }}>
                ✉ 寄信給我
              </a>
            </div>
          </Win>
        </div>

        <footer className="footer">
          <div className="rule" />
          <Counter />
          <p style={{ margin: 0 }}>
            <span className="blink">🚧</span> 本頁面永遠施工中{" "}
            <span className="blink">🚧</span>
          </p>
          <p className="tiny" style={{ margin: 0, opacity: 0.85 }}>
            Best viewed at 1024×768 · Made with 🩵 and too much CSS
          </p>
        </footer>
      </main>

      <Taskbar
        tasks={pinned.map((w) => ({ id: w.id, label: w.label, icon: w.icon }))}
        menu={windows.map((w) => ({ id: w.id, label: `${w.label} — ${w.desktop}`, icon: w.icon }))}
      />
    </>
  );
}
