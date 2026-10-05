const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GAME_URL = 'https://volamidle.pages.dev/';
const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const STORAGE_PATH = path.join(__dirname, 'storage.json');

let browserInstance = null;
let pageInstance = null;
let botStatus = {
  status: 'Initializing',
  lastCheck: null,
  uptimeStarted: new Date().toISOString(),
  memory: null,
  error: null
};

// Health-check Endpoint - Trả về 200 OK ngay lập tức cho Render Health Check
app.get('/', (req, res) => {
  const mem = process.memoryUsage();
  botStatus.memory = `${Math.round(mem.rss / 1024 / 1024)}MB`;
  res.status(200).json({
    service: 'VolamIdle 24/7 Runner',
    botStatus: botStatus,
    timestamp: new Date().toISOString()
  });
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
  // Trì hoãn 5 giây để Render hoàn tất Health Check kiểm tra Server trước khi mở Chrome nặng
  setTimeout(() => {
    startBot();
  }, 5000);
});

process.on('SIGTERM', async () => {
  console.log('[SYSTEM] SIGTERM received. Closing browser...');
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});
