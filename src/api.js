// All communication with the backend lives in this file.
// Same functions / arguments / responses as src/mockApi.js (which was used before connecting).
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const MAIN_PORTAL_URL = import.meta.env.VITE_MAIN_PORTAL_URL || 'http://localhost:5174';

const TOKEN_KEY = 'supervisor_token';
const USER_KEY = 'supervisor_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Sign-in coming from the main portal: it opens this app as  <url>/#session=<base64 of {token,user}>
// (localStorage is not shared between different ports, so the session travels in the link).
export function consumeHashSession() {
  const match = window.location.hash.match(/session=([^&]+)/);
  if (!match) return;
  try {
    const { token, user } = JSON.parse(decodeURIComponent(atob(match[1])));
    if (token && user && user.role === 'ACADEMIC_SUPERVISOR') saveSession(token, user);
  } catch {
    /* ignore a malformed link */
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'تعذر الاتصال بالخادم. تأكد من تشغيل الـ backend.');
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    // expired / invalid session -> back to the login screen
    if (res.status === 401 && token && path !== '/auth/login') {
      clearSession();
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(res.status, data?.error || 'حدث خطأ غير متوقع');
  }
  return data;
}

const get = (p) => request('GET', p);

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email: email.trim(), password }),
  me: () => get('/auth/me'),

  supervisedStudents: () => get('/supervisor/students'),

  applications: ({ status } = {}) => get(`/applications?limit=100${status ? `&status=${status}` : ''}`),
  nominate: (applicationId) => request('PATCH', `/applications/${applicationId}/status`, { status: 'NOMINATED' }),

  attendance: (assignmentId) => get(`/assignments/${assignmentId}/attendance`),

  reports: () => get('/reports?limit=100'),
  reviewReport: (reportId, status) => request('PATCH', `/reports/${reportId}/status`, { status }),

  notes: (assignmentId) => get(`/assignments/${assignmentId}/notes`),
  addNote: (assignmentId, note) => request('POST', '/notes', { assignmentId, note }),

  visits: () => get('/visits?limit=100'),
  requestVisit: (data) => request('POST', '/visits', data),
  updateVisit: (visitId, data) => request('PATCH', `/visits/${visitId}`, data),
  cancelVisit: (visitId) => request('PATCH', `/visits/${visitId}/cancel`),

  criteria: () => get('/evaluations/criteria'),
  evaluation: (assignmentId) => get(`/evaluations/${assignmentId}`),
  commencement: (assignmentId) => get(`/assignments/${assignmentId}/commencement`),

  setFinalGrade: (assignmentId, grade) => request('POST', '/final-grades', { assignmentId, grade }),
  recordEmployment: (assignmentId, data) => request('PATCH', `/assignments/${assignmentId}/employment`, data),

  notifications: () => get('/notifications?limit=50'),
  markAllRead: () => request('PATCH', '/notifications/read-all'),

  contacts: () => get('/messages/contacts'),
  thread: (userId) => get(`/messages/with/${userId}?limit=100`),
  conversations: () => get('/messages/conversations'),
  sendMessage: (data) => request('POST', '/messages', data),

  stats: () => get('/stats/summary'),

  // download a report / message file with the login token, then save it
  downloadAttachment: async (attachment) => {
    const res = await fetch(`${API_URL}/attachments/${attachment.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError(res.status, 'تعذر تحميل الملف');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.originalName || 'file';
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Requests students send from the student portal arrive as messages with these subjects
export const STUDENT_REQUEST_SUBJECTS = ['طلب اعتماد انصراف (نسيان تسجيل الانصراف)', 'عذر غياب', 'طلب استئذان / انصراف مبكر'];
