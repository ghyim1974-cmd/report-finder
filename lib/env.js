// lib/env.js — .env 파일을 읽어 process.env에 넣는 작은 도우미 (외부 패키지 불필요)
// 서버 시작 시 가장 먼저 한 번 호출한다.
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return; // .env가 없으면 조용히 넘어감

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    // "이름=값" 형태만 처리, # 주석은 무시
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2];
    }
  }
}

module.exports = { loadEnv };
