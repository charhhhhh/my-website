import { contestData, type SidebarBox } from "@/lib/contest";

/**
 * The contest sidebar. Contents vary per tab - the dashboard shows 4 round boxes, problem
 * pages add "Problem tags", Hacks adds "Hacks filter" - so the caller names which capture
 * to use. Each box's inner markup is reused verbatim: its exact structure (rtable,
 * caption titled, top-links) is what Codeforces' roundbox CSS keys off.
 */
export function CfSidebar({ boxes }: { boxes: SidebarBox[] }) {
  if (boxes.length === 0) return null;
  return (
    <div id="sidebar">
      {boxes.map((box, i) => (
        <div key={i} className={box.classes} dangerouslySetInnerHTML={{ __html: box.html }} />
      ))}
    </div>
  );
}

export const sidebarFor = (slug: string): SidebarBox[] =>
  contestData.sidebars[slug] ?? contestData.sidebar;
