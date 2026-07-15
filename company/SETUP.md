# 할 일 처리기 — 회사 버전

개인 버전(`/994257/`)과 완전히 분리된 회사용 사본.

- **프론트**: `company/index.html` → GitHub Pages `https://grkang333-glitch.github.io/994257/company/`
- **백엔드**: `company/apps-script.gs` → 회사 구글 계정의 새 스프레드시트 + Apps Script 웹 앱
- **로컬 캐시**: localStorage 키가 `task-processor-company-v1`로 분리되어 있어
  같은 브라우저에서 개인 버전과 같이 써도 데이터가 섞이지 않음
  (GitHub Pages는 repo가 달라도 origin이 같아서 키 분리가 필수였음)

## 최초 셋업 (1회, 약 5분)

1. **회사 구글 계정**으로 로그인한 상태에서 새 스프레드시트 생성
   (시트는 비워둬도 됨 — `items` 탭이 자동 생성됨)
2. 스프레드시트 메뉴 [확장 프로그램] → [Apps Script]
3. 기본 코드 지우고 `apps-script.gs` 내용 전체 붙여넣기 → 저장
4. [배포] → [새 배포] → 유형 선택(톱니바퀴): **웹 앱**
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자**
5. 배포 후 나오는 **웹 앱 URL(`.../exec`)** 복사
6. `https://grkang333-glitch.github.io/994257/company/` 접속
   → 우측 상단 [URL 설정]에 붙여넣기 → 저장

다른 기기에서도 쓰려면 그 기기에서 6번만 반복하면 됨.
(또는 `.../company/?api=<웹앱URL>` 링크를 한 번 열면 자동 설정됨 — URL이 곧 비밀이니 링크를 아무 데도 남기지 말 것.)

## 백엔드 코드 수정 시

Apps Script 편집기에서 수정 → [배포] → [배포 관리] → 기존 배포 [편집(연필)]
→ 버전 "**새 버전**" → [배포].
**[새 배포]를 만들면 URL이 바뀌어서 앱의 URL 설정을 다시 해야 함.**

## 프론트 코드 수정 시

`company/index.html` 수정 → commit → push → GitHub Pages가 1~2분 내 자동 반영
→ 브라우저에서 Ctrl+Shift+R (하드 리프레시).

## 개인 버전과 다른 점

| | 개인 | 회사 |
|---|---|---|
| 경로 | `/994257/index.html` | `/994257/company/index.html` |
| localStorage 키 | `task-processor-v1` | `task-processor-company-v1` |
| BUILTIN_API_URL | 개인 배포 URL 하드코딩 | 빈 값 (URL 설정에서 입력) |
| 백엔드 시트 | 개인 계정 | 회사 계정 |

백엔드도 개선판: `deadline` 컬럼을 텍스트 서식(@)으로 고정해서
개인 시트에서 발생하던 날짜 자동변환(datetime-local 문자열 → Date 객체) 문제가 없고,
`completedAt`을 epoch ms 숫자 컬럼으로 저장해 완료 시각이 정확히 왕복됨.

## 주의 (개인 버전과 동일한 한계)

- 웹 앱 URL을 아는 사람은 누구나 데이터를 읽고 쓸 수 있음 (URL = 비밀번호)
- 동시 편집 충돌 처리 없음 (last-write-wins) — 혼자 쓰는 용도로 설계됨
