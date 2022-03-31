/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var {
  be_in_folder,
  create_folder,
  make_message_sets_in_folders,
  mc,
  open_message_from_file,
  press_delete,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var folder1, folder2;

add_setup(async function() {
  folder1 = await create_folder("CopyFromFolder");
  folder2 = await create_folder("CopyToFolder");
  await make_message_sets_in_folders([folder1], [{ count: 1 }]);
});

add_task(async function test_copy_eml_message() {
  // First, copy an email to a folder and delete it immediately just so it shows
  // up in the recent folders list. This simplifies navigation of the copy
  // context menu.
  be_in_folder(folder1);
  let message = select_click_row(0);
  MailServices.copy.copyMessages(
    folder1,
    [message],
    folder2,
    true,
    null,
    mc.window.msgWindow,
    true
  );
  be_in_folder(folder2);
  select_click_row(0);
  press_delete(mc);

  // Now, open a .eml file and copy it to our folder.
  let file = new FileUtils.File(getTestFilePath("data/evil.eml"));
  let msgc = await open_message_from_file(file);

  // First check the properties are correct when opening the .eml form file.
  // @see nsDummyMsgHeader.
  let emlMessage = msgc.window.gMessageDisplay.displayedMessage;
  Assert.equal(emlMessage.mime2DecodedSubject, "An email");
  Assert.equal(emlMessage.mime2DecodedAuthor, "from@example.com");
  Assert.equal(
    emlMessage.date,
    new Date("Mon, 10 Jan 2011 12:00:00 -0500").getTime() * 1000
  );
  Assert.equal(
    emlMessage.messageId,
    "11111111-bdfd-ca83-6479-3427940164a8@invalid"
  );

  let documentChild = msgc.e("messagepane").contentDocument.firstElementChild;
  msgc.rightClick(documentChild);
  await msgc.click_menus_in_sequence(msgc.e("mailContext"), [
    { id: "mailContext-copyMenu" },
    { label: "Recent" },
    { label: "CopyToFolder" },
  ]);
  close_window(msgc);

  // Make sure the copy worked. Make sure the first header is the one used,
  // in case the message (incorrectly) has multiple when max-number is 1
  // according to RFC 5322.
  let copiedMessage = select_click_row(0);
  Assert.equal(copiedMessage.mime2DecodedSubject, "An email");
  Assert.equal(copiedMessage.mime2DecodedAuthor, "from@example.com");
  Assert.equal(
    copiedMessage.date,
    new Date("Mon, 10 Jan 2011 12:00:00 -0500").getTime() * 1000
  );
  Assert.equal(copiedMessage.numReferences, 2);
  Assert.equal(
    copiedMessage.messageId,
    "11111111-bdfd-ca83-6479-3427940164a8@invalid"
  );
});
