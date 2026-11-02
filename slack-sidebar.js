// ==UserScript==
// @name         Slack: sidebar additions
// @namespace    http://tampermonkey.net/
// @version      2026-11-02
// @description  Adds rows right after "Threads" in Slack's sidebar: "Scheduled" opens the Scheduled tab directly and shows the scheduled count, "My activity" searches from:@Arj.
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
  //  - "Threads" is the row id="Vall_threads".
  //  - "Drafts & sent" is the row id="Pdrafts"; its link is [data-qa="channel_sidebar_pdrafts"].
  //  - the Drafts & sent page has tabs, Scheduled being [data-qa="outbox_tab_scheduled"].
  // Verified against Slack web on 2026-10-21:
  //  - the top bar search button is [data-qa="top_nav_search"]; it opens on mousedown, so a bare
  //    .click() does nothing. Once open, the search input is focused.
  //  - the first Enter turns "from:@Arj" into a filter chip; a second Enter runs the search,
  //    which closes the [data-qa="search_autocomplete"] popup.
  // Verified against Slack web on 2026-11-02:
  //  - the scheduled count on Drafts & sent is a .p-outbox_link__badge (a schedule-send svg plus
  //    the number as a bare text node) inside a .p-outbox_link__badge_list.
  const THREADS_ROW = '#Vall_threads';
  const DRAFTS_LINK = '[data-qa="channel_sidebar_pdrafts"]';
  const SCHEDULED_TAB = '[data-qa="outbox_tab_scheduled"]';
  const SCHEDULED_BADGE = `${DRAFTS_LINK} .p-outbox_link__badge:has(svg[data-qa="schedule-send"])`;
  const SEARCH_BUTTON = '[data-qa="top_nav_search"]';
  const SEARCH_POPUP = '[data-qa="search_autocomplete"]';
  const ACTIVITY_QUERY = 'from:@Arj';
  const ROW_HEIGHT = 28;
  const SELECTED = 'p-channel_sidebar__link--selected';

  function waitFor(find, timeout = 2000) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function poll() {
        const el = typeof find === 'string' ? document.querySelector(find) : find();
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

  function isScheduledOpen() {
    const tab = document.querySelector(SCHEDULED_TAB);
    return !!tab && tab.getAttribute('aria-selected') === 'true';
  }

  // No search URL to navigate to, so open the search box, type the query and press Enter.
  async function searchActivity() {
    const button = document.querySelector(SEARCH_BUTTON);
    if (!button) return;
    const mouse = { bubbles: true, cancelable: true, view: window, button: 0 };
    for (const type of ['mousedown', 'mouseup', 'click']) button.dispatchEvent(new MouseEvent(type, mouse));
    const input = await waitFor(() => {
      const el = document.activeElement;
      return el && el.isContentEditable ? el : null;
    });
    if (!input) return;
    document.execCommand('selectAll');
    document.execCommand('insertText', false, ACTIVITY_QUERY);
    const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    enter(); // makes the chip
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (document.querySelector(SEARCH_POPUP)) enter(); // runs the search
  }

  // Slack's clock icon (from the top bar history menu, not always mounted), drawn on the
  // Drafts & sent icon so it gets the same size and styling as the sidebar icons.
  const CLOCK_PATH = 'M2.5 10a7.5 7.5 0 1 1 15 0 7.5 7.5 0 0 1-15 0M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18m.75 4.75a.75.75 0 0 0-1.5 0v4.75c0 .414.336.75.75.75h3.75a.75.75 0 0 0 0-1.5h-3z';
  function scheduledIcon() {
    const send = document.querySelector(`${DRAFTS_LINK} svg[data-qa="send"]`);
    if (!send) return null;
    const svg = send.cloneNode(true);
    svg.setAttribute('data-qa', 'clock');
    svg.replaceChildren();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('d', CLOCK_PATH);
    svg.appendChild(path);
    return svg;
  }

  // A copy of the scheduled count Slack shows at the end of the Drafts & sent row (a clock and a
  // number), kept in its badge list for the layout but without the list's other badges.
  function scheduledBadge() {
    const badge = document.querySelector(SCHEDULED_BADGE);
    if (!badge) return null;
    const list = badge.parentElement.cloneNode(false);
    list.appendChild(badge.cloneNode(true));
    return list;
  }

  // Rows added after Threads, in order. icon returns an <svg> to reuse from Slack's own UI,
  // badge an element to mirror at the end of the row.
  const ITEMS = [
    {
      id: 'arj-scheduled',
      label: 'Scheduled',
      icon: scheduledIcon,
      badge: scheduledBadge,
      open: openScheduled,
      isSelected: isScheduledOpen,
    },
    {
      id: 'arj-activity',
      label: 'My activity',
      // The magnifier on the top bar search button.
      icon: () => document.querySelector(`${SEARCH_BUTTON} svg`),
      open: searchActivity,
      isSelected: () => false,
    },
  ];
  const IDS = ITEMS.map((item) => `#${item.id}`).join(', ');

  // Make room for our rows: push every row after Threads down,
  // and grow the list so the last channel can still be scrolled into view.
  const style = document.createElement('style');
  style.textContent = `
    ${THREADS_ROW} ~ .c-virtual_list__item:not(${IDS}) { margin-top: ${ROW_HEIGHT * ITEMS.length}px; }
    .c-virtual_list__scroll_container:has(> ${THREADS_ROW}) { margin-bottom: ${ROW_HEIGHT * ITEMS.length}px; }
  `;
  document.head.appendChild(style);

  // Built from Slack's own sidebar classes so it looks like the rows around it.
  function makeRow(item) {
    const row = document.createElement('div');
    row.id = item.id;
    row.className = 'p-channel_sidebar__static_list__item p-channel_sidebar__static_list__item--contain p-channel_sidebar__static_list__item__row_container c-virtual_list__item';
    row.setAttribute('role', 'treeitem');
    row.tabIndex = -1;

    const link = document.createElement('div');
    link.className = 'p-channel_sidebar__link p-channel_sidebar__link--page position_relative';

    const icon = document.createElement('span');
    icon.className = 'p-channel_sidebar__link__icon c-icon--inherit';
    const svg = item.icon();
    if (svg) icon.appendChild(svg.cloneNode(true));

    const name = document.createElement('span');
    name.className = 'p-channel_sidebar__name';
    name.textContent = item.label;

    link.append(icon, name);
    row.appendChild(link);
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.open();
    });
    return row;
  }

  function sync() {
    const threadsRow = document.querySelector(THREADS_ROW);
    if (!threadsRow) { // scrolled out of the virtual list
      for (const item of ITEMS) document.getElementById(item.id)?.remove();
      return;
    }
    const list = threadsRow.parentElement;
    const y = Number((threadsRow.style.transform.match(/translateY\((-?[\d.]+)px\)/) || [])[1] || 0);
    const draftsLink = document.querySelector(DRAFTS_LINK);

    ITEMS.forEach((item, i) => {
      let row = document.getElementById(item.id);
      // Kept at the end of the list so they stay out of React's way between Slack's own rows.
      if (!row || row.parentElement !== list) {
        if (row) row.remove();
        row = makeRow(item);
        list.appendChild(row);
      }

      const transform = `translateY(${y + ROW_HEIGHT * (i + 1)}px)`;
      if (row.style.transform !== transform) {
        row.style.cssText = `top: 0px; transform: ${transform}; height: ${ROW_HEIGHT}px;`;
      }

      // Re-copied whenever Slack's own badge changes, and dropped when it goes away.
      const badge = item.badge ? item.badge() : null;
      const ours = row.querySelector('.arj-badge');
      if (!badge) {
        ours?.remove();
      } else {
        badge.classList.add('arj-badge');
        if (!ours) row.firstElementChild.appendChild(badge);
        else if (ours.outerHTML !== badge.outerHTML) ours.replaceWith(badge);
      }

      // While our page is open, highlight our row instead of Drafts & sent.
      const selected = item.isSelected();
      row.firstElementChild.classList.toggle(SELECTED, selected);
      if (selected && draftsLink && draftsLink.classList.contains(SELECTED)) {
        draftsLink.classList.remove(SELECTED);
      }
    });
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
