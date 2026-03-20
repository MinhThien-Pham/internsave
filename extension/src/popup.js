const DEFAULT_API_URL = 'http://localhost:3000';
const STORAGE_KEY = 'internsave_backend_url';

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

const editStatusInputEl = document.getElementById('editStatusInput');
const editNotesInputEl = document.getElementById('editNotesInput');

const backendUrlInputEl = document.getElementById('backendUrlInput');

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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    jobUrlInputEl.value = tab.url;
  }
});

window.addEventListener('click', (event) => {
  if (event.target === addModalEl) closeModal(addModalEl);
  if (event.target === editModalEl) closeModal(editModalEl);
  if (event.target === settingsModalEl) closeModal(settingsModalEl);
});

(async function init() {
  apiBaseUrl = await getStoredBackendUrl();
  await loadAndRender();
})();
