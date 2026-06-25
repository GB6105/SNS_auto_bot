# Fly.io 배포 — 맥북 없이 24시간 봇 운영

목표: 텔레그램 봇(`/ig`·`/threads`·승인·저장)을 **맥북과 무관하게** 클라우드에서 상시 운영.
로컬 Docker 불필요 — Fly가 **원격 빌더**로 이미지를 빌드한다. `flyctl`만 있으면 된다.

> 이미 준비됨(레포에 포함): `Dockerfile`(Chromium+한글 폰트), `fly.toml`, `.dockerignore`.

---

## 0. flyctl 설치 + 로그인 (1회)

```bash
brew install flyctl          # 또는: curl -L https://fly.io/install.sh | sh
fly auth signup              # 처음이면 가입(카드 등록 필요 — 소액, 무료 한도 내 $0)
# 이미 계정 있으면: fly auth login
```

> Fly는 신용카드 등록을 요구하지만, 이 작은 봇(1대·1GB)은 보통 무료 한도 안에서 돈다.

---

## 1. 앱 생성

레포 루트(`sns_auto/`)에서:

```bash
fly apps create sns-auto-bot      # 이름이 이미 쓰이면 다른 이름으로
```

이름을 바꿨다면 `fly.toml`의 `app = "..."` 도 같은 이름으로 수정.

---

## 2. 상태 볼륨 생성 (승인 상태·렌더 PNG 영속화)

```bash
fly volumes create snsdata --region nrt --size 1 --app sns-auto-bot
```

`fly.toml`이 이 볼륨을 `/app/out`에 마운트한다 → 재시작해도 승인 대기 상태가 유지됨.

---

## 3. 시크릿 설정 (⚠️ 채팅·코드에 붙이지 말 것)

**본인 터미널에서 직접** 실행(값은 본인 `.env`에서 복사):

```bash
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  TELEGRAM_BOT_TOKEN=123456:ABC... \
  TELEGRAM_CHAT_ID=12345678 \
  CLAUDE_MODEL=claude-sonnet-4-6 \
  --app sns-auto-bot
```

> 시크릿은 Fly에 암호화 저장되며, 컨테이너에서 환경변수로 주입된다(`.env` 파일은 올리지 않음 — `.dockerignore`로 제외).
> `IMAGE_RENDERER=puppeteer`는 Dockerfile에 이미 박혀 있어 따로 안 넣어도 됨.

### (선택) 인스타/스레드 실게시까지 하려면
토큰 발급 후(`docs/meta-setup.md`) 추가:
```bash
fly secrets set IG_USER_ID=... IG_TOKEN=... THREADS_USER_ID=... THREADS_TOKEN=... --app sns-auto-bot
# 인스타 카드 게시는 공개 이미지 호스팅도 필요:
fly secrets set IMAGE_RENDERER=puppeteer IMAGE_UPLOAD_BASE=... IMAGE_PUBLIC_BASE=... IMAGE_UPLOAD_TOKEN=... --app sns-auto-bot
```
(스레드 텍스트 게시는 이미지 호스팅 없이 가능)

---

## 4. 배포

```bash
fly deploy --app sns-auto-bot
```

원격 빌더가 Dockerfile을 빌드(Chromium 다운로드 포함 — 첫 빌드 5~10분) 후 머신 1대를 띄운다.

---

## 5. 확인

```bash
fly logs --app sns-auto-bot
```
로그에 `[bot] @sns_manger_bot 폴링 시작` 이 보이면 성공.

텔레그램에서:
- `/ig 팁` → 카드 생성·미리보기 도착
- `/threads 질문` → 스레드 생성
- 미리보기에서 **💾 저장** → 사진 앨범

이제 **맥북을 꺼도** 봇이 계속 동작한다.

---

## 운영 명령

```bash
fly status --app sns-auto-bot          # 머신 상태
fly logs --app sns-auto-bot            # 실시간 로그
fly secrets list --app sns-auto-bot    # 시크릿 키 목록(값은 안 보임)
fly deploy --app sns-auto-bot          # 코드 수정 후 재배포
fly scale memory 2048 --app sns-auto-bot   # 메모리 부족 시 2GB로
fly machine restart <id> --app sns-auto-bot
```

### ⚠️ 중요 — 로컬 봇과 동시 실행 금지
**텔레그램 봇 토큰 하나로 폴링은 한 곳에서만** 가능하다. Fly에 배포했으면
**맥북의 `node ... bot` 은 꺼야** 한다(둘 다 켜면 `getUpdates` 충돌 — 409 Conflict).

---

## 비용 메모
- shared-cpu-1x / 1GB 머신 1대 + 볼륨 1GB.
- Fly 무료 사용량(소형 머신·소량 볼륨) 한도 안에서 보통 $0~소액.
- Chromium 때문에 이미지가 크지만(≈1GB+) 빌드는 Fly 쪽에서 처리.

## 막히면
- 빌드 실패: `fly logs`에서 에러 확인. 폰트/라이브러리 누락이면 Dockerfile `apt-get` 줄에 추가.
- 메모리 부족(OOM, 카드 렌더 중 죽음): `fly scale memory 2048`.
- 한글이 □로 보이면: 폰트(`fonts-noto-cjk`) 설치 확인 — 이미 Dockerfile에 포함.
