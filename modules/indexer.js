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

EXPORTED_SYMBOLS = ['GlodaIndexer'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gloda/modules/log4moz.js");

Cu.import("resource://gloda/modules/utils.js");
Cu.import("resource://gloda/modules/datastore.js");
Cu.import("resource://gloda/modules/gloda.js");

function range(begin, end) {
  for (let i = begin; i < end; ++i) {
    yield i;
  }
}

// FROM STEEL
/**
 * This function will take a variety of xpcom iterators designed for c++ and turn
 * them into a nice JavaScript style object that can be iterated using for...in
 *
 * Currently, we support the following types of xpcom iterators:
 *   nsISupportsArray
 *   nsIEnumerator
 *   nsISimpleEnumerator
 *
 *   @param aEnum  the enumerator to convert
 *   @param aIface (optional) an interface to QI each object to prior to returning
 *
 *   @note This does *not* return an Array object.  It returns an object that can
 *         be use in for...in contexts only.  To create such an array, use
 *         var array = [a for (a in fixIterator(xpcomEnumerator))];
 */
function fixIterator(aEnum, aIface) {
  let face = aIface || Ci.nsISupports;
  // Try to QI our object to each of the known iterator types.  If the QI does
  // not throw, assign our iteration function
  try {
    aEnum.QueryInterface(Ci.nsISupportsArray);
    let iter = function() {
      let count = aEnum.Count();
      for (let i = 0; i < count; i++)
        yield aEnum.GetElementAt(i).QueryInterface(face);
    }
    return { __iterator__: iter };
  } catch(ex) {}
  
  // Now try nsIEnumerator
  try {
    aEnum.QueryInterface(Ci.nsIEnumerator);
    let done = false;
    let iter = function() {
      while (!done) {
        try {
          //rets.push(aEnum.currentItem().QueryInterface(face));
          yield aEnum.currentItem().QueryInterface(face);
          aEnum.next();
        } catch(ex) {
          done = true;
        }
      }
    };

    return { __iterator__: iter };
  } catch(ex) {}
  
  // how about nsISimpleEnumerator? this one is nice and simple
  try {
    aEnum.QueryInterface(Ci.nsISimpleEnumerator);
    let iter = function () {
      while (aEnum.hasMoreElements())
        yield aEnum.getNext().QueryInterface(face);
    }
    return { __iterator__: iter };
  } catch(ex) {}
}

let GlodaIndexer = {
  _datastore: GlodaDatastore,
  _log: Log4Moz.Service.getLogger("gloda.indexer"),
  _msgwindow: null,
  _domWindow: null,

  _inited: false,
  init: function gloda_index_init(aDOMWindow, aMsgWindow) {
    if (this._inited)
      return;
    
    this._inited = true;
    
    this._domWindow = aDOMWindow;
    
    // topmostMsgWindow explodes for un-clear reasons if we have multiple
    //  windows open.  very sad.
    /*
    let mailSession = Cc["@mozilla.org/messenger/services/session;1"].
                        getService(Ci.nsIMsgMailSession);
    this._msgWindow = mailSession.topmostMsgWindow;
    */
    this._msgWindow = aMsgWindow;
  },

  /** Track whether indexing is active (we have timers in-flight). */
  _indexingActive: false,
  get indexing() { return this._indexingActive; },
  /** You can turn on indexing, but you can't turn it off! */
  set indexing(aShouldIndex) {
    if (!this._indexingActive && aShouldIndex) {
      this._indexingActive = true;
      this._domWindow.setTimeout(this._wrapIncrementalIndex, this._indexInterval, this);
    }  
  },
  
  /** The nsIMsgFolder we are indexing, or null if we aren't. */
  _indexingFolder: null,
  /** The iterator we are using to traverse _indexingFolder. */
  _indexingIterator: null,
  _indexingFolderCount: 0,
  _indexingFolderGoal: 0,
  _indexingMessageCount: 0,
  _indexingMessageGoal: 0,
  
  /**
   * A list of things yet to index.  Contents will be lists matching one of the
   *  following patterns:
   * - ['account', account object]
   * - ['folder', folder URI]
   * - ['message', delta type, message header, folder ID, message key,
   *      message ID]
   *   (we use folder ID instead of URI so that renames can't trick us)
   */
  _indexQueue: [],
  
  /**
   * The time interval, in milliseconds between performing indexing work.
   *  This may be altered by user session (in)activity.
   */ 
  _indexInterval: 100,
  /**
   * Number of indexing 'tokens' we are allowed to consume before yielding for
   *  each incremental pass.  Consider a single token equal to indexing a single
   *  medium-sized message.  This may be altered by user session (in)activity.
   */
  _indexTokens: 10,
  
  _indexListeners: [],
  /**
   * Add an indexing progress listener.  The listener will be notified of at
   *  least all major status changes (idle -> indexing, indexing -> idle), plus
   *  arbitrary progress updates during the indexing process.
   * If indexing is not active when the listener is added, a synthetic idle
   *  notification will be generated.
   *
   * @param aListener A listener function, taking arguments: status (string),
   *     folder name being indexed (string or null), current zero-based folder
   *     number being indexed (int), total number of folders to index (int),
   *     current message number being indexed in this folder (int), total number
   *     of messages in this folder to be indexed (int).
   */
  addListener: function gloda_index_addListener(aListener) {
    // should we weakify?
    if (this._indexListeners.indexOf(aListener) == -1)
      this._indexListeners.push(aListener);
    // if we aren't indexing, give them an idle indicator, otherwise they can
    //  just be happy when we hit the next actual status point.
    if (!this.indexing)
      aListener("Idle", null, 0, 1, 0, 1);
    return aListener;
  },
  removeListener: function gloda_index_removeListener(aListener) {
    let index = this._indexListeners.indexOf(aListener);
    if (index != -1)
      this._indexListeners(index, 1);
  },
  _notifyListeners: function gloda_index_notifyListeners(aStatus, aFolderName,
      aFolderIndex, aFoldersTotal, aMessageIndex, aMessagesTotal) {
    for (let iListener=this._indexListeners.length-1; iListener >= 0; 
         iListener--) {
      let listener = this._indexListeners[iListener];
      listener(aStatus, aFolderName, aFolderIndex, aFoldersTotal, aMessageIndex,
               aMessagesTotal);
    } 
  },
  
  _wrapIncrementalIndex: function gloda_index_wrapIncrementalIndex(aThis) {
    aThis.incrementalIndex();
  },
  
  incrementalIndex: function gloda_index_incrementalIndex() {
    this._log.debug("index wake-up!");
  
    GlodaDatastore._beginTransaction();
    try {
    
      for (let tokensLeft=this._indexTokens; tokensLeft > 0; tokensLeft--) {
        if (this._indexingFolder != null) {
          try {
            this._indexMessage(this._indexingIterator.next());
            this._indexingMessageCount++;
            
            if (this._indexingMessageCount % 50 == 1) {
              this._notifyListeners("Indexing: " +
                                    this._indexingFolder.prettiestName,
                                    this._indexingFolder.prettiestName,
                                    this._indexingFolderCount,
                                    this._indexingFolderGoal,
                                    this._indexingMessageCount,
                                    this._indexingMessageGoal);
              //this._log.debug("indexed " + this._indexingCount + " in " +
              //                this._indexingFolder.prettiestName);
            }
          }
          catch (ex) {
            this._log.debug("Done with indexing folder because: " + ex);
            this._indexingFolder = null;
            this._indexingIterator = null;
          }
        }
        else if (this._indexQueue.length) {
          let item = this._indexQueue.shift();
          let itemType = item[0];
          let actionType = item[1];
          
          // Index an account.  (can't actually happen right now)
          if ((itemType == "account") && (actionType > 1)) {
            this.indexAccount(item[1]);
          }
          // Index an added folder (new, or just re-scanning)
          else if ((itemType == "folder") && (actionType > 0)) {
            let folderID = item[2];
            let folderURI = GlodaDatastore._mapFolderID(folderID);
            
            this._log.debug("Folder URI: " + folderURI);
  
            let rdfService = Cc['@mozilla.org/rdf/rdf-service;1'].
                             getService(Ci.nsIRDFService);
            let folder = rdfService.GetResource(folderURI);
            if (folder instanceof Ci.nsIMsgFolder) {
              this._indexingFolder = folder;
  
              this._log.debug("Starting indexing of folder: " +
                              folder.prettiestName);
  
              // The msf may need to be created or otherwise updated, updateFolder will
              //  do this for us.  (GetNewMessages would also do it, but we would be
              //  triggering new message retrieval in that case, which we don't actually
              //  desire.
              // TODO: handle password-protected local cache potentially triggering a
              //  password prompt here...
              try {
                //this._indexingFolder.updateFolder(this._msgWindow);
              
                let msgDatabase = folder.getMsgDatabase(this._msgWindow);
                this._indexingIterator = Iterator(fixIterator(
                                           //folder.getMessages(this._msgWindow),
                                           msgDatabase.EnumerateMessages(),
                                           Ci.nsIMsgDBHdr));
                this._indexingFolderCount++;
                this._indexingMessageCount = 0;
                this._indexingMessageGoal = folder.getTotalMessages(false); 
              }
              catch (ex) {
                this._log.error("Problem indexing folder: " +
                                folder.prettiestName + ", skipping.");
                this._log.error("Error was: " + ex);
                this._indexingFolder = null;
                this._indexingIterator = null;
              }
            }
          }
          // Delete a folder that has gone away
          // ["folder", -1, folder ID]
          else if ((itemType == "folder") && (actionType < 0)) {
            let folderID = item[2];
            // we simply convert the messages in the folder to message ids
            //  which we re-queue.
            let messageIDs = GlodaDatastore.getMessageIDsByFolderID(folderID);
            let delMsgsQueue = [["message", -1, msgId] for each
                                (msgId in messageIDs)];
            this._indexingFolderCount++;
            this._indexingMessageCount = 0;
            this._indexingMessageGoal = delMsgsQueue.length;
          }
          // Index a newly added message
          // ["message", 1, folder ID, message key]
          else if ((itemType == "message") && (actionType > 0)) {
            let folderID = item[2];
            let messageKey = item[3];
          }
          // Index a moved message (sadly basically adding for now)
          // ["message", 0, folder ID, header message-id]
          else if ((itemType == "message") && (actionType === 0)) {
          
          }
          // Delete a message that has gone away
          // ["message", -1, message database ID]
          else if ((itemType == "message") && (actionType < 0)) {
            let messageID = item[2];
            let message = GlodaDatastore.getMessageByID(messageID);
            if (message !== null)
              this._deleteMessage(message);
          }
        }
        else {
          this._log.info("Done indexing, disabling timer renewal.");
          this._indexingActive = false;
          this._indexingFolderCount = 0;
          this._indexingFolderGoal = 0;
          this._indexingMessageCount = 0;
          this._indexingMessageGoal = 0;
          this._notifyListeners("Idle", null, 0, 1, 0, 1);
          break;
        }
      }
    
    }
    finally {
      GlodaDatastore._commitTransaction();
    
      if (this.indexing)
        this._domWindow.setTimeout(this._wrapIncrementalIndex, this._indexInterval,
                                this);
    }
  },

  indexEverything: function glodaIndexEverything() {
    this._log.info("Queueing all accounts for indexing.");
    let msgAccountManager = Cc["@mozilla.org/messenger/account-manager;1"].
                            getService(Ci.nsIMsgAccountManager);
    
    GlodaDatastore._beginTransaction();
    let sideEffects = [this.indexAccount(account) for each
                       (account in fixIterator(msgAccountManager.accounts,
                                               Ci.nsIMsgAccount))];
    GlodaDatastore._commitTransaction();
  },

  indexAccount: function glodaIndexAccount(aAccount) {
    let rootFolder = aAccount.incomingServer.rootFolder;
    if (rootFolder instanceof Ci.nsIMsgFolder) {
      this._log.info("Queueing account folders for indexing: " + aAccount.key);

      GlodaDatastore._beginTransaction();
      let folders =
              [["folder", 1, GlodaDatastore._mapFolderURI(folder.URI)] for each
              (folder in fixIterator(rootFolder.subFolders, Ci.nsIMsgFolder))];
      GlodaDatastore._commitTransaction();
      
      this._indexingFolderGoal += folders.length;
      this._indexQueue = this._indexQueue.concat(folders);
      this.indexing = true;
    }
    else {
      this._log.info("Skipping Account, root folder not nsIMsgFolder");
    }
  },

  indexFolder: function glodaIndexFolder(aFolder) {
    this._log.info("Queue-ing folder for indexing: " + aFolder.prettiestName);
    
    this._indexQueue.push(["folder", 1,
                          GlodaDatastore._mapFolderURI(aFolder.URI)]);
    this.indexing = true;
  },

  
  /* *********** Event Processing *********** */

  /* ***** Folder Changes ***** */  
  /**
   * All additions and removals are queued for processing.  Indexing messages
   *  is potentially phenomenally expensive, and deletion can still be
   *  relatively expensive due to our need to delete the message, its
   *  attributes, and all attributes that reference it.  Additionally,
   *  attribute deletion costs are higher than attribute look-up because
   *  there is the actual row plus its 3 indices, and our covering indices are
   *  no help there.
   *  
   */
  _msgFolderListener: {
    indexer: null,
    
    /**
     * Handle a new-to-thunderbird message, meaning a newly fetched message
     *  (local folder) one revealed by synching with the server (IMAP).  Because
     *  the new-to-IMAP case requires Thunderbird to have opened the folder,
     *  we either need to depend on MailNews to be aggressive about looking
     *  for new messages in folders or try and do it ourselves.  For now, we
     *  leave it up to MailNews proper.
     *
     * For the time being, we post the message header as received to our
     *  indexing queue.  Depending on experience, it may be more suitable to
     *  try and index the message immediately, or hold onto a less specific
     *  form of message information than the nsIMsgDBHdr.  (If we were to
     *  process immediately, it might appropriate to consider having a
     *  transaction open that is commited by timer/sufficient activity, since it
     *  is conceivable we will see a number of these events in fairly rapid
     *  succession.)
     */
    msgAdded: function gloda_indexer_msgAdded(aMsgHdr) {
      this.indexer._indexQueue.push(
        ["message", 1,
         GlodaDatastore._mapFolderURI(aMsgHdr.folder.URI),
         aMsgHdr.messageKey]);
      this.indexer.indexing = true; 
    },
    
    /**
     * Handle real, actual deletion (move to trash and IMAP deletion model
     *  don't count; we only see the deletion here when it becomes forever,
     *  or rather _just before_ it becomes forever.  Because the header is
     *  going away, we need to either process things immediately or extract the
     *  information required to purge it later without the header.
     *
     * We opt to process all of the headers immediately, inside a transaction.
     *  We do this because deletions may actually be a batch deletion of many,
     *  many messages, which could be a lot to queue
     */
    msgsDeleted: function gloda_indexer_msgsDeleted(aMsgHdrs) {
      // TODO progress indicator for here
      for (let iMsgHdr=0; iMsgHdr < aMsgHdrs.length; iMsgHdr++) {
        let msgHdr = aMsgHdrs.queryElementAt(iMsgHdr, Ci.nsIMsgDBHdr);
        this.indexer._indexQueue.push(["message", -1, msgHdr]);
      }
      this.indexer.indexing = true;
    },
    
    /**
     * Process a move or copy.  Copies are treated as additions and accordingly
     *  queued for subsequent indexing.  Moves are annoying in that, in theory,
     *  we should be able to just alter the location information and be done
     *  with it.  Unfortunately, we have no clue what the messageKey is for
     *  the moved message until we go looking.  For now, we "simply" move the
     *  messages into the destination folder, wiping their message keys, and
     *  scheduling them all for re-indexing based on their message ids, which
     *  may catch some same-folder duplicates.
     *
     * @TODO Handle the move case better, avoiding a full reindexing of the
     *     messages when possible.  (In fact, the _indexMessage method basically
     *     has enough information to try and give this a whirl, but it's not
     *     foolproof, hence not done and this issue yet to-do.  
     */
    msgsMoveCopyCompleted: function gloda_indexer_msgsMoveCopyCompleted(aMove,
                             aSrcMsgHdrs, aDestFolder) {
      if (aMove) {
        let srcFolder = aSrcMsgHdrs.queryElementAt(0, Ci.nsIMsgDBHdr).folder;
        let messageKeys = [msgHdr.messageKey for each
                           (msgHdr in fixIterator(aSrcMsgHdrs, Ci.nsIMsgDBHdr)];
        // quickly move them to the right folder, zeroing their message keys
        GlodaDatastore.updateMessageFoldersByKeyPurging(srcFolder.URI,
                                                        messageKeys,
                                                        aDestFolder.URI);
        // and now let us queue the re-indexings...
        for (let iSrcMsgHdr=0; iSrcMsgHdrs < aSrcMsgHdrs.length; iSrcMsgHdr++) {
          let msgHdr = aSrcMsgHdrs.queryElementAt(iSrcMsgHdr, Ci.nsIMsgDBHdr);
          this.indexer._indexQueue.push(["message", 0,
            GlodaDatastore._mapFolderURI(msgHdr.folder.URI), msgHdr.messageId]);
        }
        // TODO progress indicator for here, also indexing flag        
      }
      else {
        // TODO progress indicator for here, also indexing flag
        for (let iSrcMsgHdr=0; iSrcMsgHdrs < aSrcMsgHdrs.length; iSrcMsgHdr++) {
          let msgHdr = aSrcMsgHdrs.queryElementAt(iSrcMsgHdr, Ci.nsIMsgDBHdr);
          this.indexer._indexQueue.push(["message", 1,
            GlodaDatastore._mapFolderURI(msgHdr.folder.URI),
            msgHdr.messageKey]);
        }
      }
    },
    
    /**
     * Handles folder no-longer-exists-ence.  We want to delete all messages
     *  located in the folder.
     */
    folderDeleted: function gloda_indexer_folderDeleted(aFolder) {
      this._indexingFolderGoal++;
      this.indexer._indexQueue.push(["folder", -1,
        GlodaDatastore._mapFolderURI(aFolder.URI)]);
      this.indexing = true;
    },
    
    /**
     * Handle a folder being copied.  I do not believe the MailNews code is
     *  capable of generating a case where aMove is true, but just in case we'll
     *  dispatch to our sibling method, folderRenamed.
     *
     * Folder copying is conceptually all kinds of annoying (I mean, why would
     *  you really need to duplicate all those messages?) but is easily dealt
     *  with by queueing the destination folder for initial indexing. 
     */
    folderMoveCopyCompleted: function gloda_indexer_folderMoveCopyCompleted(
                               aMove, aSrcFolder, aDestFolder) {
      if (aMove) {
        return this.folderRenamed(aSrcFolder, aDestFolder);
      }
      this._indexingFolderGoal++;
      this.indexer._indexQueue.push(["folder", 1,
        this._mapFolderURI(aDestFolder.URI)]);
      this.indexer.indexing = true;
    },
    
    /**
     * We just need to update the URI <-> ID maps and the row in the database,
     *  all of which is actually done by the datastore for us.
     */
    folderRenamed: function gloda_indexer_folderRenamed(aOrigFolder,
                                                        aNewFolder) {
      GlodaDatastore.renameFolder(aOrigFolder.URI, aNewFolder.URI);
    },
    
    itemEvent: function gloda_indexer_itemEvent(aItem, aEvent, aData) {
      // nop.  this is an expansion method on the part of the interface and has
      //  no known events that we need to handle.
    },
  },
  
  /* ***** Rebuilding / Reindexing ***** */
  // TODO: implement a folder observer doodad to handle rebuilding / reindexing
  /**
   * Allow us to invalidate an outstanding folder traversal because the
   *  underlying database is going away.  We use other means for detecting 
   *  modifications of the message (labeling, marked (un)read, starred, etc.)
   *
   * This is an nsIDBChangeListener listening to an nsIDBChangeAnnouncer.  To
   *  add ourselves, we get us a nice nsMsgDatabase, query it to the announcer,
   *  then call AddListener.
   */
  _databaseAnnouncerListener: {
    onAnnouncerGoingAway: function gloda_indexer_dbGoingAway(
                                         aDBChangeAnnouncer) {
      // TODO: work
    },
    
    onHdrChange: function(aHdrChanged, aOldFlags, aNewFlags, aInstigator) {},
    onHdrDeleted: function(aHdrChanged, aParentKey, aFlags, aInstigator) {},
    onHdrAdded: function(aHdrChanged, aParentKey, aFlags, aInstigator) {},
    onParentChanged: function(aKeyChanged, aOldParent, aNewParent, 
                              aInstigator) {},
    onReadChanged: function(aInstigator) {},
    onJunkScoreChanged: function(aInstigator) {}
  },
  
  /* ***** MailNews Shutdown ***** */
  // TODO: implement a shutdown/pre-shutdown listener that attempts to either
  //  drain the indexing queue or persist it.
  /**
   * Shutdown task.
   *
   * We implement nsIMsgShutdownTask, served up by nsIMsgShutdownService.  We
   *  offer our services by registering ourselves as a "msg-shutdown" observer
   *  with the observer service.
   */
  _shutdownTask: {
    indexer: null,
    
    get needsToRunTask {
      return this.indexer.indexing;
    },
    
    /**
     * So we could either go all out finishing our indexing, or write down what
     *  we need to index next time around.  For now, we opt to complete our
     *  indexing since it greatly simplifies our lives, but it probably would
     *  be friendly to simply persist our state.
     *
     * XXX: so we can either return false and be done with it, or return true
     *  and provide the stop running notification.
     * We call aUrlListener's OnStopRunningUrl(null, NS_OK) when we are done,
     *  and can provide status updates by calling the shutdown service
     *  (nsIMsgShutdownService)'s setStatusText method. 
     */
    doShutdownTask: function gloda_indexer_doShutdownTask(aUrlListener,
                                                          aMsgWingow) {
      this.indexer._onStopIndexingUrlListener = aUrlListener;
      
      
      
      return true;
    },
    
    getCurrentTaskName: function gloda_indexer_getCurrentTaskName() {
      return this.indexer.strBundle.getString("shutdownTaskName");
    },
  }, 
  
  /**
   * Attempt to extract the original subject from a message.  For replies, this
   *  means either taking off the 're[#]:' (or variant, including other language
   *  variants), or in a Microsoft specific-ism, from the Thread-Topic header.
   * Since we are using the nsIMsgDBHdr's subject field, this is already done
   *  for us, and we don't actually need to do any extra work.  Hooray!
   */
  _extractOriginalSubject: function glodaIndexExtractOriginalSubject(aMsgHdr) {
    return aMsgHdr.mime2DecodedSubject;
  },
  
  _indexMessage: function gloda_index_indexMessage(aMsgHdr) {
    // -- Find/create the conversation the message belongs to.
    // Our invariant is that all messages that exist in the database belong to
    //  a conversation.
    
    // - See if any of the ancestors exist and have a conversationID...
    // (references are ordered from old [0] to new [n-1])
    let references = [aMsgHdr.getStringReference(i) for each
                      (i in range(0, aMsgHdr.numReferences))];
    // also see if we already know about the message...
    references.push(aMsgHdr.messageId);
    // (ancestorLists has a direct correspondence to the message ids)
    let ancestorLists = this._datastore.getMessagesByMessageID(references);
    // pull our current message lookup results off
    references.pop();
    let candidateCurMsgs = ancestorLists.pop();
    
    let conversationID = null;
    
    // (walk from closest to furthest ancestor)
    for (let iAncestor=ancestorLists.length-1; iAncestor >= 0; --iAncestor) {
      let ancestorList = ancestorLists[iAncestor];
      
      if (ancestorList.length > 0) {
        // we only care about the first instance of the message because we are
        //  able to guarantee the invariant that all messages with the same
        //  message id belong to the same conversation. 
        let ancestor = ancestorList[0];
        if (conversationID === null)
          conversationID = ancestor.conversationID;
        else if (conversationID != ancestor.conversationID)
          this._log.error("Inconsistency in conversations invariant on " +
                          ancestor.messageID + ".  It has conv id " +
                          ancestor.conversationID + " but expected " + 
                          conversationID);
      }
    }
    
    let conversation = null;
    if (conversationID === null) {
      // (the create method could issue the id, making the call return
      //  without waiting for the database...)
      conversation = this._datastore.createConversation(
          this._extractOriginalSubject(aMsgHdr), null, null);
      conversationID = conversation.id;
    }
    
    // Walk from furthest to closest ancestor, creating the ancestors that don't
    //  exist. (This is possible if previous messages that were consumed in this
    //  thread only had an in-reply-to or for some reason did not otherwise
    //  provide the full references chain.)
    for (let iAncestor=0; iAncestor < ancestorLists.length; ++iAncestor) {
      let ancestorList = ancestorLists[iAncestor];
      
      if (ancestorList.length == 0) {
        this._log.debug("creating message with: null, " + conversationID +
                        ", " + references[iAncestor] +
                        ", null.");
        let ancestor = this._datastore.createMessage(null, null, // ghost
                                                     conversationID,
                                                     references[iAncestor],
                                                     null); // no snippet
        ancestorLists[iAncestor].push(ancestor);
      }
    }
    // now all our ancestors exist, though they may be ghost-like...
    
    // find if there's a ghost version of our message or we already have indexed
    //  this message.
    let curMsg = null;
    for (let iCurCand=0; iCurCand < candidateCurMsgs.length; iCurCand++) {
      let candMsg = candidateCurMsgs[iCurCand];
      
      // if we are in the same folder and we have the same message key, we
      //  are definitely the same, stop looking.
      // if we are in the same folder and the candidate message has a null
      //  message key, we treat it as our best option unless we find an exact
      //  key match. (this would happen because the 'move' notification case
      //  has to deal with not knowing the target message key.  this case
      //  will hopefully be somewhat improved in the future to not go through
      //  this path which mandates re-indexing of the message in its entirety.)
      // if we are in the same folder and the candidate message's underlying
      //  message no longer exists/matches, we'll assume we are the same but
      //  were betrayed by a re-indexing or something, but we have to make sure
      //  a perfect match doesn't turn up.
      if (candMsg.folderURI === aMsgHdr.folder.URI) {
        if ((candMsg.messageKey === aMsgHdr.messageKey) || 
            (candMsg.messageKey === null)) {
          curMsg = candMsg;
          break;
        }
        if (candMsg.messageKey === null)
          curMsg = candMsg;
        else if ((curMsg === null) && (candMsg.folderMessage === null))
          curMsg = candMsg;
      }
      // our choice of last resort, but still okay, is a ghost message
      else if ((curMsg === null) && (candMsg.folderID === null)) {
        curMsg = candMsg;
      }
    }
    
    if (curMsg === null) {
      curMsg = this._datastore.createMessage(aMsgHdr.folder.URI,
                                             aMsgHdr.messageKey,                
                                             conversationID,
                                             aMsgHdr.messageId,
                                             null); // no snippet
     }
     else {
        curMsg.folderURI = aMsgHdr.folder.URI;
        curMsg.messageKey = aMsgHdr.messageKey;
        this._datastore.updateMessage(curMsg);
     }
     
     Gloda.processMessage(curMsg, aMsgHdr);
  },
  
  /**
   * Wipe a message out of existence from our index.  This is slightly more
   *  tricky than one would first expect because there are potentially
   *  attributes not immediately associated with this message that reference
   *  the message.  Not only that, but deletion of messages may leave a
   *  conversation posessing only ghost messages, which we don't want, so we
   *  need to nuke the moot conversation and its moot ghost messages.
   * For now, we are actually punting on that trickiness, and the exact
   *  nuances aren't defined yet because we have not decided whether to store
   *  such attributes redundantly.  For example, if we have subject-pred-object,
   *  we could actually store this as attributes (subject, id, object) and
   *  (object, id, subject).  In such a case, we could query on (subject, *)
   *  and use the results to delete the (object, id, subject) case.  If we
   *  don't redundantly store attributes, we can deal with the problem by
   *  collecting up all the attributes that accept a message as their object
   *  type and issuing a delete against that.  For example, delete (*, [1,2,3],
   *  message id).
   * (We are punting because we haven't implemented support for generating
   *  attributes like that yet.)
   *
   * @TODO: implement deletion of attributes that reference (deleted) messages
   */
  _deleteMessage: function gloda_index_deleteMessage(aMessage) {
    // -- delete our attributes
    // delete the message's attributes (if we implement the cascade delete, that
    //  could do the honors for us... right now we define the trigger in our
    //  schema but the back-end ignores it)
    aMessage._datastore.clearMessageAttributes(aMessage);
    
    // -- delete our message or ghost us, and maybe nuke the whole conversation
    // look at the other messages in the conversation.
    let conversationMsgs = aMessage._datastore.getMessagesByConversationID(
                             aMessage.conversationID, true);
    let ghosts = [];
    let twinMessage = null;
    for (let iMsg=0; iMsg < conversationMsgs.length; iMsg++) {
      let convMsg = conversationMsgs[iMsg];
      
      // ignore our message
      if (convMsg.id == aMessage.id)
        continue;
      
      if (convMsg.folderID !== null) {
        if (convMsg.headerMessageID == aMessage.headerMessageID) {
          twinMessage = convMsg;
        }
      }
      else {
        ghosts.push(convMsg);
      }
    }
    
    // is everyone else a ghost? (note that conversationMsgs includes us, but
    //  ghosts cannot)
    if ((conversationsMsgs.length - 1) == ghosts.length) {
      // obliterate the conversation including aMessage.
      // since everyone else is a ghost they have no attributes.  however, the
      //  conversation may some day have attributes targeted against it, so it
      //  gets a helper.
      this._deleteConversationOfMessage(aMessage);
      aMessage._nuke();
    }
    else { // there is at least one real message out there, so the only q is...
      // do we have a twin (so it's okay to delete us) or do we become a ghost?
      if (twinMessage !== null) { // just delete us
        aMessage._datastore.deleteMessageByID(aMessage.id);
        aMesssage._nuke();
      }
      else { // ghost us
        aMessage._ghost();
        aMessage._datastore.updateMessage(aMessage);
      }
    }
  },
  
  /**
   * Delete an entire conversation, using the passed-in message which must be
   *  the last non-ghost in the conversation and have its attributes all
   *  deleted.  This function issues the batch delete of all the ghosts (and the
   *  message), and in the future will take care to nuke any attributes
   *  referencing the conversation.
   */
  _deleteConversationOfMessage:
      function gloda_index_deleteConversationOfMessage(aMessage) {
    aMessage._datastore.deleteMessagesByConversationID(aMessage.conversationID);
    aMessage._datastore.deleteConversationByID(aMessage.conversationID);
  },
};
