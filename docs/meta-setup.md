# Meta 앱 · 인스타그램/스레드 실게시 셋업 체크리스트

> 목표: `.env`에 넣을 `IG_USER_ID` / `IG_TOKEN` / `THREADS_USER_ID` / `THREADS_TOKEN` + 이미지 공개 URL을 얻는다.
> 이걸 채우면 텔레그램 [게시] 탭이 **실제 게시(`published`)** 까지 자동으로 간다.
>
> 용어: **Meta 앱**은 프로그램이 아니라 developers.facebook.com에 양식으로 등록하는 **권한·토큰 그릇**이다(코드 배포 아님).
> 본인 계정에만 올리는 1인 봇이면 보통 **앱 심사(App Review) 없이** 개발 모드로 게시된다(아래 STEP 3 역할 추가가 그 조건).

---

## STEP 0. 사전 조건 (계정 측)

- [x] 인스타그램을 **비즈니스/크리에이터 계정**으로 전환 (이미 완료)
- [ ] **페이스북 페이지 1개** 보유 (없으면 STEP 1에서 생성)
- [ ] 그 페이지에 **인스타 계정 연결** (STEP 1에서 확인)

> 인스타 콘텐츠 게시 API는 "IG 비즈 계정 ↔ FB 페이지 연결"을 전제로 한다. 이 연결이 `IG_USER_ID`를 얻는 통로다.

---

## STEP 1. 페이스북 페이지 연결 확인/설정  ← 여기부터 시작

### 연결돼 있는지 확인 (셋 중 편한 것)
- [ ] **인스타 앱에서:** 프로필 → 설정 및 개인정보 → **비즈니스 도구 및 관리 센터** / "연결된 계정" 또는 "페이지" 항목에 페이스북 페이지가 보이는가
- [ ] **페이스북 페이지에서:** 페이지 → 설정 → **연결된 계정(Linked accounts) → Instagram** 에 인스타가 연결돼 있는가
- [ ] **Meta Business Suite(business.facebook.com):** 좌측 **설정 → 비즈니스 자산 → Instagram 계정** 에 인스타가 페이지와 함께 묶여 있는가

### 안 돼 있으면 연결
- [ ] 페이스북 페이지가 없으면: facebook.com → 페이지 → **새 페이지 만들기** (이름만 있으면 됨, 1분)
- [ ] 인스타 앱 → 설정 → **비즈니스 → 페이스북 페이지 연결** → 위 페이지 선택
- [ ] 연결 후 위 "확인" 다시 체크

> ✅ 체크포인트: **FB 페이지에 IG 비즈 계정이 연결됨** 이 확인되면 STEP 2로.

---

## STEP 2. Meta 개발자 앱 생성

- [ ] https://developers.facebook.com 접속 → 우상단 로그인(페북 계정)
- [ ] 처음이면 **개발자 등록**(전화/이메일 인증, 무료)
- [ ] 상단 **My Apps → Create App**
- [ ] Use case(용도) 선택: **"Other" → 앱 유형 "Business"** (또는 바로 Business 유형)
- [ ] 앱 이름 입력(예: `sns-auto-adhd`) → 생성
- [ ] 생성되면 좌측 **App settings → Basic** 에서 **App ID / App Secret** 확인 (메모; Secret은 비공개)

---

## STEP 3. 본인 계정을 앱에 역할로 추가 (앱 심사 우회의 핵심)

- [ ] 앱 대시보드 → **App roles → Roles** (또는 Roles → Roles)
- [ ] 본인 페이스북 계정이 **Administrator**로 있는지 확인(보통 생성자 자동)
- [ ] (테스터가 필요하면) **Add People → Tester** 로 본인 추가 → 본인 계정에서 초대 수락
- [ ] 앱 상태는 **개발(Development) 모드**로 둔다(상단 토글). 본인 계정 게시는 이 모드로 충분

> 이 역할 부여 덕에 `instagram_content_publish` 같은 권한을 **공개 앱 심사 없이** 본인 계정에 쓸 수 있다.

---

## STEP 4. Instagram 제품 추가 + 토큰/유저ID 발급

- [ ] 앱 대시보드 → **Add Product** → **Instagram** (또는 "Instagram Graph API") 추가
- [ ] 좌측 도구 → **Graph API Explorer** 열기 (developers.facebook.com/tools/explorer)
- [ ] 우측 상단에서 본인 **앱 선택**
- [ ] **User or Page → Get User Access Token**
- [ ] 권한(Permissions) 체크 후 토큰 생성:
  - [ ] `instagram_basic`
  - [ ] `instagram_content_publish`
  - [ ] `pages_show_list`
  - [ ] `pages_read_engagement`
  - [ ] `business_management`
- [ ] 생성된 **단기 토큰** 복사
- [ ] **IG_USER_ID 얻기** — Explorer에서 아래 순서로 호출:
  - [ ] `GET /me/accounts` → 결과에서 본인 **페이지 id** 확인
  - [ ] `GET /{page-id}?fields=instagram_business_account` → 결과의 `instagram_business_account.id` = **IG_USER_ID**
- [ ] **장기 토큰(60일)으로 교환** — 브라우저 주소창에:
  ```
  https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<App ID>&client_secret=<App Secret>&fb_exchange_token=<단기 토큰>
  ```
  → 응답의 `access_token` = **IG_TOKEN**(장기)

> ⚠️ 장기 토큰도 **약 60일**이면 만료된다. 갱신 코드는 원하면 추가 가능(자동 리프레시).

---

## STEP 5. Threads 제품 추가 + 토큰/유저ID 발급

- [ ] 앱 대시보드 → **Add Product** → **Threads API**(Threads 용도) 추가
- [ ] Threads → **Use case / Settings** 에서 권한 설정:
  - [ ] `threads_basic`
  - [ ] `threads_content_publish`
- [ ] Threads 토큰 생성(대시보드의 토큰 생성기 또는 Threads OAuth) → **THREADS_TOKEN**
- [ ] `GET https://graph.threads.net/v1.0/me?fields=id&access_token=<THREADS_TOKEN>` → `id` = **THREADS_USER_ID**

> Threads는 인스타와 별개 토큰 체계다(graph.threads.net). 앱은 같은 걸 써도 되고 분리해도 된다.

---

## STEP 6. 이미지 공개 호스팅 (인스타 게시에 필수)

인스타 API는 이미지 바이너리 업로드를 안 받고 **공개 HTTPS URL(`image_url`)만** 받는다. 렌더한 PNG를 올릴 공개 버킷이 필요하다.

- [ ] **Cloudflare R2**(권장, 송신 무료) 또는 AWS S3 / Supabase Storage 중 택1
- [ ] 버킷을 **공개 읽기**로 설정(또는 공개 커스텀 도메인 연결)
- [ ] 쓰기용 토큰/키 발급
- [ ] PNG 렌더 켜기: `npm i puppeteer` (Chromium 다운로드)

`.env`:
```
IMAGE_RENDERER=puppeteer
IMAGE_UPLOAD_BASE=https://<버킷-업로드-엔드포인트>
IMAGE_PUBLIC_BASE=https://<버킷-공개-URL>
IMAGE_UPLOAD_TOKEN=<R2/S3 토큰>
```

> 스레드(텍스트)는 이미지 호스팅 없이도 게시된다. 호스팅은 **인스타 카드**에만 필요.

---

## STEP 7. `.env` 채우고 검증

- [ ] `.env`에 추가(채팅/코드에 붙이지 말 것):
  ```
  IG_USER_ID=178414...
  IG_TOKEN=EAAG...(장기)
  THREADS_USER_ID=...
  THREADS_TOKEN=...
  ```
- [ ] 빌드: `npm run build`
- [ ] 봇 켜기: `node dist/src/cli.js bot &`
- [ ] 미리보기 발송: `node dist/src/cli.js preview 2026-06-01 2026-06-01`
- [ ] 텔레그램에서 **스레드 항목 [게시]** 탭 → 상태가 `published` + 실제 스레드에 글이 올라오는지 확인(이미지 호스팅 없어도 됨)
- [ ] 이미지 호스팅까지 됐으면 **IG 카드 [게시]** 탭 → 인스타에 카드 게시 확인

> 코드는 토큰이 다 있으면 자동으로 `DryRunPublisher` → `GraphApiPublisher`로 전환된다(`makePublisher`).
> 토큰이 일부만 있으면 dry-run으로 남는다(4개 모두 필요).

---

## 자주 막히는 곳 (Gotchas)

- **24시간 25건** — 인스타 게시 한도. 우리 발행량(주 3회)은 한참 여유.
- **이미지 규격** — JPEG/PNG, 공개 URL, 정사각 1080×1080 OK. SVG는 인스타 불가 → 반드시 Puppeteer PNG.
- **토큰 만료** — IG 장기 토큰 60일. 만료되면 게시 실패 → 재발급 또는 자동 갱신 코드 필요.
- **권한 누락** — 게시 시 권한 오류면 STEP 4/5의 권한 체크 누락. Explorer에서 토큰 다시 발급.
- **개발 모드 한계** — 본인(역할 보유) 계정만 게시 가능. 타인 계정/공개 서비스로 확장하려면 그때 앱 심사·비즈니스 인증 필요.

---

## 막히면

각 STEP에서 받은 값(또는 에러 메시지)을 알려주면 거기 맞춰 도와줄 수 있다.
- 토큰 자동 갱신(60일) 코드, IG_USER_ID 조회 스크립트, 게시 에러 디버깅 등 추가 구현 가능.
