FROM node:20-slim

# Cài đặt thư viện hệ thống cần thiết cho Chrome
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    ca-certificates \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# Cài đặt npm dependencies và tải chuẩn Chrome Headless chính thức từ Puppeteer
RUN npm install && npx puppeteer browsers install chrome

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
