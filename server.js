const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GAME_URL = 'https://volamidle.pages.dev/';
const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const STORAGE_PATH = path.join(__dirname, 'storage.json');

app.use(express.json());

let browserInstance = null;
let pageInstance = null;
let botStatus = {
  status: 'Initializing',
  lastCheck: null,
  uptimeStarted: new Date().toISOString(),
  memory: null,
  error: null
};

// API Endpoint trả về thông tin trạng thái Bot
app.get('/api/status', (req, res) => {
  const mem = process.memoryUsage();
  botStatus.memory = `${Math.round(mem.rss / 1024 / 1024)}MB`;
  res.json({
    service: 'VolamIdle 24/7 Runner & Remote Control',
    botStatus: botStatus,
    timestamp: new Date().toISOString()
  });
});

// API Chụp ảnh màn hình trực tiếp
app.get('/api/screenshot', async (req, res) => {
  try {
    if (pageInstance && !pageInstance.isClosed()) {
      const screenshot = await pageInstance.screenshot({ type: 'png' });
      res.contentType('image/png');
      return res.send(screenshot);
    }
    res.status(503).send('Browser page not initialized yet.');
  } catch (err) {
    res.status(500).send('Error capturing screenshot: ' + err.message);
  }
});

// API Điều khiển: Nhấp chuột vào tọa độ (x, y) trên game
app.post('/api/click', async (req, res) => {
  try {
    const { x, y } = req.body;
    if (pageInstance && !pageInstance.isClosed()) {
      await pageInstance.mouse.click(Number(x), Number(y));
      console.log(`[REMOTE CONTROL] Clicked at (${x}, ${y})`);
      return res.json({ success: true, x, y });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Điều khiển: Gửi phím bấm (Space, Enter, Esc, 1, 2, 3...)
app.post('/api/key', async (req, res) => {
  try {
    const { key } = req.body;
    if (pageInstance && !pageInstance.isClosed()) {
      await pageInstance.keyboard.press(key);
      console.log(`[REMOTE CONTROL] Pressed key: ${key}`);
      return res.json({ success: true, key });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API Điều khiển: Load lại trang game
app.post('/api/reload', async (req, res) => {
  try {
    if (pageInstance && !pageInstance.isClosed()) {
      console.log('[REMOTE CONTROL] Reloading game page...');
      await pageInstance.reload({ waitUntil: 'domcontentloaded' });
      return res.json({ success: true });
    }
    res.status(503).json({ error: 'Page not ready' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Giao diện Web Remote Control chuyên nghiệp
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>VolamIdle 24/7 Remote Control</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 15px; }
        .container { max-width: 1100px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 1px solid #334155; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
        h1 { font-size: 1.3rem; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
        .badge { background: #22c55e; color: #000; font-weight: bold; padding: 4px 10px; borderRadius: 20px; font-size: 0.8rem; }
        .screen-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 15px; text-align: center; }
        .img-container { position: relative; display: inline-block; width: 100%; max-width: 1280px; margin-top: 10px; background: #000; border-radius: 8px; overflow: hidden; cursor: crosshair; }
        .img-container img { width: 100%; height: auto; display: block; }
        .controls { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; justify-content: center; }
        button { background: #2563eb; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
        button:hover { background: #1d4ed8; transform: translateY(-1px); }
        button.danger { background: #dc2626; }
        button.danger:hover { background: #b91c1c; }
        button.secondary { background: #475569; }
        button.secondary:hover { background: #334155; }
        .hint { color: #94a3b8; font-size: 0.85rem; margin-top: 8px; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 15px; }
        .stat-card { background: #1e293b; padding: 12px; border-radius: 8px; border: 1px solid #334155; font-size: 0.9rem; }
        .stat-title { color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>🎮 Võ Lâm Idle 24/7 Remote Control</h1>
          <span class="badge" id="botStatusBadge">Running</span>
        </header>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-title">RAM Sử Dụng</div>
            <div id="statMemory" style="font-weight: bold; font-size: 1.1rem; color: #a7f3d0;">-- MB</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Lần Kiểm Tra Cuối</div>
            <div id="statLastCheck" style="font-size: 0.85rem; color: #cbd5e1;">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Chế độ Tự Động Refresh</div>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
              <input type="checkbox" id="autoRefresh" checked> <label for="autoRefresh" style="font-size: 0.85rem;">Mỗi 5 giây</label>
            </div>
          </div>
        </div>

        <div class="screen-card">
          <div class="hint">👉 <b>Click thẳng vào ảnh</b> bên dưới để nhấp chuột điều khiển nhân vật/game thực tế!</div>
          <div class="img-container" onclick="handleClick(event)">
            <img id="gameScreen" src="/api/screenshot" alt="Game Screen Live">
          </div>
          <div class="controls">
            <button onclick="refreshScreen()">🔄 Làm mới ảnh</button>
            <button class="secondary" onclick="sendKey('Space')">⌨️ Phím Space</button>
            <button class="secondary" onclick="sendKey('Enter')">⌨️ Phím Enter</button>
            <button class="secondary" onclick="sendKey('Escape')">⌨️ Phím Esc</button>
            <button class="danger" onclick="reloadGame()">🔁 Reload Game</button>
          </div>
        </div>
      </div>

      <script>
        const gameImg = document.getElementById('gameScreen');

        function refreshScreen() {
          gameImg.src = '/api/screenshot?t=' + Date.now();
          updateStatus();
        }

        async function updateStatus() {
          try {
            const res = await fetch('/api/status');
            const data = await res.json();
            document.getElementById('statMemory').innerText = data.botStatus.memory || '40MB';
            document.getElementById('statLastCheck').innerText = new Date(data.botStatus.lastCheck).toLocaleTimeString();
          } catch(e){}
        }

        async function handleClick(e) {
          const rect = gameImg.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          // Scale vị trí click về viewport chuẩn 1280x720 của Puppeteer
          const scaledX = Math.round((clickX / rect.width) * 1280);
          const scaledY = Math.round((clickY / rect.height) * 720);

          try {
            await fetch('/api/click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: scaledX, y: scaledY })
            });
            setTimeout(refreshScreen, 600);
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
          setTimeout(refreshScreen, 600);
        }

        async function reloadGame() {
          if (confirm('Bạn có chắc chắn muốn load lại trang game?')) {
            await fetch('/api/reload', { method: 'POST' });
            setTimeout(refreshScreen, 2000);
          }
        }

        setInterval(() => {
          if (document.getElementById('autoRefresh').checked) {
            refreshScreen();
          }
        }, 5000);

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
    console.log('[BOT] Launching Puppeteer browser...');
    
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.PUPPETEER_EXEC_PATH || null;

    browserInstance = await puppeteer.launch({
      headless: 'new',
      executablePath: execPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--js-flags=--max-old-space-size=256'
      ]
    });

    pageInstance = await browserInstance.newPage();

    await pageInstance.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await pageInstance.setViewport({ width: 1280, height: 720 });

    await loadCookies(pageInstance);
    await loadLocalStorage(pageInstance);

    console.log(`[BOT] Navigating to game: ${GAME_URL}`);
    await pageInstance.goto(GAME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

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

    botStatus.status = 'Running';
    botStatus.lastCheck = new Date().toISOString();
    console.log('[BOT] Successfully loaded game page!');

    setInterval(async () => {
      try {
        if (pageInstance && !pageInstance.isClosed()) {
          const title = await pageInstance.title();
          const mem = process.memoryUsage();
          botStatus.lastCheck = new Date().toISOString();
          botStatus.status = 'Running';
          botStatus.memory = `${Math.round(mem.rss / 1024 / 1024)}MB`;
          console.log(`[KEEP-ALIVE ${new Date().toLocaleTimeString()}] Page title: "${title}" | RAM: ${botStatus.memory} | Active.`);
        }
      } catch (err) {
        console.error('[KEEP-ALIVE ERROR]', err.message);
        botStatus.status = 'Error';
        botStatus.error = err.message;
      }
    }, 3 * 60 * 1000);

  } catch (error) {
    console.error('[BOT FATAL ERROR]', error.message);
    botStatus.status = 'Crashed';
    botStatus.error = error.message;
  }
}

app.listen(PORT, () => {
  console.log(`[SERVER] Express server running instantly on port ${PORT}`);
  setTimeout(() => {
    startBot();
  }, 5000);
});

process.on('SIGTERM', async () => {
  console.log('[SYSTEM] SIGTERM received. Closing browser...');
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});
