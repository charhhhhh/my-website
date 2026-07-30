import type { CapturedTable as CapturedTableData } from "@/lib/contest";
import { DataTableBox } from "./DataTableBox";

/**
 * Renders a table captured verbatim from the live page.
 *
 * Used for Hacks, My Submissions and Room. Their cells carry meaning in class names the
 * stylesheets act on - verdict colours (`cell-verdict`, `verdict-accepted`), user rank
 * colours (`user-legendary`, `user-red`), per-problem cells (`cell-problem`) - and
 * rebuilding those by hand from flattened text would lose the styling that makes them
 * look right. The structured headers/rows are still available on the data object for any
 * consumer that wants them.
 */
export function CapturedTable({
  data,
  caption,
}: {
  data: CapturedTableData;
  caption?: React.ReactNode;
}) {
  if (!data.found || !data.html) {
    return (
      <DataTableBox caption={caption}>
        <table className="status-frame-datatable">
          <tbody>
            <tr>
              <td className="dark left right">No items</td>
            </tr>
          </tbody>
        </table>
      </DataTableBox>
    );
  }

  return (
    <DataTableBox caption={caption}>
      <div dangerouslySetInnerHTML={{ __html: data.html }} />
    </DataTableBox>
  );
}
