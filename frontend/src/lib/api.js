const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const API_BASE = configuredApiBase.endsWith('/api')
  ? configuredApiBase
  : `${configuredApiBase}/api`;

function getAuthHeaders() {
  const token = localStorage.getItem('researchly_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // --- Health & Auth ---
  async getStatus() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  async getCurrentUser() {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
    return res.json();
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  async register(data) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async logout() {
    const res = await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    localStorage.removeItem('researchly_token');
    return res.json();
  },

  async updateProfile(profileData) {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(profileData)
    });
    return res.json();
  },

  // --- Conferences & Discovery ---
  async getConferences(filters = {}) {
    const query = new URLSearchParams();
    if (filters.search) query.append('search', filters.search);
    if (filters.field && filters.field !== 'All') query.append('field', filters.field);
    if (filters.format && filters.format !== 'All') query.append('format', filters.format);
    if (filters.risk && filters.risk !== 'All') query.append('risk', filters.risk);
    if (filters.status && filters.status !== 'All') query.append('status', filters.status);
    if (filters.event_type && filters.event_type !== 'All') query.append('event_type', filters.event_type);

    const res = await fetch(`${API_BASE}/conferences?${query.toString()}`);
    return res.json();
  },

  async getConferenceDetail(id) {
    const res = await fetch(`${API_BASE}/conferences/${id}`);
    return res.json();
  },

  async syncEvents() {
    const res = await fetch(`${API_BASE}/conferences/sync`, { method: 'POST' });
    return res.json();
  },

  async getSchedulerStatus() {
    const res = await fetch(`${API_BASE}/conferences/sync/status`);
    return res.json();
  },

  // --- Social Feed ---
  async getPosts() {
    const res = await fetch(`${API_BASE}/posts`);
    return res.json();
  },

  async createPost(postData) {
    const res = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(postData)
    });
    return res.json();
  },

  async toggleLike(postId) {
    const res = await fetch(`${API_BASE}/posts/${postId}/like`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId: 'current-user' })
    });
    return res.json();
  },

  async getComments(postId) {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`);
    return res.json();
  },

  async addComment(postId, content, author) {
    const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        content,
        author_name: author?.name || 'Academic Researcher',
        author_institution: author?.institution || 'Research Institute'
      })
    });
    return res.json();
  },

  async sharePost(postId) {
    const res = await fetch(`${API_BASE}/posts/${postId}/share`, { method: 'POST' });
    return res.json();
  },

  async aiDraftPost(data) {
    const res = await fetch(`${API_BASE}/posts/ai-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // --- AI Matcher ---
  async matchPaper(data) {
    const res = await fetch(`${API_BASE}/ai-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // --- Applications Tracker (Kanban) ---
  async getApplications() {
    const res = await fetch(`${API_BASE}/applications`, { headers: getAuthHeaders() });
    return res.json();
  },

  async createApplication(data) {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async updateApplication(id, updates) {
    const res = await fetch(`${API_BASE}/applications/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    return res.json();
  },

  async deleteApplication(id) {
    const res = await fetch(`${API_BASE}/applications/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  // --- AI Paper Peer Review ---
  async reviewPaper(payload, isFormData = false) {
    let options = { method: 'POST' };
    if (isFormData) {
      options.body = payload;
    } else {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(payload);
    }
    const res = await fetch(`${API_BASE}/paper-reviews/analyze`, options);
    return res.json();
  },

  async getPaperReviews() {
    const res = await fetch(`${API_BASE}/paper-reviews`, { headers: getAuthHeaders() });
    return res.json();
  },

  // --- Colleague Network & Communities ---
  async getColleagues() {
    const res = await fetch(`${API_BASE}/network/colleagues`, { headers: getAuthHeaders() });
    return res.json();
  },

  async getConnectionRequests() {
    const res = await fetch(`${API_BASE}/network/requests`, { headers: getAuthHeaders() });
    return res.json();
  },

  async sendConnectionRequest(id, message = '') {
    const res = await fetch(`${API_BASE}/network/request/${id}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message })
    });
    return res.json();
  },

  async acceptConnection(id) {
    const res = await fetch(`${API_BASE}/network/accept/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  async rejectConnection(id) {
    const res = await fetch(`${API_BASE}/network/reject/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  async disconnectResearcher(id) {
    const res = await fetch(`${API_BASE}/network/disconnect/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  async getCommunities() {
    const res = await fetch(`${API_BASE}/network/communities`);
    return res.json();
  }
};
