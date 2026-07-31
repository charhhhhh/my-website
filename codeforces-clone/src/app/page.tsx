import { CONTEST_ID } from "@/lib/contest";

const CONTEST_URL = `/contest/${CONTEST_ID}/`;

/**
 * The site is a static export on GitHub Pages, so there is no server to answer `/` with
 * a 302 - next/navigation's redirect() only exports an empty error shell here. This
 * bounces via meta refresh instead, with a visible link for anyone whose browser or
 * extension suppresses it.
 */
export default function Home() {
  return (
    <>
      {/* React hoists this into <head>. */}
      <meta httpEquiv="refresh" content={`0; url=${CONTEST_URL}`} />
      <a href={CONTEST_URL}>Codeforces Round 1112 (Div. 2)</a>
    </>
  );
}
