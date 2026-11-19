const API_BASE_URL = 'http://localhost:4000';

// دالة مساعدة لعمل طلبات الـ Fetch مع التوكن تلقائياً
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'حدث خطأ في الاتصال بالخادم');
    error.status = response.status;
    error.details = data.details;
    error.code = data.code; // login refused: PENDING | REJECTED | SUSPENDED
    error.reason = data.reason; // rejection reason (REJECTED)
    throw error;
  }

  return data;
}

// دوال المصادقة والفرص
export const authApi = {
  login: async (email, password) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  // إنشاء حساب جديد (الطالب يدخل مباشرة، والجهة/المشرف ينتظر موافقة الإدارة)
  register: async (payload) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const opportunitiesApi = {
  getAll: async () => {
    return apiRequest('/opportunities');
  },
};