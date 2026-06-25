# SNS 자동화 봇 — Fly.io 배포용. 텔레그램 롱폴링 + puppeteer(PNG 카드 렌더).
FROM node:20-bookworm-slim

# Chromium 런타임 의존성 + 한글 폰트(카드 텍스트는 한국어) + 이모지 폰트
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-noto-cjk fonts-noto-color-emoji \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# puppeteer가 받는 Chromium을 이미지 레이어에 고정(런타임에서 같은 경로 사용)
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer
ENV IMAGE_RENDERER=puppeteer

# 의존성 설치(devDeps 포함 — tsc 빌드 필요). puppeteer postinstall이 Chromium 다운로드.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# 소스 복사 + 빌드
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

ENV NODE_ENV=production

# 상태/렌더 산출물 디렉터리(볼륨 마운트 지점). 없으면 앱이 생성하지만 미리 보장.
RUN mkdir -p /app/out

# 롱폴링 봇 — 인바운드 포트 불필요
CMD ["node", "dist/src/cli.js", "bot"]
