// ==UserScript==
// @name         Slack: more one-click reactions
// @namespace    http://tampermonkey.net/
// @version      2026-10-19.5
// @description  Adds extra one-click reaction buttons to Slack's message hover toolbar (Slack only allows 3).
// @author       Arjun
// @match        https://app.slack.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=slack.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Shown after Slack's own 3 one-click reactions (those are set in Slack under
  // Preferences > Messages & media > One-click reactions). `name` is the Slack
  // shortcode typed into the emoji picker; `glyph` picks the button's image (for a
  // custom emoji, any short text works and is shown as-is).
  const EXTRA = [
    { name: 'rocket', glyph: '🚀' },
    { name: 'heart', glyph: '❤️' },
    { name: 'raised_hands', glyph: '🙌' },
  ];

  // Verified against Slack web on 2026-10-19.
  const TOOLBAR = '[data-qa="message-actions"]';
  const ADD_REACTION = 'button[data-qa="add_reaction"]';
  const BUILT_IN_REACTION = 'button.c-message_actions__emoji_button';
  const PICKER_INPUT = 'input[data-qa="emoji_picker_input"]';
  const MARK = 'data-extra-reactions';

  function waitFor(selector, timeout = 1500) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function poll() {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return resolve(null);
        requestAnimationFrame(poll);
      })();
    });
  }

  // React ignores plain `.value =`, so go through the native setter.
  function typeInto(input, text) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // No public API for reacting, so drive the picker: open it, search, click the exact match.
  async function react(addButton, name) {
    addButton.click();
    const input = await waitFor(PICKER_INPUT);
    if (!input) return;
    typeInto(input, name);
    const match = await waitFor(`button[data-name="${name}"]`);
    if (match) match.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }

  // Slack names its standard emoji images by code point, e.g. ❤️ -> 2764-fe0f.png.
  function codePoints(glyph) {
    return [...glyph].map((c) => c.codePointAt(0).toString(16)).join('-');
  }

  // Same box as Slack's 16px emoji image, for custom emoji or when an image is missing.
  function textIcon(glyph) {
    const span = document.createElement('span');
    span.textContent = glyph;
    span.style.cssText = 'display:inline-block;width:16px;height:16px;font-size:14px;line-height:16px;text-align:center;';
    return span;
  }

  // Copy a built-in reaction button so ours match it exactly, then swap in our emoji.
  function makeButton(builtIn, addButton, { name, glyph }) {
    let btn;
    const img = builtIn && builtIn.querySelector('img');
    if (img) {
      btn = builtIn.cloneNode(true); // cloneNode drops Slack's React handlers
      const ours = btn.querySelector('img');
      ours.src = img.src.replace(/[^/]+\.png$/, `${codePoints(glyph)}.png`);
      ours.alt = name;
      ours.setAttribute('aria-label', `${name} emoji`);
      ours.setAttribute('data-stringify-emoji', name);
      ours.onerror = () => ours.replaceWith(textIcon(glyph));
    } else {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = (builtIn || addButton).className;
      btn.append(textIcon(glyph));
    }
    for (const attr of ['data-qa', 'aria-pressed', 'data-sk']) btn.removeAttribute(attr);
    btn.setAttribute('aria-label', `React with ${name}`);
    btn.title = `:${name}:`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      react(addButton, name);
    });
    return btn;
  }

  function decorate(toolbar) {
    if (toolbar.hasAttribute(MARK)) return;
    const addButton = toolbar.querySelector(ADD_REACTION);
    if (!addButton) return;
    toolbar.setAttribute(MARK, '');

    // Slack's built-in reactions share one wrapper div; adding ours to the end of it
    // keeps the same alignment. Without built-ins, go just before "Add reaction".
    const builtIn = toolbar.querySelector(BUILT_IN_REACTION);
    for (const emoji of EXTRA) {
      const btn = makeButton(builtIn, addButton, emoji);
      if (builtIn) builtIn.parentElement.append(btn);
      else addButton.before(btn);
    }
  }

  // The toolbar is mounted fresh each time a message is hovered.
  new MutationObserver(() => {
    document.querySelectorAll(`${TOOLBAR}:not([${MARK}])`).forEach(decorate);
  }).observe(document.body, { childList: true, subtree: true });
})();
