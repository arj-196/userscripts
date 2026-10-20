// ==UserScript==
// @name         Slack: Scheduled in the sidebar
// @namespace    http://tampermonkey.net/
// @version      2026-10-19
// @description  Adds a "Scheduled" item under "Drafts & sent" in Slack's sidebar that opens the Scheduled tab directly.
// @author       Arjun
// @match        https://app.slack.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=slack.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Verified against Slack web on 2026-10-19:
  //  - the sidebar is a virtual list: each row is an absolutely positioned
  //    .c-virtual_list__item placed with an inline translateY, 28px tall.
  //  - "Drafts & sent" is the row id="Pdrafts"; its link is [data-qa="channel_sidebar_pdrafts"].
  //  - the Drafts & sent page has tabs, Scheduled being [data-qa="outbox_tab_scheduled"].
  const DRAFTS_ROW = '#Pdrafts';
  const DRAFTS_LINK = '[data-qa="channel_sidebar_pdrafts"]';
  const SCHEDULED_TAB = '[data-qa="outbox_tab_scheduled"]';
  const ROW_HEIGHT = 28;
  const ID = 'arj-scheduled';
  const SELECTED = 'p-channel_sidebar__link--selected';

  // Make room for our row: push every row after Drafts & sent down by one row,
  // and grow the list so the last channel can still be scrolled into view.
  const style = document.createElement('style');
  style.textContent = `
    ${DRAFTS_ROW} ~ .c-virtual_list__item:not(#${ID}) { margin-top: ${ROW_HEIGHT}px; }
    .c-virtual_list__scroll_container:has(> ${DRAFTS_ROW}) { margin-bottom: ${ROW_HEIGHT}px; }
  `;
  document.head.appendChild(style);

  function waitFor(selector, timeout = 2000) {
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

  async function openScheduled() {
    let tab = document.querySelector(SCHEDULED_TAB);
    if (!tab) {
      const drafts = document.querySelector(DRAFTS_LINK);
      if (!drafts) return;
      drafts.click();
      tab = await waitFor(SCHEDULED_TAB);
    }
    if (tab) tab.click();
  }

  // Built from Slack's own sidebar classes so it looks like the rows around it.
  function makeRow(draftsRow) {
    const row = document.createElement('div');
    row.id = ID;
    row.className = 'p-channel_sidebar__static_list__item p-channel_sidebar__static_list__item--contain p-channel_sidebar__static_list__item__row_container c-virtual_list__item';
    row.setAttribute('role', 'treeitem');
    row.tabIndex = -1;

    const link = document.createElement('div');
    link.className = 'p-channel_sidebar__link p-channel_sidebar__link--page position_relative';

    const icon = document.createElement('span');
    icon.className = 'p-channel_sidebar__link__icon c-icon--inherit';
    // Reuse the clock icon Slack shows in the Drafts & sent badge.
    const clock = draftsRow.querySelector('svg[data-qa="schedule-send"]');
    if (clock) icon.appendChild(clock.cloneNode(true));

    const name = document.createElement('span');
    name.className = 'p-channel_sidebar__name';
    name.textContent = 'Scheduled';

    link.append(icon, name);
    row.appendChild(link);
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openScheduled();
    });
    return row;
  }

  function sync() {
    const draftsRow = document.querySelector(DRAFTS_ROW);
    let row = document.getElementById(ID);
    if (!draftsRow) { if (row) row.remove(); return; } // scrolled out of the virtual list
    const list = draftsRow.parentElement;
    // Kept at the end of the list so it stays out of React's way between Slack's own rows.
    if (!row || row.parentElement !== list) {
      if (row) row.remove();
      row = makeRow(draftsRow);
      list.appendChild(row);
    }

    const y = Number((draftsRow.style.transform.match(/translateY\((-?[\d.]+)px\)/) || [])[1] || 0);
    const transform = `translateY(${y + ROW_HEIGHT}px)`;
    if (row.style.transform !== transform) {
      row.style.cssText = `top: 0px; transform: ${transform}; height: ${ROW_HEIGHT}px;`;
    }

    // While the Scheduled tab is open, highlight our row instead of Drafts & sent.
    const tab = document.querySelector(SCHEDULED_TAB);
    const onScheduled = !!tab && tab.getAttribute('aria-selected') === 'true';
    const draftsLink = draftsRow.querySelector(DRAFTS_LINK);
    row.firstElementChild.classList.toggle(SELECTED, onScheduled);
    if (onScheduled && draftsLink && draftsLink.classList.contains(SELECTED)) {
      draftsLink.classList.remove(SELECTED);
    }
  }

  // Slack re-renders the sidebar constantly, so re-check on every change (at most once a frame).
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'aria-selected', 'class'] });

  sync();
})();
