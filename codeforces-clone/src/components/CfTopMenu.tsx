const TOP_MENU = [
  { label: "Home", href: "/" },
  { label: "Top", href: "/top" },
  { label: "Catalog", href: "/catalog" },
  { label: "Contests", href: "/contests" },
  { label: "Gym", href: "/gyms" },
  { label: "Problemset", href: "/problemset" },
  { label: "Groups", href: "/groups" },
  { label: "Rating", href: "/ratings" },
  { label: "Edu", href: "/edu/courses", edu: true },
  { label: "API", href: "/apiHelp" },
  { label: "Calendar", href: "/calendar" },
  { label: "Help", href: "/help" },
];

/** Site-wide nav. "Contests" is the current section on every contest page. */
export function CfTopMenu({ current = "Contests" }: { current?: string }) {
  return (
    <div className="roundbox menu-box borderTopRound borderBottomRound">
      <div className="menu-list-container">
        <ul className="menu-list main-menu-list">
          {TOP_MENU.map((item) => (
            <li key={item.label} className={item.label === current ? "current" : ""}>
              <a href={item.href}>
                {item.edu ? <span className="edu-menu-item">{item.label}</span> : item.label}
              </a>
            </li>
          ))}
        </ul>
        <form action="/search" method="post">
          <input className="search" name="query" defaultValue="" />
        </form>
        <br style={{ clear: "both" }} />
      </div>
    </div>
  );
}
