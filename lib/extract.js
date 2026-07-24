// lib/extract.js — 문서에서 텍스트 추출 (PLAN 5번 / DESIGN 6장 출처 확보 방식)
// 형식별 추출 방법:
//   PDF  → pdf-parse : 페이지별 텍스트 → 출처는 "p.N"
//   Word → mammoth   : 문단별 텍스트 → 출처는 "문단 N" (.docx는 페이지 개념 없음)
//   txt  → 그대로 읽기: 빈 줄 기준 문단 분리 → 출처는 "문단 N"
// 글자가 하나도 없으면(스캔·사진 PDF 등) NO_TEXT 오류를 던진다 → 업로드 거절.
'use strict';

const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const iconv = require('iconv-lite'); // 한글 인코딩(EUC-KR 등) 변환

// 조각 하나의 최대 길이 (임베딩 품질을 위해 너무 긴 조각은 나눔)
const MAX_UNIT_CHARS = 800;

// 글자가 없을 때 던지는 오류 (라우트에서 구분해 안내 문구를 보냄)
class NoTextError extends Error {
  constructor() {
    super('문서에서 텍스트를 읽을 수 없습니다');
    this.code = 'NO_TEXT';
  }
}

// 공백 정리: 연속 공백·줄바꿈을 한 칸으로
function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// 긴 텍스트를 문장 경계(마침표) 기준으로 최대 길이 이하 조각으로 나눔
function splitByLength(text, max = MAX_UNIT_CHARS) {
  if (text.length <= max) return [text];
  const pieces = [];
  let rest = text;
  while (rest.length > max) {
    // max 지점 앞에서 가장 가까운 문장 끝(마침표+공백)을 찾는다
    let cut = rest.lastIndexOf('. ', max);
    if (cut < max * 0.3) cut = max; // 적당한 경계가 없으면 그냥 자름
    else cut += 1; // 마침표까지 포함
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

// 문단 배열 → 조각(unit) 배열로 변환 (문단 순번 기반 출처)
function unitsFromParagraphs(paragraphs) {
  const units = [];
  let n = 0;
  for (const para of paragraphs) {
    const text = clean(para);
    if (!text) continue;
    n += 1;
    for (const piece of splitByLength(text)) {
      units.push({ content: piece, page: null, locationLabel: `문단 ${n}` });
    }
  }
  return units;
}

// PDF: 페이지별 텍스트 → 페이지 번호 출처
async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const units = [];
    for (const pageInfo of result.pages || []) {
      const text = clean(pageInfo.text || '');
      if (!text) continue; // 글자 없는 페이지는 건너뜀
      for (const piece of splitByLength(text)) {
        units.push({ content: piece, page: pageInfo.num, locationLabel: `p.${pageInfo.num}` });
      }
    }
    return units;
  } finally {
    await parser.destroy(); // 파서 자원 정리
  }
}

// Word(.docx): mammoth로 문단 추출 (문단은 빈 줄 2개로 구분되어 나옴)
async function extractWord(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return unitsFromParagraphs((result.value || '').split(/\n{2,}/));
}

// txt 인코딩 자동 감지 — 메모장 등에서 저장된 다양한 형식을 지원
//   BOM이 있으면 그대로 따르고(UTF-8/UTF-16), 없으면 UTF-8로 읽어본 뒤
//   깨진 글자(�)가 나오면 한국 윈도우 기본 인코딩(EUC-KR/CP949)으로 다시 읽는다.
function decodeTxt(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf8'); // UTF-8 (BOM)
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.slice(2).toString('utf16le'); // UTF-16 LE (메모장 "유니코드")
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer.slice(2), 'utf16-be'); // UTF-16 BE
  }
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('�')) return utf8; // 깨진 글자 없음 → UTF-8 확정
  return iconv.decode(buffer, 'cp949'); // EUC-KR/CP949 (옛 한글 메모장 기본)
}

// txt: 인코딩 감지 후 빈 줄 기준 문단 분리
function extractTxt(buffer) {
  return unitsFromParagraphs(decodeTxt(buffer).split(/\r?\n\s*\r?\n/));
}

// 공개 함수: 파일 종류에 맞게 추출하고, 글자가 없으면 NO_TEXT 오류
async function extractText(buffer, fileType) {
  let units;
  if (fileType === 'pdf') units = await extractPdf(buffer);
  else if (fileType === 'word') units = await extractWord(buffer);
  else units = extractTxt(buffer);

  if (units.length === 0) throw new NoTextError();
  return units;
}

module.exports = { extractText, NoTextError };
