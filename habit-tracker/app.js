// ===== 백엔드 (혼자 쓰는 모드) =====
const API_URL = 'https://script.google.com/macros/s/AKfycbwsufuyZGFqTFJEgnrPahn2Wnkj-_RT2e1zWzMj7v5VN5mgWq31q0-OBdATfxCFfR9f_Q/exec';
const USER_ID = 'gr';

// ===== 상태 & 저장 =====
const STORAGE_KEY = 'habit-tracker-v1';

const DEFAULT_STATE = {
  challenge: null,
  tasks: [],
  logs: {},
  lastTouched: {}
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_STATE), parsed);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  lastLocalChange = Date.now();
  scheduleSync();
}

// ===== Google Sheets 동기화 =====
let syncTimer = null;
let lastLocalChange = 0;
function setSyncStatus(text, cls = '') {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = cls === 'err' ? 'var(--danger)' : cls === 'ok' ? 'var(--accent-2)' : '';
}
function scheduleSync() {
  clearTimeout(syncTimer);
  setSyncStatus('● 저장 대기…');
  syncTimer = setTimeout(syncStateToSheet, 1500);
}
async function syncStateToSheet() {
  setSyncStatus('● 동기화 중…');
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        type: 'state',
        userId: USER_ID,
        state: { challenge: state.challenge, tasks: state.tasks, logs: state.logs, lastTouched: state.lastTouched || {} }
      })
    });
    setSyncStatus('● 동기화됨', 'ok');
    setTimeout(() => setSyncStatus(''), 2000);
  } catch (e) {
    setSyncStatus('● 동기화 실패', 'err');
  }
}
async function logEventToSheet(ev) {
  try {
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'event', userId: USER_ID, event: ev })
    });
  } catch {}
}
// 자동 폴링용 — 로컬 변경 직후 / 저장 대기 중이면 skip, 변경 없으면 무음
async function autoFetchFromSheet() {
  if (syncTimer) return; // 저장 대기 중
  if (Date.now() - lastLocalChange < 3000) return; // 방금 로컬 변경
  try {
    const res = await fetch(API_URL + '?userId=' + encodeURIComponent(USER_ID) + '&t=' + Date.now());
    const data = await res.json();
    if (!data?.ok || !data.state) return;
    const remote = JSON.stringify({
      challenge: data.state.challenge ?? null,
      tasks: data.state.tasks ?? [],
      logs: data.state.logs ?? {},
      lastTouched: data.state.lastTouched ?? {}
    });
    const local = JSON.stringify({
      challenge: state.challenge, tasks: state.tasks, logs: state.logs, lastTouched: state.lastTouched || {}
    });
    if (remote === local) return;
    state.challenge = data.state.challenge ?? null;
    state.tasks = data.state.tasks ?? [];
    state.logs = data.state.logs ?? {};
    state.lastTouched = data.state.lastTouched ?? {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSyncStatus('● 새 데이터 받음', 'ok');
    setTimeout(() => setSyncStatus(''), 2000);
    render();
  } catch {}
}

async function loadStateFromSheet() {
  setSyncStatus('● 불러오는 중…');
  try {
    const res = await fetch(API_URL + '?userId=' + encodeURIComponent(USER_ID) + '&t=' + Date.now());
    const data = await res.json();
    if (data && data.ok && data.state) {
      state.challenge = data.state.challenge ?? null;
      state.tasks = data.state.tasks ?? [];
      state.logs = data.state.logs ?? {};
      state.lastTouched = data.state.lastTouched ?? {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSyncStatus('● 불러옴', 'ok');
      setTimeout(() => setSyncStatus(''), 2000);
      render();
    } else {
      setSyncStatus('● 시트가 비었음');
    }
  } catch (e) {
    setSyncStatus('● 불러오기 실패', 'err');
    alert('API 호출 실패: ' + e.message);
  }
}

// ===== 유틸 =====
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function diffDays(a, b) {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}
function uid() { return Math.random().toString(36).slice(2, 9); }

// ===== 챌린지 정보 =====
function challengeEndDate() {
  if (!state.challenge) return null;
  return addDays(state.challenge.startDate, state.challenge.days - 1);
}
function daysLeft() {
  if (!state.challenge) return 0;
  const end = challengeEndDate();
  const left = diffDays(todayStr(), end) + 1;
  return Math.max(0, left);
}
function daysElapsed() {
  if (!state.challenge) return 0;
  const e = diffDays(state.challenge.startDate, todayStr()) + 1;
  return Math.min(state.challenge.days, Math.max(0, e));
}

// ===== 콤보 계산 =====
// 각 태스크의 시간순 슬롯 시퀀스를 만들고, 마지막 'fail' 이후의 연속 'ok' 개수를 콤보로 본다.
// within-day: 매일 slots[] 순서대로 평가 (시작일부터 오늘까지)
// across-days: slots = [완료] 한 개로 가정, 매일 한 슬롯씩
function getTaskTimeline(task) {
  if (!state.challenge) return [];
  const start = state.challenge.startDate;
  const today = todayStr();
  const totalDays = diffDays(start, today) + 1;
  if (totalDays <= 0) return [];

  const timeline = []; // [{date, slot, status: 'ok'|'fail'|null}]
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(start, i);
    const dayLog = (state.logs[date] && state.logs[date][task.id]) || {};
    for (const slot of task.slots) {
      timeline.push({ date, slot, status: dayLog[slot] || null });
    }
  }
  return timeline;
}

function currentCombo(task) {
  const tl = getTaskTimeline(task);
  let combo = 0;
  for (const cell of tl) {
    if (cell.status === 'ok') combo++;
    else if (cell.status === 'fail') combo = 0;
    // null(미입력)은 콤보 유지 (아직 미래 시점 슬롯)
  }
  return combo;
}

function bestCombo(task) {
  const tl = getTaskTimeline(task);
  let best = 0, cur = 0;
  for (const cell of tl) {
    if (cell.status === 'ok') { cur++; if (cur > best) best = cur; }
    else if (cell.status === 'fail') cur = 0;
  }
  return best;
}

// 남은 챌린지 기간 동안 도달 가능한 최대 콤보 (현재 콤보 + 남은 슬롯 수)
function maxReachableCombo(task) {
  const left = daysLeft();
  const slotsPerDay = task.slots.length || 1;
  // 오늘 남은 슬롯 + 미래 일수 * 슬롯
  const today = todayStr();
  const todayLog = (state.logs[today] && state.logs[today][task.id]) || {};
  let todayRemaining = 0;
  for (const s of task.slots) if (!todayLog[s]) todayRemaining++;
  const futureDays = Math.max(0, left - 1);
  return currentCombo(task) + todayRemaining + futureDays * slotsPerDay;
}

// ===== 액션 =====
function setSlot(taskId, date, slot, status) {
  if (!state.logs[date]) state.logs[date] = {};
  if (!state.logs[date][taskId]) state.logs[date][taskId] = {};
  const prev = state.logs[date][taskId][slot];
  let finalStatus;
  if (prev === status) {
    delete state.logs[date][taskId][slot];
    finalStatus = 'cleared';
  } else {
    state.logs[date][taskId][slot] = status;
    finalStatus = status;
  }
  if (!state.lastTouched) state.lastTouched = {};
  state.lastTouched[taskId] = Date.now();
  save();
  render();
  if (finalStatus !== 'cleared') {
    pushCoachMessage(taskId, slot, status);
  }
  // 이벤트 로그 전송 (취소도 기록)
  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    logEventToSheet({
      date, taskId, taskName: task.name, slot, status: finalStatus
    });
  }
}

// ===== 코치 메시지 =====
let lastMessages = [];
function pushCoachMessage(taskId, slot, status) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const combo = currentCombo(task);
  const reach = maxReachableCombo(task);
  let msg = '', cls = '';

  if (status === 'ok') {
    // 다음 슬롯 찾기
    const today = todayStr();
    const todayLog = (state.logs[today] && state.logs[today][taskId]) || {};
    const nextSlot = task.slots.find(s => !todayLog[s]);
    if (nextSlot) {
      const remainToday = task.slots.length - Object.keys(todayLog).length;
      msg = `좋습니다. [${task.name} · ${slot}] 달성! ${combo}콤보 진입했습니다. 다음 [${nextSlot}]까지 이어가면 ${combo + remainToday}콤보입니다.`;
    } else {
      msg = `완벽합니다. 오늘 [${task.name}] 전 구간 클리어. ${combo}콤보 달성. 내일 첫 슬롯이 다음 관문입니다.`;
    }
    cls = '';
  } else {
    // fail
    msg = `[${task.name} · ${slot}] 콤보가 리셋됐습니다. 자책은 짧게. 남은 ${daysLeft()}일 동안 최대 ${reach}콤보까지 다시 만들 수 있습니다. 다음 슬롯부터 새로 시작하세요.`;
    cls = 'fail';
  }
  lastMessages.unshift({ msg, cls, ts: Date.now() });
  lastMessages = lastMessages.slice(0, 4);
  renderMessages();
}

function renderMessages() {
  const el = document.getElementById('coachMessages');
  if (!lastMessages.length) {
    el.innerHTML = '<div class="empty">슬롯을 체크하면 코치 메시지가 표시됩니다.</div>';
    return;
  }
  el.innerHTML = lastMessages.map(m => `<div class="coach-msg ${m.cls}">${escapeHtml(m.msg)}</div>`).join('');
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function formatLastTouched(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

// ===== 렌더링 =====
function render() {
  document.getElementById('todayLabel').textContent = todayStr();

  if (!state.challenge) {
    document.getElementById('noChallenge').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    return;
  }
  document.getElementById('noChallenge').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  // Hero
  document.getElementById('challengeTitle').textContent = state.challenge.title || '챌린지';
  const end = challengeEndDate();
  document.getElementById('challengeRange').textContent = `${state.challenge.startDate} → ${end} (${state.challenge.days}일)`;
  const left = daysLeft();
  document.getElementById('daysLeft').textContent = left;
  const elapsed = daysElapsed();
  const pct = Math.min(100, Math.round((elapsed / state.challenge.days) * 100));
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${elapsed}일 / ${state.challenge.days}일 (${pct}%)`;

  document.getElementById('todayDate').textContent = todayStr();
  renderTodayCheckins();
  renderCombos();
  renderMessages();
}

function renderTodayCheckins() {
  const el = document.getElementById('todayCheckins');
  if (!state.tasks.length) {
    el.innerHTML = '<div class="empty">아직 태스크가 없습니다. "태스크 관리"에서 추가해 주세요.</div>';
    return;
  }
  const today = todayStr();
  el.innerHTML = state.tasks.map(task => {
    const dayLog = (state.logs[today] && state.logs[today][task.id]) || {};
    const combo = currentCombo(task);
    const slotsHtml = task.slots.map(slot => {
      const status = dayLog[slot];
      return `
        <div class="slot">
          <span class="slot-name">${escapeHtml(slot)}</span>
          <button class="slot-btn ok ${status === 'ok' ? 'active' : ''}" data-task="${task.id}" data-slot="${escapeHtml(slot)}" data-status="ok">달성</button>
          <button class="slot-btn fail ${status === 'fail' ? 'active' : ''}" data-task="${task.id}" data-slot="${escapeHtml(slot)}" data-status="fail">실패</button>
        </div>`;
    }).join('');
    const lastTs = state.lastTouched?.[task.id];
    const lastTxt = lastTs ? `최근 ${formatLastTouched(lastTs)}` : '';
    return `
      <div class="checkin-task">
        <div class="checkin-head">
          <span class="checkin-name">${escapeHtml(task.name)}</span>
          <span class="checkin-combo">${lastTxt ? `<span class="muted small" style="margin-right:8px">${lastTxt}</span>` : ''}현재 ${combo}콤보</span>
        </div>
        <div class="slots">${slotsHtml}</div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setSlot(btn.dataset.task, todayStr(), btn.dataset.slot, btn.dataset.status);
    });
  });
}

function renderCombos() {
  const el = document.getElementById('comboList');
  if (!state.tasks.length) {
    el.innerHTML = '<div class="empty">태스크를 추가하면 콤보가 표시됩니다.</div>';
    return;
  }
  el.innerHTML = state.tasks.map(task => {
    const cur = currentCombo(task);
    const best = bestCombo(task);
    const reach = maxReachableCombo(task);
    const lastTs = state.lastTouched?.[task.id];
    const lastTxt = lastTs ? ` · 최근 ${formatLastTouched(lastTs)}` : '';
    return `
      <div class="combo-row">
        <div>
          <div class="name">${escapeHtml(task.name)}</div>
          <div class="muted small">최고 ${best}콤보 · 남은 기간 최대 ${reach}콤보${lastTxt}</div>
        </div>
        <div class="now">${cur}</div>
        <div class="best">콤보</div>
      </div>
    `;
  }).join('');
}

// ===== 설정 모달 =====
const settingsModal = document.getElementById('settingsModal');
document.getElementById('openSettings').addEventListener('click', openSettings);
document.getElementById('startSetup').addEventListener('click', openSettings);
function openSettings() {
  document.getElementById('cfgTitle').value = state.challenge?.title || '';
  document.getElementById('cfgStart').value = state.challenge?.startDate || todayStr();
  document.getElementById('cfgDays').value = state.challenge?.days || 30;
  settingsModal.classList.remove('hidden');
}
document.getElementById('saveChallenge').addEventListener('click', () => {
  const title = document.getElementById('cfgTitle').value.trim() || '나의 챌린지';
  const startDate = document.getElementById('cfgStart').value || todayStr();
  const days = Math.max(1, parseInt(document.getElementById('cfgDays').value, 10) || 30);
  state.challenge = { title, startDate, days };
  save();
  settingsModal.classList.add('hidden');
  if (!state.tasks.length) openTasks(); else render();
});
document.getElementById('resetAll').addEventListener('click', () => {
  if (!confirm('모든 챌린지, 태스크, 기록을 삭제합니다. 계속하시겠습니까?')) return;
  state = structuredClone(DEFAULT_STATE);
  save();
  settingsModal.classList.add('hidden');
  render();
});

// ===== 태스크 모달 =====
const tasksModal = document.getElementById('tasksModal');
document.getElementById('manageTasks').addEventListener('click', openTasks);
function openTasks() { renderTaskEdit(); tasksModal.classList.remove('hidden'); }

document.getElementById('addTask').addEventListener('click', () => {
  state.tasks.push({ id: uid(), name: '새 태스크', slots: ['완료'] });
  save();
  renderTaskEdit();
  render();
});

const PRESETS = {
  meals:     { name: '삼시세끼 잘 챙겨 먹기', slots: ['아침', '점심', '저녁'] },
  snack:     { name: '간식 먹지 않기',       slots: ['오전', '오후', '저녁', '밤'] },
  latenight: { name: '야식 먹지 않기',       slots: ['밤'] },
  alcohol:   { name: '술 마시지 않기',       slots: ['하루'] },
  workout:   { name: '운동하기',              slots: ['완료'] },
};
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.preset];
    state.tasks.push({ id: uid(), name: p.name, slots: [...p.slots] });
    save(); renderTaskEdit(); render();
  });
});

function renderTaskEdit() {
  const wrap = document.getElementById('taskEditList');
  if (!state.tasks.length) {
    wrap.innerHTML = '<div class="empty">아직 태스크가 없습니다.</div>';
    return;
  }
  wrap.innerHTML = state.tasks.map((t, idx) => `
    <div class="task-edit" data-idx="${idx}">
      <div class="row">
        <input type="text" class="task-name" value="${escapeHtml(t.name)}" />
        <button class="danger ghost small" data-action="delete">삭제</button>
      </div>
      <div class="muted small">체크포인트 (시간순)</div>
      <div class="slot-chips">
        ${t.slots.map(s => `<span class="chip">${escapeHtml(s)} <button data-remove="${escapeHtml(s)}">✕</button></span>`).join('')}
      </div>
      <div class="add-slot">
        <input type="text" class="new-slot" placeholder="예: 아침 / 오전 / 완료" />
        <button class="ghost small" data-action="add-slot">+</button>
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('.task-edit').forEach(div => {
    const idx = parseInt(div.dataset.idx, 10);
    const task = state.tasks[idx];
    div.querySelector('.task-name').addEventListener('change', e => {
      task.name = e.target.value.trim() || '이름 없음';
      save(); render();
    });
    div.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`"${task.name}" 태스크를 삭제하시겠습니까? 기록도 함께 사라집니다.`)) return;
      state.tasks.splice(idx, 1);
      // 기록에서 해당 taskId 제거
      for (const date of Object.keys(state.logs)) { delete state.logs[date][task.id]; }
      save(); renderTaskEdit(); render();
    });
    div.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        task.slots = task.slots.filter(s => s !== btn.dataset.remove);
        if (!task.slots.length) task.slots = ['완료'];
        save(); renderTaskEdit(); render();
      });
    });
    const input = div.querySelector('.new-slot');
    div.querySelector('[data-action="add-slot"]').addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) return;
      if (task.slots.includes(v)) { input.value=''; return; }
      task.slots.push(v);
      save(); renderTaskEdit(); render();
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') div.querySelector('[data-action="add-slot"]').click(); });
  });
}

// ===== 모달 닫기 =====
document.querySelectorAll('[data-close]').forEach(b => {
  b.addEventListener('click', () => b.closest('.modal').classList.add('hidden'));
});
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});

// ===== 시작 =====
render();

// 자동 동기화: 로드 시 1회 + 포커스 복귀 시 + 60초 주기 (보일 때만)
autoFetchFromSheet();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') autoFetchFromSheet();
});
window.addEventListener('focus', autoFetchFromSheet);
setInterval(() => {
  if (document.visibilityState === 'visible') autoFetchFromSheet();
}, 60000);
