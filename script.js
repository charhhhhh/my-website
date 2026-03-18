// 隨機載入 pixel-text 內容
document.addEventListener('DOMContentLoaded', function () {
  fetch('pixel-text.txt')
    .then(res => {
      if (!res.ok) throw new Error('Failed to load pixel-text.txt');
      return res.text();
    })
    .then(text => {
      const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('//'));
      if (lines.length === 0) return;
      const picked = lines[Math.floor(Math.random() * lines.length)];
      const el = document.querySelector('.pixel-text');
      if (el) el.textContent = picked;
    })
    .catch(err => {
      console.error(err);
    });
});

// Instagram 按鈕小彩蛋：先換圖再開新分頁
document.addEventListener('DOMContentLoaded', function () {
  const instagramLinks = document.querySelectorAll('a[href*="instagram.com"]');

  if (instagramLinks.length > 0) {
    const instagramButton = instagramLinks[0];

    instagramButton.addEventListener('click', function (event) {
      event.preventDefault();

      const url = this.getAttribute('href');
      const iconElement = this.querySelector('i.fab.fa-instagram');

      if (iconElement) {
        const img = document.createElement('img');
        img.src = 'picture/bowling.png';
        img.alt = 'Bowling';
        img.style.width = '1em';
        img.style.height = '1em';
        img.style.verticalAlign = 'middle';

        iconElement.replaceWith(img);
      }

      setTimeout(function () {
        if (url) {
          window.open(url, '_blank');
        }
      }, 80);
    });
  }
});

// 右上角互動動畫 orb：跟著滑鼠微動 & 呼吸效果
document.addEventListener('DOMContentLoaded', function () {
  const orb = document.getElementById('interactive-orb');
  if (!orb) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const strength = 0.06;

  function animate() {
    currentX += (targetX - currentX) * strength;
    currentY += (targetY - currentY) * strength;

    orb.style.transform =
      `translate(${currentX}px, ${currentY}px) scale(1.02)`;

    requestAnimationFrame(animate);
  }

  window.addEventListener('mousemove', (e) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const normalizedX = (e.clientX - vw * 0.7) / vw;
    const normalizedY = (e.clientY - vh * 0.1) / vh;

    targetX = normalizedX * 30;
    targetY = normalizedY * 30;
  });

  animate();
});