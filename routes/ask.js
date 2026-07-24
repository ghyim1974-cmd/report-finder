// routes/ask.js — 질문·답변 라우트 (PLAN 8~10번 / DESIGN 2장 흐름 B)
//   POST /api/ask { question } → { answer, sources }
// 처리: 문서 유무 확인 → 질문 임베딩 → 유사 조각 검색 → 근거만으로 답변 생성 → 출처 정리
'use strict';

const { embedTexts, generateAnswer, NOT_FOUND } = require('../lib/openai');
const db = require('../lib/db');

// JSON 응답 도우미
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleAsk(req, res) {
  // 요청 본문(JSON) 읽기
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    // 1) 질문 확인
    let question;
    try {
      question = (JSON.parse(body).question || '').trim();
    } catch {
      return sendJson(res, 400, { error: { message: '잘못된 요청입니다' } });
    }
    if (!question) {
      return sendJson(res, 400, { error: { message: '질문을 입력해 주세요' } });
    }
    // 지나치게 긴 질문 거절 (비용·부하 방지 — CHECK.md P1)
    if (question.length > 1000) {
      return sendJson(res, 400, { error: { message: '질문이 너무 깁니다 (1,000자 이내로 입력해 주세요)' } });
    }

    try {
      // 2) 저장된 보고서가 없으면 안내 (PRD 9장 고정 문구)
      const usage = await db.getUsage();
      if (usage.count === 0) {
        return sendJson(res, 400, { error: { message: '먼저 보고서를 업로드해 주세요' } });
      }

      // 3) 질문 임베딩 → 의미가 가까운 조각 검색 (상위 5개)
      const [queryEmbedding] = await embedTexts([question]);
      const matches = await db.searchChunks(queryEmbedding, 5);

      // 4) 검색된 근거만으로 답변 생성 (근거 없으면 모델이 NOT_FOUND로 답하도록 지시됨)
      const answer = matches.length === 0
        ? NOT_FOUND
        : await generateAnswer(question, matches);

      // 5) 출처 정리 — 답과 관련 있는 근거(유사도 0.3 이상, 최소 1개)만,
      //    같은 보고서/위치는 한 번만, "찾을 수 없습니다"면 출처 없음
      const relevant = matches.filter((m) => m.similarity >= 0.3);
      const usedMatches = relevant.length > 0 ? relevant : matches.slice(0, 1);
      const sources = answer.includes(NOT_FOUND)
        ? []
        : [...new Map(
            usedMatches.map((m) => [
              `${m.document_name}|${m.location_label}`,
              // content: 출처 클릭 시 원문 보기에 사용 (화면에서 그대로 표시)
              { name: m.document_name, location: m.location_label, content: m.content },
            ])
          ).values()];

      sendJson(res, 200, { answer, sources });
    } catch (err) {
      console.error('질문 처리 오류:', err.message);
      const msg = err.code === 'CONFIG'
        ? err.message
        : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요';
      sendJson(res, 503, { error: { message: msg } });
    }
  });
}

module.exports = { handleAsk };
