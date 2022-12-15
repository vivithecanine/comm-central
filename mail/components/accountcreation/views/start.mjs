/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../base/content/sync.js */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { UIState } = ChromeUtils.import("resource://services-sync/UIState.jsm");

class AccountHubStart extends HTMLElement {
  #accounts = [
    {
      id: "email",
      l10n: "account-hub-email-button",
      type: "MAIL",
    },
    {
      id: "newEmail",
      l10n: "account-hub-new-email-button",
      type: "NEW_MAIL",
    },
    {
      id: "calendar",
      l10n: "account-hub-calendar-button",
      type: "CALENDAR",
    },
    {
      id: "addressBook",
      l10n: "account-hub-address-book-button",
      type: "ADDRESS_BOOK",
    },
    {
      id: "chat",
      l10n: "account-hub-chat-button",
      type: "CHAT",
    },
    {
      id: "feed",
      l10n: "account-hub-feed-button",
      type: "FEED",
    },
    {
      id: "newsgroup",
      l10n: "account-hub-newsgroup-button",
      type: "NNTP",
    },
    {
      id: "import",
      l10n: "account-hub-import-button",
      type: "IMPORT",
    },
  ];

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    let template = document.getElementById("accountHubStart");
    this.appendChild(template.content.cloneNode(true));

    this.initUI();

    this.setupAccountFlows();
  }

  /**
   * Update the UI to reflect reality whenever this view is triggered.
   */
  initUI() {
    const hasAccounts = MailServices.accounts.accounts.length;
    this.querySelector("#welcomeHeader").hidden = hasAccounts;
    this.querySelector("#defaultHeader").hidden = !hasAccounts;

    this.updateFxAButton();

    // Hide the release notes link for nightly builds since we don't have any.
    if (AppConstants.NIGHTLY_BUILD) {
      this.querySelector("#hubReleaseNotes").closest("li").hidden = true;
      return;
    }

    if (
      Services.prefs.getPrefType("app.releaseNotesURL") !=
      Services.prefs.PREF_INVALID
    ) {
      let relNotesURL = Services.urlFormatter.formatURLPref(
        "app.releaseNotesURL"
      );
      if (relNotesURL != "about:blank") {
        this.querySelector("#hubReleaseNotes").href = relNotesURL;
        return;
      }
      // Hide the release notes link if we don't have a URL to add.
      this.querySelector("#hubReleaseNotes").closest("li").hidden = true;
    }
  }

  /**
   * Populate the main container fo the start view with all the available
   * account creation flows.
   */
  setupAccountFlows() {
    const fragment = new DocumentFragment();
    for (const account of this.#accounts) {
      const button = document.createElement("button");
      button.id = `${account.id}Button`;
      button.classList.add("button-flat", "button-account");
      document.l10n.setAttributes(button, account.l10n);
      button.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("open-view", {
            bubbles: true,
            composed: true,
            detail: {
              type: account.type,
            },
          })
        );
      });
      fragment.append(button);
    }
    this.querySelector(".hub-body-grid").replaceChildren(fragment);

    this.querySelector("#hubSyncButton").addEventListener("click", () => {
      // FIXME: Open this in a dialog or browser inside the modal, or find a
      // way to close the account hub without an account and open it again in
      // case the FxA login fails to set up accounts.
      gSync.initFxA();
    });
  }

  /**
   * Set up the Firefox Sync button.
   */
  updateFxAButton() {
    const state = UIState.get();
    this.querySelector("#hubSyncButton").hidden =
      state.status == UIState.STATUS_SIGNED_IN;
  }

  /**
   * The start view doesn't have any abortable operation that needs to be
   * checked, so we always return true.
   *
   * @returns {boolean} - Always true.
   */
  reset() {
    return true;
  }
}
customElements.define("account-hub-start", AccountHubStart);
