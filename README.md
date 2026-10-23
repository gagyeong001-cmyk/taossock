# 타오쏙 — 타오바오 이미지 번역 웹앱

스마트폰에서 타오바오 스크린샷을 골라 한국어로 번역하는 **모바일 우선 PWA**입니다.

## 먼저 사용하기 (무료 기본 번역)

1. 이 폴더의 전체 파일을 새로운 GitHub 공개 저장소(예: `taossok`)에 올립니다.
2. **Settings → Pages → Build and deployment → Deploy from a branch** → `main` / `/ (root)` 선택 후 저장합니다.
3. 안내된 `https://사용자명.github.io/taossok/`에 접속합니다.
4. 휴대폰 크롬의 메뉴에서 **홈 화면에 추가** 또는 **앱 설치**를 선택합니다.
5. **이미지 선택 → 무료 기본 번역 → 한국어로 해석하기**를 누릅니다.

별도의 API 키 없이 동작합니다. [Tesseract.js](https://tesseract.projectnaptha.com/)가 브라우저에서 중국어 글자를 인식하고, 인식된 문장을 [MyMemory](https://mymemory.translated.net/doc/spec.php) 공개 번역 API에 보냅니다. 첫 사용에는 중국어 인식 파일 다운로드가 필요하며, 외부 서비스의 일일 사용량 제한과 연결 오류, 오역이 있을 수 있습니다. 무료 모드에서 **이미지 자체는 번역 서버에 보내지 않고, 인식된 글자만 전송**합니다. CDN에서 OCR 코드와 언어 데이터를 가져옵니다.

## AI 맥락 해석 (선택, 직접 서버 연결)

기본 번역보다 타오바오 구매 조건과 옵션을 정확히 이해하고 싶다면 Cloudflare Worker를 별도로 배포할 수 있습니다.

1. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 Gemini API 키를 발급받습니다. 서비스 제공 조건에 따라 무료 이용량과 과금이 달라질 수 있습니다.
2. [Cloudflare Workers](https://developers.cloudflare.com/workers/get-started/guide/)에서 새 Worker를 만들고 `worker/index.js` 코드를 올립니다. CLI 사용 시 `worker` 폴더에서 `npx wrangler deploy` 실행합니다.
3. Worker **Settings → Variables and Secrets**에 `GEMINI_API_KEY` (Secret)와 `APP_PIN` (Secret, 긴 임의 암호)를 추가합니다. 절대로 저장소 파일에 키를 적지 마세요.
4. Worker `ALLOWED_ORIGIN`은 GitHub Pages **원본 주소** (예: `https://사용자명.github.io`)로 설정할 수 있습니다. Cloudflare Worker 설정에 일반 변수를 추가하거나 `worker/wrangler.toml`의 `[vars]`에 추가하세요. 브라우저의 Origin은 경로(`/taossok`)를 포함하지 않습니다. Origin 제한만으로는 봇 호출을 막을 수 없어서 `APP_PIN`도 설정해야 합니다.
5. 앱에서 **AI 맥락 해석** 선택 → Worker의 `https://...workers.dev` 주소와 개인 암호 입력 → 해석합니다. 서버 주소만 브라우저에 기억하고, 암호와 Gemini 키는 앱의 영구 저장소에 남기지 않습니다.

**보안:** Gemini API 키는 클라이언트에 노출시키지 않고 Worker 비밀 변수에 보관합니다. 개인용으로만 사용하세요. 공개로 배포할 경우 Cloudflare 사용량 제한, IP별 요청 제한, 로그 및 과금 알림도 별도로 적용해야 합니다. 앱을 공개 GitHub Pages에 올렸다는 사실만으로 비공개 서버 인증이 보장되지는 않습니다.

## 파일 구조

- `index.html` — 업로드 화면
- `styles.css` — 모바일 UI
- `app.js` — 이미지 업로드, OCR, 무료 번역, AI 서버 호출
- `manifest.webmanifest` + `sw.js` — 홈 화면 설치 기능 (앱 셸만 캐시)
- `assets/` — 앱 아이콘
- `worker/index.js` + `worker/wrangler.toml` — 선택 AI 번역 백엔드

## 제약 사항

- 실시간 타오바오 페이지를 읽는 앱이 아니라 **업로드한 스크린샷**을 해석합니다.
- 기본 번역은 이미지 위에 번역문을 입히지 않습니다. 원문 및 해석문을 따로 보여줍니다.
- 한 번에 최대 3장, 장당 16MB, 무료 번역 요청은 이미지당 최대 45개 세그먼트입니다.
- 가격, 수량, 사이즈, 배송 기한 및 환불 문구는 결제 전 원본을 확인해야 합니다.
- 기본 번역은 MyMemory 공개 서비스의 네트워크/CORS 정책과 사용량 제한에 영향을 받습니다.
- PWA의 앱 셸은 캐시되지만 OCR 언어 다운로드와 번역에는 인터넷이 필요합니다.