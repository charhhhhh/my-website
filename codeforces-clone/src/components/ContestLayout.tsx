import { CfHeader } from "./CfHeader";
import { CfTopMenu } from "./CfTopMenu";
import { CfSidebar, sidebarFor } from "./CfSidebar";
import { CfFooter } from "./CfFooter";
import { SecondLevelMenu, type TabKey } from "./SecondLevelMenu";

/**
 * The chrome shared by every contest page.
 *
 * Layout comes straight from Codeforces' style.css and is fixed-width, not fluid:
 *   #body      width/max-width 1200px, min-width 920px, centred
 *   #sidebar   280px, pulled right with margin-left -308px
 *   #pageContent.content-with-sidebar  878px, margin-right 308px
 *
 * The Room tab drops the sidebar entirely and runs #pageContent full width (1172px) with
 * no `content-with-sidebar` class, so `sidebar` is the capture slug to render - or null.
 */
export function ContestLayout({
  active,
  sidebar,
  children,
}: {
  active: TabKey;
  /** Capture slug whose sidebar to show, or null for the full-width Room layout. */
  sidebar: string | null;
  children: React.ReactNode;
}) {
  const boxes = sidebar ? sidebarFor(sidebar) : [];
  const hasSidebar = boxes.length > 0;

  return (
    <div id="body">
      <CfHeader />
      <CfTopMenu />
      {/* Unnamed position:relative wrapper around #sidebar + #pageContent. It carries no
          id or class on the live site but is load-bearing: .second-level-menu is
          position:absolute with top:-12px, so this is the containing block that lifts the
          tab bar into place. Without it the tab bar lands at y=-12, off-page. */}
      <div style={{ position: "relative" }}>
        {hasSidebar && <CfSidebar boxes={boxes} />}
        <div id="pageContent" className={hasSidebar ? "content-with-sidebar" : undefined}>
          <SecondLevelMenu active={active} />
          {children}
        </div>
      </div>
      {/* #footer sits INSIDE #body on the live site - that is what constrains it to the
          1200px column. Hoisting it out lets it span the full viewport width. */}
      <CfFooter />
    </div>
  );
}
