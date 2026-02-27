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

            // const selectors = [
            //     `shreddit-post[subreddit-prefixed-name="${rSub}"]`,
            //     `shreddit-post[community-name="${sub}"]`,
            //     // Add these for the new search interface:
            //     `[subreddit-name="${sub}"]`,
            //     `article:has(a[href*="/r/${sub}/"])`, 
            //     `div:has(> shreddit-post[community-name="${sub}"])`
            // ];
            const selectors = [
                `shreddit-post[subreddit-prefixed-name="${rSub}"]`,
                `shreddit-post[community-name="${sub}"]`,
                `article:has(a[href*="/r/${sub}/"])`,
                `div[data-testid="post-container"]:has(a[href*="/r/${sub}/"])`,
                // This catches the modern "Faceplate" wrappers used in search
                `faceplate-tracker:has(a[href*="/r/${sub}/"])`
            ];

            const joinedSelectors = selectors.join(', ');
            
            // Hide the main elements
            rules.push(`${joinedSelectors} { display: none !important; }`);
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
     * Hide the specific element itself, not its container.
     */
    function hideResultCard(el) {
        el.style.setProperty('display', 'none', 'important');
    }

    /**
     * Restore visibility of all previously hidden elements.
     */
    function restoreAll() {
        document.querySelectorAll('shreddit-post, faceplate-tracker, search-telemetry-tracker, a[href], .thing[data-subreddit], .search-result[data-subreddit]').forEach((el) => {
            el.style.removeProperty('display');
        });
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

        // search-telemetry-tracker and faceplate-tracker — check data attribute JSON
        document.querySelectorAll('faceplate-tracker, search-telemetry-tracker').forEach((ft) => {
            const ctx = ft.getAttribute('data-faceplate-tracking-context') || '';
            try {
                const obj = JSON.parse(ctx);
                // Check for nested subreddit.name structure and flat structures
                const sub = extractSub(
                    (obj.subreddit?.name) ||
                    obj.subredditName || 
                    obj.subreddit || 
                    obj.communityName || 
                    ''
                );
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
        document.querySelectorAll('a[href*="/r/"]').forEach((link) => {
            const href = link.getAttribute('href') || '';
            const m = href.match(/\/r\/([A-Za-z0-9_\-]+)/i);
            if (!m) return;
            
            const sub = m[1].toLowerCase();
            if (!blockedSubs.map(s => s.toLowerCase()).includes(sub)) return;

            // Find the highest level container to avoid "ghost" metadata
            const container = link.closest('shreddit-post') || 
                            link.closest('article') || 
                            link.closest('[data-testid="post-container"]') ||
                            link.closest('faceplate-tracker');
            
            if (container) {
                container.style.setProperty('display', 'none', 'important');
            }
        });

        // Also specifically target data-testid="post-title" links
        document.querySelectorAll('[data-testid="post-title"][href]').forEach((link) => {
            const href = link.getAttribute('href') || '';
            const m = href.match(/\/r\/([A-Za-z0-9_\-]+)(?:\/comments\b|[\/]|$)/i);
            if (!m) return;
            const sub = m[1];
            if (!blockedSubs.includes(sub)) return;

            const container = link.closest('shreddit-post') || 
                      link.closest('[data-testid="post-container"]') ||
                      link.closest('article');
            if (container) {
                hideResultCard(container);
            } else {
                hideResultCard(link);
            }
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
        jsFilterTimer = setTimeout(jsFilter, 50);
    }

    /* ── MutationObserver ────────────────────────────────────────── */
    function observeDOM() {
        const observer = new MutationObserver((mutations) => {
            let shouldRun = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldRun = true;
                    break;
                }
            }
            if (shouldRun) debouncedJsFilter();
        });

        observer.observe(document.documentElement, { 
            childList: true, 
            subtree: true 
        });
    }
    
    /* ── Scroll listener for lazy-loaded content ────────────────── */
    function setupScrollListener() {
        window.addEventListener('scroll', () => {
            jsFilter();
            // Run jsFilter multiple times to catch posts that load with a delay
            setTimeout(jsFilter, 25);
            setTimeout(jsFilter, 75);
            setTimeout(jsFilter, 150);
        }, { passive: true });
    }

    /* ── Storage change listener ─────────────────────────────────── */
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.blockedSubs) {
            blockedSubs = (changes.blockedSubs.newValue || []);
            applyCSS();
            restoreAll();
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

        // Extended timeout passes to catch fully rendered content
        setTimeout(jsFilter, 50);
        setTimeout(jsFilter, 100);
        setTimeout(jsFilter, 250);
        setTimeout(jsFilter, 500);
        setTimeout(jsFilter, 750);
        setTimeout(jsFilter, 1000);
        setTimeout(jsFilter, 1500);
        setTimeout(jsFilter, 2500);
        setTimeout(jsFilter, 4000);
        setTimeout(jsFilter, 6000);

        // Watch for future DOM changes
        observeDOM();
        
        // Setup scroll listener for lazy-loaded results
        setupScrollListener();
    });
})();
