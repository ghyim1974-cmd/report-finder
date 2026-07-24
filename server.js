// server.js — Report Finder 서버
// 화면(public/) 제공 + API 라우트 연결을 담당한다. (DESIGN.md 5장)
// 현재 연결된 API: POST /api/upload (PLAN 4번 — 업로드 검증)
// 이후 단계에서 /api/documents, /api/ask, /api/documents/:id/summary 를 붙인다.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadEnv } = require('./lib/env');
loadEnv(); // .env의 키들을 가장 먼저 읽는다 (OpenAI·Supabase)

const { handleUpload } = require('./routes/upload');               // 업로드 라우트
const { handleList, handleDelete, handleSummary } = require('./routes/documents'); // 목록·삭제·요약 라우트
const { handleAsk } = require('./routes/ask');                      // 질문·답변 라우트
const auth = require('./lib/auth');                                 // 접근 비밀번호 관문 (CHECK.md P1)

// 로그인 요청 본문(JSON)을 읽어 비밀번호를 확인하고 쿠키를 내려준다
function handleLogin(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let password;
    try { password = JSON.parse(body).password; } catch { password = ''; }
    if (auth.checkPassword(password)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': auth.authCookie() });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: '비밀번호가 올바르지 않습니다' } }));
    }
  });
}

const PORT = 3000; // 로컬 실행 포트
const PUBLIC_DIR = path.join(__dirname, 'public'); // 화면 파일 폴더

// 파일 확장자별 Content-Type (한글이 깨지지 않도록 charset 지정)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // 요청 경로 정리: "/" 이면 index.html을 준다
  const urlPath = req.url.split('?')[0];

  // ===== 접근 비밀번호 관문 (CHECK.md P1) =====
  // ACCESS_PASSWORD가 설정된 경우에만 작동. 로그인 전에는 로그인 화면·API만 허용.
  if (auth.isEnabled() && !auth.isAuthed(req)) {
    if (urlPath === '/api/login' && req.method === 'POST') {
      return handleLogin(req, res);
    }
    if (urlPath === '/login' || urlPath === '/login.html') {
      const loginFile = path.join(PUBLIC_DIR, 'login.html');
      return fs.readFile(loginFile, (err, data) => {
        res.writeHead(err ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(err ? '로그인 페이지를 찾을 수 없습니다' : data);
      });
    }
    // 그 외 모든 요청은 차단: API는 401 JSON, 화면은 로그인으로 보냄
    if (urlPath.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: { message: '로그인이 필요합니다' } }));
    }
    res.writeHead(302, { Location: '/login' });
    return res.end();
  }

  // ===== API 라우트 (화면 파일보다 먼저 검사) =====
  if (urlPath === '/api/upload' && req.method === 'POST') {
    return handleUpload(req, res);
  }
  if (urlPath === '/api/documents' && req.method === 'GET') {
    return handleList(req, res);
  }
  if (urlPath === '/api/ask' && req.method === 'POST') {
    return handleAsk(req, res);
  }
  // DELETE /api/documents/:id — 경로 뒤쪽이 문서 id
  const delMatch = urlPath.match(/^\/api\/documents\/([^/]+)$/);
  if (delMatch && req.method === 'DELETE') {
    return handleDelete(req, res, delMatch[1]);
  }
  // POST /api/documents/:id/summary — 보고서 1건 요약
  const sumMatch = urlPath.match(/^\/api\/documents\/([^/]+)\/summary$/);
  if (sumMatch && req.method === 'POST') {
    return handleSummary(req, res, sumMatch[1]);
  }
  const filePath = path.join(
    PUBLIC_DIR,
    urlPath === '/' ? 'index.html' : urlPath
  );

  // public 폴더 밖의 파일은 주지 않는다 (경로 탈출 방지)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('접근할 수 없습니다');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 파일이 없으면 404 안내
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('페이지를 찾을 수 없습니다');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// 127.0.0.1에만 바인딩 — 같은 네트워크의 다른 기기에서 접속 불가 (대외비 보호, PRD 7장)
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Report Finder 서버 실행 중: http://localhost:${PORT} (이 PC에서만 접속 가능)`);
});
