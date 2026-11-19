// All communication with the backend lives in this file.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const MAIN_PORTAL_URL = import.meta.env.VITE_MAIN_PORTAL_URL || 'http://localhost:5174';

const TOKEN_KEY = 'provider_token';
const USER_KEY = 'provider_user';

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
    if (token && user && user.role === 'ORG_SUPERVISOR') saveSession(token, user);
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
    this.details = data.details;
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
    if (res.status === 401 && token) {
      clearSession();
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(res.status, data?.error || 'حدث خطأ غير متوقع', data || {});
  }
  return data;
}

const get = (p) => request('GET', p);
const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  me: () => get('/auth/me'),

  // opportunities of MY organization
  myOpportunities: () => get('/opportunities' + qs({ mine: 'true', limit: 100 })),
  seatsSummary: () => get('/opportunities/summary'),
  createOpportunity: (data) => request('POST', '/opportunities', data),
  updateOpportunity: (id, data) => request('PATCH', `/opportunities/${id}`, data),
  deleteOpportunity: (id) => request('DELETE', `/opportunities/${id}`),

  // applicants (sorted by GPA) and the provider's decision on NOMINATED applications
  applicants: (opportunityId) => get(`/opportunities/${opportunityId}/applicants`),
  decideApplication: (id, status) => request('PATCH', `/applications/${id}/status`, { status }),

  // my trainees (assignments) with attendance rate, evaluation flag, final grade
  trainees: () => get('/supervisor/students'),

  // evaluation form (نموذج 2)
  evaluations: () => get('/evaluations' + qs({ limit: 100 })),
  evaluation: (assignmentId) => get(`/evaluations/${assignmentId}`),
  submitEvaluation: (data) => request('POST', '/evaluations', data),

  // reports
  reports: (params = {}) => get('/reports' + qs({ limit: 100, ...params })),
  submitReport: (data) => request('POST', '/reports', data),
  reviewReport: (id, status) => request('PATCH', `/reports/${id}/status`, { status }),

  // field visits requested by academic supervisors
  visits: () => get('/visits' + qs({ limit: 100 })),
  respondVisit: (id, decision, message) => request('PATCH', `/visits/${id}/respond`, { decision, message: message || undefined }),
};

// ── helpers shared by the screens ──
export const ORG_TYPE_AR = { PRIVATE: 'منشأة', EDUCATIONAL: 'تعليمية', GOVERNMENT: 'حكومية' };
export const OPP_TYPE_AR = { COOP: 'تدريب تعاوني', SUMMER: 'تدريب صيفي' };
export const OPP_STATUS_AR = { OPEN: 'متاح', CLOSED: 'منتهي' };
export const APP_STATUS_AR = {
  PENDING: 'بانتظار ترشيح المشرف الأكاديمي',
  NOMINATED: 'مرشّح — بانتظار قرارك',
  APPROVED: 'مقبول',
  REJECTED: 'مرفوض',
};

export const ymd = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');
export const dmy = (d) => (d ? ymd(d).split('-').reverse().join('/') : '');

// Backend messages -> Arabic (anything unknown is shown as is)
const ERRORS_AR = {
  'Invalid email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  'Validation failed': 'تحقق من البيانات المدخلة.',
  'This trainee has already been evaluated': 'تم تقييم هذا المتدرب مسبقاً.',
  'The requested time has already passed': 'موعد الزيارة المطلوب قد مضى.',
  'This request was already answered or cancelled': 'تم الرد على هذا الطلب أو إلغاؤه مسبقاً.',
};
export function errorAr(err) {
  if (err.code === 'PENDING') return 'حسابك قيد المراجعة. ستتمكن من الدخول بعد موافقة إدارة النظام.';
  if (err.code === 'REJECTED') return 'تم رفض طلب التسجيل.' + (err.reason ? ` السبب: ${err.reason}` : '');
  if (err.code === 'SUSPENDED') return 'تم إيقاف حسابك. يرجى التواصل مع إدارة النظام.';
  if (ERRORS_AR[err.message]) return ERRORS_AR[err.message];
  if (err.message?.startsWith('Students have already applied')) return 'لا يمكن حذف فرصة تقدّم عليها طلاب. يمكنك إغلاقها بدلاً من ذلك.';
  if (err.message?.startsWith('Seats cannot be lower')) return 'لا يمكن أن يقل عدد المقاعد عن عدد الطلاب المقبولين.';
  if (err.message?.startsWith('All seats of this opportunity are taken')) return 'جميع المقاعد محجوزة. زد عدد المقاعد أو ارفض الطلب.';
  return err.message;
}
