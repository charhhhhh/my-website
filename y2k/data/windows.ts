/** 桌面上的視窗清單 —— 桌面圖示、工作列、開始選單共用這份。 */
export const windows = [
  { id: "about", label: "about.exe", desktop: "關於我", icon: 0 },
  { id: "gallery", label: "viewer.exe", desktop: "我的圖片", icon: 13 },
  { id: "cp", label: "cp.exe", desktop: "競技程式", icon: 4 },
  { id: "resume", label: "resume.doc", desktop: "學經歷", icon: 11 },
  { id: "skills", label: "sysmon.exe", desktop: "系統資源", icon: 18 },
  { id: "music", label: "player.exe", desktop: "聽團清單", icon: 25 },
  { id: "games", label: "programs.cpl", desktop: "已安裝程式", icon: 9 },
  { id: "friends", label: "messenger.exe", desktop: "交友守則", icon: 7 },
  { id: "board", label: "board.txt", desktop: "版面成分", icon: 21 },
  { id: "contact", label: "contact.hlp", desktop: "聯絡我", icon: 28 },
] as const;

/** 工作列上只放常用的幾個，不然會擠爆。 */
export const pinned = windows.filter((w) =>
  ["about", "cp", "music", "games", "contact"].includes(w.id),
);
