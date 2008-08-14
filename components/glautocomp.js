/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
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
 * The Original Code is Thunderbird Global Database.
 *
 * The Initial Developer of the Original Code is
 * Mozilla Messaging, Inc.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Andrew Sutherland <asutherland@asutherland.org>
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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var Gloda = null;
var GlodaUtils = null;
var MultiSuffixTree = null;

function nsAutoCompleteGlodaResult(aString, aResults) {
  this.searchString = aString;
  this._results = aResults;
  
  this.matchCount = aResults.length;
  if (this.matchCount)
    this.searchResult = Ci.nsIAutoCompleteResult.RESULT_SUCCESS; 
}
nsAutoCompleteGlodaResult.prototype = {
  _results: null,
  searchString: null,
  searchResult: Ci.nsIAutoCompleteResult.RESULT_FAILURE,
  defaultIndex: -1,
  errorDescription: null,
  matchCount: 0,
  getValueAt: function(aIndex) {
    let thing = this._results[aIndex];
    return thing.name || thing.value;
  },
  getCommentAt: function() { return null; },
  getStyleAt: function() { return "gloda-contact"; },
  getImageAt: function() { return null; },
  removeValueAt: function() {}
};

function nsAutoCompleteGloda() {
  // set up our awesome globals!
  if (Gloda === null) {
    let loadNS = {};
    Cu.import("resource://gloda/modules/gloda.js", loadNS);
    Gloda = loadNS.Gloda;
    // force initialization
    Cu.import("resource://gloda/modules/everybody.js", loadNS);

    Cu.import("resource://gloda/modules/utils.js", loadNS);
    GlodaUtils = loadNS.GlodaUtils;
    Cu.import("resource://gloda/modules/suffixtree.js", loadNS);
    MultiSuffixTree = loadNS.MultiSuffixTree;
  }
  
  Gloda.lookupNoun("contact");
  
  // get all the contacts
  let contactQuery = Gloda.newQuery(Gloda.NOUN_CONTACT);
  this.contactCollection = contactQuery.getAllSync();

  // get all the identities
  let identityQuery = Gloda.newQuery(Gloda.NOUN_IDENTITY);
  this.identityCollection = identityQuery.getAllSync();
  
  let contactNames = [(c.name.replace(" ", "") || "x") for each
                      (c in this.contactCollection.items)];
  let identityMails = [i.value for each (i in this.identityCollection.items)];
  
  this.suffixTree = new MultiSuffixTree(contactNames.concat(identityMails),
    this.contactCollection.items.concat(this.identityCollection.items));
}

nsAutoCompleteGloda.prototype = {
  classDescription: "AutoCompleteGloda",
  contractID: "@mozilla.org/autocomplete/search;1?name=gloda",
  classID: Components.ID("{3bbe4d77-3f70-4252-9500-bc00c26f476c}"),
  QueryInterface: XPCOMUtils.generateQI([
      Components.interfaces.nsIAutoCompleteSearch]),

  startSearch: function(aString, aParam, aResult, aListener) {
    // only match if they type at least 3 letters...
    let matches = [];
    if (aString.length >= 3) {
      matches = this.suffixTree.findMatches(aString);
    } 
  
    var result = new nsAutoCompleteGlodaResult(aString, matches);
    aListener.onSearchResult(this, result);
  },

  stopSearch: function() {}
};

function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule([nsAutoCompleteGloda]);
}
