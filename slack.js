// ==UserScript==
// @name         Slack: Option+Command+A opens Threads
// @namespace    http://tampermonkey.net/
// @version      2026-09-08
// @description  Adds an Option+Command+A shortcut that clicks the Threads item in Slack's sidebar.
// @author       Arjun
// @match        https://app.slack.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=slack.com
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Verified against Slack web on 2026-09-08:
  //  - the sidebar Threads entry is a <div data-qa="channel_sidebar_vall_threads">,
  //    wrapped in a treeitem with id="Vall_threads" (no <a href>).
  //  - it stays mounted even when the sidebar is scrolled to the bottom.
  //  - navigating to /client/<team>/threads no longer opens Threads, so no URL fallback.
  function findThreads() {
    return (
      document.querySelector('[data-qa="channel_sidebar_vall_threads"]') ||
      document.querySelector('#Vall_threads')
    );
  }

  function openThreads(attempt = 0) {
    const el = findThreads();
    if (el) { el.click(); return; }
    if (attempt < 10) setTimeout(() => openThreads(attempt + 1), 200); // sidebar not rendered yet
  }

  window.addEventListener('keydown', (e) => {
    const isShortcut =
      e.altKey && e.metaKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyA';
    if (!isShortcut) return;
    e.preventDefault();
    e.stopPropagation();
    openThreads();
  }, true);
})();