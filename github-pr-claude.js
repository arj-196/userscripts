// ==UserScript==
// @name         GitHub: analyse PR in Claude Code
// @namespace    http://tampermonkey.net/
// @version      2026-10-23
// @description  Adds an "Analyse in Claude" button on PR pages that opens a new Claude Code session in the repo's local checkout with a risk-review prompt.
// @author       Arjun
// @match        https://github.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=claude.ai
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Claude desktop deep link, read from its URL handler (v3.6556):
  //   claude://code/new?q=<prompt>&folder=<absolute path>
  // opens a new Code session in that folder with the prompt in the composer.
  const PROMPT = (url) => `Analyse this PR ${url}\nHighlight the risks I need to investigate`;

  // Local checkout per GitHub owner; the folder is assumed to be named after the repo.
  const OWNER_ROOTS = {
    'mendo-sas': '/Users/arjun/Mendo/apps',
    'arj-196': '/Users/arjun/Personal/apps',
  };
  // Checkouts whose folder name differs from the repo name.
  const REPO_FOLDERS = {
    'arj-196/api-template': '/Users/arjun/Personal/apps/autoplay-api-tempate',
    'arj-196/register': '/Users/arjun/Personal/apps/is-a-dev-register',
    'arj-196/personal-trainer': '/Users/arjun/Personal/apps/personal_trainer',
  };

  const BUTTON_ID = 'arj-claude-pr-button';

  function currentPr() {
    const m = location.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!m) return null;
    const [, owner, repo, number] = m;
    return { owner, repo, url: `https://github.com/${owner}/${repo}/pull/${number}` };
  }

  function folderFor({ owner, repo }) {
    const key = `${owner}/${repo}`.toLowerCase();
    if (REPO_FOLDERS[key]) return REPO_FOLDERS[key];
    const root = OWNER_ROOTS[owner.toLowerCase()];
    return root ? `${root}/${repo}` : null; // unknown owner: Claude asks for the folder
  }

  function deepLink(pr) {
    const params = new URLSearchParams({ q: PROMPT(pr.url) });
    const folder = folderFor(pr);
    if (folder) params.set('folder', folder);
    return `claude://code/new?${params}`;
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.textContent = '✳ Analyse in Claude';
    btn.title = 'Open a Claude Code session on this PR';
    Object.assign(btn.style, {
      position: 'fixed', right: '20px', bottom: '20px', zIndex: '2147483647',
      padding: '8px 14px', border: 'none', borderRadius: '999px', cursor: 'pointer',
      background: '#d97757', color: '#fff', font: '600 13px -apple-system, sans-serif',
      boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    });
    btn.addEventListener('click', () => {
      const pr = currentPr();
      if (pr) location.href = deepLink(pr);
    });
    return btn;
  }

  // GitHub navigates with Turbo/React without full page loads, so re-check
  // the URL on an interval instead of only at startup.
  function sync() {
    const existing = document.getElementById(BUTTON_ID);
    if (currentPr()) {
      if (!existing) document.body.appendChild(createButton());
    } else if (existing) {
      existing.remove();
    }
  }

  sync();
  setInterval(sync, 500);
})();
