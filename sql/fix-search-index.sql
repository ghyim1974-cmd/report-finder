-- fix-search-index.sql — 검색 인덱스 교체 (ivfflat → HNSW)
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run 실행 (1회만)
-- 배경: ivfflat 인덱스는 "빈 테이블"에 만들면 군집이 학습되지 않아 검색이 0건이 나온다.
--       HNSW 인덱스는 이런 사전 학습이 필요 없어 데이터가 늘어나도 안정적이다.

drop index if exists chunks_embedding_idx;

create index chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);
