const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GAME_URL = 'https://volamidle.pages.dev/';
const COOKIES_PATH = path.join(__dirname, 'cookies.json');

let browserInstance = null;
let pageInstance = null;
let botStatus = {
  status: 'Initializing',
  lastCheck: null,
  uptimeStarted: new Date().toISOString(),
  error: null
};

// Health-check Endpoint cho Render và UptimeRobot
app.get('/', (req, res) => {
  res.json({
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
        // Puppeteer yêu cầu cookie domain / path chính xác
        const sanitizedCookies = cookies.map(c => {
          // Xóa bớt thuộc tính không tương thích với Puppeteer nếu có từ extension
          const { hostOnly, storeId, ...validCookie } = c;
          return validCookie;
        });

        await page.setCookie(...sanitizedCookies);
        console.log(`[COOKIE] Successfully injected ${sanitizedCookies.length} cookies.`);
      } else {
        console.log('[COOKIE] Warning: cookies.json appears to be empty or using placeholder values.');
      }
    } else {
      console.log('[COOKIE] Warning: cookies.json file not found. Proceeding without cookies.');
    }
  } catch (err) {
    console.error('[COOKIE ERROR] Failed to load/inject cookies:', err.message);
  }
}

async function startBot() {
  try {
    console.log('[BOT] Launching Puppeteer browser...');
    
    // Khởi tạo puppeteer với các flag tối ưu hóa bộ nhớ cho Docker / Render Linux container
    browserInstance = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXEC_PATH || null, // Hỗ trợ nếu dùng Chromium hệ thống trên Linux
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Giúp tiết kiệm RAM tối đa trong môi trường Free tier (512MB RAM)
        '--disable-extensions'
      ]
    });

    pageInstance = await browserInstance.newPage();

    // Giả lập User-Agent Desktop tiêu chuẩn
    await pageInstance.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Thiết lập Viewport chuẩn
    await pageInstance.setViewport({ width: 1280, height: 720 });

    // Inject Cookie trước khi truy cập trang web
    await loadCookies(pageInstance);

    console.log(`[BOT] Navigating to game: ${GAME_URL}`);
    await pageInstance.goto(GAME_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    botStatus.status = 'Running';
    botStatus.lastCheck = new Date().toISOString();
    console.log('[BOT] Successfully loaded game page!');

    // Vòng lặp keep-alive và log định kỳ (mỗi 3 phút)
    setInterval(async () => {
      try {
        if (pageInstance && !pageInstance.isClosed()) {
          const title = await pageInstance.title();
          botStatus.lastCheck = new Date().toISOString();
          botStatus.status = 'Running';
          console.log(`[KEEP-ALIVE ${new Date().toLocaleTimeString()}] Page title: "${title}" | Bot active.`);
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

// Lắng nghe cổng HTTP
app.listen(PORT, () => {
  console.log(`[SERVER] Express server running on port ${PORT}`);
  // Bắt đầu chạy Puppeteer bot
  startBot();
});

// Xử lý shutdown an toàn
process.on('SIGTERM', async () => {
  console.log('[SYSTEM] SIGTERM received. Closing browser...');
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});
