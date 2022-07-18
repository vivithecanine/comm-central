/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that cycling through the focus of the 3pane's panes works correctly.
 */

"use strict";

var {
  add_message_sets_to_folders,
  be_in_folder,
  close_tab,
  collapse_all_threads,
  create_folder,
  create_thread,
  make_display_threaded,
  mc,
  open_selected_message_in_new_tab,
  press_delete,
  select_click_row,
  select_none,
  switch_tab,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;

add_setup(async function() {
  folder = await create_folder("PaneFocus");
  let msg1 = create_thread(1);
  let thread = create_thread(3);
  let msg2 = create_thread(1);
  await add_message_sets_to_folders([folder], [msg1, thread, msg2]);

  be_in_folder(folder);
  make_display_threaded();
  collapse_all_threads();
});

/**
 * Get the currently-focused pane in the 3pane. One of the folder pane, thread
 * pane, or message pane (single- or multi-message).
 *
 * @return the focused pane
 */
function get_focused_pane() {
  let panes = [
    "mailButton",
    "threadTree",
    "folderTree",
    "messagepane",
    "multimessage",
  ].map(id => mc.e(id));

  let currentNode = mc.window.top.document.activeElement;

  while (currentNode) {
    if (panes.includes(currentNode)) {
      return currentNode;
    }

    currentNode = currentNode.parentNode;
  }
  return null;
}

/**
 * Check that it's possible to cycle through the 3pane's panes forward and
 * backward.
 *
 * @param multimessage true if the multimessage pane should be active
 */
function check_pane_cycling(multimessage) {
  let folderPane = mc.e("folderTree");
  let threadPane = mc.e("threadTree");
  let mailButton = mc.e("mailButton");
  let messagePane = mc.e(multimessage ? "multimessage" : "messagepane");

  folderPane.focus();

  EventUtils.synthesizeKey("VK_F6", {}, mc.window);
  Assert.equal(get_focused_pane().id, threadPane.id);
  EventUtils.synthesizeKey("VK_F6", {}, mc.window);
  Assert.equal(get_focused_pane().id, messagePane.id);
  EventUtils.synthesizeKey("VK_F6", {}, mc.window);
  Assert.equal(get_focused_pane().id, mailButton.id);
  EventUtils.synthesizeKey("VK_F6", {}, mc.window);
  Assert.equal(get_focused_pane().id, folderPane.id);

  EventUtils.synthesizeKey("VK_F6", { shiftKey: true }, mc.window);
  Assert.equal(get_focused_pane().id, mailButton.id);
  EventUtils.synthesizeKey("VK_F6", { shiftKey: true }, mc.window);
  Assert.equal(get_focused_pane().id, messagePane.id);
  EventUtils.synthesizeKey("VK_F6", { shiftKey: true }, mc.window);
  Assert.equal(get_focused_pane().id, threadPane.id);
  EventUtils.synthesizeKey("VK_F6", { shiftKey: true }, mc.window);
  Assert.equal(get_focused_pane().id, folderPane.id);
  EventUtils.synthesizeKey("VK_F6", { shiftKey: true }, mc.window);
  Assert.equal(get_focused_pane().id, mailButton.id);
}

add_task(function test_no_messages_selected() {
  be_in_folder(folder);

  // With E10s enabled, this test doesn't work when the message pane is a
  // remote browser, which it is at start-up when running only this test
  // (about:blank can be a remote page or a parent process page). Load and
  // unload a message to make the message pane a non-remote browser.
  select_click_row(0);
  // Select nothing
  select_none();
  check_pane_cycling(false);
});

add_task(function test_one_message_selected() {
  be_in_folder(folder);

  // Select a message
  select_click_row(0);
  check_pane_cycling(false);
});

add_task(function test_n_messages_selected() {
  be_in_folder(folder);

  // Select a thread
  select_click_row(1);
  check_pane_cycling(true);
});

add_task(function test_between_tab_and_single_message() {
  be_in_folder(folder);
  select_click_row(0);
  let tab = open_selected_message_in_new_tab(true);

  select_click_row(2);

  // First, try swapping back and forth between the tabs when the message
  // pane is focused.
  mc.window.SetFocusMessagePane();

  switch_tab(tab);
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab();
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab(tab);
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab();
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  // Now, focus the folder tree and make sure focus updates properly.
  mc.e("folderTree").focus();

  switch_tab(tab);
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab();
  Assert.equal(mc.e("folderTree"), get_focused_pane());

  close_tab(tab);
});

add_task(function test_between_tab_and_multi_message() {
  be_in_folder(folder);
  select_click_row(0);
  let tab = open_selected_message_in_new_tab(true);

  select_click_row(1);

  // First, try swapping back and forth between the tabs when the message
  // pane is focused.
  mc.window.SetFocusMessagePane();

  switch_tab(tab);
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab();
  Assert.equal(mc.e("multimessage"), get_focused_pane());

  switch_tab(tab);
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab();
  Assert.equal(mc.e("multimessage"), get_focused_pane());

  // Now, focus the folder tree and make sure focus updates properly.
  mc.e("folderTree").focus();

  switch_tab(tab);
  Assert.equal(mc.e("messagepane"), get_focused_pane());

  switch_tab();
  Assert.equal(mc.e("folderTree"), get_focused_pane());

  close_tab(tab);
});

add_task(function test_after_delete() {
  be_in_folder(folder);
  make_display_threaded();
  collapse_all_threads();

  // Select a message, then delete it to move to the thread
  select_click_row(0);
  mc.window.SetFocusMessagePane();
  press_delete();

  Assert.equal(mc.e("multimessage"), get_focused_pane());

  // Delete the thread (without warning) to move to a message
  Services.prefs.setBoolPref("mail.warn_on_collapsed_thread_operation", false);
  press_delete();

  Assert.equal(mc.e("messagepane"), get_focused_pane());
});
