/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["ToolbarButtonAPI", "getIconData"];

const lazy = {};

ChromeUtils.defineModuleGetter(
  lazy,
  "ViewPopup",
  "resource:///modules/ExtensionPopups.jsm"
);
ChromeUtils.defineModuleGetter(
  lazy,
  "ExtensionSupport",
  "resource:///modules/ExtensionSupport.jsm"
);
const { ExtensionCommon } = ChromeUtils.import(
  "resource://gre/modules/ExtensionCommon.jsm"
);
const { ExtensionUtils } = ChromeUtils.import(
  "resource://gre/modules/ExtensionUtils.jsm"
);
const { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

var { EventManager, ExtensionAPIPersistent, makeWidgetId } = ExtensionCommon;

var { IconDetails, StartupCache } = ExtensionParent;

var { DefaultWeakMap, ExtensionError } = ExtensionUtils;

var DEFAULT_ICON = "chrome://messenger/content/extension.svg";

/**
 * Get icon properties for updating the UI.
 *
 * @param {object} icons
 *        Contains the icon information, typically the extension manifest
 */
function getIconData(icons, extension) {
  let baseSize = 16;
  let { icon, size } = IconDetails.getPreferredIcon(icons, extension, baseSize);

  let legacy = false;

  // If the best available icon size is not divisible by 16, check if we have
  // an 18px icon to fall back to, and trim off the padding instead.
  if (size % 16 && typeof icon === "string" && !icon.endsWith(".svg")) {
    let result = IconDetails.getPreferredIcon(icons, extension, 18);

    if (result.size % 18 == 0) {
      baseSize = 18;
      icon = result.icon;
      legacy = true;
    }
  }

  let getIcon = (size, theme) => {
    let { icon } = IconDetails.getPreferredIcon(icons, extension, size);
    if (typeof icon === "object") {
      if (icon[theme] == IconDetails.DEFAULT_ICON) {
        icon[theme] = DEFAULT_ICON;
      }
      return IconDetails.escapeUrl(icon[theme]);
    }
    if (icon == IconDetails.DEFAULT_ICON) {
      return DEFAULT_ICON;
    }
    return IconDetails.escapeUrl(icon);
  };

  let style = [];
  let getStyle = (name, size) => {
    style.push([
      `--webextension-${name}`,
      `url("${getIcon(size, "default")}")`,
    ]);
    style.push([
      `--webextension-${name}-light`,
      `url("${getIcon(size, "light")}")`,
    ]);
    style.push([
      `--webextension-${name}-dark`,
      `url("${getIcon(size, "dark")}")`,
    ]);
  };

  getStyle("menupanel-image", 32);
  getStyle("menupanel-image-2x", 64);
  getStyle("toolbar-image", baseSize);
  getStyle("toolbar-image-2x", baseSize * 2);

  let realIcon = getIcon(size, "default");

  return { style, legacy, realIcon };
}

var ToolbarButtonAPI = class extends ExtensionAPIPersistent {
  constructor(extension, global) {
    super(extension);
    this.global = global;
    this.tabContext = new this.global.TabContext(target =>
      this.getContextData(null)
    );
  }

  /**
   * Called when the extension is enabled.
   *
   * @param {string} entryName
   *        The name of the property in the extension manifest
   */
  async onManifestEntry(entryName) {
    let { extension } = this;
    this.paint = this.paint.bind(this);
    this.unpaint = this.unpaint.bind(this);

    this.widgetId = makeWidgetId(extension.id);
    this.id =
      this.manifestName == "action"
        ? `${this.widgetId}-browserAction-toolbarbutton`
        : `${this.widgetId}-${this.manifestName}-toolbarbutton`;

    this.eventQueue = [];

    let options = extension.manifest[entryName];
    this.defaults = {
      enabled: true,
      label: options.default_label,
      title: options.default_title || extension.name,
      badgeText: "",
      badgeBackgroundColor: null,
      popup: options.default_popup || "",
    };
    this.globals = Object.create(this.defaults);

    this.browserStyle = options.browser_style;

    this.defaults.icon = await StartupCache.get(
      extension,
      [this.manifestName, "default_icon"],
      () =>
        IconDetails.normalize(
          {
            path: options.default_icon,
            iconType: this.manifestName,
            themeIcons: options.theme_icons,
          },
          extension
        )
    );

    this.iconData = new DefaultWeakMap(icons => getIconData(icons, extension));
    this.iconData.set(
      this.defaults.icon,
      await StartupCache.get(
        extension,
        [this.manifestName, "default_icon_data"],
        () => getIconData(this.defaults.icon, extension)
      )
    );

    lazy.ExtensionSupport.registerWindowListener(this.id, {
      chromeURLs: this.windowURLs,
      onLoadWindow: window => {
        this.paint(window);
      },
    });

    extension.callOnClose(this);
  }

  /**
   * Called when the extension is disabled or removed.
   */
  close() {
    lazy.ExtensionSupport.unregisterWindowListener(this.id);
    for (let window of lazy.ExtensionSupport.openWindows) {
      if (this.windowURLs.includes(window.location.href)) {
        this.unpaint(window);
      }
    }
  }

  /**
   * Creates a toolbar button.
   *
   * @param {Window} window
   */
  makeButton(window) {
    let { document } = window;
    let button = document.createXULElement("toolbarbutton");
    button.id = this.id;
    button.classList.add("toolbarbutton-1");
    button.classList.add("webextension-action");
    button.setAttribute("badged", "true");
    button.setAttribute("data-extensionid", this.extension.id);
    button.addEventListener("mousedown", this);
    this.updateButton(button, this.globals);
    return button;
  }

  /**
   * Returns an element in the toolbar, which is to be used as default insertion
   * point for new toolbar buttons in non-customizable toolbars.
   *
   * May return null to append new buttons to the end of the toolbar.
   *
   * @param {DOMElement} toolbar - a toolbar node
   * @returns {DOMElement} a node which is to be used as insertion point, or null
   */
  getNonCustomizableToolbarInsertionPoint(toolbar) {
    return null;
  }

  /**
   * Rectify the currentSet of a customizable toolbar (if needed). Called on each
   * paint request of extension buttons in customizable toolbars.
   *
   * @param {string} currentSet - comma separated list of button ids
   * @returns {string} the updated currentSet
   */
  rectifyCustomizableToolbarSet(currentSet) {
    return currentSet;
  }

  /**
   * Adds a toolbar button to a customizable toolbar in this window.
   *
   * @param {Window} window
   */
  customizableToolbarPaint(window) {
    let windowURL = window.location.href;
    let { document } = window;
    if (document.getElementById(this.id)) {
      return;
    }

    let toolbox = document.getElementById(this.toolboxId);
    if (!toolbox) {
      return;
    }

    // Get all toolbars which link to or are children of this.toolboxId and check
    // if the button has been moved to a non-default toolbar.
    let toolbars = window.document.querySelectorAll(
      `#${this.toolboxId} toolbar, toolbar[toolboxid="${this.toolboxId}"]`
    );
    for (let toolbar of toolbars) {
      let currentSet = Services.xulStore
        .getValue(windowURL, toolbar.id, "currentset")
        .split(",")
        .filter(Boolean);
      if (currentSet.includes(this.id)) {
        this.toolbarId = toolbar.id;
        break;
      }
    }

    let toolbar = document.getElementById(this.toolbarId);
    let button = this.makeButton(window);
    if (toolbox.palette) {
      toolbox.palette.appendChild(button);
    } else {
      toolbar.appendChild(button);
    }

    // Handle the special case where this toolbar does not yet have a currentset
    // defined.
    if (!Services.xulStore.hasValue(windowURL, this.toolbarId, "currentset")) {
      let defaultSet = toolbar
        .getAttribute("defaultset")
        .split(",")
        .filter(Boolean);
      Services.xulStore.setValue(
        windowURL,
        this.toolbarId,
        "currentset",
        defaultSet.join(",")
      );
    }

    // Add new buttons to currentset: If the extensionset does not include the
    // button, it is a new one which needs to be added.
    let extensionSet = Services.xulStore
      .getValue(windowURL, this.toolbarId, "extensionset")
      .split(",")
      .filter(Boolean);
    if (!extensionSet.includes(this.id)) {
      extensionSet.push(this.id);
      Services.xulStore.setValue(
        windowURL,
        this.toolbarId,
        "extensionset",
        extensionSet.join(",")
      );
      let currentSet = Services.xulStore
        .getValue(windowURL, this.toolbarId, "currentset")
        .split(",")
        .filter(Boolean);
      if (!currentSet.includes(this.id)) {
        currentSet.push(this.id);
        Services.xulStore.setValue(
          windowURL,
          this.toolbarId,
          "currentset",
          currentSet.join(",")
        );
      }
    }

    let currentSet = Services.xulStore.getValue(
      windowURL,
      this.toolbarId,
      "currentset"
    );

    let rectifiedCurrentSet = this.rectifyCustomizableToolbarSet(currentSet);
    if (currentSet != rectifiedCurrentSet) {
      currentSet = rectifiedCurrentSet;
      Services.xulStore.setValue(
        windowURL,
        this.toolbarId,
        "currentset",
        currentSet
      );
    }

    toolbar.currentSet = currentSet;
    toolbar.setAttribute("currentset", toolbar.currentSet);

    if (this.extension.hasPermission("menus")) {
      document.addEventListener("popupshowing", this);
    }
  }

  /**
   * Adds a toolbar button to a non-customizable toolbar in this window.
   *
   * @param {Window} window
   */
  nonCustomizableToolbarPaint(window) {
    let { document } = window;
    let windowURL = window.location.href;
    if (document.getElementById(this.id)) {
      return;
    }
    let toolbar = document.getElementById(this.toolbarId);
    let before = this.getNonCustomizableToolbarInsertionPoint(toolbar);
    let button = this.makeButton(window);
    let currentSet = Services.xulStore
      .getValue(windowURL, toolbar.id, "currentset")
      .split(",")
      .filter(Boolean);
    if (!currentSet.includes(this.id)) {
      currentSet.push(this.id);
      Services.xulStore.setValue(
        windowURL,
        toolbar.id,
        "currentset",
        currentSet.join(",")
      );
    } else {
      for (let id of [...currentSet].reverse()) {
        if (!id.endsWith(`-${this.manifestName}-toolbarbutton`)) {
          continue;
        }
        if (id == this.id) {
          break;
        }
        let element = document.getElementById(id);
        if (element) {
          before = element;
        }
      }
    }
    toolbar.insertBefore(button, before);

    if (this.extension.hasPermission("menus")) {
      document.addEventListener("popupshowing", this);
    }
  }

  /**
   * Adds a toolbar button to a toolbar in this window.
   *
   * @param {Window} window
   */
  paint(window) {
    let toolbar = window.document.getElementById(this.toolbarId);
    if (toolbar.hasAttribute("customizable")) {
      return this.customizableToolbarPaint(window);
    }
    return this.nonCustomizableToolbarPaint(window);
  }

  /**
   * Removes the toolbar button from this window.
   *
   * @param {Window} window
   */
  unpaint(window) {
    let { document } = window;

    if (this.extension.hasPermission("menus")) {
      document.removeEventListener("popupshowing", this);
    }

    let button = document.getElementById(this.id);
    if (button) {
      button.remove();
    }
  }

  /**
   * Triggers this browser action for the given window, with the same effects as
   * if it were clicked by a user.
   *
   * This has no effect if the browser action is disabled for, or not
   * present in, the given window.
   *
   * @param {Window} window
   */
  async triggerAction(window) {
    let { document } = window;
    let button = document.getElementById(this.id);
    let { popup: popupURL, enabled } = this.getContextData(
      this.getTargetFromWindow(window)
    );

    if (button && enabled) {
      if (popupURL) {
        let popup =
          lazy.ViewPopup.for(this.extension, window) ||
          this.getPopup(window, popupURL);
        popup.viewNode.openPopup(button, "bottomleft topleft", 0, 0);
      } else {
        if (!this.lastClickInfo) {
          this.lastClickInfo = { button: 0, modifiers: [] };
        }
        this.emit("click", window, this.lastClickInfo);
      }
    }
    delete this.lastClickInfo;
  }

  /**
   * Event listener.
   *
   * @param {Event} event
   */
  handleEvent(event) {
    let window = event.target.ownerGlobal;

    switch (event.type) {
      case "mousedown":
        if (event.button == 0) {
          this.lastClickInfo = {
            button: 0,
            modifiers: this.global.clickModifiersFromEvent(event),
          };
          this.triggerAction(window);
        }
        break;
      case "TabSelect":
        this.updateWindow(window);
        break;
    }
  }

  /**
   * Returns a potentially pre-loaded popup for the given URL in the given
   * window. If a matching pre-load popup already exists, returns that.
   * Otherwise, initializes a new one.
   *
   * If a pre-load popup exists which does not match, it is destroyed before a
   * new one is created.
   *
   * @param {Window} window
   *        The browser window in which to create the popup.
   * @param {string} popupURL
   *        The URL to load into the popup.
   * @param {boolean} [blockParser = false]
   *        True if the HTML parser should initially be blocked.
   * @returns {ViewPopup}
   */
  getPopup(window, popupURL, blockParser = false) {
    let popup = new lazy.ViewPopup(
      this.extension,
      window,
      popupURL,
      this.browserStyle,
      false,
      blockParser
    );
    popup.ignoreResizes = false;
    return popup;
  }

  /**
   * Update the toolbar button |node| with the tab context data
   * in |tabData|.
   *
   * @param {XULElement} node
   *        XUL toolbarbutton to update
   * @param {object} tabData
   *        Properties to set
   * @param {boolean} sync
   *        Whether to perform the update immediately
   */
  updateButton(node, tabData, sync = false) {
    let title = tabData.title || this.extension.name;
    let label = tabData.label;
    let callback = () => {
      node.setAttribute("tooltiptext", title);
      node.setAttribute("label", label || title);
      node.setAttribute(
        "hideWebExtensionLabel",
        label === "" ? "true" : "false"
      );

      if (tabData.badgeText) {
        node.setAttribute("badge", tabData.badgeText);
      } else {
        node.removeAttribute("badge");
      }

      if (tabData.enabled) {
        node.removeAttribute("disabled");
      } else {
        node.setAttribute("disabled", "true");
      }

      let color = tabData.badgeBackgroundColor;
      if (color) {
        color = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] /
          255})`;
        node.setAttribute("badgeStyle", `background-color: ${color};`);
      } else {
        node.removeAttribute("badgeStyle");
      }

      let { style, legacy } = this.iconData.get(tabData.icon);
      const LEGACY_CLASS = "toolbarbutton-legacy-addon";
      if (legacy) {
        node.classList.add(LEGACY_CLASS);
      } else {
        node.classList.remove(LEGACY_CLASS);
      }

      for (let [name, value] of style) {
        node.style.setProperty(name, value);
      }
    };
    if (sync) {
      callback();
    } else {
      node.ownerGlobal.requestAnimationFrame(callback);
    }
  }

  /**
   * Update the toolbar button for a given window.
   *
   * @param {ChromeWindow} window
   *        Browser chrome window.
   */
  async updateWindow(window) {
    let button = window.document.getElementById(this.id);
    if (button) {
      this.updateButton(
        button,
        this.getContextData(this.getTargetFromWindow(window))
      );
    }
    await new Promise(window.requestAnimationFrame);
  }

  /**
   * Update the toolbar button when the extension changes the icon, title, url, etc.
   * If it only changes a parameter for a single tab, `target` will be that tab.
   * If it only changes a parameter for a single window, `target` will be that window.
   * Otherwise `target` will be null.
   *
   * @param {XULElement|ChromeWindow|null} target
   *        Browser tab or browser chrome window, may be null.
   */
  async updateOnChange(target) {
    if (target) {
      let window = Cu.getGlobalForObject(target);
      if (target === window) {
        await this.updateWindow(window);
      } else {
        let tabmail = window.document.getElementById("tabmail");
        if (tabmail && target == tabmail.selectedTab) {
          await this.updateWindow(window);
        }
      }
    } else {
      let promises = [];
      for (let window of lazy.ExtensionSupport.openWindows) {
        if (this.windowURLs.includes(window.location.href)) {
          promises.push(this.updateWindow(window));
        }
      }
      await Promise.all(promises);
    }
  }

  /**
   * Gets the active tab of the passed window if the window has tabs, or the
   * window itself.
   *
   * @param {ChromeWindow} window
   * @returns {XULElement|ChromeWindow}
   */
  getTargetFromWindow(window) {
    let tabmail = window.top.document.getElementById("tabmail");
    if (!tabmail) {
      return window.top;
    }

    if (window == window.top) {
      return tabmail.currentTabInfo;
    }
    if (window.parent != window.top) {
      window = window.parent;
    }
    return tabmail.tabInfo.find(t => t.chromeBrowser?.contentWindow == window);
  }

  /**
   * Gets the target object corresponding to the `details` parameter of the various
   * get* and set* API methods.
   *
   * @param {object} details
   *        An object with optional `tabId` or `windowId` properties.
   * @throws if `windowId` is specified, this is not valid in Thunderbird.
   * @returns {XULElement|ChromeWindow|null}
   *        If a `tabId` was specified, the corresponding XULElement tab.
   *        If a `windowId` was specified, the corresponding ChromeWindow.
   *        Otherwise, `null`.
   */
  getTargetFromDetails({ tabId, windowId }) {
    if (windowId != null) {
      throw new ExtensionError("windowId is not allowed, use tabId instead.");
    }
    if (tabId != null) {
      return this.global.tabTracker.getTab(tabId);
    }
    return null;
  }

  /**
   * Gets the data associated with a tab, window, or the global one.
   *
   * @param {XULElement|ChromeWindow|null} target
   *        A XULElement tab, a ChromeWindow, or null for the global data.
   * @returns {object}
   *        The icon, title, badge, etc. associated with the target.
   */
  getContextData(target) {
    if (target) {
      return this.tabContext.get(target);
    }
    return this.globals;
  }

  /**
   * Set a global, window specific or tab specific property.
   *
   * @param {object} details
   *        An object with optional `tabId` or `windowId` properties.
   * @param {string} prop
   *        String property to set. Should should be one of "icon", "title", "label",
   *        "badgeText", "popup", "badgeBackgroundColor" or "enabled".
   * @param {string} value
   *        Value for prop.
   */
  async setProperty(details, prop, value) {
    let target = this.getTargetFromDetails(details);
    let values = this.getContextData(target);
    if (value === null) {
      delete values[prop];
    } else {
      values[prop] = value;
    }

    await this.updateOnChange(target);
  }

  /**
   * Retrieve the value of a global, window specific or tab specific property.
   *
   * @param {object} details
   *        An object with optional `tabId` or `windowId` properties.
   * @param {string} prop
   *        String property to retrieve. Should should be one of "icon", "title", "label",
   *        "badgeText", "popup", "badgeBackgroundColor" or "enabled".
   * @returns {string} value
   *          Value of prop.
   */
  getProperty(details, prop) {
    return this.getContextData(this.getTargetFromDetails(details))[prop];
  }

  PERSISTENT_EVENTS = {
    onClicked({ context, fire }) {
      const { extension } = this;
      const { tabManager, windowManager } = extension;

      async function listener(_event, window, clickInfo) {
        if (fire.wakeup) {
          await fire.wakeup();
        }

        // TODO: We should double-check if the tab is already being closed by the time
        // the background script got started and we converted the primed listener.

        let win = windowManager.wrapWindow(window);
        fire.sync(tabManager.convert(win.activeTab.nativeTab), clickInfo);
      }
      this.on("click", listener);
      return {
        unregister: () => {
          this.off("click", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  /**
   * WebExtension API.
   *
   * @param {object} context
   */
  getAPI(context) {
    let { extension } = context;

    let action = this;

    return {
      [this.manifestName]: {
        onClicked: new EventManager({
          context,
          // browserAction was renamed to action in MV3, but its module name is
          // still "browserAction" because that is the name used in ext-mail.json,
          // independently from the manifest version.
          module:
            this.manifestName == "action" ? "browserAction" : this.manifestName,
          event: "onClicked",
          inputHandling: true,
          extensionApi: this,
        }).api(),

        async enable(tabId) {
          await action.setProperty({ tabId }, "enabled", true);
        },

        async disable(tabId) {
          await action.setProperty({ tabId }, "enabled", false);
        },

        isEnabled(details) {
          return action.getProperty(details, "enabled");
        },

        async setTitle(details) {
          await action.setProperty(details, "title", details.title);
        },

        getTitle(details) {
          return action.getProperty(details, "title");
        },

        async setLabel(details) {
          await action.setProperty(details, "label", details.label);
        },

        getLabel(details) {
          return action.getProperty(details, "label");
        },

        async setIcon(details) {
          details.iconType = this.manifestName;

          let icon = IconDetails.normalize(details, extension, context);
          if (!Object.keys(icon).length) {
            icon = null;
          }
          await action.setProperty(details, "icon", icon);
        },

        async setBadgeText(details) {
          await action.setProperty(details, "badgeText", details.text);
        },

        getBadgeText(details) {
          return action.getProperty(details, "badgeText");
        },

        async setPopup(details) {
          // Note: Chrome resolves arguments to setIcon relative to the calling
          // context, but resolves arguments to setPopup relative to the extension
          // root.
          // For internal consistency, we currently resolve both relative to the
          // calling context.
          let url = details.popup && context.uri.resolve(details.popup);
          if (url && !context.checkLoadURL(url)) {
            return Promise.reject({ message: `Access denied for URL ${url}` });
          }
          await action.setProperty(details, "popup", url);
          return Promise.resolve(null);
        },

        getPopup(details) {
          return action.getProperty(details, "popup");
        },

        async setBadgeBackgroundColor(details) {
          let color = details.color;
          if (typeof color == "string") {
            let col = InspectorUtils.colorToRGBA(color);
            if (!col) {
              throw new ExtensionError(
                `Invalid badge background color: "${color}"`
              );
            }
            color = col && [col.r, col.g, col.b, Math.round(col.a * 255)];
          }
          await action.setProperty(details, "badgeBackgroundColor", color);
        },

        getBadgeBackgroundColor(details, callback) {
          let color = action.getProperty(details, "badgeBackgroundColor");
          return color || [0xd9, 0, 0, 255];
        },

        openPopup() {
          let window = Services.wm.getMostRecentWindow("");
          if (action.windowURLs.includes(window.location.href)) {
            action.triggerAction(window);
          }
        },
      },
    };
  }
};
