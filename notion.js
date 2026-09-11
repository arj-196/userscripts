// ==UserScript==
// @name         Notion: let Arc handle Command+O
// @namespace    http://tampermonkey.net/
// @version      2026-09-11.2
// @description  Hides Command+O from Notion web so the browser (Arc: "Open in Arc" from a Little Arc popup) handles it instead.
// @author       Arjun
// @match        https://www.notion.so/*
// @match        https://*.notion.so/*
// @match        https://www.notion.com/*
// @match        https://*.notion.com/*
// @match        https://*.notion.site/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=notion.so
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Registered on window in the capture phase at document-start, so this runs
  // before any listener Notion attaches (on window, document or body), and
  // stopImmediatePropagation keeps Notion's handlers from ever seeing the key.
  //
  // Deliberately NO preventDefault: Chromium-based browsers only run their own
  // Command+O action when the page leaves the keydown unhandled. That is what
  // lets Arc's "Open in Arc" (Little Arc popup -> main-window tab) fire.
  function isCmdO(e) {
    return e.metaKey && !e.altKey && !e.shiftKey && !e.ctrlKey && e.code === 'KeyO';
  }

  window.addEventListener('keydown', (e) => {
    if (!isCmdO(e)) return;
    e.stopImmediatePropagation();
  }, true);
})();
