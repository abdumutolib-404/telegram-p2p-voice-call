import { adminFetch } from '../api/client';
import type {
  SystemHealthTelemetry,
  MatchmakingQueueTelemetry,
  ActiveCallsTelemetry,
  SystemErrorsTelemetry,
  AuditLogItem,
  AdminStats,
  PlansResponse,
  UserItem,
  AppealItem,
  ManualPaymentRequestItem,
  StarsTransactionItem,
} from '../types';

export const adminApi = {
  // --- Telemetry Endpoints (Milestone M5) ---
  getHealth: () => adminFetch<SystemHealthTelemetry>('/api/admin/telemetry/health'),
  getQueue: () => adminFetch<MatchmakingQueueTelemetry>('/api/admin/telemetry/queue'),
  getActiveCalls: () => adminFetch<ActiveCallsTelemetry>('/api/admin/telemetry/active-calls'),
  getErrors: (limit = 50) => adminFetch<SystemErrorsTelemetry>(`/api/admin/telemetry/errors?limit=${limit}`),

  // --- Audit Log Trail ---
  getAuditLogs: () => adminFetch<AuditLogItem[]>('/api/admin/audit-logs'),

  // --- Overview & Analytics ---
  getStats: () => adminFetch<AdminStats>('/api/admin/stats'),

  // --- Global Plan Configurations ---
  getPlans: () => adminFetch<PlansResponse>('/api/admin/plans'),
  updatePlans: (data: unknown) =>
    adminFetch<{ success: boolean; plans: PlansResponse }>('/api/admin/plans', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // --- User / Candidate Operations ---
  getUsers: (query = '', status = '') => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (status) params.set('status', status);
    const queryString = params.toString();
    return adminFetch<UserItem[]>(`/api/admin/users${queryString ? `?${queryString}` : ''}`);
  },
  updateUserPlan: (userId: string, data: unknown) =>
    adminFetch<UserItem>(`/api/admin/users/${userId}/plan`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  banUser: (userId: string, permanent = true, reason = '') =>
    adminFetch<{ success: boolean; user: UserItem }>(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ permanent, reason }),
    }),
  moderateUser: (userId: string, action: string, reason = '') =>
    adminFetch<{ success: boolean; user: UserItem }>(`/api/admin/users/${userId}/moderate`, {
      method: 'POST',
      body: JSON.stringify({ action, reason }),
    }),

  // --- Appeals Management ---
  getAppeals: () => adminFetch<AppealItem[]>('/api/admin/appeals'),
  approveAppeal: (appealId: string) =>
    adminFetch<{ success: boolean; message: string }>(`/api/admin/appeals/${appealId}/approve`, {
      method: 'POST',
    }),
  rejectAppeal: (appealId: string) =>
    adminFetch<{ success: boolean; message: string }>(`/api/admin/appeals/${appealId}/reject`, {
      method: 'POST',
    }),

  // --- Payment Queues ---
  getManualPayments: (tab = 'queue', search = '') => {
    const params = new URLSearchParams();
    if (tab) params.set('tab', tab);
    if (search) params.set('search', search);
    return adminFetch<ManualPaymentRequestItem[]>(`/api/admin/payments/manual?${params.toString()}`);
  },
  getStarsPayments: () => adminFetch<StarsTransactionItem[]>('/api/admin/payments/stars'),
};
