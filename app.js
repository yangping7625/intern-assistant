/**
 * CareerMatch AI - 求职智配平台
 * 四大模块：岗位匹配 / 简历优化 / 面试模拟 / 职业规划
 */

const state = {
  jobs: [],
  favorites: [],
  filter: 'all',
  sort: 'match',
  isChatting: false,
  currentTab: 'match',
  interviewHistory: [],
  interviewActive: false,
  profile: { ...CONFIG.userProfile },
};

const $ = id => document.getElementById(id);

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined' && marked.parse) return marked.parse(text);
  return escapeHtml(text);
}

document.addEventListener('DOMContentLoaded', () => {
  APIKeyManager.init();
  loadTheme();
  loadFavorites();
  loadProfile();
  renderProfileTags();
  bindEvents();
  bindAPIKeyEvents();
  bindTabEvents();
  bindThemeToggle();
});

function bindAPIKeyEvents() {
  $('api-key-btn').addEventListener('click', () => APIKeyManager.prompt());
  $('api-key-save').addEventListener('click', () => {
    if (APIKeyManager.saveAndClose()) showToast('API Key 已保存');
    else showToast('Key 格式不对，请检查');
  });
  $('api-key-cancel').addEventListener('click', () => APIKeyManager.close());
  $('api-key-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('api-key-save').click();
  });
}

function bindTabEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
}

function bindThemeToggle() {
  $('theme-toggle').addEventListener('click', () => toggleTheme());
}

function loadTheme() {
  const theme = localStorage.getItem(CONFIG.themeKey) || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  $('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(CONFIG.themeKey, next);
  $('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
}

function bindEvents() {
  $('parse-jobs').addEventListener('click', parseJobs);
  $('clear-jobs').addEventListener('click', () => { $('jobs-input').value = ''; $('parse-status').textContent = ''; });
  $('load-sample-jobs').addEventListener('click', loadSampleJobs);
  $('chat-send').addEventListener('click', sendChatMessage);
  $('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => { $('chat-input').value = btn.dataset.q; sendChatMessage(); });
  });
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderJobs();
    });
  });
  $('sort-select').addEventListener('change', e => { state.sort = e.target.value; renderJobs(); });
  $('edit-profile').addEventListener('click', openProfileModal);
  $('profile-save').addEventListener('click', saveProfileFromModal);
  $('profile-cancel').addEventListener('click', () => $('profile-modal').style.display = 'none');
  $('analyze-resume').addEventListener('click', analyzeResume);
  $('start-interview').addEventListener('click', startInterview);
  $('interview-send').addEventListener('click', sendInterviewAnswer);
  $('interview-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendInterviewAnswer();
  });
  $('end-interview').addEventListener('click', endInterview);
  $('generate-career').addEventListener('click', generateCareerPlan);
  $('job-detail-close').addEventListener('click', () => $('job-detail-modal').style.display = 'none');
}

function parseJobs() {
  const raw = $('jobs-input').value.trim();
  if (!raw) { $('parse-status').className = 'parse-status error'; $('parse-status').textContent = '请输入岗位数据'; return; }
  let jobs = [];
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const firstLine = lines[0];
  if (firstLine.includes(',') || firstLine.includes('\t') || firstLine.includes(';')) {
    const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
    const firstCells = splitLine(firstLine, sep);
    const hasHeader = firstCells.some(c => /公司|岗位|职位|日薪|薪资|工作制|时长|地点|位置|餐|住|要求|company|position|salary/i.test(c));
    let headers, dataLines;
    if (hasHeader) { headers = firstCells.map(c => c.trim().toLowerCase()); dataLines = lines.slice(1); }
    else { headers = ['公司','岗位','日薪','工作制','实习时长','地点','餐补','住宿','要求']; dataLines = lines; }
    dataLines.forEach((line, idx) => {
      const cells = splitLine(line, sep);
      const job = parseJobFromCells(cells, headers);
      if (job) { job.id = `job-${Date.now()}-${idx}`; jobs.push(job); }
    });
  }
  if (jobs.length === 0) jobs = parseFreeText(raw);
  if (jobs.length === 0) { $('parse-status').className = 'parse-status error'; $('parse-status').textContent = '未能解析出岗位数据'; return; }
  jobs.forEach(job => { job.matchScore = calculateMatchScore(job); });
  state.jobs = jobs;
  $('parse-status').className = 'parse-status success';
  $('parse-status').textContent = `解析成功：${jobs.length} 个岗位`;
  renderSummary();
  renderJobs();
  $('jobs-section').style.display = 'block';
  $('chat-section').style.display = 'block';
  $('match-empty').style.display = 'none';
  $('match-summary').style.display = 'grid';
  $('chat-input').disabled = false;
  $('chat-send').disabled = false;
  showToast(`已导入 ${jobs.length} 个岗位`);
}

function splitLine(line, sep) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; } }
    else if (ch === sep && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseJobFromCells(cells, headers) {
  const job = { company:'', title:'', salary:'', schedule:'', duration:'', location:'', meal:'', housing:'', requirement:'' };
  headers.forEach((h, i) => {
    const val = (cells[i] || '').trim();
    if (/公司|company/.test(h)) job.company = val;
    else if (/岗位|职位|position|title/.test(h)) job.title = val;
    else if (/日薪|薪资|salary|月薪/.test(h)) job.salary = val;
    else if (/工作制|时间|schedule/.test(h)) job.schedule = val;
    else if (/时长|周期|duration/.test(h)) job.duration = val;
    else if (/地点|位置|location|地址/.test(h)) job.location = val;
    else if (/餐|饭|meal/.test(h)) job.meal = val;
    else if (/住|宿|housing/.test(h)) job.housing = val;
    else if (/要求|条件|require/.test(h)) job.requirement = val;
  });
  if (!job.company && !job.title) return null;
  return job;
}

function parseFreeText(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const jobs = [];
  paragraphs.forEach((para, idx) => {
    const lines = para.split(/\n/).filter(l => l.trim());
    const job = { company:'', title:'', salary:'', schedule:'', duration:'', location:'', meal:'', housing:'', requirement:'' };
    lines.forEach(line => {
      if (/公司/.test(line)) job.company = line.split(/[:：]/)[1]?.trim() || line;
      else if (/岗位|职位/.test(line)) job.title = line.split(/[:：]/)[1]?.trim() || line;
      else if (/日薪|薪资|月薪/.test(line)) job.salary = line.split(/[:：]/)[1]?.trim() || line;
      else if (/工作制|时间|上班/.test(line)) job.schedule = line.split(/[:：]/)[1]?.trim() || line;
      else if (/时长|周期/.test(line)) job.duration = line.split(/[:：]/)[1]?.trim() || line;
      else if (/地点|位置|地址/.test(line)) job.location = line.split(/[:：]/)[1]?.trim() || line;
      else if (/餐|饭/.test(line)) job.meal = line.split(/[:：]/)[1]?.trim() || line;
      else if (/住|宿/.test(line)) job.housing = line.split(/[:：]/)[1]?.trim() || line;
      else if (/要求|条件/.test(line)) job.requirement = line.split(/[:：]/)[1]?.trim() || line;
    });
    if (job.company || job.title) { job.id = `job-${Date.now()}-${idx}`; job.raw = para; jobs.push(job); }
  });
  return jobs;
}

function calculateMatchScore(job) {
  const p = state.profile;
  let scores = { location:0, salary:0, schedule:0, duration:0, meal:0, housing:0, role:0 };
  let maxScores = { location:20, salary:20, schedule:15, duration:15, meal:10, housing:10, role:10 };

  if (job.location && job.location.includes(p.location)) scores.location = 20;
  else if (job.location && /贵阳|贵安/.test(job.location)) scores.location = 10;

  const salaryNum = extractNumber(job.salary);
  const range = p.salaryRange.match(/(\d+)-(\d+)/);
  const minS = range ? parseInt(range[1]) : 150;
  const maxS = range ? parseInt(range[2]) : 200;
  if (salaryNum >= minS && salaryNum <= maxS) scores.salary = 20;
  else if (salaryNum >= minS - 30 && salaryNum < minS) scores.salary = 10;
  else if (salaryNum > maxS) scores.salary = 15;

  if (job.schedule && /双休/.test(job.schedule)) scores.schedule = 15;
  else if (job.schedule && /大小周/.test(job.schedule)) scores.schedule = 5;

  const durationNum = extractNumber(job.duration);
  if (durationNum >= 6) scores.duration = 15;
  else if (durationNum >= 3) scores.duration = 8;

  if (job.meal && /餐|饭|食/.test(job.meal)) scores.meal = 10;
  if (job.housing && /包住|提供住宿|人才公寓|宿舍/.test(job.housing)) scores.housing = 10;

  if (job.title) {
    const titleLower = job.title.toLowerCase();
    const roles = p.targetRoles.toLowerCase().split(/[\/,，]/).map(r => r.trim());
    for (const r of roles) {
      if (r && titleLower.includes(r)) { scores.role = 10; break; }
    }
    if (scores.role === 0 && /AI|数据|标注|训练|政务|助理/.test(job.title)) scores.role = 5;
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const maxTotal = Object.values(maxScores).reduce((a, b) => a + b, 0);
  const percentage = Math.round((total / maxTotal) * 100);
  return { percentage, breakdown: scores, maxScores };
}

function extractNumber(text) {
  if (!text) return 0;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

function renderSummary() {
  $('stat-total').textContent = state.jobs.length;
  $('stat-match').textContent = state.jobs.filter(j => j.matchScore.percentage >= 60).length;
  $('stat-fav').textContent = state.favorites.length;
  const salaries = state.jobs.map(j => extractNumber(j.salary)).filter(n => n > 0);
  const avg = salaries.length > 0 ? Math.round(salaries.reduce((a,b) => a+b, 0) / salaries.length) : 0;
  $('stat-avg-salary').textContent = avg;
}

function renderJobs() {
  const container = $('jobs-list');
  let jobs = [...state.jobs];

  if (state.filter === 'match') jobs = jobs.filter(j => j.matchScore.percentage >= 60);
  else if (state.filter === 'favorite') jobs = jobs.filter(j => state.favorites.includes(j.id));

  if (state.sort === 'match') jobs.sort((a, b) => b.matchScore.percentage - a.matchScore.percentage);
  else if (state.sort === 'salary-desc') jobs.sort((a, b) => extractNumber(b.salary) - extractNumber(a.salary));
  else if (state.sort === 'salary-asc') jobs.sort((a, b) => extractNumber(a.salary) - extractNumber(b.salary));

  if (jobs.length === 0) { container.innerHTML = '<p class="empty-state">暂无符合条件的岗位</p>'; return; }

  container.innerHTML = jobs.map(job => {
    const isFav = state.favorites.includes(job.id);
    const score = job.matchScore.percentage;
    const matchClass = score >= 70 ? 'match-high' : score >= 50 ? 'match-mid' : 'match-low';
    const ringColor = score >= 70 ? '#00b774' : score >= 50 ? '#ffa726' : '#9ca3af';
    const circumference = 2 * Math.PI * 20;
    const dashOffset = circumference - (score / 100) * circumference;

    return `
      <div class="job-card ${matchClass}" data-job-id="${job.id}">
        <div class="job-card-top">
          <div style="flex:1;">
            <div class="job-title">${escapeHtml(job.title || '未知岗位')}</div>
            <div class="job-company">${escapeHtml(job.company || '')}</div>
          </div>
          <div class="match-ring">
            <svg width="48" height="48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border-light)" stroke-width="4"/>
              <circle cx="24" cy="24" r="20" fill="none" stroke="${ringColor}" stroke-width="4"
                stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" stroke-linecap="round"/>
            </svg>
            <div class="match-ring-text" style="color:${ringColor};">${score}</div>
          </div>
          <button class="job-favorite-btn ${isFav ? 'active' : ''}" data-fav-id="${job.id}">
            ${isFav ? '⭐' : '☆'}
          </button>
        </div>
        <div class="job-tags">
          ${job.salary ? `<span class="job-tag salary">${escapeHtml(job.salary)}</span>` : ''}
          ${job.schedule ? `<span class="job-tag schedule">${escapeHtml(job.schedule)}</span>` : ''}
          ${job.duration ? `<span class="job-tag">${escapeHtml(job.duration)}</span>` : ''}
          ${job.location ? `<span class="job-tag location">${escapeHtml(job.location)}</span>` : ''}
          ${job.meal ? `<span class="job-tag meal">${escapeHtml(job.meal)}</span>` : ''}
          ${job.housing ? `<span class="job-tag housing">${escapeHtml(job.housing)}</span>` : ''}
        </div>
        ${job.requirement ? `<div class="job-requirement">${escapeHtml(job.requirement)}</div>` : ''}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('job-favorite-btn')) return;
      showJobDetail(card.dataset.jobId);
    });
  });
  container.querySelectorAll('.job-favorite-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(btn.dataset.favId); });
  });
}

function showJobDetail(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const score = job.matchScore;
  const breakdown = [
    { label: '地点', score: score.breakdown.location, max: score.maxScores.location },
    { label: '薪资', score: score.breakdown.salary, max: score.maxScores.salary },
    { label: '工作制', score: score.breakdown.schedule, max: score.maxScores.schedule },
    { label: '时长', score: score.breakdown.duration, max: score.maxScores.duration },
    { label: '餐饮', score: score.breakdown.meal, max: score.maxScores.meal },
    { label: '住宿', score: score.breakdown.housing, max: score.maxScores.housing },
    { label: '岗位', score: score.breakdown.role, max: score.maxScores.role },
  ];
  const ringColor = score.percentage >= 70 ? '#00b774' : score.percentage >= 50 ? '#ffa726' : '#9ca3af';
  $('job-detail-content').innerHTML = `
    <h3 style="margin-bottom:4px;">${escapeHtml(job.title || '未知岗位')}</h3>
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;">${escapeHtml(job.company || '')}</p>
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;">
      <div class="match-ring" style="width:64px;height:64px;">
        <svg width="64" height="64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border-light)" stroke-width="5"/>
          <circle cx="32" cy="32" r="28" fill="none" stroke="${ringColor}" stroke-width="5"
            stroke-dasharray="${2*Math.PI*28}" stroke-dashoffset="${2*Math.PI*28 - (score.percentage/100)*2*Math.PI*28}" stroke-linecap="round"/>
        </svg>
        <div class="match-ring-text" style="font-size:16px;color:${ringColor};">${score.percentage}</div>
      </div>
      <div>
        <div style="font-size:13px;color:var(--text-secondary);">综合匹配度</div>
        <div style="font-size:14px;font-weight:600;color:${ringColor};">${score.percentage >= 70 ? '高度匹配' : score.percentage >= 50 ? '一般匹配' : '匹配度低'}</div>
      </div>
    </div>
    <div class="match-breakdown">
      ${breakdown.map(b => {
        const pct = Math.round((b.score / b.max) * 100);
        const color = pct >= 80 ? '#00b774' : pct >= 50 ? '#ffa726' : '#ef5350';
        return `<div class="match-bar">
          <span class="match-bar-label">${b.label}</span>
          <div class="match-bar-track"><div class="match-bar-fill" style="width:${pct}%;background:${color};"></div></div>
          <span class="match-bar-score">${b.score}/${b.max}</span>
        </div>`;
      }).join('')}
    </div>
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-light);">
      ${job.salary ? `<p style="margin-bottom:4px;"><strong>日薪：</strong>${escapeHtml(job.salary)}</p>` : ''}
      ${job.schedule ? `<p style="margin-bottom:4px;"><strong>工作制：</strong>${escapeHtml(job.schedule)}</p>` : ''}
      ${job.duration ? `<p style="margin-bottom:4px;"><strong>实习时长：</strong>${escapeHtml(job.duration)}</p>` : ''}
      ${job.location ? `<p style="margin-bottom:4px;"><strong>地点：</strong>${escapeHtml(job.location)}</p>` : ''}
      ${job.meal ? `<p style="margin-bottom:4px;"><strong>餐补：</strong>${escapeHtml(job.meal)}</p>` : ''}
      ${job.housing ? `<p style="margin-bottom:4px;"><strong>住宿：</strong>${escapeHtml(job.housing)}</p>` : ''}
      ${job.requirement ? `<p style="margin-bottom:4px;"><strong>要求：</strong>${escapeHtml(job.requirement)}</p>` : ''}
    </div>
  `;
  $('job-detail-modal').style.display = 'flex';
}

function toggleFavorite(jobId) {
  const idx = state.favorites.indexOf(jobId);
  if (idx >= 0) { state.favorites.splice(idx, 1); showToast('已取消收藏'); }
  else { state.favorites.push(jobId); showToast('已收藏'); }
  saveFavorites();
  renderJobs();
  renderSummary();
}

function loadFavorites() {
  try { state.favorites = JSON.parse(localStorage.getItem(CONFIG.storageKey)) || []; } catch(_) { state.favorites = []; }
}
function saveFavorites() { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.favorites)); }

function loadProfile() {
  try { const saved = JSON.parse(localStorage.getItem(CONFIG.profileKey)); if (saved) state.profile = { ...CONFIG.userProfile, ...saved }; } catch(_) {}
}
function saveProfile() { localStorage.setItem(CONFIG.profileKey, JSON.stringify(state.profile)); }

function renderProfileTags() {
  const p = state.profile;
  $('profile-tags').innerHTML = `
    <span class="profile-tag">📍 ${escapeHtml(p.location)}</span>
    <span class="profile-tag">💰 ${escapeHtml(p.salaryRange.split('(')[0].trim())}</span>
    <span class="profile-tag">📅 ${escapeHtml(p.schedule)}</span>
    <span class="profile-tag">⏱️ ${escapeHtml(p.duration)}</span>
    <span class="profile-tag">🍽️ ${escapeHtml(p.mealPreference)}</span>
    <span class="profile-tag">🏠 ${escapeHtml(p.housingPreference)}</span>
    <span class="profile-tag">🎯 ${escapeHtml(p.targetRoles)}</span>
  `;
}

function openProfileModal() {
  const p = state.profile;
  const fields = [
    { key: 'location', label: '地点' },
    { key: 'salaryRange', label: '日薪期望' },
    { key: 'schedule', label: '工作制' },
    { key: 'duration', label: '实习时长' },
    { key: 'mealPreference', label: '餐饮偏好' },
    { key: 'housingPreference', label: '住宿偏好' },
    { key: 'targetRoles', label: '目标岗位' },
    { key: 'certification', label: '证明要求' },
    { key: 'education', label: '学历背景' },
    { key: 'notes', label: '其他说明' },
  ];
  $('profile-edit-fields').innerHTML = fields.map(f => `
    <div class="form-group">
      <label>${f.label}</label>
      <input type="text" class="form-input" id="profile-${f.key}" value="${escapeHtml(p[f.key] || '')}">
    </div>
  `).join('');
  $('profile-modal').style.display = 'flex';
}

function saveProfileFromModal() {
  const keys = ['location','salaryRange','schedule','duration','mealPreference','housingPreference','targetRoles','certification','education','notes'];
  keys.forEach(k => { const el = $(`profile-${k}`); if (el) state.profile[k] = el.value; });
  saveProfile();
  renderProfileTags();
  $('profile-modal').style.display = 'none';
  if (state.jobs.length > 0) {
    state.jobs.forEach(j => j.matchScore = calculateMatchScore(j));
    renderJobs();
    renderSummary();
    showToast('画像已更新，匹配度已重新计算');
  } else { showToast('画像已保存'); }
}

async function sendChatMessage() {
  const input = $('chat-input');
  const question = input.value.trim();
  if (!question || state.isChatting) return;
  addMessage('user', question, 'chat-messages');
  input.value = '';
  const loadingEl = addMessage('ai', '', 'chat-messages', true);
  state.isChatting = true;
  $('chat-send').disabled = true;
  $('chat-input').disabled = true;
  try {
    const jobsContext = buildJobsContext();
    const profileContext = buildProfileContext();
    const userMessage = `${profileContext}\n\n${jobsContext}\n\n用户问题：${question}`;
    const response = await callDeepSeekAPI(userMessage, CONFIG.prompts.match);
    loadingEl.remove();
    addMessage('ai', response, 'chat-messages');
  } catch (err) {
    loadingEl.remove();
    addMessage('ai', `出错了：${err.message}`, 'chat-messages');
  } finally {
    state.isChatting = false;
    $('chat-send').disabled = false;
    $('chat-input').disabled = false;
    $('chat-input').focus();
  }
}

function buildJobsContext() {
  if (state.jobs.length === 0) return '【岗位数据】暂无';
  const lines = state.jobs.map((job, i) => {
    const parts = [];
    if (job.company) parts.push(`公司: ${job.company}`);
    if (job.title) parts.push(`岗位: ${job.title}`);
    if (job.salary) parts.push(`日薪: ${job.salary}`);
    if (job.schedule) parts.push(`工作制: ${job.schedule}`);
    if (job.duration) parts.push(`实习时长: ${job.duration}`);
    if (job.location) parts.push(`地点: ${job.location}`);
    if (job.meal) parts.push(`餐补: ${job.meal}`);
    if (job.housing) parts.push(`住宿: ${job.housing}`);
    if (job.requirement) parts.push(`要求: ${job.requirement}`);
    return `[${i+1}] ${parts.join(' | ')}`;
  });
  return `【岗位数据】共 ${state.jobs.length} 个岗位：\n${lines.join('\n')}`;
}

function buildProfileContext() {
  const p = state.profile;
  return `【用户求职画像】\n- 地点：${p.location}\n- 日薪期望：${p.salaryRange}\n- 工作制：${p.schedule}\n- 实习时长：${p.duration}\n- 餐饮：${p.mealPreference}\n- 住宿：${p.housingPreference}\n- 目标岗位：${p.targetRoles}\n- 证明要求：${p.certification}\n- 学历背景：${p.education}\n- 其他：${p.notes}`;
}

async function callDeepSeekAPI(userMessage, systemPrompt) {
  const apiKey = APIKeyManager.get();
  if (!apiKey) throw new Error('未配置 API Key，请点击右上角「Key」');
  const response = await fetch(`${CONFIG.apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      max_tokens: CONFIG.maxTokens,
      temperature: CONFIG.temperature,
    }),
  });
  if (!response.ok) { const err = await response.text(); throw new Error(`API 错误 (${response.status}): ${err}`); }
  const data = await response.json();
  return data.choices[0]?.message?.content || '(空响应)';
}

async function callDeepSeekWithHistory(history, systemPrompt) {
  const apiKey = APIKeyManager.get();
  if (!apiKey) throw new Error('未配置 API Key');
  const response = await fetch(`${CONFIG.apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      max_tokens: CONFIG.maxTokens,
      temperature: CONFIG.temperature,
    }),
  });
  if (!response.ok) throw new Error(`API 错误 (${response.status})`);
  const data = await response.json();
  return data.choices[0]?.message?.content || '(空响应)';
}

function addMessage(role, content, containerId, isLoading = false) {
  const container = $(containerId);
  const msg = document.createElement('div');
  msg.className = `chat-message ${role}${isLoading ? ' loading' : ''}`;
  const avatar = role === 'ai' ? '🤖' : '🧑';
  const contentHtml = isLoading
    ? '<div class="loading-dots"><span></span><span></span><span></span></div> 正在分析...'
    : renderMarkdown(content);
  msg.innerHTML = `<div class="message-avatar">${avatar}</div><div class="message-content">${contentHtml}</div>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

async function analyzeResume() {
  const resume = $('resume-input').value.trim();
  const targetJob = $('target-job-input').value.trim();
  if (!resume) { $('resume-status').className = 'parse-status error'; $('resume-status').textContent = '请粘贴简历内容'; return; }
  if (!targetJob) { $('resume-status').className = 'parse-status error'; $('resume-status').textContent = '请填写目标岗位'; return; }
  $('resume-status').className = 'parse-status'; $('resume-status').textContent = 'AI 分析中...';
  $('analyze-resume').disabled = true;
  $('resume-result').innerHTML = '<div class="resume-placeholder"><div class="loading-dots"><span></span><span></span><span></span></div><p style="margin-top:12px;">AI 正在分析你的简历...</p></div>';
  try {
    const message = `【我的简历】\n${resume}\n\n【目标岗位描述】\n${targetJob}`;
    const response = await callDeepSeekAPI(message, CONFIG.prompts.resume);
    $('resume-result').innerHTML = `<div class="card compact" style="padding:24px;"><div class="resume-result-content">${renderMarkdown(response)}</div></div>`;
    $('resume-status').className = 'parse-status success'; $('resume-status').textContent = '分析完成';
  } catch (err) {
    $('resume-result').innerHTML = `<div class="resume-placeholder"><p style="color:var(--danger);">出错了：${escapeHtml(err.message)}</p></div>`;
    $('resume-status').className = 'parse-status error'; $('resume-status').textContent = '分析失败';
  } finally { $('analyze-resume').disabled = false; }
}

async function startInterview() {
  const position = $('interview-position').value.trim();
  const type = $('interview-type').value;
  const context = $('interview-context').value.trim();
  if (!position) { showToast('请填写目标岗位'); return; }
  const typeMap = { general: '综合面试', technical: '技术面试', behavioral: '行为面试(STAR法则)', hr: 'HR面试' };
  $('interview-title').textContent = `${position} · ${typeMap[type]}`;
  $('interview-setup').style.display = 'none';
  $('interview-chat').style.display = 'block';
  $('interview-messages').innerHTML = '';
  state.interviewHistory = [];
  state.interviewActive = true;
  $('interview-input').disabled = false;
  $('interview-send').disabled = false;
  const loadingEl = addMessage('ai', '', 'interview-messages', true);
  try {
    const initMessage = `我要面试的岗位：${position}\n面试类型：${typeMap[type]}\n${context ? `补充信息：${context}` : ''}\n\n请开始面试。`;
    state.interviewHistory.push({ role: 'user', content: initMessage });
    const response = await callDeepSeekWithHistory(state.interviewHistory, CONFIG.prompts.interview);
    state.interviewHistory.push({ role: 'assistant', content: response });
    loadingEl.remove();
    addMessage('ai', response, 'interview-messages');
  } catch (err) {
    loadingEl.remove();
    addMessage('ai', `出错了：${err.message}`, 'interview-messages');
  }
  $('interview-input').focus();
}

async function sendInterviewAnswer() {
  const input = $('interview-input');
  const answer = input.value.trim();
  if (!answer || !state.interviewActive) return;
  addMessage('user', answer, 'interview-messages');
  input.value = '';
  state.interviewHistory.push({ role: 'user', content: answer });
  const loadingEl = addMessage('ai', '', 'interview-messages', true);
  $('interview-send').disabled = true;
  $('interview-input').disabled = true;
  try {
    const response = await callDeepSeekWithHistory(state.interviewHistory, CONFIG.prompts.interview);
    state.interviewHistory.push({ role: 'assistant', content: response });
    loadingEl.remove();
    addMessage('ai', response, 'interview-messages');
    if (response.includes('面试结束') || response.includes('综合评价')) {
      state.interviewActive = false;
      $('interview-input').disabled = true;
      $('interview-send').disabled = true;
    }
  } catch (err) {
    loadingEl.remove();
    addMessage('ai', `出错了：${err.message}`, 'interview-messages');
  } finally {
    if (state.interviewActive) { $('interview-send').disabled = false; $('interview-input').disabled = false; }
    $('interview-input').focus();
  }
}

function endInterview() {
  state.interviewActive = false;
  $('interview-setup').style.display = 'block';
  $('interview-chat').style.display = 'none';
  $('interview-input').disabled = true;
  $('interview-send').disabled = true;
  $('interview-messages').innerHTML = '';
  state.interviewHistory = [];
  showToast('面试已结束');
}

async function generateCareerPlan() {
  const data = {
    major: $('career-major').value.trim(),
    school: $('career-school').value,
    grad: $('career-grad').value.trim(),
    directions: $('career-directions').value.trim(),
    city: $('career-city').value.trim(),
    notes: $('career-notes').value.trim(),
  };
  $('generate-career').disabled = true;
  $('career-result').innerHTML = '<div class="resume-placeholder"><div class="loading-dots"><span></span><span></span><span></span></div><p style="margin-top:12px;">AI 正在生成职业规划...</p></div>';
  try {
    const message = `【个人背景】\n专业：${data.major}\n学历：${data.school}\n毕业年份：${data.grad}\n意向方向：${data.directions}\n城市偏好：${data.city}\n补充说明：${data.notes}`;
    const response = await callDeepSeekAPI(message, CONFIG.prompts.career);
    $('career-result').innerHTML = `<div class="card compact" style="padding:24px;"><div class="career-result-content">${renderMarkdown(response)}</div></div>`;
  } catch (err) {
    $('career-result').innerHTML = `<div class="resume-placeholder"><p style="color:var(--danger);">出错了：${escapeHtml(err.message)}</p></div>`;
  } finally { $('generate-career').disabled = false; }
}

function loadSampleJobs() {
  const sample = `公司,岗位,日薪,工作制,实习时长,地点,餐补,住宿,要求
贵阳大数据交易所,数据标注员,180,双休,6个月,贵阳观山湖,免费午餐,无,本科在读 大数据/计算机相关
贵州云上艾珀,AI训练师助理,200,双休,6个月,贵阳白云,餐补30/天,人才公寓,了解大模型 有耐心
贵阳筑梦科技,政务数据辅助,160,双休,3个月,贵阳南明,无,无,专业不限 细心负责
观山湖科创园,AI数据标注,150,大小周,6个月,贵阳观山湖,免费午餐,无,本科 数据标注经验优先
贵州传媒集团,内容审核员,140,双休,6个月,贵阳云岩,餐补20/天,无,新闻/中文专业
贵阳智慧城市,数据质检员,170,双休,6个月,贵阳观山湖,免费午餐,提供宿舍,大数据/统计专业
贵州大学科技园,AI模型评测实习生,190,双休,6个月,贵阳花溪,无,无,了解AI评测 有分析能力
贵安新区大数据,数据标注,130,双休,6个月,贵安新区,免费午餐,人才公寓,专业不限 可开实习证明
贵州师范学院,科研助理,120,双休,4个月,贵阳乌当,无,无,数据科学专业 研究方向
贵阳软件园,测试开发实习生,220,双休,6个月,贵阳观山湖,餐补25/天,无,计算机专业 会Python`;
  $('jobs-input').value = sample;
  parseJobs();
}
