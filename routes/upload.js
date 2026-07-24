// routes/upload.js — 파일 업로드 라우트 (PLAN 4·5번 / DESIGN 5장 POST /api/upload)
// 처리 순서: 검증(형식→용량→저장 한도) → 텍스트 추출(글자 없으면 거절)
// 다음 작업(6번)에서 추출된 조각의 임베딩·Supabase 저장을 연결한다.
'use strict';

const path = require('path');

const { extractText, NoTextError } = require('../lib/extract'); // 텍스트 추출 (PLAN 5번)
const { embedTexts } = require('../lib/openai');                 // 임베딩 (PLAN 6번)
const db = require('../lib/db');                                 // Supabase 저장 (PLAN 6번)

// ===== 검증 규칙 (PRD 5장 must 규칙 — 임의로 완화 금지) =====
const ALLOWED_EXT = { '.pdf': 'pdf', '.docx': 'word', '.txt': 'txt' }; // 허용 확장자 → 파일 종류
const MAX_FILE_BYTES = 20 * 1024 * 1024;    // 파일 1개당 최대 20MB
const MAX_DOC_COUNT = 50;                   // 문서 최대 50개
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;  // 총 저장 한도 200MB

// 거절 안내 문구 (PRD 9장 / DESIGN 7장 — 문구 고정)
const MSG_REJECT = '지원하지 않는 형식이거나 용량을 초과했습니다';

// JSON 응답 도우미
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// 현재 저장 사용량(문서 수·총 용량) — Supabase documents 집계 (PLAN 6번에서 실제 연결됨)
async function getUsage() {
  return db.getUsage();
}

// POST /api/upload 처리
async function handleUpload(req, res) {
  // 1) 파일 이름 확인 (화면에서 x-file-name 헤더로 보낸다)
  const rawName = req.headers['x-file-name'];
  if (!rawName) {
    return sendJson(res, 400, { error: { message: '파일 이름이 전달되지 않았습니다' } });
  }
  let name;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    // 잘못 인코딩된 파일명 헤더 방어
    return sendJson(res, 400, { error: { message: '파일 이름을 읽을 수 없습니다' } });
  }
  // 지나치게 긴 파일명 거절 (CHECK.md P1)
  if (name.length > 200) {
    return sendJson(res, 400, { error: { message: '파일 이름이 너무 깁니다 (200자 이내)' } });
  }

  // 2) 형식 검증 — PDF·Word(.docx)·txt 3가지만 허용
  const ext = path.extname(name).toLowerCase();
  const fileType = ALLOWED_EXT[ext];
  if (!fileType) {
    return sendJson(res, 400, { error: { message: `${MSG_REJECT} (PDF·Word(.docx)·txt만 가능)` } });
  }

  // 3) 용량 사전 검증 — 요청 헤더의 크기부터 확인해 큰 파일은 일찍 거절
  const declaredBytes = parseInt(req.headers['content-length'] || '0', 10);
  if (declaredBytes > MAX_FILE_BYTES) {
    return sendJson(res, 400, { error: { message: `${MSG_REJECT} (파일당 20MB 이하)` } });
  }

  // 4) 저장 한도 검증 — 문서 50개 / 총 200MB (Supabase 집계 기준)
  let usage;
  try {
    usage = await getUsage();
  } catch (err) {
    // 저장소 설정·연결 문제는 여기서 일찍 알림 (임베딩 비용을 쓰기 전에)
    const msg = err.code === 'CONFIG' ? err.message : '저장소(Supabase) 연결에 실패했습니다. .env 설정과 테이블 준비(sql/supabase-setup.sql)를 확인해 주세요';
    return sendJson(res, 503, { error: { message: msg } });
  }
  if (usage.count >= MAX_DOC_COUNT || usage.totalBytes + declaredBytes > MAX_TOTAL_BYTES) {
    return sendJson(res, 400, { error: { message: `${MSG_REJECT} (저장 한도: 문서 50개·총 200MB)` } });
  }

  // 5) 본문 수신 — 실제 받은 바이트 수도 세면서 20MB를 넘는 순간 중단
  const chunks = [];
  let received = 0;
  req.on('data', (chunk) => {
    received += chunk.length;
    if (received > MAX_FILE_BYTES) {
      sendJson(res, 400, { error: { message: `${MSG_REJECT} (파일당 20MB 이하)` } });
      req.destroy(); // 더 받지 않고 연결 종료
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    if (res.writableEnded) return; // 이미 거절 응답을 보낸 경우
    if (received === 0) {
      return sendJson(res, 400, { error: { message: '빈 파일은 업로드할 수 없습니다' } });
    }

    // 텍스트 추출 (PLAN 5번) — 글자 없는 문서(스캔·사진 PDF)는 여기서 거절
    let units;
    try {
      const buffer = Buffer.concat(chunks);
      units = await extractText(buffer, fileType);
    } catch (err) {
      if (err instanceof NoTextError) {
        // PRD 9장 고정 문구: 글자 없는 문서는 저장하지 않는다
        return sendJson(res, 400, { error: { message: '문서에서 텍스트를 읽을 수 없습니다' } });
      }
      // 깨진 파일 등 그 외 추출 실패
      console.error('텍스트 추출 오류:', err.message);
      return sendJson(res, 400, { error: { message: '문서를 처리할 수 없습니다. 파일이 손상되지 않았는지 확인해 주세요' } });
    }

    // 임베딩 + Supabase 저장 (PLAN 6번)
    try {
      const embeddings = await embedTexts(units.map((u) => u.content));
      const doc = await db.saveDocument({ name, fileType, sizeBytes: received }, units, embeddings);
      sendJson(res, 200, {
        ok: true,
        document: { id: doc.id, name: doc.name, type: fileType, sizeBytes: received },
        chunkCount: units.length,
        message: `저장 완료 (조각 ${units.length}개) — 이제 이 보고서에 대해 질문할 수 있습니다`,
      });
    } catch (err) {
      console.error('저장 오류:', err.message);
      const msg = err.code === 'CONFIG'
        ? err.message
        : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요';
      sendJson(res, 503, { error: { message: msg } });
    }
  });

  req.on('error', () => {
    if (!res.writableEnded) {
      sendJson(res, 500, { error: { message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요' } });
    }
  });
}

module.exports = { handleUpload };
