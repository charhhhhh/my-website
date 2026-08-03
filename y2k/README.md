# y2k — 胡言的個人首頁

千禧金屬 / Win98-XP 桌面風格的個人介紹站。Next.js 靜態輸出，沒有後端。

## 開發

```bash
npm install
npm run thumbs   # 從 ../image/verify1 產生 public/oc/（改圖時才要跑）
npm run dev      # http://localhost:3000
npm run build    # 輸出到 out/
```

⚠️ `dev` 跟 `build` 共用 `.next/`，同時跑會讓 dev server 噴
`Cannot find module './xxx.js'`。要 build 先把 dev 關掉；真的撞到就
`rm -rf .next` 再重開 dev。

## 要改字，只動這兩個檔

- `data/profile.ts` — 所有文案、連結、數值。標了 `TODO(你)` 的是待填的真實資料。
- `data/windows.ts` — 桌面上有哪些視窗、圖示編號、順序。

## 結構

| 檔案 | 做什麼 |
| --- | --- |
| `app/globals.css` | 整套視覺：立體邊框、Luna 藍標題列、工作列、金屬字、剪紙外框 |
| `components/Win.tsx` | 視窗外框（固定位置，不能拖） |
| `components/Taskbar.tsx` | 工作列 + 開始選單 + 關機藍屏 |
| `components/Gallery.tsx` | 看圖程式，翻 31 張角色圖 |
| `components/MediaPlayer.tsx` | 假播放器，不會出聲 |
| `components/Meter.tsx` | Win98 一格一格的進度條 |
| `components/Counter.tsx` | 訪客計數器（localStorage，純裝飾） |
| `components/SparkleCursor.tsx` | 滑鼠星星拖尾 |
| `public/oc/` | `npm run thumbs` 產生，不要手動改 |
| `public/cursor/` | 自訂游標（SVG；Safari 不支援會退回系統游標） |

## 部署

目前**還沒**接上 GitHub Pages。`.github/workflows/deploy.yml` 現在指向 `codeforces-clone/`，
要上線得把 `working-directory` 與 artifact path 改成 `y2k`，並決定觸發分支。
