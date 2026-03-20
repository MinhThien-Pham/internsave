const DEFAULT_API_URL = 'http://localhost:3000';
const STORAGE_KEY = 'internsave_backend_url';
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = 'qwen2.5:3b';

const AI_FIELD_KEYS = ['employer', 'title', 'location', 'applied_at', 'status', 'platform', 'job_url', 'notes'];

const statusOptions = ['Saved', 'Applied', 'OA', 'Interview', 'Rejected', 'Offer'];

let apiBaseUrl = DEFAULT_API_URL;
let currentEditingId = null;
let cachedApplications = [];

const applicationsListEl = document.getElementById('applicationsList');
const statusFilterEl = document.getElementById('statusFilter');

const addModalEl = document.getElementById('addModal');
const editModalEl = document.getElementById('editModal');
const settingsModalEl = document.getElementById('settingsModal');

const addFormEl = document.getElementById('addForm');
const editFormEl = document.getElementById('editForm');

const employerInputEl = document.getElementById('employerInput');
const titleInputEl = document.getElementById('titleInput');
const locationInputEl = document.getElementById('locationInput');
const platformInputEl = document.getElementById('platformInput');
const statusInputEl = document.getElementById('statusInput');
const appliedAtInputEl = document.getElementById('appliedAtInput');
const jobUrlInputEl = document.getElementById('jobUrlInput');
const notesInputEl = document.getElementById('notesInput');
const aiAutofillBtnEl = document.getElementById('aiAutofillBtn');
const aiAutofillStatusEl = document.getElementById('aiAutofillStatus');

const editStatusInputEl = document.getElementById('editStatusInput');
const editNotesInputEl = document.getElementById('editNotesInput');

const backendUrlInputEl = document.getElementById('backendUrlInput');

function setAiStatus(message, type = '') {
  if (!aiAutofillStatusEl) return;
  aiAutofillStatusEl.textContent = message;
  aiAutofillStatusEl.classList.remove('error', 'success');
  if (type) aiAutofillStatusEl.classList.add(type);
}

function inferPlatformFromUrl(url) {
  if (!url) return 'Other';
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'Other';
  }

  if (host.includes('handshake')) return 'Handshake';
  if (host.includes('linkedin')) return 'LinkedIn';
  if (host.includes('indeed')) return 'Indeed';
  return 'Other';
}

function sanitizeAiValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeAiResult(raw, currentUrl) {
  const normalized = {
    employer: '',
    title: '',
    location: '',
    applied_at: '',
    status: 'Saved',
    platform: inferPlatformFromUrl(currentUrl),
    job_url: currentUrl || '',
    notes: ''
  };

  if (!raw || typeof raw !== 'object') return normalized;

  normalized.employer = sanitizeAiValue(raw.employer);
  normalized.title = sanitizeAiValue(raw.title);
  normalized.location = sanitizeAiValue(raw.location);
  normalized.notes = sanitizeAiValue(raw.notes);

  return normalized;
}

function compactText(value, maxLen) {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function buildCompactPageSummary(pageData) {
  const summary = {
    url: compactText(pageData?.url || '', 500),
    title: compactText(pageData?.title || '', 300),
    meta: pageData?.meta || {},
    headings: Array.isArray(pageData?.headings)
      ? pageData.headings.map((item) => compactText(item, 160)).filter(Boolean).slice(0, 20)
      : [],
    jobPosting: pageData?.jobPosting || null,
    visibleText: compactText(pageData?.visibleText || '', 6000)
  };

  return JSON.stringify(summary);
}

function inferLocationFromPageData(pageData) {
  const jobLocation = pageData?.jobPosting?.jobLocation || '';
  const headingText = Array.isArray(pageData?.headings) ? pageData.headings.join(' ') : '';
  const metaText = pageData?.meta ? Object.values(pageData.meta).join(' ') : '';
  const combined = [
    pageData?.title || '',
    jobLocation,
    headingText,
    metaText,
    pageData?.visibleText || ''
  ]
    .join(' ')
    .toLowerCase();

  const isRemote = /\bremote\b|work\s*from\s*home|work\s*remotely|100%\s*remote/.test(combined);
  const hasUnitedStates =
    /united states|\bu\.?s\.?a?\b|\bus\s+work\s+authorization\b/.test(combined);

  if (isRemote) {
    return hasUnitedStates ? 'Remote (United States)' : 'Remote';
  }

  if (typeof jobLocation === 'string' && jobLocation.trim()) {
    return jobLocation.trim();
  }

  return '';
}

function extractFirstJsonObject(text) {
  if (!text) return null;

  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseAiJsonResponse(responseText) {
  try {
    return JSON.parse(responseText);
  } catch {
    const candidate = extractFirstJsonObject(responseText);
    if (!candidate) throw new Error('AI did not return valid JSON');
    return JSON.parse(candidate);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function extractCurrentPageData(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/pageExtractor.js']
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (typeof window.__internsaveExtractPageData !== 'function') return null;
      return window.__internsaveExtractPageData();
    }
  });

  const result = results?.[0]?.result;
  if (!result) throw new Error('Could not read current page content');
  return result;
}

async function requestLocalAiAutofill(pageSummary) {
  const prompt = [
    'You extract internship application fields from a job page summary.',
    'Return JSON only with these exact keys and string values:',
    AI_FIELD_KEYS.join(', '),
    'Rules:',
    '- If unknown, return empty string.',
    '- For location: if the posting says remote/work from home, return "Remote". If it specifies United States, return "Remote (United States)".',
    '- status must be "Saved".',
    '- applied_at must be empty string.',
    '- platform must be one of Handshake, LinkedIn, Indeed, Other.',
    '- Keep notes short and useful.',
    '',
    'Page summary JSON:',
    pageSummary
  ].join('\n');

  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0
        }
      })
    });
  } catch {
    throw new Error('Local AI unavailable. Start Ollama at http://127.0.0.1:11434 and try again.');
  }

  if (!response.ok) {
    throw new Error(`Local AI request failed (${response.status})`);
  }

  const data = await response.json();
  if (!data?.response || typeof data.response !== 'string') {
    throw new Error('Local AI returned an unexpected response');
  }

  return parseAiJsonResponse(data.response);
}

function applyAutofillToForm(values) {
  employerInputEl.value = values.employer;
  titleInputEl.value = values.title;
  locationInputEl.value = values.location;
  appliedAtInputEl.value = '';
  statusInputEl.value = 'Saved';
  platformInputEl.value = values.platform;
  jobUrlInputEl.value = values.job_url;
  notesInputEl.value = values.notes;
}

async function handleAiAutofill() {
  if (!aiAutofillBtnEl) return;

  aiAutofillBtnEl.disabled = true;
  setAiStatus('Analyzing current page...');

  try {
    const tab = await getActiveTab();
    if (!tab?.id || !tab.url) {
      throw new Error('No active tab found');
    }

    const urlProtocol = tab.url.startsWith('http://') || tab.url.startsWith('https://');
    if (!urlProtocol) {
      throw new Error('Open a job page on http or https before using AI Autofill');
    }

    const pageData = await extractCurrentPageData(tab.id);
    const pageSummary = buildCompactPageSummary({
      ...pageData,
      url: tab.url
    });

    setAiStatus('Calling local AI model...');
    const aiRaw = await requestLocalAiAutofill(pageSummary);

    const normalized = normalizeAiResult(aiRaw, tab.url);
    const inferredLocation = inferLocationFromPageData(pageData);
    if (!normalized.location && inferredLocation) {
      normalized.location = inferredLocation;
    }
    applyAutofillToForm(normalized);

    setAiStatus('AI Autofill complete. Review and edit before saving.', 'success');
  } catch (error) {
    setAiStatus(error.message || 'AI Autofill failed', 'error');
  } finally {
    aiAutofillBtnEl.disabled = false;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toDateInputValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toApiDate(dateValue) {
  if (!dateValue) return null;
  return new Date(dateValue).toISOString();
}

async function getStoredBackendUrl() {
  const result = await chrome.storage.sync.get([STORAGE_KEY]);
  return result[STORAGE_KEY] || DEFAULT_API_URL;
}

async function setStoredBackendUrl(url) {
  await chrome.storage.sync.set({ [STORAGE_KEY]: url });
}

function openModal(modal) {
  modal.classList.remove('hidden');
}

function closeModal(modal) {
  modal.classList.add('hidden');
}

async function fetchApplications() {
  const response = await fetch(`${apiBaseUrl}/api/applications`);
  if (!response.ok) throw new Error('Failed to load applications');
  return response.json();
}

function renderApplications(items) {
  if (!items.length) {
    applicationsListEl.innerHTML = '<div class="empty">No applications yet. Click Add Application.</div>';
    return;
  }

  applicationsListEl.innerHTML = items
    .map((app) => {
      const dateText = app.applied_at ? new Date(app.applied_at).toLocaleDateString() : 'N/A';
      const urlBlock = app.job_url
        ? `<p><a href="${escapeHtml(app.job_url)}" target="_blank">job_url</a></p>`
        : '';

      return `
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${escapeHtml(app.title)}</h3>
              <p><strong>${escapeHtml(app.employer)}</strong></p>
            </div>
            <span class="badge">${escapeHtml(app.status)}</span>
          </div>
          <p class="meta">platform: ${escapeHtml(app.platform)} | location: ${escapeHtml(app.location || 'N/A')}</p>
          <p class="meta">applied_at: ${escapeHtml(dateText)}</p>
          ${urlBlock}
          <p>${escapeHtml(app.notes || '')}</p>
          <div class="actions">
            <button class="small-btn" data-edit-id="${app.id}">Edit</button>
            <button class="small-btn danger" data-delete-id="${app.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function applyStatusFilter() {
  const selected = statusFilterEl.value;
  if (!selected) {
    renderApplications(cachedApplications);
    return;
  }
  const filtered = cachedApplications.filter((item) => item.status === selected);
  renderApplications(filtered);
}

async function loadAndRender() {
  applicationsListEl.innerHTML = '<div class="loading">Loading...</div>';
  try {
    cachedApplications = await fetchApplications();
    applyStatusFilter();
  } catch (error) {
    applicationsListEl.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

async function createApplication(payload) {
  const response = await fetch(`${apiBaseUrl}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to create application');
}

async function updateApplication(id, payload) {
  const response = await fetch(`${apiBaseUrl}/api/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to update application');
}

async function removeApplication(id) {
  const response = await fetch(`${apiBaseUrl}/api/applications/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete application');
}

function findById(id) {
  return cachedApplications.find((item) => item.id === id);
}

addFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    employer: employerInputEl.value.trim(),
    title: titleInputEl.value.trim(),
    location: locationInputEl.value.trim() || null,
    applied_at: toApiDate(appliedAtInputEl.value),
    status: statusInputEl.value,
    platform: platformInputEl.value,
    job_url: jobUrlInputEl.value.trim() || null,
    notes: notesInputEl.value.trim() || null
  };

  if (!payload.employer || !payload.title || !payload.platform) {
    alert('employer, title, and platform are required');
    return;
  }

  try {
    await createApplication(payload);
    addFormEl.reset();
    closeModal(addModalEl);
    await loadAndRender();
  } catch (error) {
    alert(error.message);
  }
});

editFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentEditingId) return;

  try {
    await updateApplication(currentEditingId, {
      status: editStatusInputEl.value,
      notes: editNotesInputEl.value.trim() || null
    });
    currentEditingId = null;
    closeModal(editModalEl);
    await loadAndRender();
  } catch (error) {
    alert(error.message);
  }
});

applicationsListEl.addEventListener('click', async (event) => {
  const editId = event.target.getAttribute('data-edit-id');
  const deleteId = event.target.getAttribute('data-delete-id');

  if (editId) {
    const app = findById(editId);
    if (!app) return;
    currentEditingId = editId;
    editStatusInputEl.value = statusOptions.includes(app.status) ? app.status : 'Saved';
    editNotesInputEl.value = app.notes || '';
    openModal(editModalEl);
    return;
  }

  if (deleteId) {
    if (!confirm('Delete this application?')) return;
    try {
      await removeApplication(deleteId);
      await loadAndRender();
    } catch (error) {
      alert(error.message);
    }
  }
});

statusFilterEl.addEventListener('change', applyStatusFilter);

document.getElementById('openAddModalBtn').addEventListener('click', () => {
  addFormEl.reset();
  statusInputEl.value = 'Saved';
  platformInputEl.value = 'Handshake';
  setAiStatus('');
  openModal(addModalEl);
});

document.getElementById('closeAddModalBtn').addEventListener('click', () => closeModal(addModalEl));
document.getElementById('closeEditModalBtn').addEventListener('click', () => closeModal(editModalEl));

document.getElementById('settingsBtn').addEventListener('click', () => {
  backendUrlInputEl.value = apiBaseUrl;
  openModal(settingsModalEl);
});

document.getElementById('closeSettingsModalBtn').addEventListener('click', () => closeModal(settingsModalEl));

document.getElementById('saveBackendBtn').addEventListener('click', async () => {
  const nextValue = backendUrlInputEl.value.trim();
  if (!nextValue) {
    alert('Backend URL is required');
    return;
  }

  try {
    new URL(nextValue);
    apiBaseUrl = nextValue;
    await setStoredBackendUrl(nextValue);
    closeModal(settingsModalEl);
    await loadAndRender();
  } catch {
    alert('Please enter a valid URL');
  }
});

document.getElementById('useTabUrlBtn').addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab?.url) {
    jobUrlInputEl.value = tab.url;
  }
});

if (aiAutofillBtnEl) {
  aiAutofillBtnEl.addEventListener('click', handleAiAutofill);
}

window.addEventListener('click', (event) => {
  if (event.target === addModalEl) closeModal(addModalEl);
  if (event.target === editModalEl) closeModal(editModalEl);
  if (event.target === settingsModalEl) closeModal(settingsModalEl);
});

(async function init() {
  apiBaseUrl = await getStoredBackendUrl();
  await loadAndRender();
})();
