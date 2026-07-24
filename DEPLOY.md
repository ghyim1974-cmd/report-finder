# DEPLOY.md — 배포 안내 (나중에 공개 배포할 때)

> 상태: 2026-07-24 기준 **로컬 사용 중, 공개 배포 보류.**
> 로컬 git 저장소는 준비 완료(최초 커밋 있음, `.env` 제외 확인). 인터넷엔 아무것도 올라가 있지 않음.

## ⚠️ 배포 전 필수 (안 하면 대외비 노출)

1. **접근 비밀번호 설정** — `.env`의 `ACCESS_PASSWORD`에 값을 넣어야 로그인 관문이 켜진다.
   비어 있으면 인터넷의 누구나 보고서 열람·삭제·질문(=OpenAI 요금)이 가능하다.
2. **⚠️ 코드 적응 필요** — 현재 `server.js`는 포트를 여는 상시 실행 서버라 **Vercel 서버리스에서 그대로 동작하지 않는다.** 배포하려면 서버리스 핸들러로 바꾸는 작업이 먼저 필요하다. (Claude에게 "Vercel용으로 코드 적응해줘"라고 요청)

## 안전 점검 (완료됨)

- ✅ `.gitignore`에 `.env` 등록 → 비밀 키는 저장소에 올라가지 않음
- ✅ 저장소 추적 파일에 `.env` 없음 (확인함). 코드에 하드코딩된 키 없음(모두 `process.env`)
- ℹ️ 이 PC에 GitHub CLI(`gh`) 미설치 → 저장소 생성은 웹 또는 `gh` 설치 후 진행

## GitHub에 올리기 (회원님 계정 필요)

```bash
# 1) GitHub에서 새 저장소 생성 (웹: github.com/new) — 대외비 코드이면 Private 권장
# 2) 로컬 저장소를 원격에 연결하고 push
cd my-app
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git branch -M main
git push -u origin main
```
> 로그인 창이 뜨면 회원님 GitHub 계정으로 인증 (Claude는 계정 로그인을 대신하지 않음).

## Vercel 배포 (회원님 계정 + 키 직접 등록)

```bash
vercel login      # 회원님 Vercel 계정으로 로그인
vercel            # 프로젝트 배포 (안내 따라 진행)
```

**환경변수 등록 — 반드시 회원님이 직접** (Claude는 비밀 키를 대신 입력하지 않음):
Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에 아래를 추가한 뒤 재배포.

| 이름 | 값 |
|---|---|
| `OPENAI_API_KEY` | 본인 OpenAI 키 |
| `SUPABASE_URL` | 본인 Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_KEY` | 본인 Supabase service_role 키 |
| `ACCESS_PASSWORD` | **정한 접근 비밀번호 (비우지 말 것)** |

## 배포 후 확인

- 접속 → 로그인 화면이 뜨고, 비밀번호를 넣어야 들어가지는지 (관문 작동 확인)
- 비밀번호 없이 `/api/documents` 호출 시 401이 나오는지
