// All communication with the backend lives in this file.
// The backend address comes from VITE_API_URL (see .env.example); default is the local backend.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const TOKEN_KEY = 'coop_token';
const USER_KEY = 'coop_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

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
    if (token && user && user.role === 'STUDENT') saveSession(token, user);
  } catch {
    /* ignore a malformed link */
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, { body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: formData ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'تعذر الاتصال بالخادم. تأكد من تشغيل الـ backend.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    // expired / invalid token -> send the user back to the login screen
    if (res.status === 401 && token && path !== '/auth/login') {
      clearSession();
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new ApiError(res.status, data?.error || 'حدث خطأ غير متوقع', data?.details);
  }
  return data;
}

export const api = {
  // auth
  login: (email, password) => request('POST', '/auth/login', { body: { email, password } }),

  // assignment (the student's placement: organization, supervisors, dates)
  assignments: () => request('GET', '/assignments?limit=100'),
  letter: (assignmentId) => request('GET', `/assignments/${assignmentId}/letter`),

  // opportunities and applications
  openOpportunities: () => request('GET', '/opportunities?status=OPEN&limit=100'),
  myApplications: () => request('GET', '/applications?limit=100'),
  apply: (opportunityId) => request('POST', '/applications', { body: { opportunityId } }),

  // attendance
  attendance: (assignmentId) => request('GET', `/assignments/${assignmentId}/attendance`),
  checkIn: (assignmentId) => request('POST', '/attendance/check-in', { body: { assignmentId } }),
  checkOut: (assignmentId) => request('POST', '/attendance/check-out', { body: { assignmentId } }),

  // reports
  reports: () => request('GET', '/reports?limit=100'),
  submitReport: (data) => request('POST', '/reports', { body: data }),
  // edit a SUBMITTED report, or fix a REJECTED one -> it goes back to the supervisor for review
  updateReport: (id, data) => request('PATCH', `/reports/${id}`, { body: data }),

  // after the training: final grade (404 until the academic supervisor sets it) and post-training employment
  finalGrade: (assignmentId) => request('GET', `/final-grades/${assignmentId}`),
  recordEmployment: (assignmentId, data) => request('PATCH', `/assignments/${assignmentId}/employment`, { body: data }),

  // download a file (report / message attachment) with the login token, then save it
  downloadAttachment: async (id, fileName) => {
    const res = await fetch(`${API_URL}/attachments/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new ApiError(res.status, 'تعذر تحميل الملف');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'file';
    a.click();
    URL.revokeObjectURL(url);
  },

  // notifications
  notifications: () => request('GET', '/notifications?limit=50'),
  markRead: (id) => request('PATCH', `/notifications/${id}/read`),
  markAllRead: () => request('PATCH', '/notifications/read-all'),

  // messages to the academic supervisor (+ optional file such as a proof image / PDF)
  uploadAttachment: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('POST', '/attachments', { formData });
  },
  sendMessage: (data) => request('POST', '/messages', { body: data }),
};
