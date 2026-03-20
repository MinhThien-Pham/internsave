(() => {
  if (typeof window.__internsaveExtractPageData === 'function') {
    return;
  }

  function compact(value, maxLen) {
    if (!value || typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
  }

  function collectMeta() {
    const wanted = ['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'];
    const result = {};

    wanted.forEach((name) => {
      const selector = `meta[name="${name}"], meta[property="${name}"]`;
      const element = document.querySelector(selector);
      if (element?.content) {
        result[name] = compact(element.content, 400);
      }
    });

    return result;
  }

  function collectHeadings() {
    const nodes = Array.from(document.querySelectorAll('h1, h2, h3'));
    return nodes.map((node) => compact(node.textContent || '', 200)).filter(Boolean).slice(0, 30);
  }

  function parseJson(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function normalizeJobPosting(item) {
    if (!item || typeof item !== 'object') return null;
    const type = item['@type'];
    const isJobPosting =
      type === 'JobPosting' ||
      (Array.isArray(type) && type.includes('JobPosting'));

    if (!isJobPosting) return null;

    return {
      title: compact(item.title || '', 250),
      hiringOrganization: compact(item.hiringOrganization?.name || '', 200),
      jobLocation: compact(item.jobLocation?.address?.addressLocality || '', 200),
      description: compact(item.description || '', 1200)
    };
  }

  function collectJobPosting() {
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

    for (const script of scripts) {
      const parsed = parseJson(script.textContent || '');
      if (!parsed) continue;

      const values = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed['@graph'])
          ? parsed['@graph']
          : [parsed];

      for (const value of values) {
        const jobPosting = normalizeJobPosting(value);
        if (jobPosting) return jobPosting;
      }
    }

    return null;
  }

  function collectVisibleText() {
    const bodyText = document.body?.innerText || '';
    return compact(bodyText, 9000);
  }

  window.__internsaveExtractPageData = function extractPageData() {
    return {
      url: window.location.href,
      title: compact(document.title || '', 300),
      meta: collectMeta(),
      headings: collectHeadings(),
      jobPosting: collectJobPosting(),
      visibleText: collectVisibleText()
    };
  };
})();