"use strict";

module.exports = {
  "globals": {
    // From toolkit/components/extensions/parent/.eslintrc.js.
    "CONTAINER_STORE": true,
    "DEFAULT_STORE": true,
    "EventEmitter": true,
    "EventManager": true,
    "InputEventManager": true,
    "PRIVATE_STORE": true,
    "TabBase": true,
    "TabManagerBase": true,
    "TabTrackerBase": true,
    "WindowBase": true,
    "WindowManagerBase": true,
    "WindowTrackerBase": true,
    "getContainerForCookieStoreId": true,
    "getCookieStoreIdForContainer": true,
    "getCookieStoreIdForTab": true,
    "isContainerCookieStoreId": true,
    "isDefaultCookieStoreId": true,
    "isPrivateCookieStoreId": true,
    "isValidCookieStoreId": true,

    // These are defined in ext-mail.js.
    "ExtensionError": true,
    "Tab": true,
    "Window": true,
    "WindowEventManager": true,
    "getTabBrowser": true,
    "makeWidgetId": true,
    "tabGetSender": true,
    "tabTracker": true,
    "windowTracker": true,
  },
};
