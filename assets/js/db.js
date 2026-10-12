/* ============================================
   课程数据层 - 通过后端 API 获取
   ============================================ */

const API_BASE = '';   // 同源部署
const ADMIN_TOKEN_KEY = 'training_admin_token';

/* ---------- 管理员 token ---------- */
function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}
function setAdminToken(t) {
  if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function requireAdmin() {
  let token = getAdminToken();
  if (!token) {
    token = prompt('请输入管理员 token（首次使用向部署方索取）：');
    if (token) setAdminToken(token);
  }
  return token;
}

/* ---------- API 封装 ---------- */
async function apiGet(path) {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error('API 错误 ' + r.status);
  return r.json();
}

async function apiSend(path, method, body, isForm = false) {
  const headers = { 'X-Token': getAdminToken() };
  if (!isForm) headers['Content-Type'] = 'application/json';
  const r = await fetch(API_BASE + path, { method, headers, body });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!r.ok) throw new Error(json.error || ('HTTP ' + r.status));
  return json;
}

/* ---------- 课程数据 ---------- */
async function listAllCourses() {
  const data = await apiGet('/api/courses');
  return {
    builtin: data.courses,
    user: [],
    all: data.courses,
  };
}

async function loadBuiltinCourseDetail(id) {
  return await apiGet('/api/courses/' + id);
}

/* ---------- 上传 / 删除（管理员）---------- */
async function uploadCourse(formData) {
  // formData: FormData (含 title, instructor, description, pdf?, video?)
  const r = await fetch(API_BASE + '/api/courses', {
    method: 'POST',
    headers: { 'X-Token': getAdminToken() },
    body: formData,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error || ('HTTP ' + r.status));
  return json;
}

async function deleteCourse(id) {
  return await apiSend('/api/courses/' + id, 'DELETE');
}

/* ---------- Toast 通知 ---------- */
function showToast(message, type = 'default') {
  const container = document.querySelector('.toast-container') ||
    (() => {
      const c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
      return c;
    })();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ---------- 工具 ---------- */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
