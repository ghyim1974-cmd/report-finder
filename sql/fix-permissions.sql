-- fix-permissions.sql — 재생성된 테이블에 접근 권한 부여
-- 사용법: Supabase 대시보드 > SQL Editor 에 전체 붙여넣고 Run 실행 (1회만)
-- 배경: 테이블을 지우고 다시 만들면 서버가 쓰는 역할(service_role)의 권한이 빠질 수 있다.

-- 스키마 사용 권한
grant usage on schema public to service_role;

-- 테이블 읽기·쓰기 권한 (documents, chunks 포함 전체)
grant all on all tables in schema public to service_role;

-- 검색 함수 실행 권한
grant execute on all functions in schema public to service_role;

-- 앞으로 만들 테이블·함수에도 자동으로 권한이 붙도록 기본값 설정
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
