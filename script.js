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
    { y: to, x: xOffset,     // 套用 X 偏移
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

// --- Instagram 按鈕點擊事件監聽器 ---
document.addEventListener('DOMContentLoaded', function() {
  // 選取所有按鈕連結
  const buttons = document.querySelectorAll('.buttons a');
  
  // 找到Instagram按鈕（第二個按鈕，索引為1）
  if (buttons.length >= 2) {
    const instagramButton = buttons[1];
    
    instagramButton.addEventListener('click', function(event) {
      event.preventDefault(); // 先阻止預設行為
      
      // 找到按鈕內的 <i> 圖示元素
      const iconElement = this.querySelector('i.fab.fa-instagram');
      
      if (iconElement) {
        // 建立 img 元素
        const img = document.createElement('img');
        img.src = 'picture/bowling.png';
        img.alt = 'Bowling';
        img.style.width = '1em';
        img.style.height = '1em';
        img.style.verticalAlign = 'middle';
        
        // 用圖片取代圖示
        iconElement.replaceWith(img);
      }
      
      // 替換完圖示後，再進行跳轉
      const url = this.getAttribute('href');
      if (url) {
        window.open(url, '_blank');
      }
    });
  }
});