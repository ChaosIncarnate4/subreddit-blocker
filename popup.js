(() => {
  const input = document.getElementById('subreddit-input');
  const addBtn = document.getElementById('add-btn');
  const listEl = document.getElementById('blocked-list');
  const emptyMsg = document.getElementById('empty-msg');
  const sortSelect = document.getElementById('sort-select');

  let blocked = [];
  let sortMode = 'name';

  /* ── Storage helpers ──────────────────────── */
  function load(cb) {
    chrome.storage.sync.get({ blockedSubs: [] }, (data) => {
      blocked = data.blockedSubs;
      
      // Migrate old format (array of strings) to new format (array of objects)
      blocked = blocked.map((item) => {
        if (typeof item === 'string') {
          return { name: item, addedAt: Date.now() };
        }
        return item;
      });

      // Load sort preference
      chrome.storage.sync.get({ sortMode: 'name' }, (data) => {
        sortMode = data.sortMode;
        if (sortSelect) sortSelect.value = sortMode;
        cb();
      });
    });
  }

  function save(cb) {
    chrome.storage.sync.set({ blockedSubs: blocked, sortMode }, () => {
      if (cb) cb();
    });
  }

  /* ── Sorting ───────────────────────────────── */
  function getSortedBlocked() {
    const copy = [...blocked];

    if (sortMode === 'name') {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'newest') {
      copy.sort((a, b) => b.addedAt - a.addedAt);
    } else if (sortMode === 'oldest') {
      copy.sort((a, b) => a.addedAt - b.addedAt);
    }

    return copy;
  }

  /* ── Render ────────────────────────────────── */
  function render() {
    listEl.innerHTML = '';

    if (blocked.length === 0) {
      emptyMsg.classList.remove('hidden');
      return;
    }

    emptyMsg.classList.add('hidden');

    const sorted = getSortedBlocked();
    sorted.forEach((item) => {
      const sub = item.name;
      const chip = document.createElement('div');
      chip.className = 'chip';

      const prefix = document.createElement('span');
      prefix.className = 'chip-prefix';
      prefix.textContent = 'r/';

      const name = document.createElement('span');
      name.textContent = sub;

      const del = document.createElement('button');
      del.className = 'chip-delete';
      del.title = `Remove r/${sub}`;
      del.textContent = '×';
      del.addEventListener('click', () => removeSub(sub));

      chip.appendChild(prefix);
      chip.appendChild(name);
      chip.appendChild(del);
      listEl.appendChild(chip);
    });
  }

  /* ── Add / Remove ──────────────────────────── */
  function sanitize(raw) {
    // Strip leading "r/" or "/r/" and trim whitespace
    return raw
      .trim()
      .replace(/^\/?(r\/)?/i, '')
      .replace(/\/$/, '')
      .trim();
  }

  function addSub() {
    const name = sanitize(input.value);

    if (!name) return;

    if (blocked.some((item) => item.name === name)) {
      showToast(`r/${name} is already blocked`);
      input.value = '';
      input.focus();
      return;
    }

    blocked.push({ name, addedAt: Date.now() });
    save(() => {
      render();
      input.value = '';
      input.focus();
      showToast(`r/${name} blocked`);
    });
  }

  function removeSub(name) {
    blocked = blocked.filter((item) => item.name !== name);
    save(() => {
      render();
      showToast(`r/${name} unblocked`);
    });
  }

  /* ── Toast ─────────────────────────────────── */
  let toastTimer;
  function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  /* ── Events ────────────────────────────────── */
  addBtn.addEventListener('click', addSub);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSub();
  });

  sortSelect.addEventListener('change', (e) => {
    sortMode = e.target.value;
    save(() => {
      render();
    });
  });

  /* ── Init ──────────────────────────────────── */
  load(render);
})();
