import { cfAsset } from "@/lib/cf-assets";

/** Codeforces #header: logo on the left, language flags + Enter/Register on the right. */
export function CfHeader() {
  return (
    <div id="header" style={{ position: "relative" }}>
      <div style={{ float: "left", maxHeight: "60px" }}>
        <a href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- matching Codeforces'
              plain <img> so their inline height styling applies unchanged */}
          <img
            alt="Codeforces"
            height={65}
            src={cfAsset("images/codeforces-sponsored-by-ton.png")}
            style={{ height: "65px" }}
            title="Codeforces"
          />
        </a>
      </div>
      <div className="lang-chooser">
        <div style={{ textAlign: "right" }}>
          <a href="?locale=en">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="In English" src={cfAsset("images/flags/24/gb.png")} title="In English" />
          </a>
          <a href="?locale=ru">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="По-русски" src={cfAsset("images/flags/24/ru.png")} title="По-русски" />
          </a>
        </div>
        <div>
          <a href="/enter">Enter</a> | <a href="/register">Register</a>
        </div>
      </div>
      <br style={{ clear: "both" }} />
    </div>
  );
}
