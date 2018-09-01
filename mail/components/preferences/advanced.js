/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Load DownloadUtils module for convertByteUnits
ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/L10nRegistry.jsm");
ChromeUtils.import("resource://gre/modules/Localization.jsm");

var gAdvancedPane = {
  mPane: null,
  mInitialized: false,
  mShellServiceWorking: false,
  mBundle: null,
  requestingLocales: null,

  init: function ()
  {
    this.mPane = document.getElementById("paneAdvanced");
    this.updateCompactOptions();
    this.mBundle = document.getElementById("bundlePreferences");
    this.formatLocaleSetLabels();

    if (Services.prefs.getBoolPref("intl.multilingual.enabled")) {
      this.initMessengerLocale();
    }

    if (!(("arguments" in window) && window.arguments[1]))
    {
      // If no tab was specified, select the last used tab.
      let preference = document.getElementById("mail.preferences.advanced.selectedTabIndex");
      if (preference.value)
        document.getElementById("advancedPrefs").selectedIndex = preference.value;
    }
    if (AppConstants.MOZ_UPDATER)
      this.updateReadPrefs();

    // Default store type initialization.
    let storeTypeElement = document.getElementById("storeTypeMenulist");
    // set the menuitem to match the account
    let defaultStoreID = Services.prefs.getCharPref("mail.serverDefaultStoreContractID");
    let targetItem = storeTypeElement.getElementsByAttribute("value", defaultStoreID);
    storeTypeElement.selectedItem = targetItem[0];

    if (AppConstants.MOZ_CRASHREPORTER)
      this.initSubmitCrashes();
    this.initTelemetry();
    this.updateActualCacheSize();

    // Search integration -- check whether we should hide or disable integration
    let hideSearchUI = false;
    let disableSearchUI = false;
    ChromeUtils.import("resource:///modules/SearchIntegration.js");
    if (SearchIntegration)
    {
      if (SearchIntegration.osVersionTooLow)
        hideSearchUI = true;
      else if (SearchIntegration.osComponentsNotRunning)
        disableSearchUI = true;
    }
    else
    {
      hideSearchUI = true;
    }

    if (hideSearchUI)
    {
      document.getElementById("searchIntegrationContainer").hidden = true;
    }
    else if (disableSearchUI)
    {
      let searchCheckbox = document.getElementById("searchIntegration");
      searchCheckbox.checked = false;
      document.getElementById("searchintegration.enable").disabled = true;
    }

    // If the shell service is not working, disable the "Check now" button
    // and "perform check at startup" checkbox.
    try {
      let shellSvc = Cc["@mozilla.org/mail/shell-service;1"]
                       .getService(Ci.nsIShellService);
      this.mShellServiceWorking = true;
    } catch (ex) {
      // The elements may not exist if HAVE_SHELL_SERVICE is off.
      if (document.getElementById("alwaysCheckDefault")) {
        document.getElementById("alwaysCheckDefault").disabled = true;
        document.getElementById("alwaysCheckDefault").checked = false;
      }
      if (document.getElementById("checkDefaultButton"))
        document.getElementById("checkDefaultButton").disabled = true;
      this.mShellServiceWorking = false;
    }

    if (AppConstants.MOZ_UPDATER) {
      let distroId = Services.prefs.getCharPref("distribution.id" , "");
      if (distroId) {
        let distroVersion = Services.prefs.getCharPref("distribution.version");

        let distroIdField = document.getElementById("distributionId");
        distroIdField.value = distroId + " - " + distroVersion;
        distroIdField.style.display = "block";

        let distroAbout = Services.prefs.getStringPref("distribution.about", "");
        if (distroAbout) {
          let distroField = document.getElementById("distribution");
          distroField.value = distroAbout;
          distroField.style.display = "block";
        }
      }

      let version = AppConstants.MOZ_APP_VERSION_DISPLAY;

      // Include the build ID and display warning if this is an "a#" (nightly) build
      if (/a\d+$/.test(version)) {
        let buildID = Services.appinfo.appBuildID;
        let year = buildID.slice(0, 4);
        let month = buildID.slice(4, 6);
        let day = buildID.slice(6, 8);
        version += ` (${year}-${month}-${day})`;
      }

      // Append "(32-bit)" or "(64-bit)" build architecture to the version number:
      let bundle = Services.strings.createBundle("chrome://messenger/locale/messenger.properties");
      let archResource = Services.appinfo.is64Bit
                         ? "aboutDialog.architecture.sixtyFourBit"
                         : "aboutDialog.architecture.thirtyTwoBit";
      let arch = bundle.GetStringFromName(archResource);
      version += ` (${arch})`;

      document.getElementById("version").textContent = version;

      if (!AppConstants.NIGHTLY_BUILD) {
        // Show a release notes link if we have a URL.
        let relNotesLink = document.getElementById("releasenotes");
        let relNotesPrefType = Services.prefs.getPrefType("app.releaseNotesURL");
        if (relNotesPrefType != Services.prefs.PREF_INVALID) {
          let relNotesURL = Services.urlFormatter.formatURLPref("app.releaseNotesURL");
          if (relNotesURL != "about:blank") {
            relNotesLink.href = relNotesURL;
            relNotesLink.hidden = false;
          }
        }
      }

      gAppUpdater = new appUpdater();
    }

    this.mInitialized = true;
  },

  tabSelectionChanged: function ()
  {
    if (this.mInitialized)
    {
      document.getElementById("mail.preferences.advanced.selectedTabIndex")
              .valueFromPreferences = document.getElementById("advancedPrefs").selectedIndex;
    }
  },

  /**
   * Checks whether Thunderbird is currently registered with the operating
   * system as the default app for mail, rss and news.  If Thunderbird is not
   * currently the default app, the user is given the option of making it the
   * default for each type; otherwise, the user is informed that Thunderbird is
   * already the default.
   */
  checkDefaultNow: function (aAppType)
  {
    if (!this.mShellServiceWorking)
      return;

    // otherwise, bring up the default client dialog
    gSubDialog.open("chrome://messenger/content/systemIntegrationDialog.xul",
                    "resizable=no", "calledFromPrefs");
  },

  showConfigEdit: function()
  {
    gSubDialog.open("chrome://global/content/config.xul");
  },

  /**
   * Set the default store contract ID.
   */
  updateDefaultStore: function(storeID)
  {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);
  },

  // NETWORK TAB

  /*
   * Preferences:
   *
   * browser.cache.disk.capacity
   * - the size of the browser cache in KB
   */

  // Retrieves the amount of space currently used by disk cache
  updateActualCacheSize: function()
  {
    let actualSizeLabel = document.getElementById("actualDiskCacheSize");
    let prefStrBundle = document.getElementById("bundlePreferences");

    // Needs to root the observer since cache service keeps only a weak reference.
    this.observer = {
      onNetworkCacheDiskConsumption: function(consumption) {
        let size = DownloadUtils.convertByteUnits(consumption);
        // The XBL binding for the string bundle may have been destroyed if
        // the page was closed before this callback was executed.
        if (!prefStrBundle.getFormattedString) {
          return;
        }
        actualSizeLabel.value = prefStrBundle.getFormattedString("actualDiskCacheSize", size);
      },

      QueryInterface: ChromeUtils.generateQI([
        Ci.nsICacheStorageConsumptionObserver,
        Ci.nsISupportsWeakReference
      ])
    };

    actualSizeLabel.value = prefStrBundle.getString("actualDiskCacheSizeCalculated");

    try {
      let cacheService =
        Cc["@mozilla.org/netwerk/cache-storage-service;1"]
          .getService(Ci.nsICacheStorageService);
      cacheService.asyncGetDiskConsumption(this.observer);
    } catch (e) {}
  },

  updateCacheSizeUI: function (smartSizeEnabled)
  {
    document.getElementById("useCacheBefore").disabled = smartSizeEnabled;
    document.getElementById("cacheSize").disabled = smartSizeEnabled;
    document.getElementById("useCacheAfter").disabled = smartSizeEnabled;
  },

  readSmartSizeEnabled: function ()
  {
    // The smart_size.enabled preference element is inverted="true", so its
    // value is the opposite of the actual pref value
    var disabled = document.getElementById("browser.cache.disk.smart_size.enabled").value;
    this.updateCacheSizeUI(!disabled);
  },

  /**
   * Converts the cache size from units of KB to units of MB and returns that
   * value.
   */
  readCacheSize: function ()
  {
    var preference = document.getElementById("browser.cache.disk.capacity");
    return preference.value / 1024;
  },

  /**
   * Converts the cache size as specified in UI (in MB) to KB and returns that
   * value.
   */
  writeCacheSize: function ()
  {
    var cacheSize = document.getElementById("cacheSize");
    var intValue = parseInt(cacheSize.value, 10);
    return isNaN(intValue) ? 0 : intValue * 1024;
  },

  /**
   * Clears the cache.
   */
  clearCache: function ()
  {
    try {
      let cache = Cc["@mozilla.org/netwerk/cache-storage-service;1"]
                    .getService(Ci.nsICacheStorageService);
      cache.clear();
    } catch (ex) {}
    this.updateActualCacheSize();
  },

  updateButtons: function (aButtonID, aPreferenceID)
  {
    var button = document.getElementById(aButtonID);
    var preference = document.getElementById(aPreferenceID);
    // This is actually before the value changes, so the value is not as you expect.
    button.disabled = preference.value == true;
    return undefined;
  },

/**
 * Selects the item of the radiogroup based on the pref values and locked
 * states.
 *
 * UI state matrix for update preference conditions
 *
 * UI Components:                              Preferences
 * Radiogroup                                  i   = app.update.auto
 */
updateReadPrefs: function ()
{
  var autoPref = document.getElementById("app.update.auto");
  var radiogroup = document.getElementById("updateRadioGroup");

  if (autoPref.value)
    radiogroup.value="auto";      // Automatically install updates
  else
    radiogroup.value="checkOnly"; // Check, but let me choose

  var canCheck = Cc["@mozilla.org/updates/update-service;1"].
                   getService(Ci.nsIApplicationUpdateService).
                   canCheckForUpdates;

  // canCheck is false if the binary platform or OS version is not known.
  // A locked pref is sufficient to disable the radiogroup.
  radiogroup.disabled = !canCheck || autoPref.locked;

  if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
    // Check to see if the maintenance service is installed.
    // If it is don't show the preference at all.
    let installed;
    try {
      let wrk = Cc["@mozilla.org/windows-registry-key;1"]
                  .createInstance(Ci.nsIWindowsRegKey);
      wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE,
               "SOFTWARE\\Mozilla\\MaintenanceService",
               wrk.ACCESS_READ | wrk.WOW64_64);
      installed = wrk.readIntValue("Installed");
      wrk.close();
    } catch(e) { }
    if (installed != 1) {
      document.getElementById("useService").hidden = true;
    }
  }
},

/**
 * Sets the pref values based on the selected item of the radiogroup.
 */
updateWritePrefs: function ()
{
  var autoPref = document.getElementById("app.update.auto");
  var radiogroup = document.getElementById("updateRadioGroup");
  switch (radiogroup.value) {
    case "auto":      // Automatically install updates
      autoPref.value = true;
      break;
    case "checkOnly": // Check, but but let me choose
      autoPref.value = false;
      break;
  }
},

  showUpdates: function ()
  {
    gSubDialog.open("chrome://mozapps/content/update/history.xul");
  },

  updateCompactOptions: function(aCompactEnabled)
  {
    document.getElementById("offlineCompactFolderMin").disabled =
      !document.getElementById("offlineCompactFolder").checked ||
      document.getElementById("mail.purge_threshhold_mb").locked;
  },

  updateSubmitCrashReports: function(aChecked)
  {
    Cc["@mozilla.org/toolkit/crash-reporter;1"]
      .getService(Ci.nsICrashReporter)
      .submitReports = aChecked;
  },
  /**
   * Display the return receipts configuration dialog.
   */
  showReturnReceipts: function()
  {
    gSubDialog.open("chrome://messenger/content/preferences/receipts.xul",
                    "resizable=no");
  },

  /**
   * Display the the connection settings dialog.
   */
  showConnections: function ()
  {
    gSubDialog.open("chrome://messenger/content/preferences/connection.xul",
                    "resizable=no");
  },

  /**
   * Display the the offline settings dialog.
   */
  showOffline: function()
  {
    gSubDialog.open("chrome://messenger/content/preferences/offline.xul",
                    "resizable=no");
  },

  /**
   * Display the user's certificates and associated options.
   */
  showCertificates: function ()
  {
    gSubDialog.open("chrome://pippki/content/certManager.xul");
  },

  /**
   * security.OCSP.enabled is an integer value for legacy reasons.
   * A value of 1 means OCSP is enabled. Any other value means it is disabled.
   */
  readEnableOCSP: function ()
  {
    var preference = document.getElementById("security.OCSP.enabled");
    // This is the case if the preference is the default value.
    if (preference.value === undefined) {
      return true;
    }
    return preference.value == 1;
  },

  /**
   * See documentation for readEnableOCSP.
   */
  writeEnableOCSP: function ()
  {
    var checkbox = document.getElementById("enableOCSP");
    return checkbox.checked ? 1 : 0;
  },

  /**
   * Display a dialog from which the user can manage his security devices.
   */
  showSecurityDevices: function ()
  {
    gSubDialog.open("chrome://pippki/content/device_manager.xul");
  },

  /**
   * When the user toggles the layers.acceleration.disabled pref,
   * sync its new value to the gfx.direct2d.disabled pref too.
   */
  updateHardwareAcceleration: function(aVal)
  {
    if (AppConstants.platforms == "win")
      Services.prefs.setBoolPref("gfx.direct2d.disabled", !aVal);
  },

  // DATA CHOICES TAB

  /**
   * Open a text link.
   */
  openTextLink: function (evt) {
    // Opening links behind a modal dialog is poor form. Work around flawed
    // text-link handling by opening in browser if we'd instead get a content
    // tab behind the modal options dialog.
    if (Services.prefs.getBoolPref("browser.preferences.instantApply")) {
      return true; // Yes, open the link in a content tab.
    }
    var url = evt.target.getAttribute("href");
    var messenger = Cc["@mozilla.org/messenger;1"]
      .createInstance(Ci.nsIMessenger);
    messenger.launchExternalURL(url);
    evt.preventDefault();
    return false;
  },

  /**
   * Set up or hide the Learn More links for various data collection options
   */
  _setupLearnMoreLink: function (pref, element) {
    // set up the Learn More link with the correct URL
    let url = Services.prefs.getCharPref(pref);
    let el = document.getElementById(element);

    if (url) {
      el.setAttribute("href", url);
    } else {
      el.setAttribute("hidden", "true");
    }
  },

  initSubmitCrashes: function ()
  {
    var checkbox = document.getElementById("submitCrashesBox");
    try {
      var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"].
               getService(Ci.nsICrashReporter);
      checkbox.checked = cr.submitReports;
    } catch (e) {
      checkbox.style.display = "none";
    }
    this._setupLearnMoreLink("toolkit.crashreporter.infoURL", "crashReporterLearnMore");
  },

  updateSubmitCrashes: function ()
  {
    var checkbox = document.getElementById("submitCrashesBox");
    try {
      var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"].
               getService(Ci.nsICrashReporter);
      cr.submitReports = checkbox.checked;
    } catch (e) { }
  },


  /**
   * The preference/checkbox is configured in XUL.
   *
   * In all cases, set up the Learn More link sanely
   */
  initTelemetry: function ()
  {
    if (AppConstants.MOZ_TELEMETRY_REPORTING)
      this._setupLearnMoreLink("toolkit.telemetry.infoURL", "telemetryLearnMore");
  },

  formatLocaleSetLabels: function() {
    const localeService =
      Cc["@mozilla.org/intl/localeservice;1"]
        .getService(Ci.mozILocaleService);
    const osprefs =
      Cc["@mozilla.org/intl/ospreferences;1"]
        .getService(Ci.mozIOSPreferences);
    let appLocale = localeService.getAppLocalesAsBCP47()[0];
    let rsLocale = osprefs.getRegionalPrefsLocales()[0];
    let names = Services.intl.getLocaleDisplayNames(undefined, [appLocale, rsLocale]);
    let appLocaleRadio = document.getElementById("appLocale");
    let rsLocaleRadio = document.getElementById("rsLocale");
    let appLocaleLabel = this.mBundle.getFormattedString("appLocale.label",
                                                         [names[0]]);
    let rsLocaleLabel = this.mBundle.getFormattedString("rsLocale.label",
                                                        [names[1]]);
    appLocaleRadio.setAttribute("label", appLocaleLabel);
    rsLocaleRadio.setAttribute("label", rsLocaleLabel);
    appLocaleRadio.accessKey = this.mBundle.getString("appLocale.accesskey");
    rsLocaleRadio.accessKey = this.mBundle.getString("rsLocale.accesskey");
  },

  // Load the preferences string bundle for other locales with fallbacks.
  getBundleForLocales(newLocales) {
    let locales = Array.from(new Set([
      ...newLocales,
      ...Services.locale.getRequestedLocales(),
      Services.locale.lastFallbackLocale,
    ]));
    function generateContexts(resourceIds) {
      return L10nRegistry.generateContexts(locales, resourceIds);
    }
    return new Localization([
      "messenger/preferences/preferences.ftl",
      "branding/brand.ftl",
    ], generateContexts);
  },

  initMessengerLocale() {
    let localeCodes = Services.locale.getAvailableLocales();
    let localeNames = Services.intl.getLocaleDisplayNames(undefined, localeCodes);
    let locales = localeCodes.map((code, i) => ({code, name: localeNames[i]}));
    locales.sort((a, b) => a.name > b.name);

    let fragment = document.createDocumentFragment();
    for (let {code, name} of locales) {
      let menuitem = document.createElement("menuitem");
      menuitem.setAttribute("value", code);
      menuitem.setAttribute("label", name);
      fragment.appendChild(menuitem);
    }
    let menulist = document.getElementById("defaultMessengerLanguage");
    let menupopup = menulist.querySelector("menupopup");
    menupopup.appendChild(fragment);
    menulist.value = Services.locale.getRequestedLocale();

    document.getElementById("messengerLanguagesBox").hidden = false;
  },

  showMessengerLanguages() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/messengerLanguages.xul",
      null, this.requestingLocales, this.messengerLanguagesClosed);
  },

  /* Show or hide the confirm change message bar based on the updated ordering. */
  messengerLanguagesClosed() {
    let requesting = this.gMessengerLanguagesDialog.requestedLocales;
    let requested = Services.locale.getRequestedLocales();
    let defaultMessengerLanguage = document.getElementById("defaultMessengerLanguage");
    if (requesting && requesting.join(",") != requested.join(",")) {
      gAdvancedPane.showConfirmLanguageChangeMessageBar(requesting);
      defaultMessengerLanguage.value = requesting[0];
      return;
    }
    defaultMessengerLanguage.value = Services.locale.getRequestedLocale();
    gAdvancedPane.hideConfirmLanguageChangeMessageBar();
  },

  /* Show the confirmation message bar to allow a restart into the new locales. */
  async showConfirmLanguageChangeMessageBar(locales) {
    let messageBar = document.getElementById("confirmMessengerLanguage");
    // Set the text in the message bar for the new locale.
    let newBundle = this.getBundleForLocales(locales);
    let description = messageBar.querySelector(".message-bar-description");
    description.textContent = await newBundle.formatValue(
      "confirm-messenger-language-change-description");
    let button = messageBar.querySelector(".message-bar-button");
    button.setAttribute(
      "label", await newBundle.formatValue(
        "confirm-messenger-language-change-button"));
    button.setAttribute("locales", locales.join(","));
    messageBar.hidden = false;
    this.requestingLocales = locales;
  },

  hideConfirmLanguageChangeMessageBar() {
    let messageBar = document.getElementById("confirmMessengerLanguage");
    messageBar.hidden = true;
    messageBar.querySelector(".message-bar-button").removeAttribute("locales");
    this.requestingLocales = null;
  },

  /* Confirm the locale change and restart the Thunderbird in the new locale. */
  confirmLanguageChange() {
    let localesString = (event.target.getAttribute("locales") || "").trim();
    if (!localesString || localesString.length == 0) {
      return;
    }
    let locales = localesString.split(",");
    Services.locale.setRequestedLocales(locales);

    // Restart with the new locale.
    let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
    Services.obs.notifyObservers(cancelQuit, "quit-application-requested", "restart");
    if (!cancelQuit.data) {
      Services.startup.quit(Services.startup.eAttemptQuit | Services.startup.eRestart);
    }
  },

  /* Show or hide the confirm change message bar based on the new locale. */
  onMessengerLanguageChange(event) {
    let locale = event.target.value;
    if (locale == Services.locale.getRequestedLocale()) {
      this.hideConfirmLanguageChangeMessageBar();
      return;
    }
    let locales = Array.from(new Set([
      locale,
      ...Services.locale.getRequestedLocales(),
    ]).values());
    this.showConfirmLanguageChangeMessageBar(locales);
  },
};
