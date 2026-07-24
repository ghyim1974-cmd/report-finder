-- supabase-setup.sql — 보고서 챗봇 저장소 준비 (DESIGN.md 4장)
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run 실행 (1회만)

-- 1) 벡터 확장 켜기 (임베딩 유사도 검색용)
create extension if not exists vector;

-- 2) documents — 보고서 1건
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- 파일명 (출처 표기에 사용)
  file_type text not null,           -- 'pdf' / 'word' / 'txt'
  size_bytes bigint not null,        -- 파일 용량 (한도 계산용)
  uploaded_at timestamptz not null default now()
);

-- 3) chunks — 보고서를 문단 단위로 나눈 조각
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade, -- 보고서 삭제 시 조각도 함께 삭제
  chunk_index int not null,          -- 문단 순번
  content text not null,             -- 조각 원문 텍스트
  page int,                          -- PDF 페이지 번호 (Word·txt는 null)
  location_label text not null,      -- 출처 표기 문자열 (예: 'p.2' / '문단 5')
  embedding vector(1536) not null    -- OpenAI text-embedding-3-small
);

-- 4) 유사도 검색을 빠르게 하는 인덱스 (HNSW — 빈 테이블에서도 안전)
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops);

-- 5) 질문과 의미가 가까운 조각을 찾는 함수 (서버의 /api/ask 에서 호출)
create or replace function match_chunks(
  query_embedding vector(1536),  -- 질문의 임베딩
  match_count int default 5      -- 가져올 조각 개수
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  content text,
  location_label text,
  similarity float
)
language sql stable
as $$
  select
    c.id as chunk_id,
    c.document_id,
    d.name as document_name,
    c.content,
    c.location_label,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
