// All communication with the backend lives in this file.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const MAIN_PORTAL_URL = import.meta.env.VITE_MAIN_PORTAL_URL || 'http://localhost:5174';

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

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

// Sign-in coming from the main portal: <url>/#session=<base64 of {token,user}>
export function consumeHashSession() {
  const match = window.location.hash.match(/session=([^&]+)/);
  if (!match) return;
  try {
    const { token, user } = JSON.parse(decodeURIComponent(atob(match[1])));
    if (token && user && user.role === 'ADMIN') saveSession(token, user);
  } catch {
    /* ignore a malformed link */
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.code = data.code;
    this.reason = data.reason;
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
    if (res.status === 401 && token) {
      clearSession();
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(res.status, data?.error || 'حدث خطأ غير متوقع', data || {});
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => request('GET', '/auth/me'),

  stats: () => request('GET', '/stats/summary'),

  users: (params = {}) => request('GET', '/users' + qs({ limit: 100, ...params })),
  setActive: (id, isActive) => request('PATCH', `/users/${id}/active`, { isActive }),
  reject: (id, reason) => request('POST', `/users/${id}/reject`, { reason: reason || undefined }),

  approvedApplications: () => request('GET', '/applications' + qs({ status: 'APPROVED', limit: 100 })),
  assignments: () => request('GET', '/assignments' + qs({ limit: 100 })),
  createAssignment: (data) => request('POST', '/assignments', data),
  setAssignmentStatus: (id, status) => request('PATCH', `/assignments/${id}/status`, { status }),

  organizations: () => request('GET', '/organizations' + qs({ limit: 100 })),
  organization: (id) => request('GET', `/organizations/${id}`),

  logs: (params = {}) => request('GET', '/logs' + qs({ limit: 50, ...params })),
};

// ── Arabic labels ──
export const ROLE_AR = { STUDENT: 'طالب', ACADEMIC_SUPERVISOR: 'مشرف أكاديمي', ORG_SUPERVISOR: 'جهة تدريب', ADMIN: 'مدير النظام' };
export const STATUS_AR = { PENDING: 'بانتظار الموافقة', ACTIVE: 'مفعّل', REJECTED: 'مرفوض', SUSPENDED: 'موقوف' };
export const ORG_TYPE_AR = { PRIVATE: 'منشأة', EDUCATIONAL: 'تعليمية', GOVERNMENT: 'حكومية' };
export const ASSIGNMENT_AR = { ACTIVE: 'جارٍ', COMPLETED: 'مكتمل', CANCELLED: 'ملغى' };

export const dmy = (d) => (d ? new Date(d).toISOString().split('T')[0].split('-').reverse().join('/') : '—');
export const dateTime = (d) =>
  new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(d));

const ERRORS_AR = {
  'Invalid email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'This student already has an active assignment': 'لدى هذا الطالب تكليف جارٍ بالفعل.',
  'No seats left for this opportunity': 'لا توجد مقاعد متبقية في هذه الفرصة.',
  'You cannot disable your own account': 'لا يمكنك إيقاف حسابك.',
  'Only pending supervisor or training-provider requests can be rejected': 'يمكن رفض طلبات التسجيل المعلّقة فقط.',
};
export function errorAr(err) {
  if (err.code === 'PENDING') return 'الحساب قيد المراجعة.';
  if (err.code === 'SUSPENDED') return 'تم إيقاف الحساب.';
  if (err.code === 'REJECTED') return 'تم رفض طلب التسجيل.';
  return ERRORS_AR[err.message] || err.message;
}
