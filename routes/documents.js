// routes/documents.js — 보고서 목록·삭제·요약 라우트 (PLAN 7·12번 / DESIGN 5장)
//   GET    /api/documents              → { documents, usage }  (목록 + 저장 현황)
//   DELETE /api/documents/:id          → { ok: true }          (1건 삭제, 조각도 함께)
//   POST   /api/documents/:id/summary  → { summary, source }   (보고서 1건 요약)
'use strict';

const db = require('../lib/db');
const { generateSummary } = require('../lib/openai');

// JSON 응답 도우미
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// 저장소 오류를 사용자 안내 문구로 변환
function storageError(res, err) {
  console.error('저장소 오류:', err.message);
  const msg = err.code === 'CONFIG'
    ? err.message
    : '저장소(Supabase) 연결에 실패했습니다. 잠시 후 다시 시도해 주세요';
  sendJson(res, 503, { error: { message: msg } });
}

// GET /api/documents — 목록 + 저장 현황(개수/총 용량)
async function handleList(req, res) {
  try {
    const documents = await db.listDocuments();
    const usage = {
      count: documents.length,
      totalBytes: documents.reduce((sum, d) => sum + d.size_bytes, 0),
    };
    sendJson(res, 200, { documents, usage });
  } catch (err) {
    storageError(res, err);
  }
}

// DELETE /api/documents/:id — 1건 삭제
async function handleDelete(req, res, id) {
  // id가 uuid 모양인지 간단히 확인 (이상한 경로 거절)
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return sendJson(res, 400, { error: { message: '잘못된 요청입니다' } });
  }
  try {
    await db.deleteDocument(id);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    storageError(res, err);
  }
}

// POST /api/documents/:id/summary — 보고서 1건 요약 (사용자가 요청할 때만 생성)
async function handleSummary(req, res, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return sendJson(res, 400, { error: { message: '잘못된 요청입니다' } });
  }
  try {
    const doc = await db.getDocumentWithChunks(id);
    if (!doc) {
      return sendJson(res, 404, { error: { message: '해당 보고서를 찾을 수 없습니다' } });
    }
    const summary = await generateSummary(doc.name, doc.chunks);
    // 출처는 보고서명 (PRD 5장 3번 규칙)
    sendJson(res, 200, { summary, source: { name: doc.name } });
  } catch (err) {
    storageError(res, err);
  }
}

module.exports = { handleList, handleDelete, handleSummary };
