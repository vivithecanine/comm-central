/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the ability to switch between multiple folder modes.
 */

"use strict";

var {
  assert_folder_visible,
  inboxFolder,
  make_message_sets_in_folders,
  mc,
  select_no_folders,
  toggle_main_menu,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { MailTelemetryForTests } = ChromeUtils.import(
  "resource:///modules/MailGlue.jsm"
);
var { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

var rootFolder;
var unreadFolder;
var favoriteFolder;
var tree;
var modeList_menu;
var modeList_appmenu;
var modeList_popupmenu;
var view_menu;
var view_menupopup;
var appmenu_button;
var appmenu_mainView;
var appmenu_popup;
var menu_state;

add_setup(async function() {
  rootFolder = inboxFolder.server.rootFolder;

  // Create one folder with unread messages and one favorite folder.
  inboxFolder.createSubfolder("UnreadFolder", null);
  unreadFolder = inboxFolder.getChildNamed("UnreadFolder");

  inboxFolder.createSubfolder("FavoriteFolder", null);
  favoriteFolder = inboxFolder.getChildNamed("FavoriteFolder");

  await make_message_sets_in_folders([unreadFolder], [{ count: 1 }]);
  favoriteFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);

  modeList_menu = mc.e("menu_FolderViewsPopup");
  modeList_appmenu = mc.e("appMenu-foldersView");
  modeList_popupmenu = mc.e("folderPaneOptionsPopup");

  view_menu = mc.e("menu_View");
  view_menupopup = mc.e("menu_View_Popup");
  appmenu_button = mc.window.document.getElementById("button-appmenu");
  appmenu_mainView = mc.e("appMenu-mainView");
  appmenu_popup = mc.e("appMenu-popup");

  tree = mc.folderTreeView;

  select_no_folders();

  // Main menu is needed for this whole test file.
  menu_state = toggle_main_menu(true);

  // Show the Folder Pane header toolbar.
  mc.e("folderPaneHeader").removeAttribute("collapsed");

  Services.xulStore.removeDocument(
    "chrome://messenger/content/messenger.xhtml"
  );
  Services.telemetry.clearScalars();
});

/**
 * Check whether the expected folder mode is selected in menus and internally.
 *
 * @param {string} aMode - The name of the expected mode.
 */
async function assert_mode_selected(aMode) {
  if (aMode != "compact") {
    // "compact" isn't really a mode, we're just using this function because
    // it tests everything we want to test.
    Assert.ok(tree.activeModes.includes(aMode));
  }

  // We need to open the menu because only then the right mode is set in them.
  if (["linux", "win"].includes(AppConstants.platform)) {
    // On OS X the main menu seems not accessible for clicking from tests.
    EventUtils.synthesizeMouseAtCenter(view_menu, { clickCount: 1 }, mc.window);
    let popuplist = await mc.click_menus_in_sequence(
      view_menupopup,
      [{ id: modeList_menu.parentNode.id }],
      true
    );
    for (let mode of tree.activeModes) {
      Assert.ok(
        modeList_menu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
      );
    }
    mc.close_popup_sequence(popuplist);
  }

  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, mc.window);
  mc.click_through_appmenu([
    { id: "appmenu_View" },
    { id: "appmenu_FolderViews" },
  ]);
  for (let mode of tree.activeModes) {
    Assert.ok(
      modeList_appmenu
        .querySelector(`[value="${mode}"]`)
        .hasAttribute("checked")
    );
  }
  appmenu_popup.hidePopup();

  let shownPromise = BrowserTestUtils.waitForEvent(
    modeList_popupmenu,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    mc.e("folderPaneOptionsButton"),
    { clickCount: 1 },
    mc.window
  );
  await shownPromise;
  for (let mode of tree.activeModes) {
    Assert.ok(
      modeList_popupmenu
        .querySelector(`[value="${mode}"]`)
        .hasAttribute("checked")
    );
  }
  modeList_popupmenu.hidePopup();
}

/**
 * Check whether the expected folder mode is unselected in menus and internally.
 *
 * @param {string} mode - The name of the missing mode.
 */
async function assert_mode_not_selected(mode) {
  Assert.ok(!tree.activeModes.includes(mode));

  // We need to open the menu because only then the right mode is set in them.
  if (["linux", "win"].includes(AppConstants.platform)) {
    // On OS X the main menu seems not accessible for clicking from tests.
    EventUtils.synthesizeMouseAtCenter(view_menu, { clickCount: 1 }, mc.window);
    let popuplist = await mc.click_menus_in_sequence(
      view_menupopup,
      [{ id: modeList_menu.parentNode.id }],
      true
    );
    Assert.ok(
      !modeList_menu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
    );
    mc.close_popup_sequence(popuplist);
  }

  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, mc.window);
  mc.click_through_appmenu([
    { id: "appmenu_View" },
    { id: "appmenu_FolderViews" },
  ]);
  Assert.ok(
    !modeList_appmenu.querySelector(`[value="${mode}"]`).hasAttribute("checked")
  );
  appmenu_popup.hidePopup();

  let shownPromise = BrowserTestUtils.waitForEvent(
    modeList_popupmenu,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    mc.e("folderPaneOptionsButton"),
    { clickCount: 1 },
    mc.window
  );
  await shownPromise;
  Assert.ok(
    !modeList_popupmenu
      .querySelector(`[value="${mode}"]`)
      .hasAttribute("checked")
  );
  modeList_popupmenu.hidePopup();
}

/**
 * Toggle the folder mode by clicking in the menu.
 *
 * @param mode  The base name of the mode to select.
 */
function select_mode_in_menu(mode) {
  EventUtils.synthesizeMouseAtCenter(appmenu_button, {}, mc.window);
  mc.click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_FolderViews" }],
    { value: mode }
  );
  appmenu_popup.hidePopup();
}

/**
 * Check the all folders mode.
 */
async function subtest_toggle_all_folders(show) {
  let mode = "all";
  select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the unread folders mode.
 */
async function subtest_toggle_unread_folders(show) {
  let mode = "unread";
  select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);

    // Mode is hierarchical, parent folders are shown.
    assert_folder_visible(inboxFolder.server.rootFolder);
    assert_folder_visible(inboxFolder);
    assert_folder_visible(unreadFolder);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the favorite folders mode.
 */
async function subtest_toggle_favorite_folders(show) {
  let mode = "favorite";
  select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);

    // Mode is hierarchical, parent folders are shown.
    assert_folder_visible(inboxFolder.server.rootFolder);
    assert_folder_visible(inboxFolder);
    assert_folder_visible(favoriteFolder);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the recent folders mode.
 */
async function subtest_toggle_recent_folders(show) {
  let mode = "recent";
  select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check the smart folders mode.
 */
async function subtest_toggle_smart_folders(show) {
  let mode = "smart";
  select_mode_in_menu(mode);

  if (show) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Toggle the compact mode.
 */
async function subtest_toggle_compact(compact) {
  let mode = "compact";
  select_mode_in_menu(mode);

  if (compact) {
    await assert_mode_selected(mode);
  } else {
    await assert_mode_not_selected(mode);
  }
}

/**
 * Check that the current mode(s) are accurately recorded in telemetry.
 * Note that `reportUIConfiguration` usually only runs at start-up.
 */
function check_scalars(expected) {
  MailTelemetryForTests.reportUIConfiguration();
  let scalarName = "tb.ui.configuration.folder_tree_modes";
  let scalars = TelemetryTestUtils.getProcessScalars("parent");
  if (expected) {
    TelemetryTestUtils.assertScalar(scalars, scalarName, expected);
  } else {
    TelemetryTestUtils.assertScalarUnset(scalars, scalarName);
  }
}

/**
 * Toggle folder modes through different means and sequences.
 */
add_task(async function test_toggling_modes() {
  check_scalars();

  await subtest_toggle_all_folders(true);
  await subtest_toggle_smart_folders(true);
  check_scalars("all,smart");

  await subtest_toggle_unread_folders(true);
  await subtest_toggle_favorite_folders(true);
  await subtest_toggle_recent_folders(true);
  check_scalars("all,smart,unread,favorite,recent");

  await subtest_toggle_compact(true);
  check_scalars("all,smart,unread,favorite,recent (compact)");

  await subtest_toggle_unread_folders(false);
  check_scalars("all,smart,favorite,recent (compact)");

  await subtest_toggle_compact(false);
  check_scalars("all,smart,favorite,recent");

  await subtest_toggle_favorite_folders(false);
  check_scalars("all,smart,recent");

  await subtest_toggle_all_folders(false);
  await subtest_toggle_recent_folders(false);
  await subtest_toggle_smart_folders(false);

  // Confirm that the all folders mode is visible even after all the modes have
  // been deselected in order to ensure that the Folder Pane is never empty.
  await assert_mode_selected("all");
  check_scalars("all");
});

registerCleanupFunction(function() {
  inboxFolder.propagateDelete(unreadFolder, true, null);
  inboxFolder.propagateDelete(favoriteFolder, true, null);
  toggle_main_menu(menu_state);
});
