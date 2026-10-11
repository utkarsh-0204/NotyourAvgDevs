import { AuthResponse, DashboardStats, DocumentRecord, LegalAnalysisResult, QuestionAnswerResponse, SampleDocumentItem, SystemStatus, User } from '../types';

const API_BASE = '/api';

function getAuthToken(): string | null {
  return localStorage.getItem('nyayadrishti_token');
}

export const api = {
  // Authentication
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    return data;
  },

  async register(name: string, email: string, password: string, role?: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    return data;
  },

  async getMe(): Promise<{ user: User }> {
    const token = getAuthToken();
    if (!token) throw new Error('No authentication token found');
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to authenticate user');
    }
    return data;
  },

  async logout(): Promise<void> {
    const token = getAuthToken();
    if (token) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        // ignore
      }
    }
    localStorage.removeItem('nyayadrishti_token');
    localStorage.removeItem('nyayadrishti_user');
  },

  async getStats(): Promise<DashboardStats> {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) throw new Error('Failed to fetch dashboard stats');
    return res.json();
  },

  async listDocuments(params?: { search?: string; caseType?: string; status?: string }): Promise<{ documents: DocumentRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.append('search', params.search);
    if (params?.caseType) searchParams.append('caseType', params.caseType);
    if (params?.status) searchParams.append('status', params.status);

    const url = `${API_BASE}/documents${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch documents list');
    return res.json();
  },

  async getDocument(id: string): Promise<{ document: DocumentRecord }> {
    const res = await fetch(`${API_BASE}/documents/${id}`);
    if (!res.ok) throw new Error('Failed to retrieve document details');
    return res.json();
  },

  async uploadDocument(file: File, onProgress?: (pct: number) => void): Promise<{ document: DocumentRecord; message: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', `${API_BASE}/documents/upload`);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.round((evt.loaded / evt.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(response);
          } else {
            reject(new Error(response.error || `Upload failed with status ${xhr.status}`));
          }
        } catch (e) {
          reject(new Error(`Server error response: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred during document upload.'));
      };

      xhr.send(formData);
    });
  },

  async analyzeDocument(id: string, customApiKey?: string): Promise<{ document: DocumentRecord; message: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (customApiKey && customApiKey.trim().length > 0) {
      headers['x-gemini-api-key'] = customApiKey.trim();
    }

    const res = await fetch(`${API_BASE}/documents/${id}/analyze`, {
      method: 'POST',
      headers,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Document analysis failed.');
    }
    return data;
  },

  async askQuestion(
    id: string,
    question: string,
    history: { question: string; answer: string }[] = []
  ): Promise<QuestionAnswerResponse> {
    const res = await fetch(`${API_BASE}/documents/${id}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not answer the question.');
    return data;
  },

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete document');
    }
  },

  async getSampleDocuments(): Promise<{ samples: SampleDocumentItem[] }> {
    const res = await fetch(`${API_BASE}/samples`);
    if (!res.ok) throw new Error('Failed to load sample documents');
    return res.json();
  },

  async loadSampleDocument(sampleId: string): Promise<{ document: DocumentRecord; message: string }> {
    const res = await fetch(`${API_BASE}/samples/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load sample document');
    return data;
  },

  async getSystemStatus(): Promise<SystemStatus> {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Failed to check system health');
    return res.json();
  },

  getOriginalDownloadUrl(id: string): string {
    return `${API_BASE}/documents/${id}/download`;
  },

  getAnalysisExportUrl(id: string, format: 'json' | 'markdown' = 'json'): string {
    return `${API_BASE}/documents/${id}/export?format=${format}`;
  },
};
