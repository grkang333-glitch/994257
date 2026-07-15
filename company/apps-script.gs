// ===================================================================
// 할 일 처리기 백엔드 (Google Apps Script) — 회사 버전
//
// 프론트: https://grkang333-glitch.github.io/994257/company/
//
// 설치 방법:
// 1) 회사 구글 계정으로 새 스프레드시트 생성
// 2) 메뉴 [확장 프로그램] → [Apps Script]
// 3) 기존 코드 전체 삭제 후 이 내용으로 교체 → 저장
// 4) [배포] → [새 배포] → 유형: 웹 앱
//    - 실행 계정: 나
//    - 액세스 권한: 모든 사용자 (URL이 곧 비밀 — 아무 데도 공개하지 말 것)
// 5) 배포 URL(/exec)을 복사해서 앱 우측 [URL 설정]에 붙여넣기
//
// 코드 수정 후 재배포할 때는 [배포] → [배포 관리] → 기존 배포 [편집(연필)]
// → 버전 "새 버전" → [배포]  (새 배포를 만들면 URL이 바뀌니 주의)
//
// 시트 구조 (items 탭, 자동 생성):
//   id | text | done | deadline | bucket | condition | parentId
//   | childIds | createdAt | completedAt | createdDate | completedDate
//   - condition/childIds 는 JSON 문자열, createdAt/completedAt 은 epoch ms
//   - createdDate/completedDate 는 사람이 보기 위한 파생 컬럼 (읽을 땐 무시)
//   - deadline 컬럼은 텍스트 서식(@)으로 고정 → 시트의 날짜 자동변환 방지
// ===================================================================

const ITEMS_SHEET = 'items';
const HEADER = ['id', 'text', 'done', 'deadline', 'bucket', 'condition',
  'parentId', 'childIds', 'createdAt', 'completedAt', 'createdDate', 'completedDate'];
const TZ = 'Asia/Seoul';

function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) || '';
    if (action !== 'list') return jsonOut({ ok: false, error: 'unknown action: ' + action });
    return jsonOut({ ok: true, items: readItems() });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action !== 'save') return jsonOut({ ok: false, error: 'unknown action: ' + body.action });
    if (!Array.isArray(body.items)) return jsonOut({ ok: false, error: 'items must be an array' });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      writeItems(body.items);
    } finally {
      lock.releaseLock();
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ITEMS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ITEMS_SHEET);
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function writeItems(items) {
  const sheet = getSheet();
  const rows = items.map(it => [
    String(it.id || ''),
    String(it.text || ''),
    it.done === true,
    String(it.deadline || ''),
    String(it.bucket || ''),
    String(it.condition || '[]'),
    String(it.parentId || ''),
    JSON.stringify(it.childIds || []),
    Number(it.createdAt) || 0,
    (it.completedAt === null || it.completedAt === undefined) ? '' : Number(it.completedAt),
    fmtDate(it.createdAt),
    fmtDate(it.completedAt)
  ]);

  const maxRows = Math.max(sheet.getLastRow() - 1, rows.length, 1);
  sheet.getRange(2, 1, maxRows, HEADER.length).clearContent();
  if (rows.length) {
    const range = sheet.getRange(2, 1, rows.length, HEADER.length);
    // deadline 컬럼(4번째)을 텍스트 서식으로 고정해 날짜 자동변환을 막는다
    sheet.getRange(2, 4, rows.length, 1).setNumberFormat('@');
    range.setValues(rows);
  }
}

function readItems() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const vals = sheet.getRange(2, 1, last - 1, HEADER.length).getValues();
  const items = [];
  for (const row of vals) {
    const id = String(row[0] || '').trim();
    if (!id) continue;
    items.push({
      id: id,
      text: String(row[1] || ''),
      done: row[2] === true || String(row[2]).toUpperCase() === 'TRUE',
      deadline: toDeadlineString(row[3]),
      bucket: String(row[4] || 'inbox'),
      condition: String(row[5] || '[]'),
      parentId: String(row[6] || ''),
      childIds: parseJsonArray(row[7]),
      createdAt: Number(row[8]) || 0,
      completedAt: (row[9] === '' || row[9] === null || row[9] === undefined) ? null : Number(row[9]) || null
    });
  }
  return items;
}

// 과거 데이터나 수동 편집으로 셀이 Date로 변환된 경우 datetime-local 형식으로 복원
function toDeadlineString(val) {
  if (val instanceof Date) return Utilities.formatDate(val, TZ, "yyyy-MM-dd'T'HH:mm");
  return String(val || '');
}

function parseJsonArray(val) {
  const s = String(val || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function fmtDate(ms) {
  const n = Number(ms);
  if (!n) return '';
  return Utilities.formatDate(new Date(n), TZ, 'yyyy. M. d HH:mm');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
