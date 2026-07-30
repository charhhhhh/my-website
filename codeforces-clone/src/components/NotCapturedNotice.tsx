import { DataTableBox } from "./DataTableBox";

/**
 * Placeholder for a tab whose body could not be captured.
 *
 * Codeforces redirects Submit Code and Custom Invocation to the contest dashboard for
 * logged-out visitors, so there was no markup to clone. Rather than invent a plausible
 * form and pass it off as a clone, the page renders the real chrome plus this notice.
 * Once a logged-in capture exists, swap this for the extracted content.
 */
export function NotCapturedNotice({
  tab,
  url,
}: {
  tab: string;
  url: string;
}) {
  return (
    <DataTableBox caption={tab}>
      <div style={{ padding: "1.5em 1em", fontSize: "1.3rem", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 0.8em" }}>
          <strong>This tab was not captured.</strong> Codeforces requires a signed-in
          session for <code>{url}</code> and redirects anonymous visitors to the contest
          dashboard, so no markup for it exists in the extraction.
        </p>
        <p style={{ margin: 0 }}>
          To fill it in: sign in to Codeforces in the CDP browser window, then re-run{" "}
          <code>
            python tools/extract_cdp.py --only submit,custom-invocation
          </code>{" "}
          and replace this component with the captured content.
        </p>
      </div>
    </DataTableBox>
  );
}
