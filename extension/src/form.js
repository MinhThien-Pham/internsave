import {
    createApplication,
    fetchApplicationById,
    getFormDraft,
    inferPlatformFromUrl,
    openOrFocusFormWindow,
    runAiAutofillFromTab,
    toApiDateTime,
    toDateTimeLocalValue,
    updateApplication
} from './common.js';

const formEl = document.getElementById('applicationForm');
const formTitleEl = document.getElementById('formTitle');
const subtitleEl = document.getElementById('subtitle');
const bannerEl = document.getElementById('statusBanner');
const submitBtnEl = document.getElementById('submitBtn');
const retryAiBtnEl = document.getElementById('retryAiBtn');
const openListBtnEl = document.getElementById('openListBtn');

const employerInputEl = document.getElementById('employerInput');
const titleInputEl = document.getElementById('titleInput');
const locationInputEl = document.getElementById('locationInput');
const platformInputEl = document.getElementById('platformInput');
const statusInputEl = document.getElementById('statusInput');
const appliedAtInputEl = document.getElementById('appliedAtInput');
const jobUrlInputEl = document.getElementById('jobUrlInput');
const notesInputEl = document.getElementById('notesInput');

const state = {
    mode: 'create',
    editId: null,
    sourceTabId: null,
    sourceUrl: ''
};

function setBanner(message, type = 'info') {
    bannerEl.textContent = message;
    bannerEl.classList.remove('error', 'success', 'info');
    bannerEl.classList.add(type);
}

function setLoading(loading) {
    submitBtnEl.disabled = loading;
    retryAiBtnEl.disabled = loading;
}

function populateForm(values) {
    employerInputEl.value = values.employer || '';
    titleInputEl.value = values.title || '';
    locationInputEl.value = values.location || '';
    platformInputEl.value = values.platform || 'Other';
    statusInputEl.value = values.status || 'Saved';
    appliedAtInputEl.value = toDateTimeLocalValue(values.applied_at || '');
    jobUrlInputEl.value = values.job_url || '';
    notesInputEl.value = values.notes || '';
}

function buildPayload() {
    return {
        employer: employerInputEl.value.trim(),
        title: titleInputEl.value.trim(),
        location: locationInputEl.value.trim() || null,
        applied_at: toApiDateTime(appliedAtInputEl.value),
        status: statusInputEl.value,
        platform: platformInputEl.value,
        job_url: jobUrlInputEl.value.trim() || null,
        notes: notesInputEl.value.trim() || null
    };
}

async function runPrefill() {
    if (!state.sourceTabId) {
        setBanner('No source tab found for AI retry. You can still edit and save manually.', 'error');
        return;
    }

    setBanner('Running AI prefill from the source job page...', 'info');
    try {
        const result = await runAiAutofillFromTab(state.sourceTabId, state.sourceUrl || jobUrlInputEl.value);

        employerInputEl.value = result.employer || employerInputEl.value;
        titleInputEl.value = result.title || titleInputEl.value;
        locationInputEl.value = result.location || locationInputEl.value;
        notesInputEl.value = result.notes || notesInputEl.value;

        if (!jobUrlInputEl.value) {
            jobUrlInputEl.value = result.job_url || '';
        }

        if (!platformInputEl.value || platformInputEl.value === 'Other') {
            platformInputEl.value = result.platform || inferPlatformFromUrl(jobUrlInputEl.value);
        }

        setBanner('AI prefill updated employer, title, location, and notes.', 'success');
    } catch (error) {
        setBanner(error.message || 'AI prefill failed. You can continue manually.', 'error');
    }
}

async function initCreateMode(draftId) {
    const draft = await getFormDraft(draftId);
    if (!draft) {
        setBanner('Draft not found. Open Save or Apply again from the launcher.', 'error');
        return;
    }

    state.mode = 'create';
    state.sourceTabId = draft.sourceTabId || null;
    state.sourceUrl = draft.job_url || '';

    formTitleEl.textContent = draft.launchType === 'apply' ? 'Apply Internship' : 'Save Internship';
    subtitleEl.textContent = 'AI prefill runs automatically. Edit values, then save when ready.';
    submitBtnEl.textContent = draft.launchType === 'apply' ? 'Create Applied Entry' : 'Create Saved Entry';

    populateForm(draft);

    await runPrefill();
}

async function initEditMode(editId) {
    state.mode = 'edit';
    state.editId = editId;
    state.sourceTabId = null;
    state.sourceUrl = '';

    formTitleEl.textContent = 'Edit Internship';
    subtitleEl.textContent = 'Update any field and save your changes.';
    submitBtnEl.textContent = 'Update Application';

    setBanner('Loading application...', 'info');

    try {
        const app = await fetchApplicationById(editId);
        populateForm(app);
        setBanner('Application loaded.', 'success');
    } catch (error) {
        setBanner(error.message || 'Failed to load application', 'error');
    }
}

formEl.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = buildPayload();
    if (!payload.employer || !payload.title || !payload.platform) {
        setBanner('employer, title, and platform are required.', 'error');
        return;
    }

    setLoading(true);

    try {
        if (state.mode === 'edit' && state.editId) {
            await updateApplication(state.editId, payload);
            setBanner('Application updated successfully.', 'success');
        } else {
            await createApplication(payload);
            setBanner('Application saved successfully.', 'success');
            formEl.reset();
            statusInputEl.value = 'Saved';
            platformInputEl.value = 'Other';
        }
    } catch (error) {
        setBanner(error.message || 'Save failed', 'error');
    } finally {
        setLoading(false);
    }
});

retryAiBtnEl.addEventListener('click', async () => {
    setLoading(true);
    try {
        await runPrefill();
    } finally {
        setLoading(false);
    }
});

openListBtnEl.addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/list.html') });
});

(async function init() {
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get('draftId');
    const editId = params.get('editId');

    setLoading(true);
    try {
        if (editId) {
            await initEditMode(editId);
        } else {
            await initCreateMode(draftId);
        }
    } finally {
        setLoading(false);
    }
})();
