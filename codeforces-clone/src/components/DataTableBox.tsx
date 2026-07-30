import { cfAsset } from "@/lib/cf-assets";

/**
 * Codeforces' .datatable frame. The rounded corners are not border-radius: they are four
 * absolutely-positioned corner sprites (.lt/.rt/.lb/.rb) on the grey outer box plus two
 * more (.ilt/.irt) on the white inner panel. Omitting any of them leaves visible square
 * corners, so the structure is reproduced exactly.
 */
export function DataTableBox({
  caption,
  children,
}: {
  caption?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="datatable" style={{ backgroundColor: "#E1E1E1", paddingBottom: "3px" }}>
      <div className="lt" />
      <div className="rt" />
      <div className="lb" />
      <div className="rb" />
      {caption !== undefined && (
        <div style={{ padding: "4px 0 0 6px", fontSize: "1.4rem", position: "relative" }}>
          {caption}
          <div style={{ position: "absolute", right: "0.25em", top: "0.35em" }}>
            <span className="rowCount" style={{ padding: 0, position: "relative", bottom: "2px" }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="closed" src={cfAsset("images/icons/magnifier-medium.png")} alt="" />
          </div>
        </div>
      )}
      <div
        style={{ backgroundColor: "white", margin: "0.3em 3px 0 3px", position: "relative" }}
      >
        <div className="ilt" />
        <div className="irt" />
        {children}
      </div>
    </div>
  );
}
