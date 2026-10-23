export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Timely-Request': '1', ...(options.headers as Record<string, string> || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const rawText = await response.text();
  let data: any = {};
  if (rawText && rawText.trim()) {
    try {
      data = JSON.parse(rawText);
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      return {} as T;
    }
  }
  if (!response.ok) {
    const message = Array.isArray(data?.detail) ? data.detail.map((d: any) => `${d.loc?.slice(-1)[0] || ''}: ${d.msg}`).join('; ') : data?.detail;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return data as T;
}
export const send = (body: any, method = 'POST') => ({ method, body: JSON.stringify(body) });
export type Lead = {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  company_name: string;
  inquiry_type: string;
  source: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  website_id: string | null;
  tags: string[];
  attribution?: Record<string, any>;
  duplicate_of: string | null;
  external_submission_id: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  activities?: any[];
};
export const stages = ['new', 'contacted', 'qualified', 'converted', 'lost'];
export const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
