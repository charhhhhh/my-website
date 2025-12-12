// --- 步驟一：設定所有配對 ---

const allLines = document.querySelectorAll(".line");     // 抓取所有 17 條 "背景線"
const allLights = document.querySelectorAll(".light");    // 抓取所有 17 條 "移動線"
const svgWidth = 1920;
const lightOffsets = new Map(); // 建立一個 "倉庫" 來儲存每條移動線的 X 偏移量

// 迴圈跑 17 次 (因為你有 17 對線)
for (let i = 0; i < allLines.length; i++) {

  // 1. 取得這一對的元素
  const line = allLines[i];
  const light = allLights[i]; // 假設 HTML 順序是固定的 (light1, light2...)

  // 2. 產生一個 "共用" 的隨機 X
  const randomX = Math.floor(Math.random() * svgWidth);

  // 3. 設定 "背景線" 的位置 (它很單純，直接設定 'x' 屬性)
  line.setAttribute('x', randomX);

  // 4. 計算 "移動線" 需要平移多少
  //    (它的 X 是寫死在 'd' 路徑裡的，所以我們用 'transform' 來移)
  const originalLightX = light.getBBox().x;
  const xOffset = randomX - originalLightX;

  // 5. 取得這條移動線的 class (例如 ".light1", ".light2")
  //    我們假設 classList[0] 永遠是它的唯一 ID (例如 "light1")
  const lightClass = "." + light.classList[0];

  // 6. 把這個偏移量存到 "倉庫" 裡，用 class 當作鑰匙
  lightOffsets.set(lightClass, xOffset);
}


// --- 步驟二：執行動畫 (函式有修改) ---

// 函式現在變得更簡單了
function animateWithRandomNumber(myClass, from, to) {

  // 從 "倉庫" 裡，用 class (例如 ".light1") 找出預先算好的偏移量
  const xOffset = lightOffsets.get(myClass);

  TweenLite.fromTo(myClass, Math.floor(Math.random() * 20 + 1),
    { y: from, x: xOffset }, // 套用 X 偏移
    {
      y: to, x: xOffset,     // 套用 X 偏移
      onComplete: animateWithRandomNumber,
      onCompleteParams: [myClass, from, to], // 遞迴時不需要再傳 xOffset 了
      ease: Linear.easeNone
    });
}

// --- 步驟三：啟動動畫 (這區塊完全不用改) ---
const itemsDown = [".light4", ".light5", ".light6", ".light7", ".light8", ".light11", ".light12", ".light13", ".light14", ".light15", ".light16"].
  forEach(e => animateWithRandomNumber(e, -1080, 1080));
const itemsUp = [".light1", ".light2", ".light3", ".light9", ".light10", ".light17"].
  forEach(e => animateWithRandomNumber(e, 1080, -1080));

// --- 年齡驗證 ---
document.addEventListener('DOMContentLoaded', function () {
  const confirmBtn = document.querySelector('.age-button.confirm');
  const denyBtn = document.querySelector('.age-button.deny');

  // 取得頁面元素
  const backgroundContainer = document.querySelector('.container');
  const mainUI = document.querySelector('.main');
  const scareContainer = document.getElementById('scare');
  const video = document.getElementById('video');

  // 全螢幕輔助函式
  function videoClick(event) {
    if (event) event.preventDefault();
    const { documentElement } = document;
    if (documentElement.requestFullscreen) documentElement.requestFullscreen();
    else if (documentElement.mozRequestFullScreen) documentElement.mozRequestFullScreen();
    else if (documentElement.webkitRequestFullscreen) documentElement.webkitRequestFullscreen();
    else if (documentElement.msRequestFullscreen) documentElement.msRequestFullscreen();
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', function (event) {
      event.preventDefault();

      // 1. 隱藏原本的背景和按鈕
      backgroundContainer.style.display = 'none';
      mainUI.style.display = 'none';

      // 2. 顯示並播放影片
      scareContainer.style.display = 'block';
      video.play();

      // 3. 觸發全螢幕
      videoClick();
    });
  }

  // 影片點擊也能觸發全螢幕 (防止使用者不小心跳出)
  if (video) {
    video.addEventListener("click", videoClick);

    // 影片結束後跳轉
    video.addEventListener("ended", function () {
      window.location.href = "https://dinlon5566.github.io/";
    });
  }

  if (denyBtn) {
    denyBtn.addEventListener('click', function () {
      window.location.href = '../index.html'; // 拒絕則回首頁
    });
  }
});

