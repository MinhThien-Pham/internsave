import {
    getActiveTab,
    inferPlatformFromUrl,
    openOrFocusFormWindow,
    runAiAutofillFromTab,
    saveFormDraft
} from './common.js';

const saveBtnEl = document.getElementById('saveBtn');
const applyBtnEl = document.getElementById('applyBtn');
const viewListBtnEl = document.getElementById('viewListBtn');
const statusTextEl = document.getElementById('statusText');

function setStatus(message) {
    statusTextEl.textContent = message;
}

function isHttpUrl(url) {
    return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function makeWorkflowDraft(mode, tab) {
    const jobUrl = tab?.url || '';
    const isApply = mode === 'apply';

    return {
        launchType: mode,
        employer: '',
        title: '',
        location: '',
        applied_at: isApply ? new Date().toISOString() : null,
        status: isApply ? 'Applied' : 'Saved',
        platform: inferPlatformFromUrl(jobUrl),
        job_url: jobUrl,
        notes: '',
        sourceTabId: tab?.id || null
    };
}

async function buildDraftFromCurrentTab(mode) {
    const tab = await getActiveTab();
    const draft = makeWorkflowDraft(mode, tab);

    if (!tab?.id || !isHttpUrl(tab.url)) {
        return draft;
    }

    try {
        const aiPrefill = await runAiAutofillFromTab(tab.id, tab.url);
        draft.employer = aiPrefill.employer || draft.employer;
        draft.title = aiPrefill.title || draft.title;
        draft.location = aiPrefill.location || draft.location;
        draft.notes = aiPrefill.notes || draft.notes;
        draft.platform = draft.platform || aiPrefill.platform || 'Other';
    } catch {
        // Autofill is best effort and should not block opening the form.
    }

    return draft;
}

async function launchForm(mode) {
    const label = mode === 'apply' ? 'Apply' : 'Save';
    setStatus(`${label}: preparing AI draft...`);

    try {
        const draft = await buildDraftFromCurrentTab(mode);
        const draftId = await saveFormDraft(draft);
        await openOrFocusFormWindow({ draftId });
        setStatus(`${label}: form opened.`);
        window.close();
    } catch (error) {
        setStatus(error.message || `${label}: failed to open form.`);
    }
}

saveBtnEl.addEventListener('click', () => launchForm('save'));
applyBtnEl.addEventListener('click', () => launchForm('apply'));

viewListBtnEl.addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('src/list.html') });
    window.close();
});
