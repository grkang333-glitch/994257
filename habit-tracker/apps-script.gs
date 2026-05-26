// ===================================================================
// 해빗 트래커 백엔드 (Google Apps Script)
//
// 사용 방법:
// 1) 구글 드라이브에서 새 스프레드시트 생성 (예: "Habit Tracker")
// 2) 메뉴 [확장 프로그램] → [Apps Script] 클릭
// 3) 기본 Code.gs 내용 전체를 이 파일 내용으로 교체
// 4) 저장 후 우측 상단 [배포] → [새 배포] → 유형: "웹 앱"
//    - 다음 사용자로 실행: 본인
//    - 액세스 권한: "모든 사용자" (링크 아는 사람)
// 5) 배포 후 나오는 웹 앱 URL (https://script.google.com/macros/s/.../exec) 복사
// 6) 해빗 트래커 앱 → 설정 → "Google Sheets API URL"에 붙여넣고 저장
//
// 시트 구조 (자동 생성됨):
//   state  - A1 셀에 전체 앱 상태 JSON 1줄 저장
//   events - 슬롯 변경 이벤트 누적 (timestamp, date, taskId, taskName, slot, status)
// ===================================================================

const STATE_SHEET = 'state';
const EVENTS_SHEET = 'events';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(STATE_SHEET);
    let state = { challenge: null, tasks: [], logs: {} };
    if (sheet && sheet.getLastRow() >= 1) {
      const v = sheet.getRange(1, 1).getValue();
      if (v) {
        try { state = JSON.parse(v); } catch (err) {}
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, state }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const body = JSON.parse(e.postData.contents);

    if (body.type === 'state') {
      let sheet = ss.getSheetByName(STATE_SHEET);
      if (!sheet) sheet = ss.insertSheet(STATE_SHEET);
      sheet.getRange(1, 1).setValue(JSON.stringify(body.state));
    } else if (body.type === 'event') {
      let sheet = ss.getSheetByName(EVENTS_SHEET);
      if (!sheet) {
        sheet = ss.insertSheet(EVENTS_SHEET);
        sheet.appendRow(['timestamp', 'date', 'taskId', 'taskName', 'slot', 'status']);
      }
      const ev = body.event || {};
      sheet.appendRow([new Date(), ev.date || '', ev.taskId || '', ev.taskName || '', ev.slot || '', ev.status || '']);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
