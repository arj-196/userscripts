// ==UserScript==
// @name         Slack: hide LastPass icons
// @namespace    http://tampermonkey.net/
// @version      2026-09-29.2
// @description  Stops LastPass from treating Slack's text fields (e.g. "Find a conversation") as email/password fields.
// @author       Arjun
// @match        https://app.slack.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=slack.com
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Slack's web client has no login form (sign-in happens on <workspace>.slack.com),
  // so every field here is safe to mark. Password inputs are left alone just in case.
  const FIELDS = 'input:not([type="password"]):not([data-lpignore]), textarea:not([data-lpignore])';

  // Recent LastPass versions don't always honour data-lpignore and inject their
  // icon about a second after load anyway, so also remove whatever they inject.
  const LASTPASS = '[data-lastpass-icon-root], [data-lastpass-root]';

  function handle(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches(LASTPASS)) { node.remove(); return; }
    node.querySelectorAll(LASTPASS).forEach((el) => el.remove());
    if (node.matches(FIELDS)) node.setAttribute('data-lpignore', 'true');
    node.querySelectorAll(FIELDS).forEach((el) => el.setAttribute('data-lpignore', 'true'));
  }

  // Slack is a SPA that mounts and remounts inputs constantly, so watch for new nodes.
  new MutationObserver((mutations) => {
    for (const m of mutations) m.addedNodes.forEach(handle);
  }).observe(document.documentElement, { childList: true, subtree: true });

  handle(document.documentElement);
})();
