# Report Finder

사내 보고서(PDF·Word·txt)를 업로드하면 그 **내용에만 근거해** 질문에 답하고 **출처**를 함께 보여주는 개인용 RAG 챗봇. 로컬 우선으로 동작한다.

> 상세 기획은 [PRD.md](PRD.md), 설계는 [DESIGN.md](DESIGN.md) 참조.

## 주요 기능

- **보고서 업로드 & 저장** — PDF·Word·txt (파일당 20MB, 문서 50개·총 200MB), 문단 단위로 나눠 임베딩 저장
- **질문답변 (RAG)** — 보고서 근거로만 답변, 근거 없으면 "보고서에서 찾을 수 없습니다", 한국어 3~5문장 + 출처
- **보고서 요약** — 요청 시 해당 보고서를 핵심 3~5문장으로 요약 + 출처
- **목록·삭제**, 답변 복사, 출처 클릭 시 원문 보기, 접근 비밀번호(선택)

## 기술 스택

화면 HTML·JavaScript · 서버 Node.js(`server.js`) · AI OpenAI(임베딩 `text-embedding-3-small` + GPT) · 저장 Supabase(pgvector)

## 실행 방법

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 설정 — .env.example을 복사해 .env를 만들고 값 채우기
#    OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY
#    (배포 시) ACCESS_PASSWORD

# 3) Supabase 준비 — 대시보드 SQL Editor에서 아래를 1회 실행
#    sql/reset-and-setup.sql, sql/fix-permissions.sql, sql/fix-search-index.sql

# 4) 실행 → http://localhost:3000
npm start
```

## 보안

- 대외비일 수 있는 사내 문서를 다룬다 — **외부 공유 금지**, 로컬 실행이 기본
- API 키·비밀번호는 `.env`(환경변수)로 관리하며 저장소에 커밋하지 않는다 (`.gitignore` 등록됨)
- 인터넷 배포 시 `ACCESS_PASSWORD`를 반드시 설정해 접근을 제한한다 — [DEPLOY.md](DEPLOY.md) 참조
