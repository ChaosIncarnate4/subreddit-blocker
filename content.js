(() => {
    'use strict';

    let blockedSubs = [];
    let styleEl = null;

    /* ── Inject / update a <style> tag ─────────────────────────────
       CSS attribute selectors are the most reliable way to hide
       shreddit-post elements — they apply before paint and don't
       lose a race against React re-renders.
    ────────────────────────────────────────────────────────────── */
    function buildCSS() {
        if (blockedSubs.length === 0) return '';

        const rules = [];

        blockedSubs.forEach((item) => {
            const sub = typeof item === 'string' ? item : item.name;
            const rSub = `r/${sub}`;

            // We use the CSS Adjacent Sibling Combinator (+) to target the divider 
            // ONLY if it immediately follows a blocked post element.
            const selectors = [
                `shreddit-post[community-name="${sub}"] + hr.list-divider-line`,
                `shreddit-post[subreddit-prefixed-name="${rSub}"] + hr.list-divider-line`,
                `faceplate-tracker:has(a[href*="/r/${sub}/"]) + hr`,
                `div[data-testid="post-container"]:has(a[href*="/r/${sub}/"]) + hr`,
                // Standard post hiding selectors
                `shreddit-post[community-name="${sub}"]`,
                `shreddit-post[subreddit-prefixed-name="${rSub}"]`,
                `faceplate-tracker:has(a[href*="/r/${sub}/"])`,
                `article:has(a[href*="/r/${sub}/"])`,
                `div[data-testid="post-container"]:has(a[href*="/r/${sub}/"])`
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
     * Check if a subreddit name is in the blocked list.
     * Handles both old format (strings) and new format (objects with name property).
     */
    function isBlocked(subName) {
        return blockedSubs.some((item) => {
            const name = typeof item === 'string' ? item : item.name;
            return name === subName;
        });
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
        document.querySelectorAll('shreddit-post, faceplate-tracker, search-telemetry-tracker, a[href], .thing[data-subreddit], .search-result[data-subreddit], [data-testid="post-divider"], hr').forEach((el) => {
            el.style.removeProperty('display');
        });
    }

    /**
     * Hide dividers that follow a hidden post.
     * Specifically targets the "list-divider-line" used in Shreddit.
     */
    function hideFollowingDividers() {
        // Target specifically the dividers you mentioned
        const dividers = document.querySelectorAll('hr.list-divider-line, hr.border-b-neutral-border-weak');
        
        dividers.forEach((divider) => {
            let prev = divider.previousElementSibling;
            
            // Look at the immediate previous sibling. 
            // If it is hidden (display: none), then hide this divider.
            if (prev) {
                const isPrevHidden = window.getComputedStyle(prev).display === 'none' || prev.style.display === 'none' || prev.hasAttribute('hidden');

                if (isPrevHidden) {
                    hideResultCard(divider);
                }
            }
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
            if (sub && isBlocked(sub)) {
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
                if (sub && isBlocked(sub)) {
                    hideResultCard(ft);
                }
            } catch (_) {
                // Not JSON — try a looser regex to catch variations / escaped contexts
                const m = ctx.match(/subreddit(?:Name|PrefixedName)?[^A-Za-z0-9_\-]*r?\/?([A-Za-z0-9_\-]+)/i);
                if (m) {
                    const sub = m[1];
                    if (isBlocked(sub)) {
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
            const blockedLower = blockedSubs.map(item => {
                const name = typeof item === 'string' ? item : item.name;
                return name.toLowerCase();
            });
            if (!blockedLower.includes(sub)) return;

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
            if (!isBlocked(sub)) return;

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
            if (isBlocked(sub)) {
                el.style.setProperty('display', 'none', 'important');
            }
        });

        // Hide AutoModerator comments
        hideAutoModeratorComments();

        // Hide dividers that follow blocked posts
        hideFollowingDividers();
    }

    /**
     * Hide comments created by u/AutoModerator.
     * Only applies when searching comments (type=comments).
     *
     * Strategy: For every search-telemetry-tracker, parse its
     * data-faceplate-tracking-context JSON and also inspect any
     * descendant faceplate-hovercard[label] whose label follows the
     * "username details" pattern.  If the resolved username is
     * "AutoModerator" (case-insensitive), hide the nearest comment
     * container walking up the DOM.
     */
    function hideAutoModeratorComments() {
        // Only run on comment searches
        const url = window.location.href;
        if (!url.includes('type=comments')) return;

        /**
         * Given a label string, extract the username portion.
         * Expected formats:
         *   "AutoModerator details"
         *   "u/AutoModerator details"
         *   "AutoModerator"          (fallback — no trailing word)
         * Returns the username string, or null if unparseable.
         */
        function extractUsernameFromLabel(label) {
            if (!label) return null;
            // Strip leading "u/" if present, then grab everything before
            // the last word (which is "details") — or the whole string.
            const cleaned = label.trim().replace(/^u\//i, '');
            // "AutoModerator details"  →  ["AutoModerator", "details"]
            const parts = cleaned.split(/\s+/);
            if (parts.length >= 2 && parts[parts.length - 1].toLowerCase() === 'details') {
                return parts.slice(0, parts.length - 1).join(' ');
            }
            // No trailing "details" word — treat whole string as username
            return cleaned;
        }

        function isAutoMod(username) {
            return username && username === 'AutoModerator';
        }

        /**
         * Walk up from `el` to find the outermost comment/result wrapper
         * that should be hidden.  Prefers search-telemetry-tracker itself
         * (which wraps the entire result card in comment search) before
         * falling back to semantic comment elements.
         */
        function findCommentContainer(el) {
            // In Reddit's comment-search layout the search-telemetry-tracker
            // IS the top-level result card — hiding it removes the whole row.
            const tracker = el.closest('search-telemetry-tracker');
            if (tracker) return tracker;

            return (
                el.closest('shreddit-comment') ||
                el.closest('[data-testid="comment"]') ||
                el.closest('.comment')
            );
        }

        // ── Pass 1: check data-faceplate-tracking-context JSON on every tracker
        document.querySelectorAll('search-telemetry-tracker').forEach((tracker) => {
            const ctx = tracker.getAttribute('data-faceplate-tracking-context') || '';
            try {
                const obj = JSON.parse(ctx);
                // Common field names observed in Reddit's tracking payloads
                const author =
                    obj.author ||
                    obj.authorName ||
                    obj.username ||
                    (obj.comment && obj.comment.author) ||
                    '';
                if (isAutoMod(extractUsernameFromLabel(author) || author)) {
                    hideResultCard(tracker);
                    return; // no need to inspect hovercards inside
                }
            } catch (_) { /* not JSON — fall through to hovercard pass */ }

            // ── Pass 2: inspect every faceplate-hovercard[label] inside this tracker
            tracker.querySelectorAll('faceplate-hovercard[label]').forEach((hovercard) => {
                const label = hovercard.getAttribute('label') || '';
                const username = extractUsernameFromLabel(label);
                if (isAutoMod(username)) {
                    const container = findCommentContainer(hovercard);
                    if (container) {
                        hideResultCard(container);
                    }
                }
            });
        });

        // ── Pass 3: catch hovercards that sit outside a search-telemetry-tracker
        document.querySelectorAll('faceplate-hovercard[label]').forEach((hovercard) => {
            // Skip if already handled in pass 2
            if (hovercard.closest('search-telemetry-tracker')) return;
            const label = hovercard.getAttribute('label') || '';
            const username = extractUsernameFromLabel(label);
            if (isAutoMod(username)) {
                const container = findCommentContainer(hovercard);
                if (container) {
                    hideResultCard(container);
                }
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