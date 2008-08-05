/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Kent James <kent@caspia.com>.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Mark Banner <bugzilla@standard8.plus.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
 
// Local Mail Folders. Requires prior setup of profile directory

var gLocalIncomingServer;
var gLocalInboxFolder;

function loadLocalMailAccount()
{
  var acctMgr = Cc["@mozilla.org/messenger/account-manager;1"]
                  .getService(Ci.nsIMsgAccountManager);
  acctMgr.createLocalMailAccount();

  gLocalIncomingServer = acctMgr.localFoldersServer;

  var rootFolder = gLocalIncomingServer.rootMsgFolder;

  // Note: Inbox is not created automatically when there is no deferred server,
  // so we need to create it.
  gLocalInboxFolder = rootFolder.addSubfolder("Inbox");

  // Force an initialization of the Inbox folder database.
  var folderName = gLocalInboxFolder.prettiestName;
}

// Loads a file to a string
// If aCharset is specified, treats the file as being of that charset
function loadFileToString(aFile, aCharset) {
  var data = "";
  var fstream = Cc["@mozilla.org/network/file-input-stream;1"]
                  .createInstance(Ci.nsIFileInputStream);
  fstream.init(aFile, -1, 0, 0);

  if (aCharset)
  {
    var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                    .createInstance(Ci.nsIConverterInputStream);
    cstream.init(fstream, aCharset, 4096, 0x0000);
    var str = {};
    while (cstream.readString(4096, str) != 0)
      data += str.value;

    cstream.close();
  }
  else
  {
    var sstream = Cc["@mozilla.org/scriptableinputstream;1"]
                    .createInstance(Ci.nsIScriptableInputStream);

    sstream.init(fstream);

    var str = sstream.read(4096);
    while (str.length > 0) {
      data += str;
      str = sstream.read(4096);
    }

    sstream.close();
  }

  fstream.close();

  return data;
}
