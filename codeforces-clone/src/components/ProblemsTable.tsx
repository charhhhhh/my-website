import { cfAsset } from "@/lib/cf-assets";
import { contestData } from "@/lib/contest";
import { DataTableBox } from "./DataTableBox";

/** Codeforces zebra-stripes by putting `dark` on alternating rows, starting with the first. */
const stripe = (i: number) => (i % 2 === 0 ? " dark" : "");

export function ProblemsTable() {
  return (
    <DataTableBox caption="Problems">
      <table className="problems">
        <tbody>
          <tr>
            <th className="top left" style={{ width: "4em" }}>
              #
            </th>
            <th className="top">Name</th>
            <th className="top" style={{ width: "3em" }} />
            <th className="top right" style={{ width: "5em" }} />
          </tr>
          {contestData.problems.map((p, i) => (
            <tr key={p.index}>
              <td className={`id${stripe(i)} left`}>
                <a href={p.href ?? "#"}>{p.index}</a>
              </td>
              <td className={stripe(i).trim() || undefined}>
                <div style={{ position: "relative" }}>
                  <div style={{ float: "left" }}>
                    <a href={p.href ?? "#"}>{p.name}</a>
                  </div>
                  <div
                    className="notice"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "-0.5em",
                      fontSize: "1rem",
                      paddingTop: "1px",
                      textAlign: "right",
                    }}
                  >
                    <div>{p.ioMode}</div>
                    {p.limits}
                  </div>
                </div>
              </td>
              <td className={`act${stripe(i)}`}>
                <span className="act-item">
                  <a href={p.submitHref ?? "#"}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="Submit" src={cfAsset("images/icons/submit-22x22.png")} title="Submit" />
                  </a>
                </span>
              </td>
              <td className={`${stripe(i).trim()} right`} style={{ fontSize: "1.1rem" }}>
                <a href={p.solvedHref ?? "#"} title="Participants solved the problem">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cfAsset("images/icons/user.png")} style={{ verticalAlign: "middle" }} alt="" />
                  {p.solvedCount}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTableBox>
  );
}
