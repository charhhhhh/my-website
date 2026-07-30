import { cfAsset } from "@/lib/cf-assets";

/** Server time is fixed to the capture timestamp - this is a static layout clone. */
const CAPTURED_SERVER_TIME = "Jul/30/2026 14:55:03";

export function CfFooter() {
  return (
    <div id="footer">
      <div>
        <a href="https://codeforces.com/">Codeforces</a> (c) Copyright 2010-2026 Mike
        Mirzayanov
      </div>
      <div>The only programming contests Web 2.0 platform</div>
      <div>
        Server time: {CAPTURED_SERVER_TIME}
        <sup className="tz-superscript" title="timezone offset">
          UTC+8
        </sup>{" "}
        (n2).
      </div>
      <div>
        Desktop version, switch to{" "}
        <a className="switchToMobile" href="?mobile=true" rel="nofollow">
          mobile version
        </a>
        .
      </div>
      <div className="smaller">
        <a href="/privacy">Privacy Policy</a> | <a href="/terms">Terms and Conditions</a>
      </div>
      <div style={{ marginTop: "25px" }}>Supported by</div>
      <div style={{ textAlign: "center", marginTop: "8px" }}>
        <a href="https://ton.org/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="TON" src={cfAsset("images/ton-100x100.png")} style={{ width: "60px" }} title="TON" />
        </a>
      </div>
    </div>
  );
}
