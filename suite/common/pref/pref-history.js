/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{ 
  var urlbarHistButton = document.getElementById("ClearUrlBarHistoryButton");
  var lastUrlPref = document.getElementById("general.open_location.last_url");
  try {
    var isBtnDisabled = lastUrlPref.locked;
    if (!isBtnDisabled && !lastUrlPref.hasUserValue) {
      var file = GetUrlbarHistoryFile();
      if (!file.exists())
        isBtnDisabled = true;
      else {
        var connection = Services.storage.openDatabase(file);
        isBtnDisabled = !connection.tableExists("urlbarhistory");
        connection.close();
      }
    }
    urlbarHistButton.disabled = isBtnDisabled;
  }
  catch(ex) {
  }
    
  var globalHistButton = document.getElementById("browserClearHistory");
  var globalHistory = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                                .getService(Components.interfaces.nsINavHistoryService);
  if (!globalHistory.hasHistoryEntries)
    globalHistButton.disabled = true;
}

function prefClearGlobalHistory()
{
  Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
  PlacesUtils.history.removeAllPages();
}

function prefClearUrlbarHistory()
{
  document.getElementById("general.open_location.last_url").valueFromPreferences = "";
  var file = GetUrlbarHistoryFile();
  if (file.exists())
    file.remove(false);
}
