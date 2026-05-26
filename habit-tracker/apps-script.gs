// ===================================================================
// 콤보 챌린지 백엔드 (Google Apps Script) — v2: 다중 사용자 지원
//
// 사용 방법:
// 1) 구글 드라이브에서 새 스프레드시트 생성 (또는 기존 시트 그대로 사용)
// 2) 메뉴 [확장 프로그램] → [Apps Script]
// 3) 기존 코드 전체 삭제 후 이 내용으로 교체
// 4) 저장 → [배포] → [배포 관리] → 기존 배포의 [편집(연필)]
//    → 버전: "새 버전" 선택 → [배포]
//    (URL은 그대로 유지됨. 새로 배포하면 URL이 바뀌어서 모든 사용자가 재설정해야 함)
// 5) 시트는 비워둬도 됨 — `states` 와 `events` 탭이 자동 생성됨
//
// 시트 구조:
//   states  - userId | state(JSON) | updated   (사용자별 1행)
//   events  - timestamp | userId | date | taskId | taskName | slot | status
// ===================================================================

const STATES_SHEET = 'states';
const EVENTS_SHEET = 'events';

function doGet(e) {
  try {
    const userId = ((e.parameter && e.parameter.userId) || '').trim();
    if (!userId) return jsonOut({ ok: false, error: 'userId required' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let state = { challenge: null, tasks: [], logs: {} };
    const sheet = ss.getSheetByName(STATES_SHEET);
    if (sheet && sheet.getLastRow() >= 2) {
      const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      for (const row of vals) {
        if (String(row[0]) === userId && row[1]) {
          try { state = JSON.parse(row[1]); } catch (err) {}
          break;
        }
      }
    }
    return jsonOut({ ok: true, state });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const userId = (body.userId || '').trim();
    if (!userId) return jsonOut({ ok: false, error: 'userId required' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.type === 'state') {
      let sheet = ss.getSheetByName(STATES_SHEET);
      if (!sheet) {
        sheet = ss.insertSheet(STATES_SHEET);
        sheet.appendRow(['userId', 'state', 'updated']);
      }
      const last = sheet.getLastRow();
      let rowIdx = -1;
      if (last >= 2) {
        const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i][0]) === userId) { rowIdx = i + 2; break; }
        }
      }
      const json = JSON.stringify(body.state);
      const now = new Date();
      if (rowIdx > 0) {
        sheet.getRange(rowIdx, 2, 1, 2).setValues([[json, now]]);
      } else {
        sheet.appendRow([userId, json, now]);
      }
    } else if (body.type === 'event') {
      let sheet = ss.getSheetByName(EVENTS_SHEET);
      if (!sheet) {
        sheet = ss.insertSheet(EVENTS_SHEET);
        sheet.appendRow(['timestamp', 'userId', 'date', 'taskId', 'taskName', 'slot', 'status']);
      }
      const ev = body.event || {};
      sheet.appendRow([new Date(), userId, ev.date || '', ev.taskId || '', ev.taskName || '', ev.slot || '', ev.status || '']);
    }
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
