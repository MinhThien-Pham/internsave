import {
    escapeHtml,
    fetchApplications,
    formatDisplayDate,
    getStoredBackendUrl,
    openOrFocusFormWindow,
    removeApplication,
    setStoredBackendUrl,
    saveFormDraft
} from './common.js';

const tableBodyEl = document.getElementById('tableBody');
const bannerEl = document.getElementById('statusBanner');
const refreshBtnEl = document.getElementById('refreshBtn');
const backendUrlInputEl = document.getElementById('backendUrlInput');
const saveBackendBtnEl = document.getElementById('saveBackendBtn');

function setBanner(message, type = 'info') {
    bannerEl.textContent = message;
    bannerEl.classList.remove('error', 'success', 'info');
    bannerEl.classList.add(type);
}

function renderRows(items) {
    if (!items.length) {
        tableBodyEl.innerHTML = '<tr><td colspan="9">No applications yet.</td></tr>';
        return;
    }

    tableBodyEl.innerHTML = items
        .map((app) => {
            const safeUrl = escapeHtml(app.job_url || '');
            const linkBlock = app.job_url
                ? `<a class="url" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`
                : 'N/A';

            return `
        <tr>
          <td>${escapeHtml(app.employer)}</td>
          <td>${escapeHtml(app.title)}</td>
          <td>${escapeHtml(app.location || 'N/A')}</td>
          <td>${escapeHtml(formatDisplayDate(app.applied_at))}</td>
          <td>${escapeHtml(app.status)}</td>
          <td>${escapeHtml(app.platform)}</td>
          <td>${linkBlock}</td>
          <td>${escapeHtml(app.notes || '')}</td>
          <td>
            <button class="action-btn" data-edit-id="${app.id}" type="button">Edit</button>
            <button class="action-btn delete" data-delete-id="${app.id}" type="button">Delete</button>
          </td>
        </tr>
      `;
        })
        .join('');
}

async function loadTable() {
    setBanner('Loading applications...', 'info');
    try {
        const items = await fetchApplications();
        renderRows(items);
        setBanner(`Loaded ${items.length} application(s).`, 'success');
    } catch (error) {
        setBanner(error.message || 'Failed to load applications', 'error');
    }
}

tableBodyEl.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const editId = target.getAttribute('data-edit-id');
    const deleteId = target.getAttribute('data-delete-id');

    if (editId) {
        await openOrFocusFormWindow({ editId });
        return;
    }

    if (deleteId) {
        const ok = confirm('Delete this application?');
        if (!ok) return;

        try {
            await removeApplication(deleteId);
            await loadTable();
        } catch (error) {
            setBanner(error.message || 'Delete failed', 'error');
        }
    }
});

refreshBtnEl.addEventListener('click', loadTable);

saveBackendBtnEl.addEventListener('click', async () => {
    const nextValue = backendUrlInputEl.value.trim();
    if (!nextValue) {
        setBanner('Backend URL is required.', 'error');
        return;
    }

    try {
        new URL(nextValue);
        await setStoredBackendUrl(nextValue);
        setBanner('Backend URL updated.', 'success');
        await loadTable();
    } catch {
        setBanner('Please enter a valid backend URL.', 'error');
    }
});

(async function init() {
    backendUrlInputEl.value = await getStoredBackendUrl();

    await loadTable();
})();
