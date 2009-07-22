/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
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
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Alec Flett <alecf@netscape.com>
 *   Håkan Waara <hwaara@chello.se>
 *   Seth Spitzer <sspitzer@netscape.com>
 *   Mark Banner <mark@standard8.demon.co.uk>
 *   Kent James <kent@caspia.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
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


var gPromptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                     .getService(Components.interfaces.nsIPromptService);

// the actual filter that we're editing
var gFilter;
// cache the key elements we need
var gFilterList;
var gFilterNameElement;
var gFilterContext;
var gFilterBundle;
var gPreFillName;
var nsMsgSearchScope = Components.interfaces.nsMsgSearchScope;
var gPrefBranch;
var gMailSession = null;
var gFilterActionList;
var gCustomActions = null;
var gFilterType;

var gFilterActionStrings = ["none", "movemessage", "setpriorityto", "deletemessage", 
                            "markasread", "ignorethread", "watchthread", "markasflagged",
                            "label", "replytomessage", "forwardmessage", "stopexecution",
                            "deletefrompopserver",  "leaveonpopserver", "setjunkscore",
                            "fetchfrompopserver", "copymessage", "addtagtomessage",
                            "ignoresubthread"];

var nsMsgFilterAction = Components.interfaces.nsMsgFilterAction;

var gFilterEditorMsgWindow = null;

function filterEditorOnLoad()
{
  getCustomActions();
  initializeSearchWidgets();
  initializeFilterWidgets();

  gPrefBranch = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch(null);
  gFilterBundle = document.getElementById("bundle_filter");

  if ("arguments" in window && window.arguments[0]) 
  {
    var args = window.arguments[0];

    if ("filterList" in args) 
      gFilterList = args.filterList;

    if ("filter" in args) 
    {
      // editing a filter
      gFilter = window.arguments[0].filter;
      initializeDialog(gFilter);
    } 
    else 
    {
      if (gFilterList)
          setSearchScope(getScopeFromFilterList(gFilterList));
      // if doing prefill filter create a new filter and populate it.
      if ("filterName" in args) 
      {
        gPreFillName = args.filterName;
        gFilter = gFilterList.createFilter(gPreFillName);
        var term = gFilter.createTerm();

        term.attrib = Components.interfaces.nsMsgSearchAttrib.Sender;
        term.op = Components.interfaces.nsMsgSearchOp.Is;
        term.booleanAnd = gSearchBooleanRadiogroup.value == "and";

        var termValue = term.value;
        termValue.attrib = term.attrib;
        termValue.str = gPreFillName;

        term.value = termValue;

        gFilter.appendTerm(term);

        // the default action for news filters is Delete
        // for everything else, it's MoveToFolder
        var filterAction = gFilter.createAction();
        filterAction.type = (getScopeFromFilterList(gFilterList) ==
            Components.interfaces.nsMsgSearchScope.newsFilter) ?
            nsMsgFilterAction.Delete : nsMsgFilterAction.MoveToFolder;
        gFilter.appendAction(filterAction);
        initializeDialog(gFilter);
      }
      else
      {
        // fake the first more button press
        onMore(null);
      }
    }
  }

  if (!gFilter)
  {
    var stub = gFilterBundle.getString("untitledFilterName");
    var count = 1;
    var name = stub;

    // Set the default filter name to be "Untitled Filter"
    while (duplicateFilterNameExists(name)) 
    {
      count++;
      name = stub + " " + count.toString();
    }
    gFilterNameElement.value = name;
    gFilterContext.selectedIndex = 2; // both
  }

  // in the case of a new filter, we may not have an action row yet.
  ensureActionRow();
  gFilterType = determineFilterType();

  gFilterNameElement.select();
  // This call is required on mac and linux.  It has no effect under win32.  See bug 94800.
  gFilterNameElement.focus();
  moveToAlertPosition();
}

function filterEditorOnUnload()
{
  if (gMailSession)
    gMailSession.RemoveFolderListener(gFolderListener);
}

function onEnterInSearchTerm()
{
  // do nothing.  onOk() will get called since this is a dialog
}

function onAccept()
{
  if (!saveFilter()) 
    return false;

  // parent should refresh filter list..
  // this should REALLY only happen when some criteria changes that
  // are displayed in the filter dialog, like the filter name
  window.arguments[0].refresh = true;
  return true;
}

// the folderListener object
var gFolderListener = {
  OnItemAdded: function(parentItem, item) {},

  OnItemRemoved: function(parentItem, item){},

  OnItemPropertyChanged: function(item, property, oldValue, newValue) {},

  OnItemIntPropertyChanged: function(item, property, oldValue, newValue) {},

  OnItemBoolPropertyChanged: function(item, property, oldValue, newValue) {},

  OnItemUnicharPropertyChanged: function(item, property, oldValue, newValue){},
  OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) {},

  OnItemEvent: function(folder, event) 
  {
    var eventType = event.toString();

    if (eventType == "FolderCreateCompleted") 
    {
      SetFolderPicker(folder.URI, gActionTargetElement.id);
      SetBusyCursor(window, false);
    }     
    else if (eventType == "FolderCreateFailed")
      SetBusyCursor(window, false);
  }
}

function duplicateFilterNameExists(filterName)
{
  if (gFilterList)
    for (var i = 0; i < gFilterList.filterCount; i++) 
      if (filterName == gFilterList.getFilterAt(i).filterName)
        return true;
  return false;   
}

function getScopeFromFilterList(filterList)
{
  if (!filterList) 
  {
    dump("yikes, null filterList\n");
    return nsMsgSearchScope.offlineMail;
  }
  return filterList.folder.server.filterScope;
}

function getScope(filter) 
{
  return getScopeFromFilterList(filter.filterList);
}

function initializeFilterWidgets()
{
  gFilterNameElement = document.getElementById("filterName");
  gFilterActionList = document.getElementById("filterActionList");
  gFilterContext = document.getElementById("contextMenuList");
}

function initializeDialog(filter)
{
  gFilterNameElement.value = filter.filterName;
  var contextIndex = -1;
  if (filter.filterType & Components.interfaces.nsMsgFilterType.Incoming)
    contextIndex += 1;
  if (filter.filterType & Components.interfaces.nsMsgFilterType.Manual)
    contextIndex += 2;
  gFilterContext.selectedIndex = contextIndex;
  var actionList = filter.actionList;
  var numActions = actionList.Count();
  
  for (var actionIndex=0; actionIndex < numActions; actionIndex++)
  {
    var filterAction = actionList.QueryElementAt(actionIndex, Components.interfaces.nsIMsgRuleAction);

    var newActionRow = document.createElement('listitem');
    newActionRow.setAttribute('initialActionIndex', actionIndex);
    newActionRow.className = 'ruleaction';
    gFilterActionList.appendChild(newActionRow);
    newActionRow.setAttribute('value',
        filterAction.type == Components.interfaces.nsMsgFilterAction.Custom ?
        filterAction.customId : gFilterActionStrings[filterAction.type]);
  }

  var gSearchScope = getFilterScope(getScope(filter), filter.filterType, filter.filterList);
  initializeSearchRows(gSearchScope, filter.searchTerms);
  setFilterScope(filter.filterType, filter.filterList);
}

function ensureActionRow()
{
  // make sure we have at least one action row visible to the user
  if (!gFilterActionList.getRowCount())
  {
    var newActionRow = document.createElement('listitem');
    newActionRow.className = 'ruleaction';
    gFilterActionList.appendChild(newActionRow);
    newActionRow.mRemoveButton.disabled = true;
  }
}

// move to overlay
function saveFilter() 
{
  var isNewFilter;
  var filterAction; 

  var filterName= gFilterNameElement.value;
  if (!filterName || filterName == "") 
  {
    if (gPromptService)
      gPromptService.alert(window, null,
                           gFilterBundle.getString("mustEnterName"));
    gFilterNameElement.focus();
    return false;
  }

  // If we think have a duplicate, then we need to check that if we
  // have an original filter name (i.e. we are editing a filter), then
  // we must check that the original is not the current as that is what
  // the duplicateFilterNameExists function will have picked up.
  if ((!gFilter || gFilter.filterName != filterName) && duplicateFilterNameExists(filterName))
  {
    if (gPromptService)
      gPromptService.alert(window,gFilterBundle.getString("cannotHaveDuplicateFilterTitle"), 
                           gFilterBundle.getString("cannotHaveDuplicateFilterMessage"));
    return false;
  }

  // Check that all of the search attributes and operators are valid.
  let allValid = true;
  for (var index = 0; index < gSearchTerms.length && allValid; index++)
  {
    let obj = gSearchTerms[index].obj;
    if (isNaN(obj.searchattribute.value)) // is this a custom term?
    {
      let filterService = Components.classes["@mozilla.org/messenger/services/filters;1"]
          .getService(Components.interfaces.nsIMsgFilterService);
      let customTerm = filterService.getCustomTerm(obj.searchattribute.value);
      if (!customTerm)
        allValid = false;
      else
        allValid = customTerm.getAvailable(obj.searchScope, obj.searchattribute.value);
    }

    else {
      let otherHeader = Components.interfaces.nsMsgSearchAttrib.OtherHeader;
      let attribValue = (obj.searchattribute.value > otherHeader) ?
        otherHeader : obj.searchattribute.value;
      if (!obj.searchattribute
            .validityTable
            .getAvailable(attribValue, obj.searchoperator.value))
        allValid = false;
    }
  }

  if (!allValid)
  {
    if (gPromptService)
      gPromptService.alert(window, gFilterBundle.getString("searchTermsInvalidTitle"),
                           gFilterBundle.getString("searchTermsInvalidMessage"));
    return false;
  }

  // before we go any further, validate each specified filter action, abort the save
  // if any of the actions is invalid...
  for (var index = 0; index < gFilterActionList.getRowCount(); index++)
  {
    var listItem = gFilterActionList.getItemAtIndex(index);
    if (!listItem.validateAction())
      return false;
  }
  
  // if we made it here, all of the actions are valid, so go ahead and save the filter

  if (!gFilter) 
  {
    gFilter = gFilterList.createFilter(filterName);
    isNewFilter = true;
    gFilter.enabled=true;
  } 
  else 
  {
    gFilter.filterName = filterName;
    //Prefilter is treated as a new filter.
    if (gPreFillName) 
    {
      isNewFilter = true;
      gFilter.enabled=true;
    }
    else 
      isNewFilter = false;
    
    gFilter.clearActionList();
  }

  // add each filteraction to the filter
  for (index = 0; index < gFilterActionList.getRowCount(); index++)
    gFilterActionList.getItemAtIndex(index).saveToFilter(gFilter);

  gFilter.filterType = gFilterType;
  saveSearchTerms(gFilter.searchTerms, gFilter);

  if (isNewFilter) 
  {
    // new filter - insert into gFilterList
    gFilterList.insertFilterAt(0, gFilter);
  }

  // success!
  return true;
}

function GetFirstSelectedMsgFolder()
{
  var selectedFolder = gActionTargetElement.getAttribute("uri");
  if (!selectedFolder)
    return null;

  var msgFolder = GetMsgFolderFromUri(selectedFolder, true);
  return msgFolder;
}

function SearchNewFolderOkCallback(name, uri)
{
  var msgFolder = GetMsgFolderFromUri(uri, true);
  var imapFolder = null;
  try
  {
    imapFolder = msgFolder.QueryInterface(Components.interfaces.nsIMsgImapMailFolder);
  }
  catch(ex) {}
  var mailSessionContractID = "@mozilla.org/messenger/services/session;1";
  if (imapFolder) //imapFolder creation is asynchronous.
  {
    if (!gMailSession)
      gMailSession = Components.classes[mailSessionContractID].getService(Components.interfaces.nsIMsgMailSession);
    try 
    {
      var nsIFolderListener = Components.interfaces.nsIFolderListener;
      var notifyFlags = nsIFolderListener.event;
      gMailSession.AddFolderListener(gFolderListener, notifyFlags);
    } 
    catch (ex) 
    {
      dump("Error adding to session: " +ex + "\n");
    }
  }

  var msgWindow = GetFilterEditorMsgWindow();

  if (imapFolder)
    SetBusyCursor(window, true);

  msgFolder.createSubfolder(name, msgWindow);
  
  if (!imapFolder)
  {
    var curFolder = uri+"/"+encodeURIComponent(name);
    SetFolderPicker(curFolder, gActionTargetElement.id);
  }
}

function UpdateAfterCustomHeaderChange()
{
  updateSearchAttributes();
}

//if you use msgWindow, please make sure that destructor gets called when you close the "window"
function GetFilterEditorMsgWindow()
{
  if (!gFilterEditorMsgWindow)
  {
    var msgWindowContractID = "@mozilla.org/messenger/msgwindow;1";
    var nsIMsgWindow = Components.interfaces.nsIMsgWindow;
    gFilterEditorMsgWindow = Components.classes[msgWindowContractID].createInstance(nsIMsgWindow);
    gFilterEditorMsgWindow.domWindow = window;
    gFilterEditorMsgWindow.rootDocShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL;
  }
  return gFilterEditorMsgWindow;
}

function SetBusyCursor(window, enable)
{
  // setCursor() is only available for chrome windows.
  // However one of our frames is the start page which 
  // is a non-chrome window, so check if this window has a
  // setCursor method
  if ("setCursor" in window) 
  {
    if (enable)
        window.setCursor("wait");
    else
        window.setCursor("auto");
  }
}

function doHelpButton()
{
  openHelp("mail-filters");
}

function getCustomActions()
{
  if (!gCustomActions)
  {
    gCustomActions = [];
    var filterService = Components.classes[
                        "@mozilla.org/messenger/services/filters;1"]
                        .getService(Components.interfaces.nsIMsgFilterService);

    var customActionsEnum = filterService.getCustomActions();
    while (customActionsEnum.hasMoreElements())
      gCustomActions.push(customActionsEnum.getNext().QueryInterface(
                           Components.interfaces.nsIMsgFilterCustomAction));
  }
}

function updateFilterType()
{
  gFilterType = determineFilterType();
  setFilterScope(gFilterType, gFilterList);

  // set valid actions
  var ruleActions = gFilterActionList.getElementsByAttribute('class', 'ruleaction');
  for (var i = 0; i < ruleActions.length; i++)
    ruleActions[i].mRuleActionType.hideInvalidActions();
}

function determineFilterType()
{
  /*
   * contextIndex = 0: checking mail
   *              = 1: manually run
   *              = 2: checking mail or manually run
   */
  let contextIndex = gFilterContext.selectedIndex;
  let filterType = Components.interfaces.nsMsgFilterType.None; // that is, 0
  if (contextIndex == 1) // manual only
  {
    filterType = Components.interfaces.nsMsgFilterType.Manual;
  }
  else // 0 or 2, checking mail is enabled
  {
    if (getScopeFromFilterList(gFilterList) ==
        Components.interfaces.nsMsgSearchScope.newsFilter)
      filterType = Components.interfaces.nsMsgFilterType.NewsRule;
    else
      filterType = Components.interfaces.nsMsgFilterType.InboxRule;

    if (contextIndex == 2)
      filterType |= Components.interfaces.nsMsgFilterType.Manual;
  }
  return filterType;
}

// Given a filter type, set the global search scope to the filter scope
function setFilterScope(aFilterType, aFilterList) 
{
  let filterScope = getFilterScope(getScopeFromFilterList(aFilterList),
                                   aFilterType, aFilterList);
  setSearchScope(filterScope);
}

//
// Given the base filter scope for a server, and the filter
// type, return the scope used for filter. This assumes a
// hierarchy of contexts, with incoming the most restrictive,
// followed by manual.
function getFilterScope(aServerFilterScope, aFilterType, aFilterList)
{
  let Ci = Components.interfaces;

  if (aFilterType & Ci.nsMsgFilterType.Incoming)
    return aServerFilterScope;

  if (aFilterType & Ci.nsMsgFilterType.Manual)
  {
    // local mail allows body and junk types
    if (aServerFilterScope == Ci.nsMsgSearchScope.offlineMailFilter)
      return Ci.nsMsgSearchScope.offlineMail;
    // IMAP and NEWS don't allow body
    return aServerFilterScope;
  }

  // We shouldn't get here
  dump("Invalid filter type in getFilterScope\n");
  return null;
}
