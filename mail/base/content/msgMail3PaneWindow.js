/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from ../../components/customizableui/content/panelUI.js */
/* import-globals-from ../../components/newmailaccount/content/provisionerCheckout.js */
/* import-globals-from ../../components/addrbook/content/addressBookTab.js */
/* import-globals-from ../../components/preferences/preferencesTab.js */
/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from folderPane.js */
/* import-globals-from glodaFacetTab.js */
/* import-globals-from mailCore.js */
/* import-globals-from mailTabs.js */
/* import-globals-from mailWindow.js */
/* import-globals-from messenger-customization.js */
/* import-globals-from quickFilterBar.js */
/* import-globals-from searchBar.js */
/* import-globals-from searchBar.js */
/* import-globals-from specialTabs.js */
/* import-globals-from toolbarIconColor.js */
/* import-globals-from spacesToolbar.js */

/* globals loadCalendarComponent */

ChromeUtils.import("resource:///modules/activity/activityModules.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BondOpenPGP: "chrome://openpgp/content/BondOpenPGP.jsm",
  Color: "resource://gre/modules/Color.jsm",
  CustomizableUI: "resource:///modules/CustomizableUI.jsm",
  JSTreeSelection: "resource:///modules/JsTreeSelection.jsm",
  LightweightThemeManager: "resource://gre/modules/LightweightThemeManager.jsm",
  MailConsts: "resource:///modules/MailConsts.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  msgDBCacheManager: "resource:///modules/MsgDBCacheManager.jsm",
  PeriodicFilterManager: "resource:///modules/PeriodicFilterManager.jsm",
  SessionStoreManager: "resource:///modules/SessionStoreManager.jsm",
  ShortcutUtils: "resource://gre/modules/ShortcutUtils.jsm",
  SummaryFrameManager: "resource:///modules/SummaryFrameManager.jsm",
  TagUtils: "resource:///modules/TagUtils.jsm",
});

// A stub for tests to avoid test failures caused by the harness expecting
// this to exist.
var NewTabPagePreloading = {
  removePreloadedBrowser() {},
};

XPCOMUtils.defineLazyGetter(this, "PopupNotifications", function() {
  let { PopupNotifications } = ChromeUtils.import(
    "resource:///modules/GlobalPopupNotifications.jsm"
  );
  try {
    // Hide all notifications while the URL is being edited and the address bar
    // has focus, including the virtual focus in the results popup.
    // We also have to hide notifications explicitly when the window is
    // minimized because of the effects of the "noautohide" attribute on Linux.
    // This can be removed once bug 545265 and bug 1320361 are fixed.
    let shouldSuppress = () => window.windowState == window.STATE_MINIMIZED;
    return new PopupNotifications(
      document.getElementById("tabmail"),
      document.getElementById("notification-popup"),
      document.getElementById("notification-popup-box"),
      { shouldSuppress }
    );
  } catch (ex) {
    Cu.reportError(ex);
    return null;
  }
});

// Copied from M-C's TelemetryEnvironment.jsm
ChromeUtils.defineModuleGetter(
  this,
  "ctypes",
  "resource://gre/modules/ctypes.jsm"
);
/**
 * Gets the service pack and build information on Windows platforms. The initial version
 * was copied from nsUpdateService.js.
 *
 * @return An object containing the service pack major and minor versions, along with the
 *         build number.
 */
function getWindowsVersionInfo() {
  const UNKNOWN_VERSION_INFO = {
    servicePackMajor: null,
    servicePackMinor: null,
    buildNumber: null,
  };

  if (AppConstants.platform !== "win") {
    return UNKNOWN_VERSION_INFO;
  }

  const BYTE = ctypes.uint8_t;
  const WORD = ctypes.uint16_t;
  const DWORD = ctypes.uint32_t;
  const WCHAR = ctypes.char16_t;
  const BOOL = ctypes.int;

  // This structure is described at:
  // http://msdn.microsoft.com/en-us/library/ms724833%28v=vs.85%29.aspx
  const SZCSDVERSIONLENGTH = 128;
  const OSVERSIONINFOEXW = new ctypes.StructType("OSVERSIONINFOEXW", [
    { dwOSVersionInfoSize: DWORD },
    { dwMajorVersion: DWORD },
    { dwMinorVersion: DWORD },
    { dwBuildNumber: DWORD },
    { dwPlatformId: DWORD },
    { szCSDVersion: ctypes.ArrayType(WCHAR, SZCSDVERSIONLENGTH) },
    { wServicePackMajor: WORD },
    { wServicePackMinor: WORD },
    { wSuiteMask: WORD },
    { wProductType: BYTE },
    { wReserved: BYTE },
  ]);

  let kernel32 = ctypes.open("kernel32");
  try {
    let GetVersionEx = kernel32.declare(
      "GetVersionExW",
      ctypes.winapi_abi,
      BOOL,
      OSVERSIONINFOEXW.ptr
    );
    let winVer = OSVERSIONINFOEXW();
    winVer.dwOSVersionInfoSize = OSVERSIONINFOEXW.size;

    if (0 === GetVersionEx(winVer.address())) {
      throw new Error("Failure in GetVersionEx (returned 0)");
    }

    return {
      servicePackMajor: winVer.wServicePackMajor,
      servicePackMinor: winVer.wServicePackMinor,
      buildNumber: winVer.dwBuildNumber,
    };
  } catch (e) {
    return UNKNOWN_VERSION_INFO;
  } finally {
    kernel32.close();
  }
}

/* This is where functions related to the 3 pane window are kept */

// from MailNewsTypes.h
var nsMsgKey_None = 0xffffffff;
var nsMsgViewIndex_None = 0xffffffff;
var kMailCheckOncePrefName = "mail.startup.enabledMailCheckOnce";

var kStandardPaneConfig = 0;
var kWidePaneConfig = 1;
var kVerticalPaneConfig = 2;

var kNumFolderViews = 4; // total number of folder views

/** widget with id=messagepanebox, initialized by GetMessagePane() */
var gMessagePane;

/** widget with id=messagepaneboxwrapper, initialized by GetMessagePaneWrapper() */
var gMessagePaneWrapper;

var gThreadAndMessagePaneSplitter = null;
/**
 * Tracks whether the right mouse button changed the selection or not.  If the
 * user right clicks on the selection, it stays the same.  If they click outside
 * of it, we alter the selection (but not the current index) to be the row they
 * clicked on.
 *
 * The value of this variable is an object with "view" and "selection" keys
 * and values.  The view value is the view whose selection we saved off, and
 * the selection value is the selection object we saved off.
 */
var gRightMouseButtonSavedSelection = null;
var gNewAccountToLoad = null;

var gDisplayStartupPage = false;

// The object in charge of managing the mail summary pane
var gSummaryFrameManager;

// the folderListener object
var folderListener = {
  onFolderAdded(parentFolder, child) {},
  onMessageAdded(parentFolder, msg) {},
  onFolderRemoved(parentFolder, child) {},
  onMessageRemoved(parentFolder, msg) {},

  onFolderPropertyChanged(item, property, oldValue, newValue) {},

  onFolderIntPropertyChanged(item, property, oldValue, newValue) {
    if (item == gFolderDisplay.displayedFolder) {
      if (property == "TotalMessages" || property == "TotalUnreadMessages") {
        UpdateStatusMessageCounts(gFolderDisplay.displayedFolder);
      }
    }
  },

  onFolderBoolPropertyChanged(item, property, oldValue, newValue) {},

  onFolderUnicharPropertyChanged(item, property, oldValue, newValue) {},
  onFolderPropertyFlagChanged(item, property, oldFlag, newFlag) {},

  onFolderEvent(folder, event) {
    if (event == "ImapHdrDownloaded") {
      if (folder) {
        var imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
        if (imapFolder) {
          var hdrParser = imapFolder.hdrParser;
          if (hdrParser) {
            var msgHdr = hdrParser.GetNewMsgHdr();
            if (msgHdr) {
              var hdrs = hdrParser.headers;
              if (hdrs && hdrs.includes("X-attachment-size:")) {
                msgHdr.OrFlags(Ci.nsMsgMessageFlags.Attachment);
              }
              if (hdrs && hdrs.includes("X-image-size:")) {
                msgHdr.setStringProperty("imageSize", "1");
              }
            }
          }
        }
      }
    }
  },
};

function ServerContainsFolder(server, folder) {
  if (!folder || !server) {
    return false;
  }

  return server.equals(folder.server);
}

/**
 * Called on startup if there are no accounts.
 */
function verifyOpenAccountHubTab() {
  let suppressDialogs = Services.prefs.getBoolPref(
    "mail.provider.suppress_dialog_on_startup",
    false
  );

  if (suppressDialogs) {
    // Looks like we were in the middle of filling out an account form. We
    // won't display the dialogs in that case.
    Services.prefs.clearUserPref("mail.provider.suppress_dialog_on_startup");
    loadPostAccountWizard();
    return;
  }

  // Collapse the Folder Pane since no account is currently present.
  document.getElementById("folderPaneBox").collapsed = true;
  document.getElementById("folderpane_splitter").collapsed = true;

  openAccountSetupTab();
}

function initOpenPGPIfEnabled() {
  BondOpenPGP.init();

  try {
    Enigmail.msg.messengerStartup.bind(Enigmail.msg);
    Enigmail.msg.messengerStartup();
    Enigmail.hdrView.hdrViewLoad.bind(Enigmail.hdrView);
    Enigmail.hdrView.hdrViewLoad();
  } catch (ex) {
    console.log(ex);
  }
}

var gMailInit = {
  onBeforeInitialXULLayout() {
    // Set a sane starting width/height for all resolutions on new profiles.
    // Do this before the window loads.
    if (!document.documentElement.hasAttribute("width")) {
      // Prefer 1024xfull height.
      let defaultHeight = screen.availHeight;
      let defaultWidth = screen.availWidth <= 1024 ? screen.availWidth : 1024;

      // On small screens, default to maximized state.
      if (defaultHeight <= 600) {
        document.documentElement.setAttribute("sizemode", "maximized");
      }

      document.documentElement.setAttribute("width", defaultWidth);
      document.documentElement.setAttribute("height", defaultHeight);
      // Make sure we're safe at the left/top edge of screen
      document.documentElement.setAttribute("screenX", screen.availLeft);
      document.documentElement.setAttribute("screenY", screen.availTop);
    }

    // Run menubar initialization first, to avoid TabsInTitlebar code picking
    // up mutations from it and causing a reflow.
    AutoHideMenubar.init();
    TabsInTitlebar.init();

    if (AppConstants.platform == "win") {
      // On Win8 set an attribute when the window frame color is too dark for black text.
      if (
        window.matchMedia("(-moz-platform: windows-win8)").matches &&
        window.matchMedia("(-moz-windows-default-theme)").matches
      ) {
        let { Windows8WindowFrameColor } = ChromeUtils.import(
          "resource:///modules/Windows8WindowFrameColor.jsm"
        );
        let windowFrameColor = new Color(...Windows8WindowFrameColor.get());
        // Default to black for foreground text.
        if (!windowFrameColor.isContrastRatioAcceptable(new Color(0, 0, 0))) {
          document.documentElement.setAttribute("darkwindowframe", "true");
        }
      } else if (AppConstants.isPlatformAndVersionAtLeast("win", "10")) {
        // 17763 is the build number of Windows 10 version 1809
        if (getWindowsVersionInfo().buildNumber < 17763) {
          document.documentElement.setAttribute(
            "always-use-accent-color-for-window-border",
            ""
          );
        }
      }
    }

    // Call this after we set attributes that might change toolbars' computed
    // text color.
    ToolbarIconColor.init();
  },

  /**
   * Called on startup to initialize various parts of the main window.
   * Most of this should be moved out into _delayedStartup or only
   * initialized when needed.
   */
  onLoad() {
    TagUtils.loadTagsIntoCSS(document);

    CreateMailWindowGlobals();
    GetMessagePaneWrapper().collapsed = true;

    if (!Services.policies.isAllowed("devtools")) {
      let devtoolsMenu = document.getElementById("devtoolsMenu");
      if (devtoolsMenu) {
        devtoolsMenu.hidden = true;
      }
    }

    // - initialize tabmail system
    // Do this before loadPostAccountWizard since that code selects the first
    //  folder for display, and we want gFolderDisplay setup and ready to handle
    //  that event chain.
    // Also, we definitely need to register the tab type prior to the call to
    //  specialTabs.openSpecialTabsOnStartup below.
    let tabmail = document.getElementById("tabmail");
    if (tabmail) {
      // mailTabType is defined in mailTabs.js
      tabmail.registerTabType(newMailTabType);
      // glodaFacetTab* in glodaFacetTab.js
      tabmail.registerTabType(glodaFacetTabType);
      QuickFilterBarMuxer._init();
      tabmail.registerTabMonitor(GlodaSearchBoxTabMonitor);
      tabmail.registerTabMonitor(statusMessageCountsMonitor);
      tabmail.openFirstTab();
    }

    // This also registers the contentTabType ("contentTab")
    specialTabs.openSpecialTabsOnStartup();
    tabmail.registerTabType(addressBookTabType);
    tabmail.registerTabType(preferencesTabType);
    // provisionerCheckoutTabType is defined in provisionerCheckout.js
    tabmail.registerTabType(provisionerCheckoutTabType);

    // Set up the summary frame manager to handle loading pages in the
    // multi-message pane
    gSummaryFrameManager = new SummaryFrameManager(
      document.getElementById("multimessage")
    );

    // Depending on the pref, hide/show the gloda toolbar search widgets.
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "gGlodaEnabled",
      "mailnews.database.global.indexer.enabled",
      true,
      (pref, oldVal, newVal) => {
        for (let widget of document.querySelectorAll(".gloda-search-widget")) {
          widget.hidden = !newVal;
        }
      }
    );
    for (let widget of document.querySelectorAll(".gloda-search-widget")) {
      widget.hidden = !this.gGlodaEnabled;
    }

    window.addEventListener("AppCommand", HandleAppCommandEvent, true);

    this._boundDelayedStartup = this._delayedStartup.bind(this);
    window.addEventListener("MozAfterPaint", this._boundDelayedStartup);

    // Listen for the messages sent to the main 3 pane window.
    window.addEventListener("message", this._onMessageReceived);
  },

  _cancelDelayedStartup() {
    window.removeEventListener("MozAfterPaint", this._boundDelayedStartup);
    this._boundDelayedStartup = null;
  },

  /**
   * Handle the messages sent via postMessage() method to the main 3 pane
   * window.
   *
   * @param {Event} event - The message event.
   */
  _onMessageReceived(event) {
    switch (event.data) {
      case "account-created":
      case "account-created-in-backend":
      case "account-created-from-provisioner":
        // Set the pref to false in case it was previously changed.
        Services.prefs.setBoolPref("app.use_without_mail_account", false);
        loadPostAccountWizard();

        // Always update the mail UI to guarantee all the panes are visible even
        // if the mail tab is not the currently active tab.
        updateMailPaneUI();
        break;

      case "account-setup-closed":
        // The user closed the account setup after a successful run. Make sure
        // to focus on the primary mail tab.
        switchToMailTab();
        gSpacesToolbar.onLoad();
        // Trigger the integration dialog if necessary.
        showSystemIntegrationDialog();
        break;

      case "account-setup-dismissed":
        // The user closed the account setup before completing it. Be sure to
        // initialize the few important areas we need.
        gSpacesToolbar.onLoad();
        break;

      case "open-account-setup-tab":
        openAccountSetupTab();
        break;
      default:
        break;
    }
  },

  /**
   * Delayed startup happens after the first paint of the window. Anything
   * that can be delayed until after paint, should be to help give the
   * illusion that Thunderbird is starting faster.
   *
   * Note: this only runs for the main 3 pane window.
   */
  _delayedStartup() {
    this._cancelDelayedStartup();

    MailOfflineMgr.init();

    initOpenPGPIfEnabled();

    PanelUI.init();
    gExtensionsNotifications.init();

    Services.search.init();

    PeriodicFilterManager.setupFiltering();
    msgDBCacheManager.init();

    requestIdleCallback(function() {
      if (!window.closed) {
        Services.obs.notifyObservers(
          window,
          "mail-idle-startup-tasks-finished"
        );
      }
    });

    this.delayedStartupFinished = true;
    Services.obs.notifyObservers(window, "mail-delayed-startup-finished");

    // Notify observer to resolve the browserStartupPromise, which is used for the
    // delayed background startup of WebExtensions.
    Services.obs.notifyObservers(window, "extensions-late-startup");

    this._loadComponentsAtStartup();
  },

  /**
   * Load all the necessary components to make Thunderbird usable before
   * checking for existing accounts.
   */
  async _loadComponentsAtStartup() {
    updateTroubleshootMenuItem();
    // Initialize the customizeDone method on the customizeable toolbar.
    let toolbox = document.getElementById("mail-toolbox");
    toolbox.customizeDone = function(aEvent) {
      MailToolboxCustomizeDone(aEvent, "CustomizeMailToolbar");
    };

    // The calendar component needs to be loaded before restoring any tabs.
    await loadCalendarComponent();

    // Don't trigger the existing account verification if the user wants to use
    // Thunderbird without an email account.
    if (!Services.prefs.getBoolPref("app.use_without_mail_account", false)) {
      // Load the Mail UI only if we already have at least one account configured
      // otherwise the verifyExistingAccounts will trigger the account wizard.
      if (verifyExistingAccounts()) {
        switchToMailTab();
        await loadPostAccountWizard();
      }
    } else {
      // Run the tabs restore method here since we're skipping the loading of
      // the Mail UI which would have taken care of this to properly handle
      // opened folders or messages in tabs.
      await atStartupRestoreTabs(false);
      gSpacesToolbar.onLoad();
    }

    // All core modal dialogs are done, the user can now interact with the
    // 3-pane window. We need to notify this even if the user didn't setup any
    // mail account in order to trigger all the other areas of the application.
    Services.obs.notifyObservers(window, "mail-startup-done");
  },

  /**
   * Called by messenger.xhtml:onunload, the 3-pane window inside of tabs window.
   *  It's being unloaded!  Right now!
   */
  onUnload() {
    Services.obs.notifyObservers(window, "mail-unloading-messenger");

    if (gRightMouseButtonSavedSelection) {
      // Avoid possible cycle leaks.
      gRightMouseButtonSavedSelection.view = null;
      gRightMouseButtonSavedSelection = null;
    }

    SessionStoreManager.unloadingWindow(window);
    TabsInTitlebar.uninit();
    ToolbarIconColor.uninit();

    document.getElementById("tabmail")._teardown();
    MailServices.mailSession.RemoveFolderListener(folderListener);

    // FIX ME - later we will be able to use onload from the overlay
    OnUnloadMsgHeaderPane();

    UnloadPanes();
    OnMailWindowUnload();
  },
};

/**
 * Called at startup to verify if we have ny existing account, even if invalid,
 * and if not, it will trigger the Account Hub in a tab.
 *
 * @returns {boolean} - True if we have at least one existing account.
 */
function verifyExistingAccounts() {
  try {
    // Migrate quoting preferences from global to per account. This function
    // returns true if it had to migrate, which we will use to mean this is a
    // just migrated or new profile.
    let newProfile = migrateGlobalQuotingPrefs(
      MailServices.accounts.allIdentities
    );

    // If there are no accounts, or all accounts are "invalid" then kick off the
    // account migration. Or if this is a new (to Mozilla) profile. MCD can set
    // up accounts without the profile being used yet.
    if (newProfile) {
      // Check if MCD is configured. If not, say this is not a new profile so
      // that we don't accidentally remigrate non MCD profiles.
      var adminUrl = Services.prefs.getCharPref(
        "autoadmin.global_config_url",
        ""
      );
      if (!adminUrl) {
        newProfile = false;
      }
    }

    let accounts = MailServices.accounts.accounts;
    let invalidAccounts = getInvalidAccounts(accounts);
    // Trigger the new account configuration wizard only if we don't have any
    // existing account, not even if we have at least one invalid account.
    if (
      (newProfile && !accounts.length) ||
      accounts.length == invalidAccounts.length ||
      (invalidAccounts.length > 0 &&
        invalidAccounts.length == accounts.length &&
        invalidAccounts[0])
    ) {
      verifyOpenAccountHubTab();
      return false;
    }

    let localFoldersExists;
    try {
      localFoldersExists = MailServices.accounts.localFoldersServer;
    } catch (ex) {
      localFoldersExists = false;
    }

    // We didn't trigger the account configuration wizard, so we need to verify
    // that local folders exists.
    if (!localFoldersExists && requireLocalFoldersAccount()) {
      MailServices.accounts.createLocalMailAccount();
    }

    return true;
  } catch (ex) {
    dump(`Error verifying accounts: ${ex}`);
    return false;
  }
}

/**
 * Switch the view to the first Mail tab if the currently selected tab is not
 * the first Mail tab.
 */
function switchToMailTab() {
  let tabmail = document.getElementById("tabmail");
  if (tabmail?.selectedTab.mode.name != "folder") {
    tabmail.switchToTab(0);
  }
}

function switchToCalendarTab() {
  document.getElementById("tabmail").openTab("calendar");
}

function switchToTasksTab() {
  document.getElementById("tabmail").openTab("tasks");
}

/**
 * Trigger the initialization of the entire UI. Called after the okCallback of
 * the emailWizard during a first run, or directly from the accountProvisioner
 * in case a user configures a new email account on first run.
 */
async function loadPostAccountWizard() {
  InitMsgWindow();
  messenger.setWindow(window, msgWindow);

  MigrateJunkMailSettings();
  MigrateFolderViews();
  MigrateOpenMessageBehavior();

  accountManager.setSpecialFolders();

  try {
    accountManager.loadVirtualFolders();
  } catch (e) {
    Cu.reportError(e);
  }

  // Load the message header pane.
  OnLoadMsgHeaderPane();

  // Set focus to the Thread Pane the first time the window is opened.
  SetFocusThreadPane();

  // Restore the previous folder selection before shutdown, or select the first
  // inbox folder of a newly created account.
  selectFirstFolder();

  gSpacesToolbar.onLoad();
}

/**
 * Check if we need to show the system integration dialog before notifying the
 * application that the startup process is completed.
 */
function showSystemIntegrationDialog() {
  // Check the shell service.
  let shellService;
  try {
    shellService = Cc["@mozilla.org/mail/shell-service;1"].getService(
      Ci.nsIShellService
    );
  } catch (ex) {}
  let defaultAccount = accountManager.defaultAccount;

  // Load the search integration module.
  let { SearchIntegration } = ChromeUtils.import(
    "resource:///modules/SearchIntegration.jsm"
  );

  // Show the default client dialog only if
  // EITHER: we have at least one account, and we aren't already the default
  // for mail,
  // OR: we have the search integration module, the OS version is suitable,
  // and the first run hasn't already been completed.
  // Needs to be shown outside the he normal load sequence so it doesn't appear
  // before any other displays, in the wrong place of the screen.
  if (
    (shellService &&
      defaultAccount &&
      shellService.shouldCheckDefaultClient &&
      !shellService.isDefaultClient(true, Ci.nsIShellService.MAIL)) ||
    (SearchIntegration &&
      !SearchIntegration.osVersionTooLow &&
      !SearchIntegration.osComponentsNotRunning &&
      !SearchIntegration.firstRunDone)
  ) {
    window.openDialog(
      "chrome://messenger/content/systemIntegrationDialog.xhtml",
      "SystemIntegration",
      "modal,centerscreen,chrome,resizable=no"
    );
    // On Windows, there seems to be a delay between setting TB as the
    // default client, and the isDefaultClient check succeeding.
    if (shellService.isDefaultClient(true, Ci.nsIShellService.MAIL)) {
      Services.obs.notifyObservers(window, "mail:setAsDefault");
    }
  }
}

/**
 * Properly select the starting folder or message header if we have one.
 */
function selectFirstFolder() {
  let startFolderURI = null;
  let startMsgHdr = null;

  if ("arguments" in window && window.arguments.length > 0) {
    let arg0 = window.arguments[0];
    // If the argument is a string, it is either a folder URI or a feed URI.
    if (typeof arg0 == "string") {
      // Filter out any feed urls that came in as arguments to the new window.
      if (arg0.toLowerCase().startsWith("feed:")) {
        let feedHandler = Cc[
          "@mozilla.org/newsblog-feed-downloader;1"
        ].getService(Ci.nsINewsBlogFeedDownloader);
        if (feedHandler) {
          feedHandler.subscribeToFeed(arg0, null, msgWindow);
        }
      } else {
        startFolderURI = arg0;
      }
    } else if (arg0) {
      // arg0 is an object
      if ("wrappedJSObject" in arg0 && arg0.wrappedJSObject) {
        arg0 = arg0.wrappedJSObject;
      }
      startMsgHdr = "msgHdr" in arg0 ? arg0.msgHdr : null;
    }
  }

  // Don't try to be smart with this because we need the loadStartFolder()
  // method to run even if startFolderURI is null otherwise our UI won't
  // properly restore.
  if (startMsgHdr) {
    Services.tm.dispatchToMainThread(() => loadStartMsgHdr(startMsgHdr));
  } else {
    Services.tm.dispatchToMainThread(() => loadStartFolder(startFolderURI));
  }
}

function HandleAppCommandEvent(evt) {
  evt.stopPropagation();
  switch (evt.command) {
    case "Back":
      goDoCommand("cmd_goBack");
      break;
    case "Forward":
      goDoCommand("cmd_goForward");
      break;
    case "Stop":
      msgWindow.StopUrls();
      break;
    case "Search":
      goDoCommand("cmd_search");
      break;
    case "Bookmarks":
      toAddressBook();
      break;
    case "Home":
    case "Reload":
    default:
      break;
  }
}

/**
 * Look for another 3-pane window.
 */
function FindOther3PaneWindow() {
  for (let win of Services.wm.getEnumerator("mail:3pane")) {
    if (win != window) {
      return win;
    }
  }
  return null;
}

/**
 * Called by the session store manager periodically and at shutdown to get
 * the state of this window for persistence.
 */
function getWindowStateForSessionPersistence() {
  let tabmail = document.getElementById("tabmail");
  let tabsState = tabmail.persistTabs();
  return { type: "3pane", tabs: tabsState };
}

/**
 * Attempt to restore the previous tab states.
 *
 * @param {boolean} aDontRestoreFirstTab - If this is true, the first tab will
 *   not be restored, and will continue to retain focus at the end. This is
 *   needed if the window was opened with a folder or a message as an argument.
 * @return true if the restoration was successful, false otherwise.
 */
async function atStartupRestoreTabs(aDontRestoreFirstTab) {
  let state = await SessionStoreManager.loadingWindow(window);
  if (state) {
    let tabsState = state.tabs;
    let tabmail = document.getElementById("tabmail");
    try {
      tabmail.restoreTabs(tabsState, aDontRestoreFirstTab);
    } catch (e) {
      Cu.reportError(e);
    }
  }

  // it's now safe to load extra Tabs.
  Services.tm.dispatchToMainThread(loadExtraTabs);
  SessionStoreManager._restored = true;
  Services.obs.notifyObservers(window, "mail-tabs-session-restored");

  return !!state;
}

/**
 * Loads and restores tabs upon opening a window by evaluating window.arguments[1].
 *
 * The type of the object is specified by it's action property. It can be
 * either "restore" or "open". "restore" invokes tabmail.restoreTab() for each
 * item in the tabs array. While "open" invokes tabmail.openTab() for each item.
 *
 * In case a tab can't be restored it will fail silently
 *
 * the object need at least the following properties:
 *
 * {
 *   action = "restore" | "open"
 *   tabs = [];
 * }
 *
 */
function loadExtraTabs() {
  if (!("arguments" in window) || window.arguments.length < 2) {
    return;
  }

  let tab = window.arguments[1];
  if (!tab || typeof tab != "object") {
    return;
  }

  if ("wrappedJSObject" in tab) {
    tab = tab.wrappedJSObject;
  }

  let tabmail = document.getElementById("tabmail");

  // we got no action, so suppose its "legacy" code
  if (!("action" in tab)) {
    if ("tabType" in tab) {
      tabmail.openTab(tab.tabType, tab.tabParams);
    }
    return;
  }

  if (!("tabs" in tab)) {
    return;
  }

  // this is used if a tab is detached to a new window.
  if (tab.action == "restore") {
    for (let i = 0; i < tab.tabs.length; i++) {
      tabmail.restoreTab(tab.tabs[i]);
    }

    // we currently do not support opening in background or opening a
    // special position. So select the last tab opened.
    tabmail.switchToTab(tabmail.tabInfo[tabmail.tabInfo.length - 1]);
    return;
  }

  if (tab.action == "open") {
    for (let i = 0; i < tab.tabs.length; i++) {
      if ("tabType" in tab.tabs[i]) {
        tabmail.openTab(tab.tabs[i].tabType, tab.tabs[i].tabParams);
      }
    }
  }
}

/**
 * Loads the given message header at window open. Exactly one out of this and
 * |loadStartFolder| should be called.
 *
 * @param aStartMsgHdr The message header to load at window open
 */
async function loadStartMsgHdr(aStartMsgHdr) {
  // We'll just clobber the default tab
  await atStartupRestoreTabs(true);

  MsgDisplayMessageInFolderTab(aStartMsgHdr);
}

async function loadStartFolder(initialUri) {
  var defaultServer = null;
  var startFolder;
  var isLoginAtStartUpEnabled = false;

  // If a URI was explicitly specified, we'll just clobber the default tab
  let loadFolder = !(await atStartupRestoreTabs(!!initialUri));

  if (initialUri) {
    loadFolder = true;
  }

  // First get default account
  try {
    if (initialUri) {
      startFolder = MailUtils.getOrCreateFolder(initialUri);
    } else {
      let defaultAccount = accountManager.defaultAccount;
      if (!defaultAccount) {
        return;
      }

      defaultServer = defaultAccount.incomingServer;
      var rootMsgFolder = defaultServer.rootMsgFolder;

      startFolder = rootMsgFolder;

      // Enable check new mail once by turning checkmail pref 'on' to bring
      // all users to one plane. This allows all users to go to Inbox. User can
      // always go to server settings panel and turn off "Check for new mail at startup"
      if (!Services.prefs.getBoolPref(kMailCheckOncePrefName)) {
        Services.prefs.setBoolPref(kMailCheckOncePrefName, true);
        defaultServer.loginAtStartUp = true;
      }

      // Get the user pref to see if the login at startup is enabled for default account
      isLoginAtStartUpEnabled = defaultServer.loginAtStartUp;

      // Get Inbox only if login at startup is enabled.
      if (isLoginAtStartUpEnabled) {
        // now find Inbox
        var inboxFolder = rootMsgFolder.getFolderWithFlags(
          Ci.nsMsgFolderFlags.Inbox
        );
        if (!inboxFolder) {
          return;
        }

        startFolder = inboxFolder;
      }
    }

    // it is possible we were given an initial uri and we need to subscribe or try to add
    // the folder. i.e. the user just clicked on a news folder they aren't subscribed to from a browser
    // the news url comes in here.

    // Perform biff on the server to check for new mail, except for imap
    // or a pop3 account that is deferred or deferred to,
    // or the case where initialUri is non-null (non-startup)
    if (
      !initialUri &&
      isLoginAtStartUpEnabled &&
      !defaultServer.isDeferredTo &&
      defaultServer.rootFolder == defaultServer.rootMsgFolder
    ) {
      defaultServer.performBiff(msgWindow);
    }
    if (loadFolder) {
      try {
        // TODO: Do a better job of this.
        let tab = document.getElementById("tabmail").currentTabInfo;
        tab.chromeBrowser.addEventListener(
          "load",
          () => (tab.folder = startFolder),
          true
        );
      } catch (ex) {
        // This means we tried to select a folder that isn't in the current view.
        Cu.reportError(ex);
      }
    }
  } catch (ex) {
    // this is the case where we're trying to auto-subscribe to a folder.
    if (initialUri && !startFolder.parent) {
      // hack to force display of thread pane.
      if (IsMessagePaneCollapsed) {
        MsgToggleMessagePane();
      }
      messenger.loadURL(window, initialUri);
      return;
    }

    Cu.reportError(ex);
  }

  MsgGetMessagesForAllServers(defaultServer);

  if (MailOfflineMgr.isOnline()) {
    // Check if we shut down offline, and restarted online, in which case
    // we may have offline events to playback. Since this is not a pref
    // the user should set, it's not in mailnews.js, so we need a try catch.
    let playbackOfflineEvents = Services.prefs.getBoolPref(
      "mailnews.playback_offline",
      false
    );
    if (playbackOfflineEvents) {
      Services.prefs.setBoolPref("mailnews.playback_offline", false);
      MailOfflineMgr.offlineManager.goOnline(false, true, msgWindow);
    }

    // If appropriate, send unsent messages. This may end up prompting the user,
    // so we need to get it out of the flow of the normal load sequence.
    setTimeout(function() {
      if (MailOfflineMgr.shouldSendUnsentMessages()) {
        SendUnsentMessages();
      }
    }, 0);
  }
}

function UnloadPanes() {
  var threadTree = document.getElementById("threadTree");
  threadTree.removeEventListener("click", ThreadTreeOnClick, true);
  gSpacesToolbar.onUnload();
}

function OnLoadThreadPane() {
  // Use an observer to watch the columns element so that we get a notification
  // whenever attributes on the columns change.
  let observer = new MutationObserver(function(mutations) {
    gFolderDisplay.hintColumnsChanged();
  });
  observer.observe(document.getElementById("threadCols"), {
    attributes: true,
    subtree: true,
    attributeFilter: ["hidden", "ordinal"],
  });
}

/* Functions for accessing particular parts of the window*/
function GetMessagePane() {
  if (!gMessagePane) {
    gMessagePane = document.getElementById("messagepanebox");
  }
  return gMessagePane;
}

function GetMessagePaneWrapper() {
  if (!gMessagePaneWrapper) {
    gMessagePaneWrapper = document.getElementById("messagepaneboxwrapper");
  }
  return gMessagePaneWrapper;
}

function getMailToolbox() {
  return document.getElementById("mail-toolbox");
}

function FindInSidebar(currentWindow, id) {
  var item = currentWindow.document.getElementById(id);
  if (item) {
    return item;
  }

  for (var i = 0; i < currentWindow.frames.length; ++i) {
    var frameItem = FindInSidebar(currentWindow.frames[i], id);
    if (frameItem) {
      return frameItem;
    }
  }

  return null;
}

function GetThreadAndMessagePaneSplitter() {
  if (!gThreadAndMessagePaneSplitter) {
    gThreadAndMessagePaneSplitter = document.getElementById(
      "threadpane-splitter"
    );
  }
  return gThreadAndMessagePaneSplitter;
}

function IsMessagePaneCollapsed() {
  return (
    document.getElementById("threadpane-splitter").getAttribute("state") ==
    "collapsed"
  );
}

function ClearThreadPaneSelection() {
  gFolderDisplay.clearSelection();
}

function ClearMessagePane() {
  // hide the message header view AND the message pane...
  HideMessageHeaderPane();
  gMessageNotificationBar.clearMsgNotifications();
  ClearPendingReadTimer();

  try {
    // Tell messenger to stop loading a message, if it is doing so.
    messenger.abortPendingOpenURL();
    // This can fail because cloning imap URI's can fail if the username
    // has been cleared by docshell/base/nsDefaultURIFixup.cpp.
    let messagePane = getMessagePaneBrowser();
    // If we don't do this check, no one else does and we do a non-trivial
    // amount of work.  So do the check.
    if (messagePane.currentURI?.spec != "about:blank") {
      // Don't use MailE10SUtils.loadURI here. about:blank can load in
      // remote and non-remote browsers.
      messagePane.loadURI("about:blank", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
  } catch (ex) {
    Cu.reportError(ex); // error clearing message pane
  }
}

/**
 * When right-clicks happen, we do not want to corrupt the underlying
 * selection.  The right-click is a transient selection.  So, unless the
 * user is right-clicking on the current selection, we create a new
 * selection object (thanks to JSTreeSelection) and set that as the
 * current/transient selection.
 *
 * It is up you to call RestoreSelectionWithoutContentLoad to clean up when we
 * are done.
 *
 * @param aSingleSelect Should the selection we create be a single selection?
 *     This is relevant if the row being clicked on is already part of the
 *     selection.  If it is part of the selection and !aSingleSelect, then we
 *     leave the selection as is.  If it is part of the selection and
 *     aSingleSelect then we create a transient single-row selection.
 */
function ChangeSelectionWithoutContentLoad(event, tree, aSingleSelect) {
  var treeSelection = tree.view.selection;

  var row = tree.getRowAt(event.clientX, event.clientY);
  // Only do something if:
  // - the row is valid
  // - it's not already selected (or we want a single selection)
  if (row >= 0 && (aSingleSelect || !treeSelection.isSelected(row))) {
    // Check if the row is exactly the existing selection.  In that case
    //  there is no need to create a bogus selection.
    if (treeSelection.count == 1) {
      let minObj = {};
      treeSelection.getRangeAt(0, minObj, {});
      if (minObj.value == row) {
        event.stopPropagation();
        return;
      }
    }

    let transientSelection = new JSTreeSelection(tree);
    transientSelection.logAdjustSelectionForReplay();

    gRightMouseButtonSavedSelection = {
      // Need to clear out this reference later.
      view: tree.view,
      realSelection: treeSelection,
      transientSelection,
    };

    var saveCurrentIndex = treeSelection.currentIndex;

    // tell it to log calls to adjustSelection
    // attach it to the view
    tree.view.selection = transientSelection;
    // Don't generate any selection events! (we never set this to false, because
    //  that would generate an event, and we never need one of those from this
    //  selection object.
    transientSelection.selectEventsSuppressed = true;
    transientSelection.select(row);
    transientSelection.currentIndex = saveCurrentIndex;
    tree.ensureRowIsVisible(row);
  }
  event.stopPropagation();
}

function TreeOnMouseDown(event) {
  // Detect right mouse click and change the highlight to the row
  // where the click happened without loading the message headers in
  // the Folder or Thread Pane.
  // Same for middle click, which will open the folder/message in a tab.
  if (event.button == 2 || event.button == 1) {
    // We want a single selection if this is a middle-click (button 1)
    ChangeSelectionWithoutContentLoad(
      event,
      event.target.parentNode,
      event.button == 1
    );
  }
}

function OpenMessageInNewTab(msgHdr, tabParams = {}) {
  if (!msgHdr) {
    return;
  }

  if (tabParams.background === undefined) {
    tabParams.background = Services.prefs.getBoolPref(
      "mail.tabs.loadInBackground"
    );
    if (tabParams.event?.shiftKey) {
      tabParams.background = !tabParams.background;
    }
  }

  let tabmail = document.getElementById("tabmail");
  tabmail.openTab("mailMessageTab", {
    ...tabParams,
    messageURI: msgHdr.folder.getUriForMsg(msgHdr),
  });
}

function ThreadTreeOnClick(event) {
  var threadTree = document.getElementById("threadTree");

  // Middle click on a message opens the message in a tab
  if (
    event.button == 1 &&
    event.target.localName != "slider" &&
    event.target.localName != "scrollbarbutton"
  ) {
    OpenMessageInNewTab(gFolderDisplay.selectedMessage, { event });
    RestoreSelectionWithoutContentLoad(threadTree);
  }
}

function GetSelectedMsgFolders() {
  // TODO: Replace this.
}

function SelectFolder(folderUri) {
  // TODO: Replace this.
}

function ReloadMessage() {}

// Some of the per account junk mail settings have been
// converted to global prefs. Let's try to migrate some
// of those settings from the default account.
function MigrateJunkMailSettings() {
  var junkMailSettingsVersion = Services.prefs.getIntPref("mail.spam.version");
  if (!junkMailSettingsVersion) {
    // Get the default account, check to see if we have values for our
    // globally migrated prefs.
    let defaultAccount = accountManager.defaultAccount;
    if (defaultAccount) {
      // we only care about
      var prefix = "mail.server." + defaultAccount.incomingServer.key + ".";
      if (Services.prefs.prefHasUserValue(prefix + "manualMark")) {
        Services.prefs.setBoolPref(
          "mail.spam.manualMark",
          Services.prefs.getBoolPref(prefix + "manualMark")
        );
      }
      if (Services.prefs.prefHasUserValue(prefix + "manualMarkMode")) {
        Services.prefs.setIntPref(
          "mail.spam.manualMarkMode",
          Services.prefs.getIntPref(prefix + "manualMarkMode")
        );
      }
      if (Services.prefs.prefHasUserValue(prefix + "spamLoggingEnabled")) {
        Services.prefs.setBoolPref(
          "mail.spam.logging.enabled",
          Services.prefs.getBoolPref(prefix + "spamLoggingEnabled")
        );
      }
      if (Services.prefs.prefHasUserValue(prefix + "markAsReadOnSpam")) {
        Services.prefs.setBoolPref(
          "mail.spam.markAsReadOnSpam",
          Services.prefs.getBoolPref(prefix + "markAsReadOnSpam")
        );
      }
    }
    // bump the version so we don't bother doing this again.
    Services.prefs.setIntPref("mail.spam.version", 1);
  }
}

// The first time a user runs a build that supports folder views, pre-populate the favorite folders list
// with the existing INBOX folders.
function MigrateFolderViews() {
  var folderViewsVersion = Services.prefs.getIntPref(
    "mail.folder.views.version"
  );
  if (!folderViewsVersion) {
    for (let server of accountManager.allServers) {
      if (server) {
        let inbox = MailUtils.getInboxFolder(server);
        if (inbox) {
          inbox.setFlag(Ci.nsMsgFolderFlags.Favorite);
        }
      }
    }
    Services.prefs.setIntPref("mail.folder.views.version", 1);
  }
}

// Do a one-time migration of the old mailnews.reuse_message_window pref to the
// newer mail.openMessageBehavior. This does the migration only if the old pref
// is defined.
function MigrateOpenMessageBehavior() {
  let openMessageBehaviorVersion = Services.prefs.getIntPref(
    "mail.openMessageBehavior.version"
  );
  if (!openMessageBehaviorVersion) {
    // Don't touch this if it isn't defined
    if (
      Services.prefs.getPrefType("mailnews.reuse_message_window") ==
      Ci.nsIPrefBranch.PREF_BOOL
    ) {
      if (Services.prefs.getBoolPref("mailnews.reuse_message_window")) {
        Services.prefs.setIntPref(
          "mail.openMessageBehavior",
          MailConsts.OpenMessageBehavior.EXISTING_WINDOW
        );
      } else {
        Services.prefs.setIntPref(
          "mail.openMessageBehavior",
          MailConsts.OpenMessageBehavior.NEW_TAB
        );
      }
    }

    Services.prefs.setIntPref("mail.openMessageBehavior.version", 1);
  }
}

function ThreadPaneOnDragStart(aEvent) {
  if (aEvent.target.localName != "treechildren") {
    return;
  }

  let messageUris = gFolderDisplay.selectedMessageUris;
  if (!messageUris) {
    return;
  }

  gFolderDisplay.hintAboutToDeleteMessages();
  let messengerBundle = document.getElementById("bundle_messenger");
  let noSubjectString = messengerBundle.getString(
    "defaultSaveMessageAsFileName"
  );
  if (noSubjectString.endsWith(".eml")) {
    noSubjectString = noSubjectString.slice(0, -4);
  }
  let longSubjectTruncator = messengerBundle.getString(
    "longMsgSubjectTruncator"
  );
  // Clip the subject string to 124 chars to avoid problems on Windows,
  // see NS_MAX_FILEDESCRIPTOR in m-c/widget/windows/nsDataObj.cpp .
  const maxUncutNameLength = 124;
  let maxCutNameLength = maxUncutNameLength - longSubjectTruncator.length;
  let messages = new Map();
  for (let [index, msgUri] of messageUris.entries()) {
    let msgService = messenger.messageServiceFromURI(msgUri);
    let msgHdr = msgService.messageURIToMsgHdr(msgUri);
    let subject = msgHdr.mime2DecodedSubject || "";
    if (msgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
      subject = "Re: " + subject;
    }

    let uniqueFileName;
    // If there is no subject, use a default name.
    // If subject needs to be truncated, add a truncation character to indicate it.
    if (!subject) {
      uniqueFileName = noSubjectString;
    } else {
      uniqueFileName =
        subject.length <= maxUncutNameLength
          ? subject
          : subject.substr(0, maxCutNameLength) + longSubjectTruncator;
    }
    let msgFileName = validateFileName(uniqueFileName);
    let msgFileNameLowerCase = msgFileName.toLocaleLowerCase();

    while (true) {
      if (!messages[msgFileNameLowerCase]) {
        messages[msgFileNameLowerCase] = 1;
        break;
      } else {
        let postfix = "-" + messages[msgFileNameLowerCase];
        messages[msgFileNameLowerCase]++;
        msgFileName = msgFileName + postfix;
        msgFileNameLowerCase = msgFileNameLowerCase + postfix;
      }
    }

    msgFileName = msgFileName + ".eml";

    let msgUrl = msgService.getUrlForUri(msgUri);
    let separator = msgUrl.spec.includes("?") ? "&" : "?";

    aEvent.dataTransfer.mozSetDataAt("text/x-moz-message", msgUri, index);
    aEvent.dataTransfer.mozSetDataAt("text/x-moz-url", msgUrl.spec, index);
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise-url",
      msgUrl.spec + separator + "fileName=" + encodeURIComponent(msgFileName),
      index
    );
    aEvent.dataTransfer.mozSetDataAt(
      "application/x-moz-file-promise",
      new messageFlavorDataProvider(),
      index
    );
  }

  aEvent.dataTransfer.effectAllowed = "copyMove";
  aEvent.dataTransfer.addElement(aEvent.target);
}

function messageFlavorDataProvider() {}

messageFlavorDataProvider.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIFlavorDataProvider"]),

  getFlavorData(aTransferable, aFlavor, aData) {
    if (aFlavor !== "application/x-moz-file-promise") {
      return;
    }
    let fileUriPrimitive = {};
    aTransferable.getTransferData(
      "application/x-moz-file-promise-url",
      fileUriPrimitive
    );

    let fileUriStr = fileUriPrimitive.value.QueryInterface(
      Ci.nsISupportsString
    );
    let fileUri = Services.io.newURI(fileUriStr.data);
    let fileUrl = fileUri.QueryInterface(Ci.nsIURL);
    let fileName = fileUrl.fileName;

    let destDirPrimitive = {};
    aTransferable.getTransferData(
      "application/x-moz-file-promise-dir",
      destDirPrimitive
    );
    let destDirectory = destDirPrimitive.value.QueryInterface(Ci.nsIFile);
    let file = destDirectory.clone();
    file.append(fileName);

    let messageUriPrimitive = {};
    aTransferable.getTransferData("text/x-moz-message", messageUriPrimitive);
    let messageUri = messageUriPrimitive.value.QueryInterface(
      Ci.nsISupportsString
    );

    messenger.saveAs(
      messageUri.data,
      true,
      null,
      decodeURIComponent(file.path),
      true
    );
  },
};

/**
 * Returns a new filename that is guaranteed to not be in the Set
 * of existing names.
 *
 * Example use:
 *   suggestUniqueFileName("testname", ".txt", new Set("testname", "testname1"))
 *   returns "testname2.txt"
 * Does not check file system for existing files.
 *
 * @param aIdentifier     proposed filename
 * @param aType           extension
 * @param aExistingNames  a Set of names already in use
 */
function suggestUniqueFileName(aIdentifier, aType, aExistingNames) {
  let suffix = 1;
  let base = validateFileName(aIdentifier);
  let suggestion = base + aType;
  while (true) {
    if (!aExistingNames.has(suggestion)) {
      break;
    }

    suggestion = base + suffix + aType;
    suffix++;
  }

  return suggestion;
}

function ThreadPaneOnDragOver(aEvent) {
  let ds = Cc["@mozilla.org/widget/dragservice;1"]
    .getService(Ci.nsIDragService)
    .getCurrentSession();
  ds.canDrop = false;
  if (!gFolderDisplay.displayedFolder.canFileMessages) {
    return;
  }

  let dt = aEvent.dataTransfer;
  if (Array.from(dt.mozTypesAt(0)).includes("application/x-moz-file")) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", 0);
    if (!extFile) {
      return;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
        ds.canDrop = true;
      }
    }
  }
}

function ThreadPaneOnDrop(aEvent) {
  let dt = aEvent.dataTransfer;
  for (let i = 0; i < dt.mozItemCount; i++) {
    let extFile = dt.mozGetDataAt("application/x-moz-file", i);
    if (!extFile) {
      continue;
    }

    extFile = extFile.QueryInterface(Ci.nsIFile);
    if (extFile.isFile()) {
      let len = extFile.leafName.length;
      if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
        MailServices.copy.copyFileMessage(
          extFile,
          gFolderDisplay.displayedFolder,
          null,
          false,
          1,
          "",
          null,
          msgWindow
        );
      }
    }
  }
}

var TabsInTitlebar = {
  init() {
    this._readPref();
    Services.prefs.addObserver(this._drawInTitlePref, this);

    window.addEventListener("resolutionchange", this);
    window.addEventListener("resize", this);

    this._initialized = true;
    this.update();
  },

  allowedBy(condition, allow) {
    if (allow) {
      if (condition in this._disallowed) {
        delete this._disallowed[condition];
        this.update();
      }
    } else if (!(condition in this._disallowed)) {
      this._disallowed[condition] = null;
      this.update();
    }
  },

  get systemSupported() {
    let isSupported = false;
    switch (AppConstants.MOZ_WIDGET_TOOLKIT) {
      case "windows":
      case "cocoa":
        isSupported = true;
        break;
      case "gtk":
        isSupported = window.matchMedia("(-moz-gtk-csd-available)");
        break;
    }
    delete this.systemSupported;
    return (this.systemSupported = isSupported);
  },

  get enabled() {
    return document.documentElement.getAttribute("tabsintitlebar") == "true";
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      this._readPref();
    }
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "resolutionchange":
        if (aEvent.target == window) {
          this.update();
        }
        break;
      case "resize":
        // The spaces toolbar needs special styling for the fullscreen mode.
        gSpacesToolbar.onWindowResize();
        if (window.fullScreen || aEvent.target != window) {
          break;
        }
        // We use resize events because the window is not ready after
        // sizemodechange events. However, we only care about the event when
        // the sizemode is different from the last time we updated the
        // appearance of the tabs in the titlebar.
        let sizemode = document.documentElement.getAttribute("sizemode");
        if (this._lastSizeMode == sizemode) {
          break;
        }
        let oldSizeMode = this._lastSizeMode;
        this._lastSizeMode = sizemode;
        // Don't update right now if we are leaving fullscreen, since the UI is
        // still changing in the consequent "fullscreen" event. Code there will
        // call this function again when everything is ready.
        // See browser-fullScreen.js: FullScreen.toggle and bug 1173768.
        if (oldSizeMode == "fullscreen") {
          break;
        }
        this.update();
        break;
    }
  },

  _initialized: false,
  _disallowed: {},
  _drawInTitlePref: "mail.tabs.drawInTitlebar",
  _lastSizeMode: null,

  _readPref() {
    // check is only true when drawInTitlebar=true
    let check = Services.prefs.getBoolPref(this._drawInTitlePref);
    this.allowedBy("pref", check);
  },

  update() {
    if (!this._initialized || window.fullScreen) {
      return;
    }

    let allowed =
      this.systemSupported && Object.keys(this._disallowed).length == 0;

    if (
      document.documentElement.getAttribute("chromehidden")?.includes("toolbar")
    ) {
      // Don't draw in titlebar in case of a popup window.
      allowed = false;
    }

    if (allowed) {
      document.documentElement.setAttribute("tabsintitlebar", "true");
      if (AppConstants.platform == "macosx") {
        document.documentElement.setAttribute("chromemargin", "0,-1,-1,-1");
        document.documentElement.removeAttribute("drawtitle");
      } else {
        document.documentElement.setAttribute("chromemargin", "0,2,2,2");
      }
    } else {
      document.documentElement.removeAttribute("tabsintitlebar");
      document.documentElement.removeAttribute("chromemargin");
      if (AppConstants.platform == "macosx") {
        document.documentElement.setAttribute("drawtitle", "true");
      }
    }
  },

  uninit() {
    this._initialized = false;
    Services.prefs.removeObserver(this._drawInTitlePref, this);
  },
};

/* Draw */
function onTitlebarMaxClick() {
  if (window.windowState == window.STATE_MAXIMIZED) {
    window.restore();
  } else {
    window.maximize();
  }
}

var BrowserAddonUI = {
  async promptRemoveExtension(addon) {
    let { name } = addon;
    let [title, btnTitle] = await document.l10n.formatValues([
      {
        id: "addon-removal-title",
        args: { name },
      },
      {
        id: "addon-removal-confirmation-button",
      },
    ]);
    let {
      BUTTON_TITLE_IS_STRING: titleString,
      BUTTON_TITLE_CANCEL: titleCancel,
      BUTTON_POS_0,
      BUTTON_POS_1,
      confirmEx,
    } = Services.prompt;
    let btnFlags = BUTTON_POS_0 * titleString + BUTTON_POS_1 * titleCancel;
    let message = null;

    if (!Services.prefs.getBoolPref("prompts.windowPromptSubDialog", false)) {
      message = await document.l10n.formatValue(
        "addon-removal-confirmation-message",
        {
          name,
        }
      );
    }

    let checkboxState = { value: false };
    let result = confirmEx(
      window,
      title,
      message,
      btnFlags,
      btnTitle,
      /* button1 */ null,
      /* button2 */ null,
      /* checkboxMessage */ null,
      checkboxState
    );

    return { remove: result === 0, report: false };
  },

  async removeAddon(addonId) {
    let addon = addonId && (await AddonManager.getAddonByID(addonId));
    if (!addon || !(addon.permissions & AddonManager.PERM_CAN_UNINSTALL)) {
      return;
    }

    let { remove, report } = await this.promptRemoveExtension(addon);

    if (remove) {
      await addon.uninstall(report);
    }
  },
};
