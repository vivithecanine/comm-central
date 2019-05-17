/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Execute periodic filters at the correct rate.
 *
 * The only external call required for this is setupFiltering(). This should be
 * called before the mail-startup-done notification.
 */

const EXPORTED_SYMBOLS = ["PeriodicFilterManager"];

const {fixIterator} = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
const {Log4Moz} = ChromeUtils.import("resource:///modules/gloda/log4moz.js");
const {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

const log = Log4Moz.getConfiguredLogger("mail.periodicFilterManager",
                                        Log4Moz.Level.Warn,
                                        Log4Moz.Level.Warn,
                                        Log4Moz.Level.Warn);

var PeriodicFilterManager = {
  _timer: null,
  _checkRateMilliseconds: 60000, // How often do we check if servers are ready to run?
  _defaultFilterRateMinutes: Services.prefs.getDefaultBranch("")
                               .getIntPref("mail.server.default.periodicFilterRateMinutes"),
  _initialized: false, // Has this been initialized?

  // Initial call to begin startup.
  setupFiltering() {
    if (this._initialized)
      return;

    this._initialized = true;
    Services.obs.addObserver(this, "mail-startup-done");
  },

  // Main call to start the periodic filter process
  init() {
    log.info("PeriodicFilterManager init()");
    // set the next filter time
    let servers = MailServices.accounts.allServers;
    for (let server of fixIterator(servers, Ci.nsIMsgIncomingServer)) {
      let nowTime = parseInt(Date.now() / 60000);
      // Make sure that the last filter time of all servers was in the past.
      let lastFilterTime = server.getIntValue("lastFilterTime");
      // Schedule next filter run.
      let nextFilterTime = lastFilterTime < nowTime ?
                             lastFilterTime + this.getServerPeriod(server) :
                             nowTime;
      server.setIntValue("nextFilterTime", nextFilterTime);
    }

    // kickoff the timer to run periodic filters
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback(this, this._checkRateMilliseconds,
                                 Ci.nsITimer.TYPE_REPEATING_SLACK);
    Services.obs.addObserver(this, "quit-application-granted");
  },

  // periodic callback
  notify(timer) {
    log.debug("PeriodicFilterManager timer callback");
    let servers = MailServices.accounts.allServers;
    let nowTime = parseInt(Date.now() / 60000);
    for (let server of fixIterator(servers, Ci.nsIMsgIncomingServer)) {
      if (!server.canHaveFilters)
        continue;
      if (server.getIntValue("nextFilterTime") > nowTime)
        continue;
      if (server.serverBusy)
        continue;

      server.setIntValue("nextFilterTime", nowTime + this.getServerPeriod(server));
      server.setIntValue("lastFilterTime", nowTime);
      let foldersToFilter = server.rootFolder.getFoldersWithFlags(Ci.nsMsgFolderFlags.Inbox);
      if (!foldersToFilter.length)
        continue;

      // Build a temporary list of periodic filters.
      // XXX TODO: make applyFiltersToFolders() take a filterType instead (bug 1551043).
      let curFilterList = server.getFilterList(null);
      let tempFilterList = MailServices.filters.getTempFilterList(server.rootFolder);
      let numFilters = curFilterList.filterCount;
      tempFilterList.logStream = curFilterList.logStream;
      tempFilterList.loggingEnabled = curFilterList.loggingEnabled;
      let newFilterIndex = 0;
      for (let i = 0; i < numFilters; i++) {
        let curFilter = curFilterList.getFilterAt(i);
        // Only add enabled, UI visible filters that are of the Periodic type.
        if (curFilter.enabled && !curFilter.temporary &&
            (curFilter.filterType & Ci.nsMsgFilterType.Periodic)) {
          tempFilterList.insertFilterAt(newFilterIndex, curFilter);
          newFilterIndex++;
        }
      }
      log.debug("PeriodicFilterManager apply periodic filters to server " + server.prettyName);
      MailServices.filters.applyFiltersToFolders(tempFilterList, foldersToFilter, null);
    }
  },

  getServerPeriod(server) {
    const minimumPeriodMinutes = 1;
    let serverRateMinutes = server.getIntValue("periodicFilterRateMinutes");
    // Check if period is too short.
    if (serverRateMinutes < minimumPeriodMinutes) {
      // If the server.default pref is too low, clear that one first.
      if (Services.prefs.getIntPref("mail.server.default.periodicFilterRateMinutes")
          == serverRateMinutes) {
        Services.prefs.clearUserPref("mail.server.default.periodicFilterRateMinutes");
      }
      // If the server still has its own specific value and it is still too low, sanitize it.
      if (server.getIntValue("periodicFilterRateMinutes") < minimumPeriodMinutes)
        server.setIntValue("periodicFilterRateMinutes", this._defaultFilterRateMinutes);

      return this._defaultFilterRateMinutes;
    }

    return serverRateMinutes;
  },

  observe(subject, topic, data) {
    Services.obs.removeObserver(this, topic);
    if (topic == "mail-startup-done")
      this.init();
    else if (topic == "quit-application-granted")
      this.shutdown();
  },

  shutdown() {
    log.info("PeriodicFilterManager shutdown");
    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }
  },
};
