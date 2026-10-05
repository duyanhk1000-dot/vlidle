# Dự Án Duy Trì Web Game VoLamIdle 24/7 Trên Render.com

Dự án này giúp chạy Puppeteer headless browser tự động inject cookie để duy trì game [volamidle.pages.dev](https://volamidle.pages.dev/) 24/7 trên môi trường Render Free Tier.

## 1. Cấu hình Cookie
1. Truy cập game trên trình duyệt local (nơi bạn đã đăng nhập thành công).
2. Mở tiện ích **Cookie-Editor**, bấm **Export** -> **JSON**.
3. Mở file [cookies.json](file:///d:/Lap%20trinh%20game/vlidle/cookies.json) trong dự án này và dán toàn bộ nội dung JSON vừa export vào.

## 2. Cấu hình Deploy lên Render.com (Web Service - Free Tier)

### Cấu hình chính:
- **Environment**: `Node`
- **Build Command**: 
  ```bash
  npm install && npx puppeteer browsers install chrome
  ```
- **Start Command**: 
  ```bash
  node server.js
  ```

### Biến môi trường (Environment Variables) trên Render:
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` = `false`

---

## 3. Chống Sleep (Giữ Bot 24/7)
Do dịch vụ Free của Render sẽ tự "sleep" sau 15 phút không nhận được lưu lượng HTTP:
1. Đăng ký dịch vụ miễn phí tại [UptimeRobot.com](https://uptimerobot.com/) hoặc [Cron-Job.org](https://cron-job.org/).
2. Tạo một HTTP Monitor kiểm tra endpoint URL của bạn (Ví dụ: `https://your-app-name.onrender.com/`).
3. Đặt tần suất ping: **Mỗi 5 đến 10 phút**.
