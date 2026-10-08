const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GAME_URL = 'https://volamidle.pages.dev/';
const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const STORAGE_PATH = path.join(__dirname, 'storage.json');

const VIEWPORT_WIDTH = 360;
const VIEWPORT_HEIGHT = 640;

app.use(express.json());

let browserInstance = null;
let pageInstance = null;
let botStatus = {
  status: 'Initializing',
  lastCheck: null,
  uptimeStarted: new Date().toISOString(),
  memory: null,
  account: null,
  error: null
};

// Hàm tự động xử lý đăng nhập, chọn nhân vật Slot 1, đóng bảng tạo NV và nhận thưởng
async function autoLoginIfNeeded(page) {
  try {
    if (!page || page.isClosed()) return;

    await page.evaluate(() => {
      try {
        const modal = document.querySelector('#modal');
        const modalText = modal && !modal.classList.contains('hidden') ? (modal.innerText || '') : '';
        const csel = document.querySelector('#csel');

        // 1. TỰ ĐỘNG ĐÓNG NẾU LỠ MỞ BẢNG "TẠO NHÂN VẬT"
        if (modalText.includes('Tạo nhân vật') || modalText.includes('Chọn tên, giới tính')) {
          const closeBtn = document.querySelector('#mClose, .mx, button.close');
          if (closeBtn) {
            closeBtn.click();
          } else if (typeof closeModal === 'function') {
            closeModal(true);
          }
        }

        // 2. TỰ ĐỘNG ĐĂNG NHẬP (Nếu xuất hiện bảng Đăng Nhập NetGate hoặc form ID/Pass)
        const uInput = document.querySelector('#ngU');
        const pInput = document.querySelector('#ngP');
        const loginBtn = document.querySelector('#ngIn');

        if (uInput && pInput && loginBtn && modalText.includes('Đăng nhập')) {
          if (uInput.value !== 'aaaaa') {
            uInput.value = 'aaaaa';
            uInput.dispatchEvent(new Event('input', { bubbles: true }));
            uInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          if (pInput.value !== '123123') {
            pInput.value = '123123';
            pInput.dispatchEvent(new Event('input', { bubbles: true }));
            pInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          loginBtn.click();
        } else {
          // Fallback nếu modal đăng nhập thông thường
          const inputs = modal ? Array.from(modal.querySelectorAll('input')) : [];
          if (inputs.length >= 2) {
            let userField = inputs.find(i => i.type === 'text' || (i.placeholder && (i.placeholder.toLowerCase().includes('tên') || i.placeholder.toLowerCase().includes('chữ')))) || inputs[0];
            let passField = inputs.find(i => i.type === 'password' || (i.placeholder && (i.placeholder.toLowerCase().includes('ký tự') || i.placeholder.toLowerCase().includes('mật khẩu')))) || inputs[1];

            if (userField && passField && userField !== passField) {
              if (userField.value !== 'aaaaa') {
                userField.value = 'aaaaa';
                userField.dispatchEvent(new Event('input', { bubbles: true }));
                userField.dispatchEvent(new Event('change', { bubbles: true }));
              }
              if (passField.value !== '123123') {
                passField.value = '123123';
                passField.dispatchEvent(new Event('input', { bubbles: true }));
                passField.dispatchEvent(new Event('change', { bubbles: true }));
              }
              const buttons = Array.from(modal.querySelectorAll('button'));
              const btn = buttons.find(b => (b.innerText || b.textContent || '').trim().includes('Đăng nhập'));
              if (btn) btn.click();
            }
          }
        }

        // 3. TỰ ĐỘNG CHỌN SLOT 1 VÀ BẤM "VÀO GAME" (Nếu ở màn hình Chọn Nhân Vật #csel)
        if (csel) {
          // Chọn Slot 1 (data-i="0")
          const slot0 = document.querySelector('#csel .cs-slot[data-i="0"]');
          if (slot0 && !slot0.classList.contains('on')) {
            slot0.click();
          }

          // Bấm nút "Vào Game" (#csGo)
          const csGoBtn = document.querySelector('#csGo') || Array.from(document.querySelectorAll('#csel button, .go')).find(b => (b.innerText || '').trim().includes('Vào Game'));
          if (csGoBtn && csGoBtn.offsetWidth > 0 && csGoBtn.offsetHeight > 0) {
            csGoBtn.click();
          }
        } else {
          // Fallback tìm nút "Vào Game" ngoài màn hình
          const allButtons = Array.from(document.querySelectorAll('button, .btn, div[role="button"]'));
          const enterGameBtn = allButtons.find(b => {
            const text = (b.innerText || b.textContent || '').trim();
            return text === 'Vào Game' || text.includes('Vào Game');
          });
          if (enterGameBtn && enterGameBtn.offsetWidth > 0 && enterGameBtn.offsetHeight > 0) {
            enterGameBtn.click();
          }
        }

        // 4. TỰ ĐỘNG BẤM "NHẬN" / "XÁC NHẬN" PHẦN THƯỞNG VẮNG MẶT HOẶC POPUP
        if (modalText.includes('Chào mừng trở lại') || modalText.includes('Vắng mặt') || modalText.includes('Phần thưởng') || modalText.includes('Thông báo') || modalText.includes('Sự kiện')) {
          const claimBtn = Array.from(document.querySelectorAll('#modal button, .btnrow button, .btn')).find(b => {
            const text = (b.innerText || b.textContent || '').trim();
            return text === 'Nhận' || text === 'Nhận thưởng' || text === 'Xác nhận' || text === 'Đóng';
          });
          if (claimBtn && claimBtn.offsetWidth > 0 && claimBtn.offsetHeight > 0) {
            claimBtn.click();
          }
        }
      } catch (e) {}
    });

    // Thử lại sau 1.2 giây cho chuỗi hành động diễn ra mượt mà
    setTimeout(async () => {
      try {
        if (!page || page.isClosed()) return;
        await page.evaluate(() => {
          // Chọn slot 0 & vào game nếu vẫn ở #csel
          const csel = document.querySelector('#csel');
          if (csel) {
            const slot0 = document.querySelector('#csel .cs-slot[data-i="0"]');
            if (slot0 && !slot0.classList.contains('on')) slot0.click();
            const csGoBtn = document.querySelector('#csGo');
            if (csGoBtn) csGoBtn.click();
          }

          const allButtons = Array.from(document.querySelectorAll('button, .btn, div[role="button"]'));
          const claimBtn = allButtons.find(b => {
            const text = (b.innerText || b.textContent || '').trim();
            return text === 'Nhận' || text === 'Nhận thưởng' || text === 'Xác nhận';
          });
          if (claimBtn && claimBtn.offsetWidth > 0 && claimBtn.offsetHeight > 0) {
            claimBtn.click();
          }
        });
      } catch (e) {}
    }, 1200);

  } catch (err) {
    console.error('[AUTO-LOGIN ERROR]', err.message);
  }
}

// Hàm trích xuất chỉ số nhân vật từ window.S hoặc localStorage
async function getGameAccountStats(page) {
  try {
    if (!page || page.isClosed()) return null;
    const stats = await page.evaluate(() => {
      try {
        const facMap = {
          tianren: 'Thiên Nhẫn',
          tianwang: 'Thiên Vương',
          shaolin: 'Thiếu Lâm',
          wudang: 'Võ Đang',
          emei: 'Nga Mi',
          gaibang: 'Cái Bang',
          tangmen: 'Đường Môn',
          wudu: 'Ngũ Độc',
          cuiyan: 'Thúy Yên',
          kunlun: 'Côn Lôn'
        };

        // Ưu tiên đọc trực tiếp từ window.S nếu game đang chạy
        if (window.S && window.S.fac) {
          const s = window.S;
          return {
            name: s.name || 'N/A',
            lvl: s.lvl || 0,
            xp: Math.round(s.xp || 0),
            gold: Math.round(s.gold || 0),
            facName: facMap[s.fac] || s.fac,
            stage: s.stage || 0,
            kills: s.totalKills || 0
          };
        }

        // Fallback đọc từ localStorage: ưu tiên Slot 1 (jxidle) rồi tới Slot 2 (jxidle_2)
        const rawData = localStorage.getItem('jxidle') || localStorage.getItem('jxidle_2');
        if (!rawData) return null;
        const parsed = JSON.parse(rawData);
        const data = parsed.d ? JSON.parse(parsed.d) : parsed;
        
        const name = data.name || 'N/A';
        const lvl = data.lvl || 0;
        const xp = Math.round(data.xp || 0);
        const gold = Math.round(data.gold || 0);
        const fac = data.fac || 'N/A';
        const stage = data.stage || 0;
        const kills = data.totalKills || (data.stat ? data.stat.kills : 0);

        return {
          name,
          lvl,
          xp,
          gold,
          facName: facMap[fac] || fac,
          stage,
          kills
        };
      } catch (e) {
        return null;
      }
    });
    return stats;
  } catch (e) {
    return null;
  }
}

app.get('/api/status', async (req, res) => {
  const mem = process.memoryUsage();
  botStatus.memory = `${Math.round(mem.rss / 1024 / 1024)}MB`;
  
  if (pageInstance && !pageInstance.isClosed()) {
    const liveAccountStats = await getGameAccountStats(pageInstance);
    if (liveAccountStats) {
      botStatus.account = liveAccountStats;
    }
  }

  res.json({
    service: 'VolamIdle 24/7 Runner & Remote Control',
    botStatus: botStatus,
    timestamp: new Date().toISOString()
  });
});

let isTakingScreenshot = false;
let cachedScreenshot = null;
let lastScreenshotTime = 0;

app.get('/api/screenshot', async (req, res) => {
  try {
    const now = Date.now();
    // Trả về cache nếu vừa chụp trong vòng 300ms để tránh quá tải CPU Puppeteer
    if (cachedScreenshot && (now - lastScreenshotTime < 300)) {
      res.contentType('image/jpeg');
      return res.send(cachedScreenshot);
    }

    if (pageInstance && !pageInstance.isClosed() && !isTakingScreenshot) {
      isTakingScreenshot = true;
      try {
        cachedScreenshot = await pageInstance.screenshot({
          type: 'jpeg',
          quality: 35,
          optimizeForSpeed: true
        });
        lastScreenshotTime = Date.now();
        res.contentType('image/jpeg');
        return res.send(cachedScreenshot);
      } finally {
        isTakingScreenshot = false;
      }
    } else if (cachedScreenshot) {
      res.contentType('image/jpeg');
      return res.send(cachedScreenshot);
    }

    const statusText = botStatus.error ? `Lỗi: ${botStatus.error}` : `Trạng thái: ${botStatus.status}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640">
      <rect width="360" height="640" fill="#0f172a"/>
      <text x="180" y="280" font-family="sans-serif" font-size="20" fill="#38bdf8" text-anchor="middle" font-weight="bold">🎮 Võ Lâm Idle 24/7 Bot</text>
      <text x="180" y="325" font-family="sans-serif" font-size="15" fill="#f8fafc" text-anchor="middle">⏳ Đang kết nối Trình duyệt Chrome...</text>
      <text x="180" y="365" font-family="sans-serif" font-size="13" fill="#fbbf24" text-anchor="middle">${statusText}</text>
    </svg>`;
    res.contentType('image/svg+xml').send(svg);
  } catch (err) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640">
      <rect width="360" height="640" fill="#0f172a"/>
      <text x="180" y="320" font-family="sans-serif" font-size="14" fill="#ef4444" text-anchor="middle">❌ Lỗi: ${err.message}</text>
    </svg>`;
    res.contentType('image/svg+xml').send(svg);
  }
});

app.post('/api/click', async (req, res) => {
  try {
    const { x, y } = req.body;
    if (pageInstance && !pageInstance.isClosed()) {
      await pageInstance.mouse.click(Number(x), Number(y));
      console.log(`[REMOTE CONTROL] Clicked at (${x}, ${y})`);
      lastScreenshotTime = 0; // Xóa cache ảnh để client nạp ảnh mới ngay lập tức
      return res.json({ success: true, x, y });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/key', async (req, res) => {
  try {
    const { key } = req.body;
    if (pageInstance && !pageInstance.isClosed()) {
      await pageInstance.keyboard.press(key);
      console.log(`[REMOTE CONTROL] Pressed key: ${key}`);
      lastScreenshotTime = 0;
      return res.json({ success: true, key });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/claim', async (req, res) => {
  try {
    if (pageInstance && !pageInstance.isClosed()) {
      console.log('[REMOTE CONTROL] Triggering Auto-Claim Rewards / Dismiss Popup...');
      await pageInstance.evaluate(() => {
        const allButtons = Array.from(document.querySelectorAll('button, .btn, div[role="button"]'));
        const claimBtn = allButtons.find(b => {
          const text = (b.innerText || b.textContent || '').trim();
          return text === 'Nhận' || text === 'Nhận thưởng' || text === 'Xác nhận' || text.includes('Vào Game');
        });
        if (claimBtn) claimBtn.click();
      });
      lastScreenshotTime = 0;
      return res.json({ success: true });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/autologin', async (req, res) => {
  try {
    if (pageInstance && !pageInstance.isClosed()) {
      console.log('[REMOTE CONTROL] Triggering Auto-Login Workflow...');
      await autoLoginIfNeeded(pageInstance);
      lastScreenshotTime = 0;
      return res.json({ success: true });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reload', async (req, res) => {
  try {
    if (pageInstance && !pageInstance.isClosed()) {
      console.log('[REMOTE CONTROL] Reloading game page & re-injecting storage...');
      await loadLocalStorage(pageInstance);
      await pageInstance.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      
      if (fs.existsSync(STORAGE_PATH)) {
        const storageData = fs.readFileSync(STORAGE_PATH, 'utf8');
        const storage = JSON.parse(storageData);
        if (storage && Object.keys(storage).length > 0 && !storage.EXAMPLE_KEY) {
          await pageInstance.evaluate((data) => {
            for (const [key, value] of Object.entries(data)) {
              localStorage.setItem(key, value);
            }
          }, storage);
        }
      }

      setTimeout(() => {
        autoLoginIfNeeded(pageInstance);
      }, 2000);

      return res.json({ success: true });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/switch-slot', async (req, res) => {
  try {
    const slotIdx = req.body && req.body.slot !== undefined ? String(req.body.slot) : '0';
    if (pageInstance && !pageInstance.isClosed()) {
      console.log(`[REMOTE CONTROL] Switching to slot ${slotIdx}...`);
      await pageInstance.evaluate((slot) => {
        try {
          localStorage.setItem('jxidle_slot', slot);
          sessionStorage.setItem('jxidle_in', slot);
          location.reload();
        } catch(e) {}
      }, slotIdx);
      lastScreenshotTime = 0;
      setTimeout(() => {
        autoLoginIfNeeded(pageInstance);
      }, 2500);
      return res.json({ success: true, slot: slotIdx });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>VolamIdle 24/7 Control Board</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 15px; }
        .container { max-width: 900px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 1px solid #334155; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        h1 { font-size: 1.3rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
        .badge { background: #22c55e; color: #000; font-weight: bold; padding: 4px 10px; borderRadius: 20px; font-size: 0.8rem; }
        .screen-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 15px; text-align: center; }
        .img-container { position: relative; display: inline-block; width: 100%; max-width: 360px; margin-top: 10px; background: #000; border-radius: 8px; overflow: hidden; cursor: crosshair; min-height: 200px; }
        .img-container img { width: 100%; height: auto; display: block; }
        .controls { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; justify-content: center; }
        button { background: #2563eb; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        button:hover { background: #1d4ed8; transform: translateY(-1px); }
        button.success { background: #16a34a; }
        button.success:hover { background: #15803d; }
        button.danger { background: #dc2626; }
        button.danger:hover { background: #b91c1c; }
        button.secondary { background: #475569; }
        button.secondary:hover { background: #334155; }
        .hint { color: #94a3b8; font-size: 0.85rem; margin-top: 8px; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 15px; }
        .stat-card { background: #1e293b; padding: 12px; border-radius: 8px; border: 1px solid #334155; font-size: 0.9rem; }
        .stat-title { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 4px; }
        .stat-value { font-weight: bold; font-size: 1.1rem; color: #38bdf8; }
        .stat-value.gold { color: #fbbf24; }
        .stat-value.level { color: #a7f3d0; }
        select { background: #334155; color: white; border: 1px solid #475569; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>🎮 Võ Lâm Idle 24/7 Control Board</h1>
          <span class="badge" id="botStatusBadge">Running</span>
        </header>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-title">👤 Tên Nhân Vật</div>
            <div class="stat-value" id="accName">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">⭐ Cấp Độ (Level)</div>
            <div class="stat-value level" id="accLvl">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">🗺️ Bản Đồ (Ải)</div>
            <div class="stat-value" id="accStage">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">💰 Ngân Lượng</div>
            <div class="stat-value gold" id="accGold">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">⚔️ Quái Đã Hạ</div>
            <div class="stat-value" id="accKills">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">💾 RAM Server</div>
            <div class="stat-value" id="statMemory" style="color:#e2e8f0;">-- MB</div>
          </div>
        </div>

        <div class="screen-card">
          <div class="hint">⚡ Nạp ảnh Mobile (360x640 Dọc). Click trực tiếp lên ảnh để điều khiển game!</div>
          <div class="img-container" onclick="handleClick(event)">
            <img id="gameScreen" src="/api/screenshot" alt="Game Screen Live">
          </div>
          
          <div style="margin-top: 12px; font-size: 0.85rem; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="autoRefresh" checked> Tự động nạp ảnh
            </label>
            <label style="display: flex; align-items: center; gap: 6px;">
              Tốc độ nạp: 
              <select id="refreshInterval" onchange="changeInterval()">
                <option value="500">⚡⚡ 0.5 Giây (Siêu tốc / Livestream)</option>
                <option value="1000" selected>⚡ 1.0 Giây (Rất mượt)</option>
                <option value="3000">🚀 3.0 Giây (Chuẩn)</option>
                <option value="5000">🐢 5.0 Giây (Tiết kiệm)</option>
              </select>
            </label>
          </div>

          <div class="controls">
            <button class="secondary" style="background:#2563eb; color:#fff; font-weight: bold;" onclick="switchSlot(0)">👤 Chuyển sang Slot 1 (CS 1 Lv 62)</button>
            <button class="secondary" style="background:#475569; color:#fff;" onclick="switchSlot(1)">👤 Chuyển sang Slot 2 (Lv 200)</button>
            <button class="success" onclick="triggerAutoLogin()">🔑 Tự Đăng Nhập (aaaaa / 123123)</button>
            <button class="success" style="background:#059669;" onclick="claimReward()">🎁 Nhận Thưởng / Đóng Popup</button>
            <button onclick="refreshScreen()">🔄 Làm mới ảnh & chỉ số</button>
            <button class="secondary" onclick="sendKey('Space')">⌨️ Phím Space</button>
            <button class="secondary" onclick="sendKey('Enter')">⌨️ Phím Enter</button>
            <button class="secondary" onclick="sendKey('Escape')">⌨️ Phím Esc</button>
            <button class="danger" onclick="reloadGame()">🔁 Re-login & Reload Game</button>
          </div>
        </div>
      </div>

      <script>
        const gameImg = document.getElementById('gameScreen');
        let refreshTimer = null;

        gameImg.onerror = function() {
          setTimeout(refreshScreen, 1500);
        };

        function refreshScreen() {
          gameImg.src = '/api/screenshot?t=' + Date.now();
          updateStatus();
        }

        async function claimReward() {
          await fetch('/api/claim', { method: 'POST' });
          setTimeout(refreshScreen, 300);
        }

        async function updateStatus() {
          try {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            document.getElementById('statMemory').innerText = data.botStatus.memory || '40MB';
            const badge = document.getElementById('botStatusBadge');
            if (badge && data.botStatus.status) {
              badge.innerText = data.botStatus.status;
              if (data.botStatus.status === 'Running') {
                badge.style.background = '#22c55e';
              } else if (data.botStatus.status.includes('Error') || data.botStatus.status === 'Crashed') {
                badge.style.background = '#ef4444';
              } else {
                badge.style.background = '#eab308';
              }
            }

            if (data.botStatus.account) {
              const acc = data.botStatus.account;
              document.getElementById('accName').innerText = acc.name + ' (' + acc.facName + ')';
              document.getElementById('accLvl').innerText = 'Level ' + acc.lvl;
              document.getElementById('accStage').innerText = 'Ải ' + acc.stage;
              document.getElementById('accGold').innerText = acc.gold.toLocaleString() + ' Gold';
              document.getElementById('accKills').innerText = acc.kills.toLocaleString() + ' Con';
            }
          } catch(e){}
        }

        async function triggerAutoLogin() {
          await fetch('/api/autologin', { method: 'POST' });
          setTimeout(refreshScreen, 1000);
        }

        async function handleClick(e) {
          const rect = gameImg.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const scaledX = Math.round((clickX / rect.width) * ${VIEWPORT_WIDTH});
          const scaledY = Math.round((clickY / rect.height) * ${VIEWPORT_HEIGHT});

          try {
            await fetch('/api/click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: scaledX, y: scaledY })
            });
            setTimeout(refreshScreen, 300);
          } catch(err) {
            alert('Click error: ' + err.message);
          }
        }

        async function sendKey(key) {
          await fetch('/api/key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key })
          });
          setTimeout(refreshScreen, 300);
        }

        async function reloadGame() {
          if (confirm('Bạn có chắc chắn muốn nạp lại tài khoản và kết nối lại game?')) {
            await fetch('/api/reload', { method: 'POST' });
            setTimeout(refreshScreen, 2000);
          }
        }

        async function switchSlot(slot) {
          const name = slot === 0 ? 'Slot 1 (Chuyển sinh 1 - Lv 62)' : 'Slot 2 (Lv 200)';
          if (confirm(`Bạn có chắc muốn chuyển sang ${name}?`)) {
            await fetch('/api/switch-slot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slot })
            });
            setTimeout(refreshScreen, 2500);
          }
        }

        function startAutoRefresh() {
          if (refreshTimer) clearInterval(refreshTimer);
          const ms = Number(document.getElementById('refreshInterval').value) || 1000;
          refreshTimer = setInterval(() => {
            if (document.getElementById('autoRefresh').checked) {
              refreshScreen();
            }
          }, ms);
        }

        function changeInterval() {
          startAutoRefresh();
        }

        startAutoRefresh();
        updateStatus();
      </script>
    </body>
    </html>
  `);
});

async function loadCookies(page) {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookiesData = fs.readFileSync(COOKIES_PATH, 'utf8');
      const cookies = JSON.parse(cookiesData);
      
      if (Array.isArray(cookies) && cookies.length > 0 && cookies[0].name !== 'PASTE_YOUR_COOKIE_NAME_HERE') {
        const sanitizedCookies = cookies.map(c => {
          const { hostOnly, storeId, ...validCookie } = c;
          return validCookie;
        });
        await page.setCookie(...sanitizedCookies);
        console.log(`[COOKIE] Injected ${sanitizedCookies.length} cookies.`);
      }
    }
  } catch (err) {
    console.error('[COOKIE ERROR]', err.message);
  }
}

async function loadLocalStorage(page) {
  try {
    if (fs.existsSync(STORAGE_PATH)) {
      const storageData = fs.readFileSync(STORAGE_PATH, 'utf8');
      const storage = JSON.parse(storageData);

      if (storage && Object.keys(storage).length > 0 && !storage.EXAMPLE_KEY) {
        await page.evaluateOnNewDocument((data) => {
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value);
          }
          sessionStorage.setItem('jxidle_in', data.jxidle_slot || '0');
        }, storage);
        console.log(`[LOCALSTORAGE] Configured ${Object.keys(storage).length} keys for auto-injection.`);
      }
    }
  } catch (err) {
    console.error('[LOCALSTORAGE ERROR]', err.message);
  }
}

async function startBot() {
  try {
    botStatus.status = 'Khởi động Chrome...';
    console.log('[BOT] Launching Puppeteer browser with Mobile Viewport...');
    
    let execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.PUPPETEER_EXEC_PATH || null;
    if (execPath && !fs.existsSync(execPath)) {
      execPath = null;
    }

    browserInstance = await puppeteer.launch({
      headless: 'shell',
      executablePath: execPath || undefined,
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions'
      ]
    });

    botStatus.status = 'Mở trang Game...';
    pageInstance = await browserInstance.newPage();
    pageInstance.setDefaultTimeout(90000);
    pageInstance.setDefaultNavigationTimeout(90000);

    await pageInstance.setUserAgent(
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    );

    await pageInstance.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });

    await loadCookies(pageInstance);
    await loadLocalStorage(pageInstance);

    console.log(`[BOT] Navigating to game: ${GAME_URL}`);
    try {
      await pageInstance.goto(GAME_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
    } catch (navErr) {
      console.warn('[BOT NAV WARNING]', navErr.message, '- Retrying goto...');
      await pageInstance.goto(GAME_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
    }

    botStatus.status = 'Nạp Storage & Đăng nhập...';
    if (fs.existsSync(STORAGE_PATH)) {
      const storageData = fs.readFileSync(STORAGE_PATH, 'utf8');
      const storage = JSON.parse(storageData);
      if (storage && Object.keys(storage).length > 0 && !storage.EXAMPLE_KEY) {
        await pageInstance.evaluate((data) => {
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value);
          }
          sessionStorage.setItem('jxidle_in', data.jxidle_slot || '0');
        }, storage);
      }
    }

    setTimeout(() => {
      autoLoginIfNeeded(pageInstance);
    }, 2000);

    botStatus.status = 'Running';
    botStatus.lastCheck = new Date().toISOString();
    console.log('[BOT] Successfully loaded game page!');

    setInterval(async () => {
      try {
        if (pageInstance && !pageInstance.isClosed()) {
          await autoLoginIfNeeded(pageInstance);

          const title = await pageInstance.title();
          const mem = process.memoryUsage();
          const accStats = await getGameAccountStats(pageInstance);
          
          botStatus.lastCheck = new Date().toISOString();
          botStatus.status = 'Running';
          botStatus.memory = `${Math.round(mem.rss / 1024 / 1024)}MB`;
          if (accStats) botStatus.account = accStats;

          const accInfoStr = accStats ? `| NV: ${accStats.name} (${accStats.facName}) | Lv: ${accStats.lvl} | Ải: ${accStats.stage} | Vàng: ${accStats.gold.toLocaleString()}` : '';
          console.log(`[KEEP-ALIVE ${new Date().toLocaleTimeString()}] Page: "${title}" ${accInfoStr} | RAM: ${botStatus.memory}`);
        }
      } catch (err) {
        console.error('[KEEP-ALIVE ERROR]', err.message);
        botStatus.status = 'Error';
        botStatus.error = err.message;
      }
    }, 15 * 1000);

  } catch (error) {
    console.error('[BOT FATAL ERROR]', error.message);
    botStatus.status = 'Crashed';
    botStatus.error = error.message;
  }
}

// Bind Express server trên 0.0.0.0 để Fly.io Proxy kết nối thành công 100%
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Express server running instantly on 0.0.0.0:${PORT}`);
  setTimeout(() => {
    startBot();
  }, 3000);
});

process.on('SIGTERM', async () => {
  console.log('[SYSTEM] SIGTERM received. Closing browser...');
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});
