export const DEFAULT_API_URL = 'http://localhost:3000';
export const STORAGE_KEY = 'internsave_backend_url';
export const FORM_WINDOW_ID_KEY = 'internsave_form_window_id';
export const FORM_DRAFTS_KEY = 'internsave_form_drafts';

export const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
export const OLLAMA_MODEL = 'qwen2.5:3b';

export const AI_FIELD_KEYS = ['employer', 'title', 'location', 'applied_at', 'status', 'platform', 'job_url', 'notes'];
export const STATUS_OPTIONS = ['Saved', 'Applied', 'OA', 'Interview', 'Rejected', 'Offer'];
export const PLATFORM_OPTIONS = ['Handshake', 'LinkedIn', 'Indeed', 'Other'];

export const FORM_WINDOW_SIZE = {
    width: 980,
    height: 820
};

export function inferPlatformFromUrl(url) {
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

export function inferLocationFromPageData(pageData) {
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

function normalizeAiResult(raw, currentUrl) {
    const normalized = {
        employer: '',
        title: '',
        location: '',
        applied_at: '',
        status: '',
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
            if (depth === 0) return text.slice(start, i + 1);
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

async function requestLocalAiAutofill(pageSummary) {
    const prompt = [
        'You extract internship application fields from a job page summary.',
        'Return JSON only with these exact keys and string values:',
        AI_FIELD_KEYS.join(', '),
        'Rules:',
        '- If unknown, return empty string.',
        '- For location: if the posting says remote/work from home, return "Remote". If it specifies United States, return "Remote (United States)".',
        '- status must be empty string.',
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

export async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

export async function extractCurrentPageData(tabId) {
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

export async function runAiAutofillFromTab(tabId, currentUrl) {
    const pageData = await extractCurrentPageData(tabId);
    const pageSummary = buildCompactPageSummary({ ...pageData, url: currentUrl || pageData?.url || '' });
    const aiRaw = await requestLocalAiAutofill(pageSummary);
    const normalized = normalizeAiResult(aiRaw, currentUrl || pageData?.url || '');

    const inferredLocation = inferLocationFromPageData(pageData);
    if (!normalized.location && inferredLocation) {
        normalized.location = inferredLocation;
    }

    return {
        ...normalized,
        source: {
            tabId,
            url: currentUrl || pageData?.url || ''
        }
    };
}

export async function getStoredBackendUrl() {
    const result = await chrome.storage.sync.get([STORAGE_KEY]);
    return result[STORAGE_KEY] || DEFAULT_API_URL;
}

export async function setStoredBackendUrl(url) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: url });
}

async function requestApi(path, options = {}) {
    const baseUrl = await getStoredBackendUrl();
    const response = await fetch(`${baseUrl}${path}`, options);

    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const data = await response.json();
            if (data?.error) message = data.error;
        } catch {
            // ignore json parse errors
        }
        throw new Error(message);
    }

    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return response.json();
}

export async function fetchApplications() {
    return requestApi('/api/applications');
}

export async function fetchApplicationById(id) {
    return requestApi(`/api/applications/${id}`);
}

export async function createApplication(payload) {
    return requestApi('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function updateApplication(id, payload) {
    return requestApi(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

export async function removeApplication(id) {
    return requestApi(`/api/applications/${id}`, {
        method: 'DELETE'
    });
}

export function toDateTimeLocalValue(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';

    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
}

export function toApiDateTime(localValue) {
    if (!localValue) return null;
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

export function formatDisplayDate(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
}

export function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export async function saveFormDraft(draft) {
    const draftId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await chrome.storage.local.get([FORM_DRAFTS_KEY]);
    const allDrafts = result[FORM_DRAFTS_KEY] || {};

    allDrafts[draftId] = {
        ...draft,
        createdAt: new Date().toISOString()
    };

    const entries = Object.entries(allDrafts)
        .sort((a, b) => new Date(b[1].createdAt).getTime() - new Date(a[1].createdAt).getTime())
        .slice(0, 20);

    await chrome.storage.local.set({ [FORM_DRAFTS_KEY]: Object.fromEntries(entries) });
    return draftId;
}

export async function getFormDraft(draftId) {
    if (!draftId) return null;
    const result = await chrome.storage.local.get([FORM_DRAFTS_KEY]);
    const allDrafts = result[FORM_DRAFTS_KEY] || {};
    return allDrafts[draftId] || null;
}

export async function openOrFocusFormWindow({ draftId, editId }) {
    const query = draftId ? `?draftId=${encodeURIComponent(draftId)}` : `?editId=${encodeURIComponent(editId)}`;
    const formUrl = `${chrome.runtime.getURL('src/form.html')}${query}`;

    const stored = await chrome.storage.local.get([FORM_WINDOW_ID_KEY]);
    const existingWindowId = stored[FORM_WINDOW_ID_KEY];

    if (existingWindowId) {
        try {
            await chrome.windows.get(existingWindowId);
            const tabs = await chrome.tabs.query({ windowId: existingWindowId });
            const formTab = tabs[0];
            if (formTab?.id) {
                await chrome.tabs.update(formTab.id, { url: formUrl, active: true });
                await chrome.windows.update(existingWindowId, {
                    focused: true,
                    width: FORM_WINDOW_SIZE.width,
                    height: FORM_WINDOW_SIZE.height
                });
                return;
            }
        } catch {
            // stale window id, fall through to create
        }
    }

    const createdWindow = await chrome.windows.create({
        url: formUrl,
        type: 'popup',
        width: FORM_WINDOW_SIZE.width,
        height: FORM_WINDOW_SIZE.height,
        focused: true
    });

    if (createdWindow?.id) {
        await chrome.storage.local.set({ [FORM_WINDOW_ID_KEY]: createdWindow.id });
    }
}
