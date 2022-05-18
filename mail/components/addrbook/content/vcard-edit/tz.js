/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals VCardPropertyEntryView, vCardIdGen */

ChromeUtils.defineModuleGetter(
  this,
  "cal",
  "resource:///modules/calendar/calUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "VCardPropertyEntry",
  "resource:///modules/VCardUtils.jsm"
);

/**
 * @implements {VCardPropertyEntryView}
 * @see RFC6350 URL
 */
class VCardTZComponent extends HTMLElement {
  /** @type {VCardPropertyEntry} */
  vCardPropertyEntry;

  /** @type {HTMLSelectElement} */
  selectEl;

  static newVCardPropertyEntry() {
    return new VCardPropertyEntry("tz", {}, "text", "");
  }

  constructor() {
    super();
    let template = document.getElementById("template-vcard-edit-tz");
    let clonedTemplate = template.content.cloneNode(true);
    this.appendChild(clonedTemplate);
  }

  connectedCallback() {
    if (this.isConnected) {
      this.selectEl = this.querySelector("select");
      for (let tzid of cal.timezoneService.timezoneIds) {
        let option = this.selectEl.appendChild(
          document.createElement("option")
        );
        option.value = tzid;
        option.textContent = cal.timezoneService.getTimezone(tzid).displayName;
      }

      this.fromVCardPropertyEntryToUI();
    }
  }

  disconnectedCallback() {
    if (!this.isConnected) {
      this.selectEl = null;
      this.vCardPropertyEntry = null;
    }
  }

  fromVCardPropertyEntryToUI() {
    this.selectEl.value = this.vCardPropertyEntry.value;
  }

  fromUIToVCardPropertyEntry() {
    this.vCardPropertyEntry.value = this.selectEl.value;
  }

  valueIsEmpty() {
    return this.vCardPropertyEntry.value === "";
  }
}

customElements.define("vcard-tz", VCardTZComponent);
