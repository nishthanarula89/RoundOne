const API_URL = 'https://roundone-backend-k0fl.onrender.com';
let currentUser = null;
let selectedRole = 'SDE';
let selectedDifficulty = 'Medium';
let questions = [];
let currentQuestion = 0;
let sessionResults = [];
let charts = {};

const pages = {
  landing: document.getElementById('landing-page'),
  login: document.getElementById('login-page'),
  register: document.getElementById('register-page'),
  dashboard: document.getElementById('dashboard-page'),
  setup: document.getElementById('setup-page'),
  interview: document.getElementById('interview-page'),
  feedback: document.getElementById('feedback-page'),
  report: document.getElementById('report-page'),
};

function showPage(name) {
  Object.values(pages).forEach(p => p.classList.remove('active'));
  pages[name].classList.add('active');
}

// ============ AUTH TOKEN HELPERS ============
function saveAuth(token, user) {
  localStorage.setItem('roundone_token', token);
  localStorage.setItem('roundone_user', JSON.stringify(user));
  currentUser = user;
}

function getToken() {
  return localStorage.getItem('roundone_token');
}

function clearAuth() {
  localStorage.removeItem('roundone_token');
  localStorage.removeItem('roundone_user');
  currentUser = null;
}

// ============ DASHBOARD (fetched from backend, not localStorage) ============
async function fetchSessions() {
  const token = getToken();
  if (!token) return [];
  try {
    const response = await fetch(`${API_URL}/sessions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Failed to fetch sessions');
    return await response.json();
  } catch (err) {
    console.error(err.message);
    return [];
  }
}

async function showDashboard(name) {
  document.getElementById('dash-greeting').textContent = `Hi, ${name}.`;
  showPage('dashboard'); // show page immediately, fill data as it arrives

  const sessions = await fetchSessions();

  if (sessions.length === 0) {
    document.getElementById('dash-empty').style.display = 'block';
    document.getElementById('dash-avg').textContent = '—';
    document.getElementById('dash-best').textContent = '—';
    document.getElementById('dash-total').textContent = '0';
    document.getElementById('dash-streak').textContent = '0';
    document.getElementById('dash-recent').innerHTML = '';
    return;
  }

  document.getElementById('dash-empty').style.display = 'none';

  // finalScore is stored 0-100 on the backend; display as X/10 to match existing UI
  const scores = sessions.map(s => s.finalScore / 10);
  const overallAvg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  const best = Math.max(...scores).toFixed(1);

  document.getElementById('dash-avg').textContent = overallAvg;
  document.getElementById('dash-best').textContent = best;
  document.getElementById('dash-total').textContent = sessions.length;
  document.getElementById('dash-streak').textContent = calcStreak(sessions);

  const recent = document.getElementById('dash-recent');
  recent.innerHTML = '';
  sessions.slice(0, 5).forEach(s => {
    const score = (s.finalScore / 10).toFixed(1);
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    const c = score >= 8 ? '#4caf7d' : score >= 5 ? '#e6a817' : '#e05252';
    const d = new Date(s.createdAt).toLocaleDateString();
    const label = s.role ? `${s.role}${s.difficulty ? ' · ' + s.difficulty : ''}` : 'Practice question';
    row.innerHTML = `
      <div class="breakdown-left">
        <p class="breakdown-q">${label}</p>
        <p class="breakdown-verdict">${d} · ${s.question.substring(0, 60)}...</p>
      </div>
      <div class="breakdown-score-badge" style="background:${c}20;border:1px solid ${c};color:${c}">${score}/10</div>`;
    recent.appendChild(row);
  });
}

function calcStreak(sessions) {
  const days = [...new Set(sessions.map(s => new Date(s.createdAt).toDateString()))];
  let streak = 0;
  let cursor = new Date();
  while (days.includes(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

document.getElementById('login-btn').addEventListener('click', () => showPage('login'));
document.getElementById('get-started-btn').addEventListener('click', () => showPage('register'));
document.getElementById('hero-start-btn').addEventListener('click', () => showPage('register'));
document.getElementById('go-register-btn').addEventListener('click', () => showPage('register'));
document.getElementById('go-login-btn').addEventListener('click', () => showPage('login'));
document.getElementById('switch-to-register').addEventListener('click', () => showPage('register'));
document.getElementById('switch-to-login').addEventListener('click', () => showPage('login'));
document.getElementById('logout-btn').addEventListener('click', () => { clearAuth(); showPage('landing'); });
document.getElementById('dash-logout-btn').addEventListener('click', () => { clearAuth(); showPage('landing'); });
document.getElementById('dash-start-btn').addEventListener('click', () => showPage('setup'));
document.getElementById('new-session-btn').addEventListener('click', () => showPage('dashboard'));
document.getElementById('retry-btn').addEventListener('click', () => showPage('setup'));

// ============ REAL LOGIN ============
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error'); // add this element in HTML if not present
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed');

    saveAuth(data.token, data.user);
    document.getElementById('user-greeting').textContent = `Hi, ${data.user.name}`;
    if (errorEl) errorEl.classList.remove('visible');
    showDashboard(data.user.name);
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.classList.add('visible'); }
    else alert(err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// ============ REAL REGISTER ============
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('register-password').value;
  const error = document.getElementById('register-error');
  if (password.length < 8) { error.textContent = 'Password must be at least 8 characters.'; error.classList.add('visible'); return; }

  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim(); // add this input in HTML if not present
  const role = document.getElementById('register-role').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Registration failed');

    saveAuth(data.token, data.user);
    selectedRole = role;
    document.getElementById('user-greeting').textContent = `Hi, ${data.user.name}`;
    const activeRoleCard = document.querySelector(`[data-value="${role}"][data-group="role"]`);
    if (activeRoleCard) {
      document.querySelectorAll('[data-group="role"]').forEach(c => c.classList.remove('active'));
      activeRoleCard.classList.add('active');
    }
    error.classList.remove('visible');
    showDashboard(data.user.name);
  } catch (err) {
    error.textContent = err.message;
    error.classList.add('visible');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

document.querySelectorAll('.setup-card').forEach(card => {
  card.addEventListener('click', () => {
    const group = card.dataset.group;
    document.querySelectorAll(`[data-group="${group}"]`).forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    if (group === 'role') selectedRole = card.dataset.value;
    if (group === 'difficulty') selectedDifficulty = card.dataset.value;
  });
});

document.getElementById('start-interview-btn').addEventListener('click', () => {
  sessionResults = [];
  questions = [];
  currentQuestion = 0;
  document.getElementById('interview-role-label').textContent = `${selectedRole} · ${selectedDifficulty}`;
  showPage('interview');
  loadQuestion();
});

async function loadQuestion() {
  const total = 5;
  document.getElementById('interview-label').textContent = `Question 0${currentQuestion + 1}`;
  document.getElementById('interview-progress').textContent = `Question ${currentQuestion + 1} / ${total}`;
  document.getElementById('interview-question').textContent = 'Loading question...';
  document.getElementById('answer-input').value = '';
  document.getElementById('submit-status').textContent = '';
  document.getElementById('submit-answer-btn').disabled = false;

  try {
    const response = await fetch(`${API_URL}/generate-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: selectedRole, difficulty: selectedDifficulty, questionIndex: currentQuestion })
    });
    const data = await response.json();
    const question = data.question.trim();
    questions[currentQuestion] = question;
    document.getElementById('interview-question').textContent = `"${question}"`;
  } catch (err) {
    document.getElementById('interview-question').textContent = 'Explain the difference between stack and heap memory with a real-world example.';
    questions[currentQuestion] = document.getElementById('interview-question').textContent;
  }
}

document.getElementById('submit-answer-btn').addEventListener('click', async () => {
  const answer = document.getElementById('answer-input').value.trim();
  if (!answer) return;
  const status = document.getElementById('submit-status');
  const btn = document.getElementById('submit-answer-btn');
  status.textContent = 'Evaluating your answer...';
  btn.disabled = true;

  const token = getToken();
  if (!token) {
    status.textContent = 'Session expired — please log in again.';
    showPage('login');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/evaluate-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        question: questions[currentQuestion],
        answer,
        role: selectedRole,
        difficulty: selectedDifficulty
      })
    });
    if (response.status === 401) {
      clearAuth();
      status.textContent = 'Session expired — please log in again.';
      showPage('login');
      return;
    }
    if (!response.ok) throw new Error('Server error');
    const result = await response.json();
    if (!result.score) throw new Error('Invalid response');
    sessionResults.push({
      question: questions[currentQuestion], answer,
      score: result.score, verdict: result.verdict, analysis: result.analysis,
      technical: result.technical || result.score,
      communication: result.communication || result.score,
      clarity: result.clarity || result.score
    });
    showFeedback(result, answer);
  } catch (err) {
    status.textContent = 'Evaluation failed — click submit to retry.';
    btn.disabled = false;
  }
});

function showFeedback(result, answer) {
  document.getElementById('feedback-score-num').textContent = result.score;
  document.getElementById('feedback-verdict').textContent = result.verdict;
  document.getElementById('feedback-question-text').textContent = questions[currentQuestion];
  document.getElementById('feedback-answer-text').textContent = answer;
  document.getElementById('feedback-analysis').textContent = result.analysis;
  document.getElementById('feedback-ideal').textContent = result.idealAnswer || 'Not available.';
  document.getElementById('feedback-progress').textContent = `Question ${currentQuestion + 1} / 5`;
  document.getElementById('next-question-btn').textContent = currentQuestion < 4 ? 'Next question →' : 'See full report →';
  showPage('feedback');
}

document.getElementById('next-question-btn').addEventListener('click', () => {
  if (currentQuestion < 4) {
    currentQuestion++;
    showPage('interview');
    loadQuestion();
  } else {
    showReport();
  }
});

function showReport() {
  const scores = sessionResults.map(r => r.score);
  const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  const best = Math.max(...scores);
  const worst = Math.min(...scores);

  document.getElementById('report-overall-score').textContent = avg;
  document.getElementById('report-best').textContent = best;
  document.getElementById('report-worst').textContent = worst;
  document.getElementById('report-questions').textContent = sessionResults.length;

  const title = avg >= 8 ? 'Outstanding.' : avg >= 6 ? 'Well done.' : 'Keep going.';
  const sub = avg >= 8 ? 'You are ready.' : avg >= 6 ? 'Almost there.' : 'Practice makes perfect.';
  document.getElementById('report-verdict-title').textContent = title;
  document.getElementById('report-verdict-sub').textContent = sub;

  // no localStorage save needed — /evaluate-answer already persisted each
  // question to MongoDB as it was answered

  drawRing(avg);

  const breakdown = document.getElementById('report-breakdown');
  breakdown.innerHTML = '';
  sessionResults.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    const c = r.score >= 8 ? '#4caf7d' : r.score >= 5 ? '#e6a817' : '#e05252';
    row.innerHTML = `
      <div class="breakdown-left">
        <p class="breakdown-q">Q${i + 1}. ${r.question.substring(0, 70)}...</p>
        <p class="breakdown-verdict">${r.verdict}</p>
      </div>
      <div class="breakdown-score-badge" style="background:${c}20;border:1px solid ${c};color:${c}">${r.score}/10</div>`;
    breakdown.appendChild(row);
  });

  renderCharts();
  showPage('report');
}

function drawRing(avg) {
  const pct = avg * 10;
  const circle = document.getElementById('ring-fill');
  const circumference = 2 * Math.PI * 54;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference - (pct / 100) * circumference;
  document.getElementById('ring-pct').textContent = `${pct}%`;
}

function renderCharts() {
  Object.values(charts).forEach(c => c && c.destroy());

  const labels = sessionResults.map((_, i) => `Q${i + 1}`);
  const scores = sessionResults.map(r => r.score);
  const gridColor = '#3a3633';
  const textColor = '#8a8178';

  charts.bar = new Chart(document.getElementById('chart-bar'), {
    type: 'bar',
    data: { labels, datasets: [{ data: scores, backgroundColor: scores.map(s => s >= 8 ? '#4caf7d' : s >= 5 ? '#e6a817' : '#e05252'), borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 10, grid: { color: gridColor }, ticks: { color: textColor } }, x: { grid: { display: false }, ticks: { color: textColor } } } }
  });

  const buckets = [0, 0, 0, 0];
  scores.forEach(s => { if (s >= 8) buckets[0]++; else if (s >= 6) buckets[1]++; else if (s >= 4) buckets[2]++; else buckets[3]++; });
  charts.doughnut = new Chart(document.getElementById('chart-doughnut'), {
    type: 'doughnut',
    data: { labels: ['Excellent', 'Good', 'Average', 'Poor'], datasets: [{ data: buckets, backgroundColor: ['#4caf7d', '#e6a817', '#e08a52', '#e05252'], borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 11 } } } } }
  });

  const avgOf = (k) => (sessionResults.reduce((a, r) => a + r[k], 0) / sessionResults.length).toFixed(1);
  charts.radar = new Chart(document.getElementById('chart-radar'), {
    type: 'radar',
    data: {
      labels: ['Technical', 'Communication', 'Clarity'],
      datasets: [{ data: [avgOf('technical'), avgOf('communication'), avgOf('clarity')], backgroundColor: 'rgba(232,224,213,0.15)', borderColor: '#e8e0d5', pointBackgroundColor: '#e8e0d5' }]
    },
    options: { plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 10, grid: { color: gridColor }, angleLines: { color: gridColor }, pointLabels: { color: textColor, font: { size: 11 } }, ticks: { display: false } } } }
  });
}

let recognition = null;
let isRecording = false;
const voiceBtn = document.getElementById('voice-btn');
const voiceBtnText = document.getElementById('voice-btn-text');

voiceBtn.addEventListener('click', () => {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Voice not supported in this browser. Use Chrome.');
    return;
  }
  if (isRecording) { recognition.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';
  recognition.onstart = () => { isRecording = true; voiceBtn.classList.add('recording'); voiceBtnText.textContent = 'Stop recording'; };
  recognition.onresult = (e) => {
    let t = '';
    for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
    document.getElementById('answer-input').value = t;
  };
  recognition.onend = () => { isRecording = false; voiceBtn.classList.remove('recording'); voiceBtnText.textContent = 'Use voice'; };
  recognition.start();
});