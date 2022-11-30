/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from mail3PaneWindowCommands.js */
/* import-globals-from mailContextMenus.js */
/* import-globals-from mailWindow.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messageDisplay.js */
/* import-globals-from msgMail3PaneWindow.js */

XPCOMUtils.defineLazyModuleGetters(this, {
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  GlodaSyntheticView: "resource:///modules/gloda/GlodaSyntheticView.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MsgHdrSyntheticView: "resource:///modules/MsgHdrSyntheticView.jsm",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
});

/**
 * Displays message "folder"s, mail "message"s, and "glodaList" results.  The
 *  commonality is that they all use the "mailContent" panel's folder tree,
 *  thread tree, and message pane objects.  This happens for historical reasons,
 *  likely involving the fact that prior to the introduction of this
 *  abstraction, everything was always stored in global objects.  For the 3.0
 *  release cycle we considered avoiding this 'multiplexed' style of operation
 *  but decided against moving to making each tab be independent because of
 *  presumed complexity.
 *
 * The tab info objects (as tabmail's currentTabInfo/tabInfo fields contain)
 *  have the following attributes specific to our implementation:
 *
 * @property {string} uriToOpen
 * @property {nsIMsgDBView} dbView The database view to use with the thread tree
 *     when this tab is displayed.  The value will be assigned to the global
 *     gDBView in the process.
 * @property {nsIMessenger} messenger Used to preserve "messenger" global value.
 *     The messenger object is the keeper of the 'undo' state and navigation
 *     history, which is why we do this.
 *
 * @property {nsIMsgDBHdr} hdr In "message" mode, the header of the message
 *     being displayed.
 * @property {nsIMsgSearchSession} searchSession Used to preserve gSearchSession
 *     global value.
 *
 */
var mailTabType = {
  name: "mail",
  panelId: "mailContent",
  modes: {
    /**
     * The folder view displays the contents of an nsIMsgDBFolder, with the
     *  folder pane (potentially), thread pane (always), and message pane
     *  (potentially) displayed.
     *
     * The actual nsMsgDBView can be any of the following types of things:
     *  - A single folder.
     *    - A quicksearch on a single folder.
     *  - A virtual folder potentially containing messages from multiple
     *    folders. (eShowVirtualFolderResults)
     */
    folder: {
      isDefault: !Services.prefs.getBoolPref("mail.useNewMailTabs"),
      type: "folder",
      // The set of panes that are legal to be displayed in this mode
      legalPanes: {
        folder: true,
        thread: true,
        message: true,
      },
      // The set of panes that are legal when we are showing account central
      accountCentralLegalPanes: {
        folder: true,
        accountCentral: true,
        message: false,
      },
      openFirstTab(aTab) {
        this.openTab(aTab, true, new MessagePaneDisplayWidget(), true);
        // persistence and restoreTab wants to know if we are the magic first tab
        aTab.firstTab = true;
        aTab.folderDisplay.makeActive();

        // By reassigning this here, we fix the find bar (bug 1562677).
        document.getElementById(
          "FindToolbar"
        ).browser = document.getElementById("messagepane");
      },
      /**
       * @param [aArgs.folder] The nsIMsgFolder to display.
       * @param [aArgs.msgHdr] Optional message header to display.
       * @param [aArgs.folderPaneVisible] Whether the folder pane should be
       *            visible. If this isn't specified, the current or first tab's
       *            current state is used.
       * @param [aArgs.messagePaneVisible] Whether the message pane should be
       *            visible. If this isn't specified, the current or first tab's
       *            current state is used.
       * @param [aArgs.forceSelectMessage] Whether we should consider dropping
       *            filters to select the message. This has no effect if
       *            aArgs.msgHdr isn't specified. Defaults to false.
       */
      openTab(aTab, aArgs) {
        // persistence and restoreTab wants to know if we are the magic first tab
        aTab.firstTab = false;

        // Get a tab that we can initialize our user preferences from.
        // (We don't want to assume that our immediate predecessor was a
        //  "folder" tab.)
        let modelTab = document
          .getElementById("tabmail")
          .getTabInfoForCurrentOrFirstModeInstance(aTab.mode);

        // - figure out whether to show the folder pane
        let folderPaneShouldBeVisible;
        if ("folderPaneVisible" in aArgs) {
          // Explicitly told to us.
          folderPaneShouldBeVisible = aArgs.folderPaneVisible;
        } else if (modelTab) {
          // Inherit from the previous tab (if we've got one).
          folderPaneShouldBeVisible = modelTab.folderDisplay.folderPaneVisible;
        } else {
          // Who doesn't love a folder pane?
          folderPaneShouldBeVisible = true;
        }

        // - figure out whether to show the message pane
        let messagePaneShouldBeVisible;
        if ("messagePaneVisible" in aArgs) {
          // Explicitly told to us?
          messagePaneShouldBeVisible = aArgs.messagePaneVisible;
        } else if (modelTab) {
          // Inherit from the previous tab (if we've got one).
          messagePaneShouldBeVisible = modelTab.messageDisplay.visible;
        } else {
          // Who doesn't love a message pane?
          messagePaneShouldBeVisible = true;
        }

        this.openTab(
          aTab,
          false,
          new MessagePaneDisplayWidget(messagePaneShouldBeVisible),
          folderPaneShouldBeVisible
        );

        let background = "background" in aArgs && aArgs.background;
        let msgHdr = "msgHdr" in aArgs && aArgs.msgHdr;
        let forceSelectMessage =
          "forceSelectMessage" in aArgs && aArgs.forceSelectMessage;

        if (msgHdr) {
          // Tell the folder display that a selectMessage is coming up, so that
          // we don't generate double message loads
          aTab.folderDisplay.selectMessageComingUp();
        }

        if (!background) {
          // Activate the folder display
          aTab.folderDisplay.makeActive();

          // HACK: Since we've switched away from the tab, we need to bring
          // back the real selection before selecting the folder, so do that
          RestoreSelectionWithoutContentLoad(
            document.getElementById("folderTree")
          );
        }

        aTab.folderDisplay.show(aArgs.folder);
        if (msgHdr) {
          aTab.folderDisplay.selectMessage(msgHdr, forceSelectMessage);
        }

        if (!background && aArgs.folder) {
          // This only makes sure the selection in the folder pane is correct --
          // the actual displaying is handled by the show() call above. This
          // also means that we don't have to bother about making
          // gFolderTreeView believe that a selection change has happened.
          gFolderTreeView.selectFolder(aArgs.folder);
        }

        aTab.mode.onTitleChanged.call(this, aTab, aTab.tabNode);
      },
      persistTab(aTab) {
        try {
          if (!aTab.folderDisplay.displayedFolder) {
            return null;
          }
          let retval = {
            folderURI: aTab.folderDisplay.displayedFolder.URI,
            // if the folder pane is active, then we need to look at
            // whether the box is collapsed
            folderPaneVisible: aTab.folderDisplay.folderPaneVisible,
            messagePaneVisible: aTab.messageDisplay.visible,
            firstTab: aTab.firstTab,
          };
          return retval;
        } catch (e) {
          console.error(e);
          return null;
        }
      },
      restoreTab(aTabmail, aPersistedState) {
        try {
          let folder = MailUtils.getExistingFolder(aPersistedState.folderURI);
          // if the folder no longer exists, we can't restore the tab
          if (folder) {
            let folderPaneVisible =
              "folderPaneVisible" in aPersistedState
                ? aPersistedState.folderPaneVisible
                : true;
            // If we are talking about the first tab, it already exists and we
            //  should poke it.  We are assuming it is the currently displayed
            //  tab because we are privvy to the implementation details and know
            //  it to be true.
            if (aPersistedState.firstTab) {
              // Poke the folder pane box and splitter
              document.getElementById(
                "folderPaneBox"
              ).collapsed = !folderPaneVisible;
              document
                .getElementById("folderpane_splitter")
                .setAttribute(
                  "state",
                  folderPaneVisible ? "open" : "collapsed"
                );

              if (
                gMessageDisplay.visible != aPersistedState.messagePaneVisible
              ) {
                MsgToggleMessagePane();
                // For reasons that are not immediately obvious, sometimes the
                //  message display is not active at this time.  In that case, we
                //  need to explicitly set the _visible value because otherwise it
                //  misses out on the toggle event.
                if (!gMessageDisplay._active) {
                  gMessageDisplay._visible = aPersistedState.messagePaneVisible;
                }
              }

              if (
                !(
                  "dontRestoreFirstTab" in aPersistedState &&
                  aPersistedState.dontRestoreFirstTab
                )
              ) {
                gFolderTreeView.selectFolder(folder);
              }

              // We need to manually trigger the tab monitor restore trigger
              // for this tab.  In theory this should be in tabmail, but the
              // special nature of the first tab will last exactly long as this
              // implementation right here so it does not particularly matter
              // and is a bit more honest, if ugly, to do it here.
              let tabmail = document.getElementById("tabmail");
              let restoreState = tabmail._restoringTabState;
              let tab = tabmail.tabInfo[0];
              for (let tabMonitor of tabmail.tabMonitors) {
                if (
                  "onTabRestored" in tabMonitor &&
                  tabMonitor.monitorName in restoreState.ext
                ) {
                  tabMonitor.onTabRestored(
                    tab,
                    restoreState.ext[tabMonitor.monitorName],
                    true
                  );
                }
              }
            } else {
              let tabArgs = {
                folder,
                folderPaneVisible,
                messagePaneVisible: aPersistedState.messagePaneVisible,
                background: true,
              };
              aTabmail.openTab("folder", tabArgs);
            }
          }
        } catch (e) {
          console.error(e);
        }
      },
      onTitleChanged(aTab, aTabNode) {
        if (!aTab.folderDisplay || !aTab.folderDisplay.displayedFolder) {
          // Show "Home" as title when there is no account.
          aTab.title = document.documentElement.getAttribute("defaultTabTitle");
          return;
        }
        // The user may have changed folders, triggering our onTitleChanged
        // callback.
        let folder = aTab.folderDisplay.displayedFolder;
        aTab.title = folder.prettyName;
        if (!folder.isServer && this._getNumberOfRealAccounts() > 1) {
          aTab.title += " - " + folder.server.prettyName;
        }

        // Update the appropriate attributes on the tab.
        let specialFolderStr = FolderUtils.getSpecialFolderString(folder);
        let feedUrls = FeedUtils.getFeedUrlsInFolder(folder);

        if (
          folder.server.type == "rss" &&
          !folder.isServer &&
          feedUrls &&
          specialFolderStr == "none"
        ) {
          // NOTE: The rss feed favicon is not currently exposed to the
          // WebExtension tabs API. To do so, use MozTabmail setTabFavIcon
          // method instead.
          let fallbackIcon =
            "chrome://messenger/skin/icons/new/compact/folder-rss.svg";
          let icon = gFolderTreeView.getFolderCacheProperty(folder, "favicon");
          if (icon !== null) {
            aTabNode.setIcon(icon, fallbackIcon);
            return;
          }
          // If we have a background tab, or the first tab on startup, the
          // favicon is unlikely to be cached yet.
          FeedUtils.getFavicon(folder, null, null, window, favicon => {
            aTabNode.setIcon(favicon, fallbackIcon);

            // Cache it for folderpane.
            gFolderTreeView.setFolderCacheProperty(folder, "favicon", favicon);
            gFolderTreeView.clearFolderCacheProperty(folder, "properties");
            let row = gFolderTreeView.getIndexOfFolder(folder);
            gFolderTreeView._tree.invalidateRow(row);
          });
          return;
        }

        aTabNode.setIcon(FolderUtils.getFolderIcon(folder));
      },
      getBrowser(aTab) {
        // If we are currently a thread summary, we want to select the multi
        // message browser rather than the message pane.
        return gMessageDisplay.singleMessageDisplay
          ? document.getElementById("messagepane")
          : document.getElementById("multimessage");
      },
    },
    /**
     * The message view displays a single message.  In this view, the folder
     *  pane and thread pane are forced hidden and only the message pane is
     *  displayed.
     */
    message: {
      type: "message",
      // The set of panes that are legal to be displayed in this mode
      legalPanes: {
        folder: false,
        thread: false,
        message: true,
      },
      openTab(aTab, aArgs) {
        aTab.tabNode.setIcon(
          "chrome://messenger/skin/icons/new/compact/draft.svg"
        );
        this.openTab(aTab, false, new MessageTabDisplayWidget(), false);

        let viewWrapperToClone =
          "viewWrapperToClone" in aArgs && aArgs.viewWrapperToClone;
        let background = "background" in aArgs && aArgs.background;

        if (viewWrapperToClone) {
          // The original view must have a collapsed group header thread's
          // message(s) found in expand mode before it's cloned, for any to
          // be selected.
          if (viewWrapperToClone.showGroupedBySort) {
            viewWrapperToClone.dbView.findIndexOfMsgHdr(aArgs.msgHdr, true);
          }

          aTab.folderDisplay.cloneView(viewWrapperToClone);
        } else {
          // Create a synthetic message view for the header
          let synView = new MsgHdrSyntheticView(aArgs.msgHdr);
          aTab.folderDisplay.show(synView);
        }

        // folderDisplay.show is going to try to set the title itself, but we
        // wouldn't have selected a message at that point, so set the title
        // here
        aTab.mode.onTitleChanged.call(this, aTab, null, aArgs.msgHdr);

        aTab.folderDisplay.selectMessage(aArgs.msgHdr);

        // Once we're brought into the foreground, the message pane should
        // get focus
        aTab._focusedElement = document.getElementById("messagepane");

        // we only want to make it active after setting up the view and the message
        //  to avoid generating bogus summarization events.
        if (!background) {
          aTab.folderDisplay.makeActive();
          this.restoreFocus(aTab);
        } else {
          // We don't want to null out the real tree box view, as that
          // corresponds to the _current_ tab, not the new one
          aTab.folderDisplay.hookUpFakeTree(false);
        }
      },
      persistTab(aTab) {
        let msgHdr = aTab.folderDisplay.selectedMessage;
        return {
          messageURI: msgHdr?.folder.getUriForMsg(msgHdr),
        };
      },
      restoreTab(aTabmail, aPersistedState) {
        let msgHdr = messenger.msgHdrFromURI(aPersistedState.messageURI);
        // if the message no longer exists, we can't restore the tab
        if (msgHdr) {
          aTabmail.openTab("message", { msgHdr, background: true });
        }
      },
      onTitleChanged(aTab, aTabNode, aMsgHdr) {
        // Try and figure out the selected message if one was not provided.
        // It is possible that the folder has yet to load, so it may still be
        //  null.
        if (aMsgHdr == null) {
          aMsgHdr = aTab.folderDisplay.selectedMessage;
        }
        aTab.title = "";
        if (aMsgHdr == null) {
          return;
        }
        if (aMsgHdr.flags & Ci.nsMsgMessageFlags.HasRe) {
          aTab.title = "Re: ";
        }
        if (aMsgHdr.mime2DecodedSubject) {
          aTab.title += aMsgHdr.mime2DecodedSubject;
        }

        aTab.title += " - " + aMsgHdr.folder.prettyName;
        if (this._getNumberOfRealAccounts() > 1) {
          aTab.title += " - " + aMsgHdr.folder.server.prettyName;
        }

        // Set the favicon for feed messages.
        if (
          aMsgHdr.flags & Ci.nsMsgMessageFlags.FeedMsg &&
          Services.prefs.getBoolPref("browser.chrome.site_icons") &&
          Services.prefs.getBoolPref("browser.chrome.favicons")
        ) {
          MsgHdrToMimeMessage(
            aMsgHdr,
            null,
            function(msgHdr, mimeMsg) {
              let url = mimeMsg?.headers["content-base"]?.[0];
              if (url) {
                // NOTE: The rss feed favicon is not currently exposed to the
                // WebExtension tabs API. To do so, use MozTabmail setTabFavIcon
                // method instead.
                FeedUtils.getFavicon(null, url, null, window, iconUrl =>
                  aTab.tabNode.setIcon(
                    iconUrl,
                    "chrome://messenger/skin/icons/new/compact/folder-rss.svg"
                  )
                );
              }
            },
            false,
            { saneBodySize: true }
          );
        }
      },
      getBrowser(aTab) {
        // Message tabs always use the messagepane browser.
        return document.getElementById("messagepane");
      },
    },
    /**
     * The glodaList view displays a gloda-backed nsMsgDBView with only the
     *  thread pane and (potentially) the message pane displayed; the folder
     *  pane is forced hidden.
     */
    glodaList: {
      type: "glodaSearch",
      // The set of panes that are legal to be displayed in this mode
      legalPanes: {
        folder: false,
        thread: true,
        message: true,
      },
      /**
       * Open a new folder-display-style tab showing the contents of a gloda
       *  query/collection.  You must pass one of 'query'/'collection'/
       *  'conversation'
       *
       * @param {GlodaQuery} [aArgs.query] An un-triggered gloda query to use.
       *     Alternatively, if you already have a collection, you can pass that
       *     instead as 'collection'.
       * @param {GlodaCollection} [aArgs.collection] A gloda collection to
       *     display.
       * @param {GlodaConversation} [aArgs.conversation] A conversation whose
       *     messages you want to display.
       * @param {GlodaMessage} [aArgs.message] The message to select in the
       *     conversation, if provided.
       * @param aArgs.title The title to give to the tab.  If this is not user
       *     content (a search string, a message subject, etc.), make sure you
       *     are using a localized string.
       *
       * XXX This needs to handle opening in the background
       */
      openTab(aTab, aArgs) {
        aTab.glodaSynView = new GlodaSyntheticView(aArgs);
        aTab.title = aArgs.title;
        aTab.tabNode.setIcon(
          "chrome://messenger/skin/icons/new/compact/search.svg"
        );

        this.openTab(aTab, false, new MessagePaneDisplayWidget(), false);
        aTab.folderDisplay.show(aTab.glodaSynView);
        // XXX persist threaded state?
        aTab.folderDisplay.view.showThreaded = true;

        let background = "background" in aArgs && aArgs.background;
        if (!background) {
          aTab.folderDisplay.makeActive();
        }
        if ("message" in aArgs) {
          let hdr = aArgs.message.folderMessage;
          if (hdr) {
            aTab.folderDisplay.selectMessage(hdr);
          }
        }
      },
      getBrowser(aTab) {
        // If we are currently a thread summary, we want to select the multi
        // message browser rather than the message pane.
        return gMessageDisplay.singleMessageDisplay
          ? document.getElementById("messagepane")
          : document.getElementById("multimessage");
      },
    },
  },

  _getNumberOfRealAccounts() {
    let accountCount = MailServices.accounts.accounts.length;
    // If we have an account, we also always have a "Local Folders" account.
    return accountCount > 0 ? accountCount - 1 : 0;
  },

  /**
   * Common tab opening code shared by the various tab modes.
   */
  openTab(aTab, aIsFirstTab, aMessageDisplay, aFolderPaneVisible) {
    // Set the messagepane as the primary browser for content.
    document.getElementById("messagepane").setAttribute("type", "content");
    document.getElementById("messagepane").setAttribute("primary", "true");

    aTab.messageDisplay = aMessageDisplay;
    aTab.folderDisplay = new FolderDisplayWidget(aTab, aTab.messageDisplay);
    aTab.folderDisplay.msgWindow = msgWindow;
    aTab.folderDisplay.tree = document.getElementById("threadTree");
    aTab.folderDisplay.folderPaneVisible = aFolderPaneVisible;

    if (aIsFirstTab) {
      aTab.folderDisplay.messenger = messenger;
    } else {
      // Each tab gets its own messenger instance; this provides each tab with
      // its own undo/redo stack and back/forward navigation history.
      // If this is a foreground tab, folderDisplay.makeActive() is going to
      // set it as the global messenger, so there's no need to do it here
      let tabMessenger = Cc["@mozilla.org/messenger;1"].createInstance(
        Ci.nsIMessenger
      );
      tabMessenger.setWindow(window, msgWindow);
      aTab.folderDisplay.messenger = tabMessenger;
    }
  },

  closeTab(aTab) {
    aTab.folderDisplay.close();
  },

  /**
   * Save off the tab's currently focused element or window.
   * - If the message pane or summary is currently focused, save the
   *   corresponding browser element as the focused element.
   * - If the thread tree or folder tree is focused, save that as the focused
   *   element.
   */
  saveFocus(aTab) {
    aTab._focusedElement = aTab.folderDisplay.focusedPane;
  },

  /**
   * Restore the tab's focused element or window.
   */
  restoreFocus(aTab) {
    // There seem to be issues with opening multiple messages at once, so allow
    // things to stabilize a bit before proceeding
    let reallyRestoreFocus = function(aTab) {
      if ("_focusedElement" in aTab && aTab._focusedElement) {
        aTab._focusedElement.focus();

        // If we were focused on the message pane, we need to focus on the
        // appropriate subnode (the single- or multi-message content window).
        if (aTab._focusedElement == document.getElementById("messagepanebox")) {
          if (aTab.messageDisplay.singleMessageDisplay) {
            document.getElementById("messagepane").focus();
          } else {
            document.getElementById("multimessage").focus();
          }
        }
      }
      aTab._focusedElement = null;
    };

    window.setTimeout(reallyRestoreFocus, 0, aTab);
  },

  saveTabState(aTab) {
    // Now let other tabs have a primary browser if they want.
    let messagepane = document.getElementById("messagepane");
    messagepane.setAttribute("type", "content");
    messagepane.removeAttribute("primary");

    this.saveFocus(aTab);
    aTab.folderDisplay.makeInactive();
  },

  /**
   * Some panes simply are illegal in certain views, and some panes are legal
   *  but the user may have collapsed/hidden them.  If that was not enough, we
   *  have three different layouts that are possible, each of which requires a
   *  slightly different DOM configuration, and accordingly for us to poke at
   *  different DOM nodes.  Things are made somewhat simpler by our decision
   *  that all tabs share the same layout.
   * This method takes the legal states and current display states and attempts
   *  to apply the appropriate logic to make it all work out.  This method is
   *  not in charge of figuring out or preserving display states.
   *
   * A brief primer on splitters and friends:
   * - A collapsed splitter is not visible (and otherwise it is visible).
   * - A collapsed node is not visible (and otherwise it is visible).
   * - A splitter whose "state" is "collapsed" collapses the widget implied by
   *    the value of the "collapse" attribute.  The splitter itself will be
   *    visible unless "collapsed".
   *
   * @param aLegalStates A dictionary where each key and value indicates whether
   *     the pane in question (key) is legal to be displayed in this mode.  If
   *     the value is true, then the pane is legal.  Omitted pane keys imply
   *     that the pane is illegal.  Keys are:
   *     - folder: The folder (tree) pane.
   *     - thread: The thread pane.
   *     - accountCentral: While it's in a display box with the thread pane, this
   *        is distinct from the thread pane because some other things depend
   *        on whether it's actually the thread pane we are showing.
   *     - message: The message pane.  Required/assumed to be true for now.
   * @param aVisibleStates A dictionary where each value indicates whether the
   *     pane should be 'visible' (not collapsed).  Only panes that are governed
   *     by splitters are options here.  Keys are:
   *     - folder: The folder (tree) pane.
   *     - message: The message pane.
   */
  _setPaneStates(aLegalStates, aVisibleStates) {
    // The display box hosts both the thread pane and account central.
    let displayBoxLegal = aLegalStates.thread || aLegalStates.accountCentral;

    let layout = Services.prefs.getIntPref("mail.pane_config.dynamic");
    if (layout == kWidePaneConfig) {
      // in the "wide" configuration, the #messengerBox is left holding the
      //  folder pane and thread pane, and the message pane has migrated to be
      //  its sibling (under #mailContent).
      // Accordingly, if both the folder and thread panes are illegal, we
      //  want to collapse the #messengerBox and make sure the #messagepanebox
      //  fills up the screen.  (For example, when in "message" mode.)
      let collapseMessengerBox = !aLegalStates.folder && !displayBoxLegal;
      document.getElementById("messengerBox").collapsed = collapseMessengerBox;
      if (collapseMessengerBox) {
        document.getElementById("messagepanebox").flex = 1;
      }
    }

    // -- folder pane
    let splitter = document.getElementById("folderpane_splitter");
    // collapse the splitter when not legal
    splitter.collapsed = !aLegalStates.folder;
    // collapse the folder pane when not visible
    document.getElementById("folderPaneBox").collapsed =
      !aLegalStates.folder || !aVisibleStates.folder;
    // let the splitter know as well
    splitter.setAttribute(
      "state",
      !aLegalStates.folder || !aVisibleStates.folder ? "collapsed" : "open"
    );
    try {
      // The folder-location-toolbar should be hidden if the folder
      // pane is illegal. Otherwise we shouldn't touch it
      document.getElementById(
        "folder-location-container"
      ).collapsed = !aLegalStates.folder;
    } catch (ex) {}

    // -- display box (thread pane / account central)
    // in a vertical view, the threadContentArea sits in the #threadPaneBox
    //  next to the message pane and its splitter.
    var kVerticalMailLayout = 2;
    if (layout == kVerticalMailLayout) {
      document.getElementById("threadContentArea").collapsed = !displayBoxLegal;
    } else {
      // Whereas in the default view, the displayBox is the one next to the
      // message pane and its splitter.
      document.getElementById("displayBox").collapsed = !displayBoxLegal;
    }

    // -- thread pane
    // the threadpane-splitter collapses the message pane (arguably a misnomer),
    //  but it only needs to exist when the thread-pane is legal
    document.getElementById(
      "threadpane-splitter"
    ).collapsed = !aLegalStates.thread;
    if (aLegalStates.thread && aLegalStates.message) {
      document
        .getElementById("threadpane-splitter")
        .setAttribute("state", aVisibleStates.message ? "open" : "collapsed");
    }

    // Some things do not make sense if the thread pane is not legal.
    // (This is likely an example of something that should be using the command
    //  mechanism to update the UI elements as to the state of what the user
    //  is looking at, rather than home-brewing it in here.)
    try {
      // you can't quick-search if you don't have a collection of messages
      document.getElementById(
        "search-container"
      ).collapsed = !aLegalStates.thread;
    } catch (ex) {}
    try {
      // views only work on the thread pane; no thread pane, no views
      document.getElementById(
        "mailviews-container"
      ).collapsed = !aLegalStates.thread;
    } catch (ex) {}

    // -- thread pane status bar helpers
    document.getElementById("unreadMessageCount").hidden = !aLegalStates.thread;
    document.getElementById("totalMessageCount").hidden = !aLegalStates.thread;

    // -- message pane
    document.getElementById("messagepaneboxwrapper").collapsed =
      !aLegalStates.message || !aVisibleStates.message;

    // we are responsible for updating the keybinding; view_init takes care of
    //  updating the menu item (on demand)
    let messagePaneToggleKey = document.getElementById("key_toggleMessagePane");
    if (aLegalStates.thread) {
      messagePaneToggleKey.removeAttribute("disabled");
    } else {
      messagePaneToggleKey.setAttribute("disabled", "true");
    }

    // If all panes are legal report which ones are visible. Doing it this way
    // means the telemetry reflects the state of the last folder tab that was
    // shown, but not if the state changed since it was shown.
    if (aLegalStates.folder && aLegalStates.thread && aLegalStates.message) {
      Services.telemetry.keyedScalarSet(
        "tb.ui.configuration.pane_visibility",
        "folderPane",
        aVisibleStates.folder
      );
      Services.telemetry.keyedScalarSet(
        "tb.ui.configuration.pane_visibility",
        "messagePane",
        aVisibleStates.message
      );
    }
  },

  showTab(aTab) {
    // Set the messagepane as the primary browser for content.
    document.getElementById("messagepane").setAttribute("type", "content");
    document.getElementById("messagepane").setAttribute("primary", "true");

    aTab.folderDisplay.makeActive();

    // - restore folder pane/tree selection
    if (aTab.folderDisplay.displayedFolder) {
      // but don't generate any events while doing so!
      gFolderTreeView.selection.selectEventsSuppressed = true;
      try {
        gFolderTreeView.selectFolder(aTab.folderDisplay.displayedFolder);
      } finally {
        gIgnoreSyntheticFolderPaneSelectionChange = true;
        gFolderTreeView.selection.selectEventsSuppressed = false;
      }
    }

    // restore focus
    this.restoreFocus(aTab);
  },

  // nsIController implementation

  supportsCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_viewClassicMailLayout":
      case "cmd_viewWideMailLayout":
      case "cmd_viewVerticalMailLayout":
      case "cmd_toggleFolderPane":
      case "cmd_toggleFolderPaneCols":
      case "cmd_toggleMessagePane":
        return true;

      default:
        return DefaultController.supportsCommand(aCommand);
    }
  },

  // We only depend on what's illegal
  isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_viewClassicMailLayout":
      case "cmd_viewWideMailLayout":
      case "cmd_viewVerticalMailLayout":
      case "cmd_toggleFolderPane":
      case "cmd_toggleFolderPaneCols":
      case "cmd_toggleMessagePane":
        // If the thread pane is illegal, these are all disabled
        if (!aTab.mode.legalPanes.thread) {
          return false;
        }
      // else fall through

      default:
        return DefaultController.isCommandEnabled(aCommand);
    }
  },

  doCommand(aCommand, aTab) {
    if (!this.isCommandEnabled(aCommand, aTab)) {
      return;
    }

    // DefaultController knows how to handle this
    DefaultController.doCommand(aCommand, aTab);
  },
};

/**
 * Tabs for displaying mail folders and messages.
 */
var newMailTabType = {
  name: "newMailTab",
  perTabPanel: "vbox",
  _cloneTemplate(template, tab, onLoad) {
    let tabmail = document.getElementById("tabmail");

    let clone = document.getElementById(template).content.cloneNode(true);
    let browser = clone.querySelector("browser");
    browser.id = `${tab.mode.name}Browser${tab.mode._nextId}`;
    browser.addEventListener(
      "pagetitlechanged",
      () => {
        tab.title = browser.contentTitle;
        tabmail.setTabTitle(tab);
      },
      true
    );
    browser.addEventListener("DOMLinkAdded", event => {
      if (event.target.rel == "icon") {
        tabmail.setTabFavIcon(tab, event.target.href);
      }
    });
    browser.addEventListener("DOMLinkChanged", event => {
      if (event.target.rel == "icon") {
        tabmail.setTabFavIcon(tab, event.target.href);
      }
    });
    browser.addEventListener(
      "load",
      event => onLoad(event.target.ownerGlobal),
      true
    );

    tab.title = "";
    tab.panel.id = `${tab.mode.name}${tab.mode._nextId}`;
    tab.panel.appendChild(clone);
    tab.browser = browser;
    tab.mode._nextId++;
  },

  closeTab(tab) {},
  saveTabState(tab) {},
  showTab(tab) {},

  modes: {
    mail3PaneTab: {
      _nextId: 1,
      isDefault: Services.prefs.getBoolPref("mail.useNewMailTabs"),

      openTab(tab, args = {}) {
        newMailTabType._cloneTemplate("mail3PaneTabTemplate", tab, win =>
          win.restoreState(args)
        );

        tab.folderURI = args.folderURI;
        tab.__defineGetter__("accountCentralVisible", () =>
          tab.browser.contentDocument.body.classList.contains("account-central")
        );
        tab.__defineGetter__(
          "folderPaneVisible",
          () => !tab.browser.contentWindow.splitter1.isCollapsed
        );
        tab.__defineSetter__("folderPaneVisible", visible => {
          tab.browser.contentWindow.splitter1.isCollapsed = !visible;
        });
        tab.__defineGetter__(
          "messagePaneVisible",
          () => !tab.browser.contentWindow.splitter2.isCollapsed
        );
        tab.__defineSetter__("messagePaneVisible", visible => {
          tab.browser.contentWindow.splitter2.isCollapsed = !visible;
        });
        tab.__defineGetter__("sort", () => {
          return {
            type: tab.browser.contentWindow.gViewWrapper.primarySortType,
            order: tab.browser.contentWindow.gViewWrapper.primarySortOrder,
            grouped: tab.browser.contentWindow.gViewWrapper.showGroupedBySort,
            threaded: tab.browser.contentWindow.gViewWrapper.showThreaded,
          };
        });

        tab.__defineGetter__(
          "message",
          () => tab.browser.contentWindow.gDBView?.hdrForFirstSelectedMessage
        );
        tab.__defineGetter__(
          "folder",
          () => tab.browser.contentWindow.gViewWrapper?.displayedFolder
        );

        // The same as `doCommand` but with an extra argument.
        tab.performCommand = function(command, event) {
          let commandController = tab.browser?.contentWindow.commandController;
          if (commandController?.isCommandEnabled(command)) {
            commandController.doCommand(command, event);
          }
        };
        tab.browser.addEventListener("folderURIChanged", function(event) {
          tab.folderURI = event.detail;
        });
        tab.canClose = !tab.first;
        return tab;
      },
      persistTab(tab) {
        return {
          firstTab: tab.first,
          folderPaneVisible: tab.folderPaneVisible,
          folderURI: tab.folderURI,
          messagePaneVisible: tab.messagePaneVisible,
        };
      },
      restoreTab(tabmail, persistedState) {
        if (persistedState.firstTab) {
          let tab = tabmail.tabInfo[0];
          if (
            tab.browser.currentURI.spec != "about:3pane" ||
            tab.browser.contentDocument.readyState != "complete"
          ) {
            tab.browser.contentWindow.addEventListener(
              "load",
              () => {
                tab.browser.contentWindow.displayFolder(
                  persistedState.folderURI
                );
              },
              { once: true }
            );
          } else {
            tab.browser.contentWindow.displayFolder(persistedState.folderURI);
          }
          tab.folderURI = persistedState.folderURI;
        } else {
          tabmail.openTab("mail3PaneTab", persistedState);
        }
      },
      supportsCommand(command, tab) {
        return tab.browser?.contentWindow.commandController?.supportsCommand(
          command
        );
      },
      isCommandEnabled(command, tab) {
        return tab.browser.contentWindow.commandController?.isCommandEnabled(
          command
        );
      },
      doCommand(command, tab) {
        tab.browser.contentWindow.commandController?.doCommand(command);
      },
    },
    mailMessageTab: {
      _nextId: 1,
      openTab(tab, { messageURI, viewWrapper } = {}) {
        newMailTabType._cloneTemplate("mailMessageTabTemplate", tab, win =>
          win.displayMessage(messageURI, viewWrapper)
        );

        tab.messageURI = messageURI;
        tab.__defineGetter__(
          "message",
          () => tab.browser.contentWindow.gMessage
        );
        tab.__defineGetter__(
          "folder",
          () => tab.browser.contentWindow.gViewWrapper?.displayedFolder
        );

        // The same as `doCommand` but with an extra argument.
        tab.performCommand = function(command, event) {
          let commandController = tab.browser?.contentWindow.commandController;
          if (commandController?.isCommandEnabled(command)) {
            commandController.doCommand(command, event);
          }
        };
        tab.browser.addEventListener("messageURIChanged", function(event) {
          tab.messageURI = event.detail;
        });
        return tab;
      },
      persistTab(tab) {
        return { messageURI: tab.messageURI };
      },
      restoreTab(tabmail, persistedState) {
        tabmail.openTab("mailMessageTab", persistedState);
      },
      supportsCommand(command, tab) {
        return tab.browser?.contentWindow.commandController?.supportsCommand(
          command
        );
      },
      isCommandEnabled(command, tab) {
        return tab.browser.contentWindow.commandController?.isCommandEnabled(
          command
        );
      },
      doCommand(command, tab) {
        tab.browser.contentWindow.commandController?.doCommand(command);
      },
      getBrowser(tab) {
        return tab.browser;
      },
    },
  },
};
