import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    console.log('🟡 API CLIENT: Making request to', config.method?.toUpperCase(), config.url);
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🟡 API CLIENT: Added auth token to request');
    }
    return config;
  },
  (error) => {
    console.log('🔴 API CLIENT: Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  register: (data: { email: string; password: string; fullName: string; organizationName: string }) =>
    api.post('/auth/register', {
      email: data.email,
      password: data.password,
      full_name: data.fullName,
      organization_name: data.organizationName,
    }),

  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),

  logout: () => api.post('/auth/logout'),

  getCurrentUser: () => api.get('/auth/me'),

  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
};

// Framework APIs
export const frameworkAPI = {
  getAll: () => api.get('/frameworks'),
};

// Dashboard APIs
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),

  getPriorityActions: () => api.get('/dashboard/priority-actions'),

  getRecentActivity: () => api.get('/dashboard/recent-activity'),

  getComplianceTrend: (params: { period: string }) =>
    api.get('/dashboard/compliance-trend', { params }),

  getCrosswalkImpact: () => api.get('/dashboard/crosswalk-impact'),
};

// Organization APIs
export const organizationAPI = {
  getFrameworks: (orgId: string) => api.get(`/organizations/${orgId}/frameworks`),

  addFrameworks: (orgId: string, data: { frameworkIds: string[] }) =>
    api.post(`/organizations/${orgId}/frameworks`, data),

  removeFramework: (orgId: string, frameworkId: string) =>
    api.delete(`/organizations/${orgId}/frameworks/${frameworkId}`),

  getControls: (orgId: string, params?: { frameworkId?: string; status?: string }) =>
    api.get(`/organizations/${orgId}/controls`, { params }),
};

// Controls APIs
export const controlsAPI = {
  getControl: (controlId: string) => api.get(`/controls/${controlId}`),

  updateImplementation: (
    controlId: string,
    data: {
      status: string;
      implementationDetails?: string;
      evidenceUrl?: string;
      assignedTo?: string;
      notes?: string;
    }
  ) => api.put(`/controls/${controlId}/implementation`, data),

  getMappings: (controlId: string) => api.get(`/controls/${controlId}/mappings`),

  getHistory: (controlId: string) => api.get(`/controls/${controlId}/history`),
};

// Audit APIs
export const auditAPI = {
  getLogs: (params: {
    userId?: string;
    eventType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => api.get('/audit/logs', { params }),

  getStats: (params: { startDate?: string; endDate?: string }) =>
    api.get('/audit/stats', { params }),

  getEventTypes: () => api.get('/audit/event-types'),

  getUserLogs: (userId: string) => api.get(`/audit/user/${userId}`),
};

export default api;
