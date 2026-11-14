// ==UserScript==
// @name         Slack: next free schedule slot
// @namespace    http://tampermonkey.net/
// @version      2026-11-14
// @description  Adds "Next free slot" to Slack's Schedule message menu: from 10:00, one slot per hour, at most 2 scheduled messages per slot, weekdays only, so scheduled messages don't all land at 9:00.
// @author       Arjun
// @match        https://app.slack.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=slack.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Slot rules. Times are in the browser's time zone, which is also the one Slack's
  // Custom time dialog uses as long as the Slack profile time zone matches the computer's.
  const FIRST_HOUR = 10; // first slot of the day, never earlier
  const LAST_HOUR = 17; // last slot of the day
  const SLOT_MINUTES = 60; // gap between slots
  const MAX_PER_SLOT = 2; // scheduled messages allowed in one slot
  const MIN_LEAD_MINUTES = 5; // don't offer a slot that starts in less than this
  const SKIP_WEEKENDS = true;

  // Verified against Slack web on 2026-11-14:
  //  - the arrow next to Send is [data-qa="texty_send_options_button"]; it opens a
  //    [data-qa="menu_items"] menu whose options are [data-qa="p-schedule_send_menu__scheduling_option"]
  //    ("Tomorrow at 09:00", "Monday at 09:00", "Custom time"), after a .c-menu_item__header.
  //  - "Custom time" opens a modal with a text date input [data-qa="date_time_picker_date_picker_input"]
  //    ("16 November 2026"), a combobox time input [data-qa="date_time_picker_time_picker-input"]
  //    ("9:00 AM") and the submit button [data-qa="schedule_message_dialog_submit_button"].
  //    Typed dates are kept; typed times are not, the time has to be clicked in its option list.
  //  - chat.scheduledMessages.list rejects the web client's token (not_allowed_token_type), but
  //    drafts.list on the workspace host works: scheduled messages are drafts with date_scheduled
  //    (unix seconds). It sees messages scheduled from any device.
  const OPTION = '[data-qa="p-schedule_send_menu__scheduling_option"]';
  const MENU = '[data-qa="menu_items"]';
  const DATE_INPUT = '[data-qa="date_time_picker_date_picker_input"]';
  const TIME_INPUT = '[data-qa="date_time_picker_time_picker-input"]';
  const TIME_LIST = '[data-qa="date_time_picker_time_picker-options-list"]';
  const TIME_SCROLLER = '.c-time_picker__virtual_list';
  const SUBMIT = '[data-qa="schedule_message_dialog_submit_button"]';
  const ITEM_ID = 'arj-next-slot';
  const HIGHLIGHT = 'c-menu_item__button--highlighted';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function waitFor(selector, timeout = 3000) {
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

  // The web client's session for the workspace open in this tab.
  function session() {
    const config = JSON.parse(localStorage.getItem('localConfig_v2') || '{}');
    const teamId = location.pathname.match(/\/client\/(T\w+)/)?.[1] || config.lastActiveTeamId;
    const team = config.teams?.[teamId];
    if (!team?.token || !team?.url) return null;
    return { teamId, token: team.token, url: team.url.replace(/\/?$/, '/') };
  }

  // Send times (ms) of every message scheduled in this workspace.
  async function scheduledTimes() {
    const s = session();
    if (!s) throw new Error('no Slack session');
    const times = [];
    let cursor = '';
    do {
      const form = new FormData();
      form.append('token', s.token);
      form.append('is_active', 'true');
      form.append('limit', '100');
      if (cursor) form.append('cursor', cursor);
      // Without _x_gantry=true the workspace host refuses the cross-origin call ("Failed to fetch").
      const res = await fetch(`${s.url}api/drafts.list?slack_route=${s.teamId}&_x_gantry=true`, { method: 'POST', body: form, credentials: 'include' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      for (const draft of json.drafts || []) {
        if (draft.date_scheduled && !draft.is_sent && !draft.is_deleted) times.push(draft.date_scheduled * 1000);
      }
      cursor = json.response_metadata?.next_cursor || '';
    } while (cursor);
    return times;
  }

  // The first slot from now on with fewer than MAX_PER_SLOT messages in it. A message counts
  // towards the slot it falls in, so one at 10:07 fills the 10:00 slot.
  function nextFreeSlot(times, now = new Date()) {
    const earliest = now.getTime() + MIN_LEAD_MINUTES * 60000;
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    for (let d = 0; d < 60; d++, day.setDate(day.getDate() + 1)) {
      const weekday = day.getDay();
      if (SKIP_WEEKENDS && (weekday === 0 || weekday === 6)) continue;
      for (let minutes = FIRST_HOUR * 60; minutes <= LAST_HOUR * 60; minutes += SLOT_MINUTES) {
        const slot = new Date(day);
        slot.setHours(0, minutes, 0, 0);
        const start = slot.getTime();
        if (start < earliest) continue;
        const end = start + SLOT_MINUTES * 60000;
        const taken = times.filter((t) => t >= start && t < end).length;
        if (taken < MAX_PER_SLOT) return { date: slot, taken };
      }
    }
    return null;
  }

  // Formats Slack's dialog accepts: "17 November 2026" and "11:00 AM".
  const dialogDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const dialogTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  function label(slot) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const time = slot.date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    let day;
    if (slot.date.toDateString() === now.toDateString()) day = 'Today';
    else if (slot.date.toDateString() === tomorrow.toDateString()) day = 'Tomorrow';
    else day = slot.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const load = slot.taken ? ` (${slot.taken}/${MAX_PER_SLOT} used)` : '';
    return `Next free: ${day}, ${time}${load}`;
  }

  function mouseClick(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
    }
  }

  // The date input takes typed text: insert it and press Enter.
  async function setDate(input, text) {
    input.focus();
    input.select();
    document.execCommand('insertText', false, text);
    await sleep(150);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    input.blur();
    await sleep(150);
  }

  // The time combobox ignores typed text that isn't picked from its list, and the list is
  // virtualised (12:00 AM to 11:45 PM in 15-minute steps, only ~19 rows mounted), so open it,
  // scroll the wanted row into the rendered window and click it.
  async function setTime(input, date, text) {
    input.focus();
    input.select();
    document.execCommand('insertText', false, text); // opens the list
    const list = await waitFor(`${TIME_LIST} ${TIME_SCROLLER}`);
    if (!list) return;
    const rowHeight = list.querySelector('[role="option"]')?.getBoundingClientRect().height || 28;
    const index = date.getHours() * 4 + Math.floor(date.getMinutes() / 15);
    list.scrollTop = Math.max(0, (index - 2) * rowHeight);
    list.dispatchEvent(new Event('scroll'));
    await sleep(250);
    const option = [...document.querySelectorAll(`${TIME_LIST} [role="option"]`)].find((o) => o.textContent.trim() === text);
    if (option) mouseClick(option);
    await sleep(200);
  }

  async function scheduleAt(slot, customTime) {
    customTime.click();
    const dateInput = await waitFor(DATE_INPUT);
    const timeInput = await waitFor(TIME_INPUT);
    if (!dateInput || !timeInput) return;
    await setDate(dateInput, dialogDate(slot.date));
    await setTime(timeInput, slot.date, dialogTime(slot.date));
    if (dateInput.value !== dialogDate(slot.date) || timeInput.value !== dialogTime(slot.date)) return; // leave the dialog open to fix by hand
    document.querySelector(SUBMIT)?.click();
  }

  // A copy of Slack's own menu row, so it looks like the options around it.
  async function addItem(menu) {
    const options = [...menu.querySelectorAll(OPTION)];
    const customTime = options.find((o) => o.textContent.trim() === 'Custom time');
    if (!customTime || menu.querySelector(`#${ITEM_ID}`)) return;

    const wrapper = options[0].parentElement.cloneNode(true);
    const button = wrapper.querySelector('button');
    button.id = ITEM_ID;
    button.removeAttribute('data-qa');
    const text = button.querySelector('.c-menu_item__label');
    text.textContent = 'Next free slot: checking…';
    button.disabled = true;
    button.addEventListener('mouseenter', () => button.classList.add(HIGHLIGHT));
    button.addEventListener('mouseleave', () => button.classList.remove(HIGHLIGHT));
    options[0].parentElement.before(wrapper);

    let slot;
    try {
      slot = nextFreeSlot(await scheduledTimes());
    } catch (err) {
      text.textContent = `Next free slot: unavailable (${err.message})`;
      return;
    }
    if (!slot) {
      text.textContent = 'Next free slot: none in the next 60 days';
      return;
    }
    text.textContent = label(slot);
    button.disabled = false;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scheduleAt(slot, customTime);
    });
  }

  new MutationObserver(() => {
    for (const menu of document.querySelectorAll(MENU)) {
      if (menu.querySelector(OPTION) && !menu.querySelector(`#${ITEM_ID}`)) addItem(menu);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
