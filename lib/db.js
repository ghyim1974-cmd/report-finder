// lib/db.js — Supabase 저장소 연결 (DESIGN 4장 데이터 모델)
// documents(보고서) + chunks(조각+임베딩) 두 표를 다룬다.
// 설정이 잘못되면 ConfigError를 던져 라우트에서 안내 문구로 바꾼다.
'use strict';

const { createClient } = require('@supabase/supabase-js');

// 설정 문제를 구분하기 위한 오류 (라우트에서 안내 문구로 변환)
class ConfigError extends Error {
  constructor(msg) {
    super(msg);
    this.code = 'CONFIG';
  }
}

let client = null;

// Supabase 클라이언트 준비 (설정 형식도 함께 점검)
function getClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || '';

  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    throw new ConfigError('SUPABASE_URL이 프로젝트 URL(https://프로젝트ID.supabase.co)이 아닙니다. .env를 확인해 주세요');
  }
  if (!(key.startsWith('eyJ') || key.startsWith('sb_secret_'))) {
    throw new ConfigError('SUPABASE_SERVICE_KEY가 service_role 키가 아닌 것으로 보입니다. Supabase 대시보드 > Settings > API에서 service_role 키를 복사해 주세요');
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// 현재 저장 사용량: 문서 수 + 총 용량 (저장 한도 검증용)
async function getUsage() {
  const sb = getClient();
  const { data, error } = await sb.from('documents').select('size_bytes');
  if (error) throw new Error(`저장소 조회 실패: ${error.message}`);
  return {
    count: data.length,
    totalBytes: data.reduce((sum, row) => sum + row.size_bytes, 0),
  };
}

// 보고서 1건 + 조각들을 저장한다. 조각 저장 실패 시 보고서도 지워 반쪽 저장을 막는다.
async function saveDocument(meta, units, embeddings) {
  const sb = getClient();

  // 1) documents에 보고서 정보 저장
  const { data: doc, error: docErr } = await sb
    .from('documents')
    .insert({ name: meta.name, file_type: meta.fileType, size_bytes: meta.sizeBytes })
    .select()
    .single();
  if (docErr) throw new Error(`보고서 저장 실패: ${docErr.message}`);

  // 2) chunks에 조각+임베딩 저장 (100행씩 나눠 저장 — 큰 문서의 요청 크기 제한 대비)
  const INSERT_BATCH = 100;
  const rows = units.map((u, i) => ({
    document_id: doc.id,
    chunk_index: i,
    content: u.content,
    page: u.page,
    location_label: u.locationLabel,
    embedding: embeddings[i],
  }));
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error: chunkErr } = await sb.from('chunks').insert(rows.slice(i, i + INSERT_BATCH));
    if (chunkErr) {
      // 반쪽 저장 방지: 조각 저장에 실패하면 방금 만든 보고서(+저장된 조각)도 삭제
      await sb.from('documents').delete().eq('id', doc.id);
      throw new Error(`조각 저장 실패: ${chunkErr.message}`);
    }
  }

  return doc;
}

// 저장된 보고서 목록 (최근 업로드 순)
async function listDocuments() {
  const sb = getClient();
  const { data, error } = await sb
    .from('documents')
    .select('id, name, file_type, size_bytes, uploaded_at')
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(`목록 조회 실패: ${error.message}`);
  return data;
}

// 보고서 1건 삭제 (chunks는 on delete cascade로 함께 삭제됨)
async function deleteDocument(id) {
  const sb = getClient();
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) throw new Error(`삭제 실패: ${error.message}`);
}

// 보고서 1건의 이름 + 조각 전체(순서대로) — 요약 기능용 (DESIGN 2장 흐름 C)
async function getDocumentWithChunks(id) {
  const sb = getClient();
  const { data: doc, error: docErr } = await sb
    .from('documents').select('id, name').eq('id', id).single();
  if (docErr) return null; // 없는 문서

  const { data: chunks, error: chunkErr } = await sb
    .from('chunks')
    .select('content, location_label')
    .eq('document_id', id)
    .order('chunk_index', { ascending: true });
  if (chunkErr) throw new Error(`조각 조회 실패: ${chunkErr.message}`);

  return { ...doc, chunks };
}

// 질문 임베딩과 의미가 가까운 조각 검색 (match_chunks 함수 호출 — DESIGN 4장)
async function searchChunks(queryEmbedding, count = 5) {
  const sb = getClient();
  const { data, error } = await sb.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_count: count,
  });
  if (error) throw new Error(`조각 검색 실패: ${error.message}`);
  return data; // [{ chunk_id, document_id, document_name, content, location_label, similarity }]
}

module.exports = {
  getUsage,
  saveDocument,
  listDocuments,
  deleteDocument,
  getDocumentWithChunks,
  searchChunks,
  ConfigError,
};
