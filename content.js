(() => {
    'use strict';

    let blockedSubs = [];
    let styleEl = null;
    let observerTimer = null;

    /* ── Inject / update a <style> tag ─────────────────────────────
       CSS attribute selectors are the most reliable way to hide
       shreddit-post elements — they apply before paint and don't
       lose a race against React re-renders.
    ────────────────────────────────────────────────────────────── */
    function buildCSS() {
        if (blockedSubs.length === 0) return '';

        const rules = [];

        blockedSubs.forEach((sub) => {
            const rSub = `r/${sub}`;

            const selectors = [
                `shreddit-post[subreddit-prefixed-name="${rSub}"]`,
                // exact-casing match only (user-controlled)
                `shreddit-post[community-name="${sub}"]`,
                // match faceplate-tracker contexts that contain the subreddit name (looser match)
                `faceplate-tracker[source="search"][data-faceplate-tracking-context*="${sub}"]`,
                `faceplate-tracker[source="search"][data-faceplate-tracking-context*="${rSub}"]`,
                // old reddit
                `.thing[data-subreddit="${sub}"]`,
                `.search-result-link[data-subreddit="${sub}"]`,
                // generic attribute or links that contain /r/<sub>/
                `[data-testid="search-result-link"][href*="/r/${sub}/"]`,
                `a[href*="/r/${sub}/"]`,
                `a[href*="/r/${sub}/comments/"]`,
                `a[href*="/r/${sub}/comments"]`
            ];

            rules.push(`${selectors.join(', ')} { display: none !important; }`);
        });

        return rules.join('\n');
    }

    function applyCSS() {
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'rsb-blocker-styles';
            (document.head || document.documentElement).appendChild(styleEl);
        }
        styleEl.textContent = buildCSS();
    }

    /* ── JS fallback: hide posts not caught by CSS ──────────────────
       Covers cases where the attribute value has different casing
       or is stored differently.
    ────────────────────────────────────────────────────────────── */
    function extractSub(str) {
        if (!str) return null;
        return str.replace(/^\/?r\//i, '').trim();
    }

    /**
     * Find the outermost search-result card container around `el`
     * and hide it. The card is a div with classes like
     * "hover:bg-neutral-background-hover" and "my-2xs".
     */
    function hideResultCard(el) {
        // Try the known Reddit search result card class first
        const card = el.closest('.my-2xs')
            || el.closest('[class*="hover:bg-neutral-background-hover"]')
            || el.closest('[class*="justify-between"][class*="my-2xs"]');
        if (card) {
            card.style.setProperty('display', 'none', 'important');
            return;
        }
        // Fallback: just hide the element itself
        el.style.setProperty('display', 'none', 'important');
    }

    function jsFilter() {
        if (blockedSubs.length === 0) return;

        // shreddit-post elements
        document.querySelectorAll('shreddit-post').forEach((post) => {
            const attr =
                post.getAttribute('subreddit-prefixed-name') ||
                post.getAttribute('community-name') ||
                post.getAttribute('subredditprefixedname');
            if (!attr) return;
            const sub = extractSub(attr);
            if (sub && blockedSubs.includes(sub)) {
                hideResultCard(post);
            }
        });

        // faceplate-tracker — check data attribute JSON
        document.querySelectorAll('faceplate-tracker').forEach((ft) => {
            const ctx = ft.getAttribute('data-faceplate-tracking-context') || '';
            try {
                const obj = JSON.parse(ctx);
                const sub = extractSub(obj.subredditName || obj.subreddit || obj.communityName || '');
                if (sub && blockedSubs.includes(sub)) {
                    hideResultCard(ft);
                }
            } catch (_) {
                // Not JSON — try a looser regex to catch variations / escaped contexts
                const m = ctx.match(/subreddit(?:Name|PrefixedName)?[^A-Za-z0-9_\-]*r?\/?([A-Za-z0-9_\-]+)/i);
                if (m) {
                    const sub = m[1];
                    if (blockedSubs.includes(sub)) {
                        hideResultCard(ft);
                    }
                }
            }
        });

        // Catch anything whose subreddit link text matches
        document.querySelectorAll('a[href]').forEach((link) => {
            const href = link.getAttribute('href') || '';
            // Match /r/<sub> including post links like /r/<sub>/comments/...
            const m = href.match(/\/r\/([A-Za-z0-9_\-]+)(?:\/comments\b|[\/]|$)/i);
            if (!m) return;
            const sub = m[1];
            if (!blockedSubs.includes(sub)) return;

            hideResultCard(link);
        });

        // Old Reddit
        document.querySelectorAll('.thing[data-subreddit], .search-result[data-subreddit]').forEach((el) => {
            const sub = (el.getAttribute('data-subreddit') || '');
            if (blockedSubs.includes(sub)) {
                el.style.setProperty('display', 'none', 'important');
            }
        });
    }

    /* ── Debounce helper ─────────────────────────────────────────── */
    let jsFilterTimer = null;
    function debouncedJsFilter() {
        if (jsFilterTimer) clearTimeout(jsFilterTimer);
        jsFilterTimer = setTimeout(jsFilter, 80);
    }

    /* ── MutationObserver ────────────────────────────────────────── */
    function observeDOM() {
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    debouncedJsFilter();
                    break;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* ── Storage change listener ─────────────────────────────────── */
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.blockedSubs) {
            blockedSubs = (changes.blockedSubs.newValue || []);
            applyCSS();
            jsFilter();
        }
    });

    /* ── Init ────────────────────────────────────────────────────── */
    chrome.storage.sync.get({ blockedSubs: [] }, (data) => {
        blockedSubs = data.blockedSubs;

        // Apply CSS immediately (before any JS runs, before paint)
        applyCSS();

        // JS pass to catch anything CSS missed
        jsFilter();

        // Repeat at intervals for dynamic / lazy loading
        setTimeout(jsFilter, 500);
        setTimeout(jsFilter, 1500);
        setTimeout(jsFilter, 3000);

        // Watch for future DOM changes
        observeDOM();
    });
})();
