// lib/auth.js — 접근 비밀번호 관문 (CHECK.md P1 / PRD 7장 / PLAN 13번)
// 동작:
//   - .env의 ACCESS_PASSWORD가 비어 있으면 → 관문 끔 (로컬 사용, 지금까지와 동일)
//   - ACCESS_PASSWORD가 설정돼 있으면 → 로그인 전에는 /login 화면과 로그인 API만 허용
// 인증 통과 표시는 서명된 쿠키 하나로 관리한다 (비밀번호 자체는 쿠키에 넣지 않음).
'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'report_auth';

// 관문이 켜져 있는지 (비밀번호가 설정돼 있으면 켜짐)
function isEnabled() {
  return !!(process.env.ACCESS_PASSWORD && process.env.ACCESS_PASSWORD.length > 0);
}

// 비밀번호로 인증 토큰 생성 (비밀번호의 해시 — 비밀번호가 바뀌면 기존 토큰 무효)
function makeToken() {
  return crypto
    .createHash('sha256')
    .update('report-chatbot|' + process.env.ACCESS_PASSWORD)
    .digest('hex');
}

// 요청 쿠키에서 인증 토큰을 꺼내 유효한지 확인
function isAuthed(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(COOKIE_NAME + '=([a-f0-9]+)'));
  if (!m) return false;
  // 타이밍 공격을 피하려 상수 시간 비교
  const expected = makeToken();
  const got = m[1];
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// 입력된 비밀번호가 맞는지 확인 (상수 시간 비교)
function checkPassword(input) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(process.env.ACCESS_PASSWORD));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 로그인 성공 시 내려줄 Set-Cookie 값 (HttpOnly: 자바스크립트로 못 읽음)
function authCookie() {
  // 30일 유지, HttpOnly + SameSite=Strict (CSRF 완화)
  return `${COOKIE_NAME}=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 3600}`;
}

module.exports = { isEnabled, isAuthed, checkPassword, authCookie, COOKIE_NAME };
