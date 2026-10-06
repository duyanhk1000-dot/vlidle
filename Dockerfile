FROM node:20-slim

# Cài đặt Chromium nhẹ dành riêng cho Linux/Debian
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3000

CMD ["node", "server.js"]
