/**
 * 全站文案集中在這裡 —— 想改字只要動這個檔案，版面不用碰。
 * 標了 TODO 的欄位是我沒有資料、先填假值的地方。
 */

export const profile = {
  name: "胡言",
  handle: "huyan",
  slogan: "胡言亂語的胡言",
  location: "台中 ⇄ 板橋",
  skill: "在再不會搞錯",
  // 開機以來的假天數基準，訪客計數器會用到
  since: "2026-01-01",
};

/** about.exe —— 以你貼的【自介】為基底擴寫 */
export const about = [
  "胡言是胡言亂語的胡言，不是狐言也不是湖言，打錯的我都當作沒看到。",
  "人在台中跟板橋之間來回，通勤時間長到足以把整張專輯聽完再聽一次，所以歌單才會長那樣。",
  "專長是在再不會搞錯 —— 這是我少數敢寫在履歷上的技能，而且我真的做得到。",
  "其餘時間拿來打程式競賽、打電動、以及在網路上發一些沒有營養但我自己覺得很好笑的東西。",
];

/** 【交友】—— MSN 聯絡人清單 */
export const friendPolicy = {
  status: "離開中（私訊慢回）",
  personalMessage: "友邀隨意 · 自介隨意 · 私訊隨意",
  lines: [
    { icon: "online", text: "友邀隨意，看到就會按。" },
    { icon: "online", text: "自介隨意，不用先自我介紹三百字。" },
    { icon: "away", text: "私訊隨意，但我回得很慢，不是已讀不回，是真的沒看到。" },
    { icon: "online", text: "歡迎交流，聊什麼都可以，除了叫我早起。" },
  ],
};

/** 【版面】—— 廢文跟笑話一半一半 */
export const boardMix = {
  caption: "歡迎進來看我笑話。",
  items: [
    { label: "廢文", value: 50 },
    { label: "笑話", value: 50 },
    { label: "有用的內容", value: 0 },
  ],
};

/** 【聽團】—— 媒體播放器 */
export const bands = [
  "海豚刑警",
  "顯然樂隊",
  "椅子樂團",
  "透明雜誌",
  "當代電影大師",
];

// TODO(你): 換成完整歌單網址，你貼的那條被截斷了
export const playlistUrl = "https://music.youtube.com/playlist";

/** 【遊戲】—— 新增/移除程式 */
export const games = [
  { name: "空洞騎士", en: "Hollow Knight", size: "9,999 hr", note: "白宮還沒打過" },
  { name: "爐石戰記", en: "Hearthstone", size: "課金 NT$0", note: "純白嫖" },
  { name: "Deadlock", en: "Deadlock", size: "測試中", note: "隊友都很強" },
  { name: "Balatro", en: "Balatro", size: "再一把", note: "再一把就好" },
];

/** cp.exe —— 競技程式 */
// TODO(你): 換成你真正的 handle 與 rating，我先放預設值
export const cp = {
  cfHandle: "TODO_codeforces_handle",
  cfRating: 0,
  cfMaxRating: 0,
  cfRank: "unrated",
  languages: ["C++", "Python"],
  notes: [
    "TODO(你): 比賽紀錄，例如「2025 ICPC 台灣賽區 xx 名」",
    "TODO(你): 解題數 / 常用 judge（Codeforces、AtCoder、TIOJ、ZeroJudge…）",
  ],
};

/** resume.doc —— 學經歷時間軸 */
// TODO(你): 全部換成真的，我只放了格式範例
export const timeline = [
  { year: "20XX", title: "TODO 學校 / 科系", note: "TODO 一句話說明" },
  { year: "20XX", title: "TODO 實習 / 工作 / 社團", note: "TODO 一句話說明" },
  { year: "20XX", title: "TODO 得獎 / 專案", note: "TODO 一句話說明" },
];

/** 技能 —— 顯示成系統資源表 */
// TODO(你): 調整項目與百分比
export const skills = [
  { label: "C++", value: 88 },
  { label: "演算法 / 資料結構", value: 82 },
  { label: "Python", value: 70 },
  { label: "前端 (HTML/CSS/JS)", value: 55 },
  { label: "早起", value: 3 },
];

/** 聯絡方式 */
// TODO(你): 補上真實連結，不要的整行刪掉
export const links = [
  { label: "Email", href: "mailto:charliewang1201@gmail.com", text: "charliewang1201@gmail.com" },
  { label: "GitHub", href: "https://github.com/charhhhhh", text: "@charhhhhh" },
  { label: "Playlist", href: playlistUrl, text: "我的歌單" },
];
