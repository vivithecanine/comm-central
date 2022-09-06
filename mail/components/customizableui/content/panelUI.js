/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals CanDetachAttachments
  currentAttachments FullScreen
  getIconForAttachment goUpdateAttachmentCommands initAddonPrefsMenu
  initAppMenuPopup InitAppmenuViewBodyMenu
  InitAppmenuViewMessagesMenu InitAppFolderViewsMenu InitAppViewSortByMenu
  InitMessageTags InitRecentlyClosedTabsPopup InitViewFolderViewsMenu
  InitViewHeadersMenu InitViewLayoutStyleMenu initSearchMessagesMenu
  MozXULElement msgWindow
  onViewToolbarsPopupShowing RefreshCustomViewsPopup RefreshTagsPopup
  RefreshViewPopup SanitizeAttachmentDisplayName
  updateEditUIVisibility UpdateFullZoomMenu
  initUiDensityAppMenu gSpacesToolbar
   */

var { CustomizableUI } = ChromeUtils.import(
  "resource:///modules/CustomizableUI.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);
var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { ShortcutUtils } = ChromeUtils.import(
  "resource://gre/modules/ShortcutUtils.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { UIDensity } = ChromeUtils.import("resource:///modules/UIDensity.jsm");
var { UIFontSize } = ChromeUtils.import("resource:///modules/UIFontSize.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "AppMenuNotifications",
  "resource://gre/modules/AppMenuNotifications.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "ExtensionsUI",
  "resource:///modules/ExtensionsUI.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "PanelMultiView",
  "resource:///modules/PanelMultiView.jsm"
);

/**
 * Maintains the state and dispatches events for the main menu panel.
 */
const PanelUI = {
  /** Panel events that we listen for. **/
  get kEvents() {
    return [
      "popupshowing",
      "popupshown",
      "popuphiding",
      "popuphidden",
      "ViewShowing",
    ];
  },
  /**
   * Used for lazily getting and memoizing elements from the document. Lazy
   * getters are set in init, and memoizing happens after the first retrieval.
   */
  get kElements() {
    return {
      mainView: "appMenu-mainView",
      multiView: "appMenu-multiView",
      menuButton: "button-appmenu",
      panel: "appMenu-popup",
      addonNotificationContainer: "appMenu-addon-banners",
      navbar: "mail-bar3",
    };
  },

  kAppMenuButtons: new Set(),

  _initialized: false,
  _notifications: null,

  init() {
    this._initElements();
    this.initAppMenuButton("button-appmenu", "mail-toolbox");
    this.initAppMenuButton("button-chat-appmenu", "chat-view-toolbox");

    this.menuButton = this.menuButtonMail;

    Services.obs.addObserver(this, "fullscreen-nav-toolbox");
    Services.obs.addObserver(this, "appMenu-notifications");

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "autoHideToolbarInFullScreen",
      "browser.fullscreen.autohide",
      false,
      (pref, previousValue, newValue) => {
        // On OSX, or with autohide preffed off, MozDOMFullscreen is the only
        // event we care about, since fullscreen should behave just like non
        // fullscreen. Otherwise, we don't want to listen to these because
        // we'd just be spamming ourselves with both of them whenever a user
        // opened a video.
        if (newValue) {
          window.removeEventListener("MozDOMFullscreen:Entered", this);
          window.removeEventListener("MozDOMFullscreen:Exited", this);
          window.addEventListener("fullscreen", this);
        } else {
          window.addEventListener("MozDOMFullscreen:Entered", this);
          window.addEventListener("MozDOMFullscreen:Exited", this);
          window.removeEventListener("fullscreen", this);
        }

        this._updateNotifications(false);
      },
      autoHidePref => autoHidePref && Services.appinfo.OS !== "Darwin"
    );

    if (this.autoHideToolbarInFullScreen) {
      window.addEventListener("fullscreen", this);
    } else {
      window.addEventListener("MozDOMFullscreen:Entered", this);
      window.addEventListener("MozDOMFullscreen:Exited", this);
    }

    window.addEventListener("activate", this);
    CustomizableUI.addListener(this);

    Services.obs.notifyObservers(
      null,
      "appMenu-notifications-request",
      "refresh"
    );

    this._initialized = true;
  },

  _initElements() {
    for (let [k, v] of Object.entries(this.kElements)) {
      // Need to do fresh let-bindings per iteration
      let getKey = k;
      let id = v;
      this.__defineGetter__(getKey, function() {
        delete this[getKey];
        // eslint-disable-next-line consistent-return
        return (this[getKey] = document.getElementById(id));
      });
    }
  },

  initAppMenuButton(id, toolboxId) {
    let button = document.getElementById(id);
    if (!button) {
      // If not in the document, the button should be in the toolbox palette,
      // which isn't part of the document.
      let toolbox = document.getElementById(toolboxId);
      if (toolbox) {
        button = toolbox.palette.querySelector(`#${id}`);
      }
    }

    if (button) {
      button.addEventListener("mousedown", PanelUI);
      button.addEventListener("keypress", PanelUI);

      this.kAppMenuButtons.add(button);
    }
  },

  _eventListenersAdded: false,
  _ensureEventListenersAdded() {
    if (this._eventListenersAdded) {
      return;
    }
    this._addEventListeners();
  },

  _addEventListeners() {
    for (let event of this.kEvents) {
      this.panel.addEventListener(event, this);
    }
    this._eventListenersAdded = true;
  },

  _removeEventListeners() {
    for (let event of this.kEvents) {
      this.panel.removeEventListener(event, this);
    }
    this._eventListenersAdded = false;
  },

  uninit() {
    this._removeEventListeners();

    Services.obs.removeObserver(this, "fullscreen-nav-toolbox");
    Services.obs.removeObserver(this, "appMenu-notifications");

    window.removeEventListener("MozDOMFullscreen:Entered", this);
    window.removeEventListener("MozDOMFullscreen:Exited", this);
    window.removeEventListener("fullscreen", this);
    window.removeEventListener("activate", this);

    [this.menuButtonMail, this.menuButtonChat].forEach(button => {
      // There's no chat button in the messageWindow.xhtml context.
      if (button) {
        button.removeEventListener("mousedown", this);
        button.removeEventListener("keypress", this);
      }
    });

    CustomizableUI.removeListener(this);
  },

  /**
   * Opens the menu panel if it's closed, or closes it if it's open.
   *
   * @param event the event that triggers the toggle.
   */
  toggle(event) {
    // Don't show the panel if the window is in customization mode,
    // since this button doubles as an exit path for the user in this case.
    if (document.documentElement.hasAttribute("customizing")) {
      return;
    }

    // Since we have several menu buttons, make sure the current one is used.
    // This works for now, but in the long run, if we're showing badges etc.
    // then the current menuButton needs to be set when the app's view/tab
    // changes, not just when the menu is toggled.
    this.menuButton = event.target;

    this._ensureEventListenersAdded();
    if (this.panel.state == "open") {
      this.hide();
    } else if (this.panel.state == "closed") {
      this.show(event);
    }
  },

  /**
   * Opens the menu panel. If the event target has a child with the
   * toolbarbutton-icon attribute, the panel will be anchored on that child.
   * Otherwise, the panel is anchored on the event target itself.
   *
   * @param aEvent the event (if any) that triggers showing the menu.
   */
  show(aEvent) {
    this._ensureShortcutsShown();
    (async () => {
      await this.ensureReady();

      if (
        this.panel.state == "open" ||
        document.documentElement.hasAttribute("customizing")
      ) {
        return;
      }

      let domEvent = null;
      if (aEvent && aEvent.type != "command") {
        domEvent = aEvent;
      }

      // We try to use the event.target to account for clicks triggered
      // from the #button-chat-appmenu. In case the opening of the menu isn't
      // triggered by a click event, fallback to the main menu button as anchor.
      let anchor = this._getPanelAnchor(
        aEvent ? aEvent.target : this.menuButton
      );
      await PanelMultiView.openPopup(this.panel, anchor, {
        triggerEvent: domEvent,
      });
    })().catch(Cu.reportError);
  },

  /**
   * If the menu panel is being shown, hide it.
   */
  hide() {
    if (document.documentElement.hasAttribute("customizing")) {
      return;
    }

    PanelMultiView.hidePopup(this.panel);
  },

  observe(subject, topic, status) {
    switch (topic) {
      case "fullscreen-nav-toolbox":
        if (this._notifications) {
          this._updateNotifications(false);
        }
        break;
      case "appMenu-notifications":
        // Don't initialize twice.
        if (status == "init" && this._notifications) {
          break;
        }
        this._notifications = AppMenuNotifications.notifications;
        this._updateNotifications(true);
        break;
    }
  },

  handleEvent(event) {
    // Ignore context menus and menu button menus showing and hiding:
    if (event.type.startsWith("popup") && event.target != this.panel) {
      return;
    }
    switch (event.type) {
      case "popupshowing":
        initAppMenuPopup();
        UIFontSize.updateAppMenuButton(window);
        initUiDensityAppMenu(event);
      // Fall through
      case "popupshown":
        if (event.type == "popupshown") {
          CustomizableUI.addPanelCloseListeners(this.panel);
        }
      // Fall through
      case "popuphiding":
      // Fall through
      case "popuphidden":
        this._updateNotifications();
        this._updatePanelButton(event.target);
        if (event.type == "popuphidden") {
          CustomizableUI.removePanelCloseListeners(this.panel);
        }
        break;
      case "mousedown":
        if (event.button == 0) {
          this.toggle(event);
        }
        break;
      case "keypress":
        if (event.key == " " || event.key == "Enter") {
          this.toggle(event);
          event.stopPropagation();
        }
        break;
      case "MozDOMFullscreen:Entered":
      case "MozDOMFullscreen:Exited":
      case "fullscreen":
      case "activate":
        this._updateNotifications();
        break;
      case "ViewShowing":
        PanelUI._handleViewShowingEvent(event);
        break;
    }
  },

  /**
   * When a ViewShowing event happens when a <panelview> element is shown,
   * do any required set up for that particular view.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _handleViewShowingEvent(event) {
    // Typically event.target for "ViewShowing" is a <panelview> element.
    PanelUI._ensureShortcutsShown(event.target);

    switch (event.target.id) {
      case "appMenu-foldersView":
        this._onFoldersViewShow(event);
        break;
      case "appMenu-addonsView":
        initAddonPrefsMenu(
          event.target.querySelector(".panel-subview-body"),
          "toolbarbutton",
          "subviewbutton subviewbutton-iconic",
          "subviewbutton subviewbutton-iconic"
        );
        break;
      case "appMenu-toolbarsView":
        onViewToolbarsPopupShowing(
          event,
          "mail-toolbox",
          document.getElementById("appmenu_quickFilterBar"),
          "toolbarbutton",
          "subviewbutton subviewbutton-iconic",
          true
        );
        break;
      case "appMenu-preferencesLayoutView":
        PanelUI._onPreferencesLayoutViewShow(event);
        break;
      // View
      case "appMenu-viewSortByView":
        InitAppViewSortByMenu();
        break;
      case "appMenu-viewMessagesView":
        RefreshViewPopup(event.target);
        break;
      case "appMenu-viewMessagesTagsView":
        PanelUI._refreshDynamicView(event, RefreshTagsPopup);
        break;
      case "appMenu-viewMessagesCustomViewsView":
        PanelUI._refreshDynamicView(event, RefreshCustomViewsPopup);
        break;
      case "appMenu-viewThreadsView":
        InitAppmenuViewMessagesMenu();
        break;
      case "appMenu-viewHeadersView":
        InitViewHeadersMenu();
        break;
      case "appMenu-viewMessageBodyAsView":
        InitAppmenuViewBodyMenu();
        break;
      case "appMenu-viewFeedsView":
        InitAppmenuViewBodyMenu();
        break;
      case "appMenu-viewZoomView":
        UpdateFullZoomMenu();
        break;
      // Go
      case "appMenu-goRecentlyClosedTabsView":
        PanelUI._refreshDynamicView(event, InitRecentlyClosedTabsPopup);
        break;
    }
  },

  /**
   * Refreshes some views that are dynamically populated. Typically called by
   * event listeners responding to a ViewShowing event. It calls a given refresh
   * function (that populates the view), passing appmenu-specific arguments.
   *
   * @param {ViewShowingEvent} event    ViewShowing event.
   * @param {Function} refreshFunction  Function that refreshes a particular view.
   */
  _refreshDynamicView(event, refreshFunction) {
    refreshFunction(
      event.target.querySelector(".panel-subview-body"),
      "toolbarbutton",
      "subviewbutton subviewbutton-iconic",
      "toolbarseparator"
    );
  },

  get isReady() {
    return !!this._isReady;
  },

  /**
   * Registering the menu panel is done lazily for performance reasons. This
   * method is exposed so that CustomizationMode can force panel-readyness in the
   * event that customization mode is started before the panel has been opened
   * by the user.
   *
   * @param aCustomizing (optional) set to true if this was called while entering
   *        customization mode. If that's the case, we trust that customization
   *        mode will handle calling beginBatchUpdate and endBatchUpdate.
   *
   * @return a Promise that resolves once the panel is ready to roll.
   */
  async ensureReady() {
    if (this._isReady) {
      return;
    }

    await window.delayedStartupPromise;
    this._ensureEventListenersAdded();
    this.panel.hidden = false;
    this._isReady = true;
  },

  /**
   * Shows a subview in the panel with a given ID.
   *
   * @param aViewId the ID of the subview to show.
   * @param aAnchor the element that spawned the subview.
   * @param aEvent the event triggering the view showing.
   */
  async showSubView(aViewId, aAnchor, aEvent) {
    let domEvent = null;
    if (aEvent) {
      if (aEvent.type == "mousedown" && aEvent.button != 0) {
        return;
      }
      if (
        aEvent.type == "keypress" &&
        aEvent.key != " " &&
        aEvent.key != "Enter"
      ) {
        return;
      }
      if (aEvent.type == "command" && aEvent.inputSource != null) {
        // Synthesize a new DOM mouse event to pass on the inputSource.
        domEvent = document.createEvent("MouseEvent");
        domEvent.initNSMouseEvent(
          "click",
          true,
          true,
          null,
          0,
          aEvent.screenX,
          aEvent.screenY,
          0,
          0,
          false,
          false,
          false,
          false,
          0,
          aEvent.target,
          0,
          aEvent.inputSource
        );
      } else if (aEvent.mozInputSource != null || aEvent.type == "keypress") {
        domEvent = aEvent;
      }
    }

    this._ensureEventListenersAdded();
    let viewNode = document.getElementById(aViewId);
    if (!viewNode) {
      Cu.reportError("Could not show panel subview with id: " + aViewId);
      return;
    }

    if (!aAnchor) {
      Cu.reportError(
        "Expected an anchor when opening subview with id: " + aViewId
      );
      return;
    }

    let container = aAnchor.closest("panelmultiview");
    if (container) {
      container.showSubView(aViewId, aAnchor);
    } else if (!aAnchor.open) {
      aAnchor.open = true;

      let tempPanel = document.createXULElement("panel");
      tempPanel.setAttribute("type", "arrow");
      tempPanel.setAttribute("id", "customizationui-widget-panel");
      tempPanel.setAttribute("class", "cui-widget-panel panel-no-padding");
      tempPanel.setAttribute("viewId", aViewId);
      if (aAnchor.getAttribute("tabspecific")) {
        tempPanel.setAttribute("tabspecific", true);
      }
      if (this._disableAnimations) {
        tempPanel.setAttribute("animate", "false");
      }
      tempPanel.setAttribute("context", "");
      document
        .getElementById(CustomizableUI.AREA_NAVBAR)
        .appendChild(tempPanel);
      // If the view has a footer, set a convenience class on the panel.
      tempPanel.classList.toggle(
        "cui-widget-panelWithFooter",
        viewNode.querySelector(".panel-subview-footer")
      );

      let multiView = document.createXULElement("panelmultiview");
      multiView.setAttribute("id", "customizationui-widget-multiview");
      multiView.setAttribute("viewCacheId", "appMenu-viewCache");
      multiView.setAttribute("mainViewId", viewNode.id);
      tempPanel.appendChild(multiView);
      viewNode.classList.add("cui-widget-panelview");

      let viewShown = false;
      let panelRemover = () => {
        viewNode.classList.remove("cui-widget-panelview");
        if (viewShown) {
          CustomizableUI.removePanelCloseListeners(tempPanel);
          tempPanel.removeEventListener("popuphidden", panelRemover);
        }
        aAnchor.open = false;

        PanelMultiView.removePopup(tempPanel);
      };

      if (aAnchor.parentNode.id == "PersonalToolbar") {
        tempPanel.classList.add("bookmarks-toolbar");
      }

      let anchor = this._getPanelAnchor(aAnchor);

      if (aAnchor != anchor && aAnchor.id) {
        anchor.setAttribute("consumeanchor", aAnchor.id);
      }

      try {
        viewShown = await PanelMultiView.openPopup(tempPanel, anchor, {
          position: "bottomright topright",
          triggerEvent: domEvent,
        });
      } catch (ex) {
        Cu.reportError(ex);
      }

      if (viewShown) {
        CustomizableUI.addPanelCloseListeners(tempPanel);
        tempPanel.addEventListener("popuphidden", panelRemover);
      } else {
        panelRemover();
      }
    }
  },

  /**
   * NB: The enable- and disableSingleSubviewPanelAnimations methods only
   * affect the hiding/showing animations of single-subview panels (tempPanel
   * in the showSubView method).
   */
  disableSingleSubviewPanelAnimations() {
    this._disableAnimations = true;
  },

  enableSingleSubviewPanelAnimations() {
    this._disableAnimations = false;
  },

  /**
   * Sets the anchor node into the open or closed state, depending
   * on the state of the panel.
   */
  _updatePanelButton() {
    this.menuButton.open =
      this.panel.state == "open" || this.panel.state == "showing";
  },

  /**
   * Event handler for showing the Preferences/Layout view. Removes "checked"
   * from all layout menu items and then checks the current layout menu item.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _onPreferencesLayoutViewShow(event) {
    event.target
      .querySelectorAll("[name='viewlayoutgroup']")
      .forEach(item => item.removeAttribute("checked"));

    InitViewLayoutStyleMenu(event, true);
  },

  /**
   * Event listener for showing the Folders view.
   *
   * @param {ViewShowingEvent} event  ViewShowing event.
   */
  _onFoldersViewShow(event) {
    event.target
      .querySelectorAll('[name="viewmessages"]')
      .forEach(item => item.removeAttribute("checked"));

    InitAppFolderViewsMenu();
    InitViewFolderViewsMenu(event);
  },

  _updateNotifications(notificationsChanged) {
    let notifications = this._notifications;
    if (!notifications || !notifications.length) {
      if (notificationsChanged) {
        this._clearAllNotifications();
      }
      return;
    }

    if (
      (window.fullScreen && FullScreen.navToolboxHidden) ||
      document.fullscreenElement
    ) {
      return;
    }

    let doorhangers = notifications.filter(
      n => !n.dismissed && !n.options.badgeOnly
    );

    if (this.panel.state == "showing" || this.panel.state == "open") {
      // If the menu is already showing, then we need to dismiss all notifications
      // since we don't want their doorhangers competing for attention
      doorhangers.forEach(n => {
        n.dismissed = true;
        if (n.options.onDismissed) {
          n.options.onDismissed(window);
        }
      });
      this._clearBadge();
      if (!notifications[0].options.badgeOnly) {
        this._showBannerItem(notifications[0]);
      }
    } else if (doorhangers.length > 0) {
      // Only show the doorhanger if the window is focused and not fullscreen
      if (
        (window.fullScreen && this.autoHideToolbarInFullScreen) ||
        Services.focus.activeWindow !== window
      ) {
        this._showBadge(doorhangers[0]);
        this._showBannerItem(doorhangers[0]);
      } else {
        this._clearBadge();
      }
    } else {
      this._showBadge(notifications[0]);
      this._showBannerItem(notifications[0]);
    }
  },

  _clearAllNotifications() {
    this._clearBadge();
    this._clearBannerItem();
  },

  _formatDescriptionMessage(n) {
    let text = {};
    let array = n.options.message.split("<>");
    text.start = array[0] || "";
    text.name = n.options.name || "";
    text.end = array[1] || "";
    return text;
  },

  _showBadge(notification) {
    let badgeStatus = this._getBadgeStatus(notification);
    for (let menuButton of this.kAppMenuButtons) {
      menuButton.setAttribute("badge-status", badgeStatus);
    }
  },

  // "Banner item" here refers to an item in the hamburger panel menu. They will
  // typically show up as a colored row in the panel.
  _showBannerItem(notification) {
    if (!this._panelBannerItem) {
      this._panelBannerItem = this.mainView.querySelector(".panel-banner-item");
    }
    let label = this._panelBannerItem.getAttribute("label-" + notification.id);
    // Ignore items we don't know about.
    if (!label) {
      return;
    }
    this._panelBannerItem.setAttribute("notificationid", notification.id);
    this._panelBannerItem.setAttribute("label", label);
    this._panelBannerItem.hidden = false;
    this._panelBannerItem.notification = notification;
  },

  _clearBadge() {
    for (let menuButton of this.kAppMenuButtons) {
      menuButton.removeAttribute("badge-status");
    }
  },

  _clearBannerItem() {
    if (this._panelBannerItem) {
      this._panelBannerItem.notification = null;
      this._panelBannerItem.hidden = true;
    }
  },

  _onNotificationButtonEvent(event, type) {
    let notificationEl = getNotificationFromElement(event.target);

    if (!notificationEl) {
      throw new Error(
        "PanelUI._onNotificationButtonEvent: couldn't find notification element"
      );
    }

    if (!notificationEl.notification) {
      throw new Error(
        "PanelUI._onNotificationButtonEvent: couldn't find notification"
      );
    }

    let notification = notificationEl.notification;

    if (type == "secondarybuttoncommand") {
      AppMenuNotifications.callSecondaryAction(window, notification);
    } else {
      AppMenuNotifications.callMainAction(window, notification, true);
    }
  },

  _onBannerItemSelected(event) {
    let target = event.target;
    if (!target.notification) {
      throw new Error(
        "menucommand target has no associated action/notification"
      );
    }

    event.stopPropagation();
    AppMenuNotifications.callMainAction(window, target.notification, false);
  },

  _getPopupId(notification) {
    return "appMenu-" + notification.id + "-notification";
  },

  _getBadgeStatus(notification) {
    return notification.id;
  },

  _getPanelAnchor(candidate) {
    let iconAnchor = candidate.badgeStack || candidate.icon;
    return iconAnchor || candidate;
  },

  _ensureShortcutsShown(view = this.mainView) {
    if (view.hasAttribute("added-shortcuts")) {
      return;
    }
    view.setAttribute("added-shortcuts", "true");
    for (let button of view.querySelectorAll("toolbarbutton[key]")) {
      let keyId = button.getAttribute("key");
      let key = document.getElementById(keyId);
      if (!key) {
        continue;
      }
      button.setAttribute("shortcut", ShortcutUtils.prettifyShortcut(key));
    }
  },

  folderViewMenuOnCommand(event) {
    // TODO: Reimplement?
  },

  folderCompactMenuOnCommand(event) {
    // TODO: Reimplement?
  },

  setUIDensity(event) {
    // Loops through all available options and uncheck them. This is necessary
    // since the toolbarbuttons don't uncheck themselves even if they're radio.
    for (let item of event.originalTarget
      .closest(".panel-subview-body")
      .querySelectorAll("toolbarbutton")) {
      // Skip this item if it's the one clicked.
      if (item == event.originalTarget) {
        continue;
      }

      item.removeAttribute("checked");
    }
    // Update the UI density.
    UIDensity.setMode(event.originalTarget.mode);
  },
};

XPCOMUtils.defineConstant(this, "PanelUI", PanelUI);

/**
 * Gets the currently selected locale for display.
 * @return  the selected locale
 */
function getLocale() {
  return Services.locale.appLocaleAsBCP47;
}

/**
 * Given a DOM node inside a <popupnotification>, return the parent <popupnotification>.
 */
function getNotificationFromElement(aElement) {
  return aElement.closest("popupnotification");
}

/**
 * This object is Thunderbird's version of the same object in
 * browser/base/content/browser-addons.js.
 */
var gExtensionsNotifications = {
  initialized: false,
  init() {
    this.updateAlerts();
    this.boundUpdate = this.updateAlerts.bind(this);
    ExtensionsUI.on("change", this.boundUpdate);
    this.initialized = true;
  },

  uninit() {
    // uninit() can race ahead of init() in some cases, if that happens,
    // we have no handler to remove.
    if (!this.initialized) {
      return;
    }
    ExtensionsUI.off("change", this.boundUpdate);
  },

  _createAddonButton(text, icon, callback) {
    let button = document.createXULElement("toolbarbutton");
    button.setAttribute("label", text);
    button.setAttribute("tooltiptext", text);
    const DEFAULT_EXTENSION_ICON =
      "chrome://mozapps/skin/extensions/extensionGeneric.svg";
    button.setAttribute("image", icon || DEFAULT_EXTENSION_ICON);
    button.className = "addon-banner-item";

    button.addEventListener("command", callback);
    PanelUI.addonNotificationContainer.appendChild(button);
  },

  updateAlerts() {
    let tabmail = document.getElementById("tabmail");
    let sideloaded = ExtensionsUI.sideloaded;
    let updates = ExtensionsUI.updates;
    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/addons.properties"
    );

    let container = PanelUI.addonNotificationContainer;

    while (container.firstChild) {
      container.firstChild.remove();
    }

    let items = 0;
    for (let update of updates) {
      if (++items > 4) {
        break;
      }
      let text = bundle.formatStringFromName("webextPerms.updateMenuItem", [
        update.addon.name,
      ]);
      this._createAddonButton(text, update.addon.iconURL, evt => {
        ExtensionsUI.showUpdate(tabmail.selectedBrowser, update);
      });
    }

    let appName;
    for (let addon of sideloaded) {
      if (++items > 4) {
        break;
      }
      if (!appName) {
        let brandBundle = document.getElementById("bundle_brand");
        appName = brandBundle.getString("brandShortName");
      }

      let text = bundle.formatStringFromName("webextPerms.sideloadMenuItem", [
        addon.name,
        appName,
      ]);
      this._createAddonButton(text, addon.iconURL, evt => {
        // We need to hide the main menu manually because the toolbarbutton is
        // removed immediately while processing this event, and PanelUI is
        // unable to identify which panel should be closed automatically.
        PanelUI.hide();
        ExtensionsUI.showSideloaded(tabmail.selectedBrowser, addon);
      });
    }
  },
};

addEventListener("unload", () => gExtensionsNotifications.uninit(), {
  once: true,
});
