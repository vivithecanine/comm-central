/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals DisplayNameUtils, fixIterator, MailServices, MailUtils */

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

const inputs = {
  abName: "Mochitest Address Book",
  mlName: "Mochitest Mailing List",
  nickName: "Nicky",
  description: "Just a test mailing list.",
  addresses: [
    "alan@example.com",
    "betty@example.com",
    "clyde@example.com",
    "deb@example.com",
  ],
  modification: " (modified)",
};

const getDisplayedAddress = address => `${address} <${address}>`;

let global = {};

/**
 * Set up: create a new address book to hold the mailing list.
 */
add_task(async () => {
  let abWindow = await openAddressBookWindow();
  let addressBook = await createNewAddressBook(abWindow, inputs.abName);

  let dirTree = abWindow.document.getElementById("dirTree");

  /**
   * Click a row in the address book list (tree).
   *
   * @param {number} row - The tree row to click.
   * @param {number} clickCount - Number of clicks to synthesize.
   */
  let dirTreeClick = (row, clickCount) => {
    mailTestUtils.treeClick(EventUtils, abWindow, dirTree, row, 0, {
      clickCount,
    });
  };

  global = {
    abWindow,
    addressBook,
    dirTree,
    dirTreeClick,
    mailListUID: undefined,
  };
});

/**
 * Create a new mailing list with some addresses, in the new address book.
 */
add_task(async () => {
  let mailingListWindowPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml",
    // A callback that can interact with the mailing list dialog.
    async mlWindow => {
      let mlDocument = mlWindow.document;
      let mlDocElement = mlDocument.querySelector("dialog");

      let listName = mlDocument.getElementById("ListName");
      let listNameFocusEvent = await BrowserTestUtils.waitForEvent(
        listName,
        "focus"
      );

      let abPopup = mlDocument.getElementById("abPopup");
      let listNickName = mlDocument.getElementById("ListNickName");
      let listDescription = mlDocument.getElementById("ListDescription");
      let addressInput1 = mlDocument.getElementById("addressCol1#1");
      let addressInputsCount = mlDocument
        .getElementById("addressingWidget")
        .querySelectorAll("input").length;

      is(
        abPopup.label,
        global.addressBook.dirName,
        "the correct address book is selected in the menu"
      );
      is(
        abPopup.value,
        global.addressBook.URI,
        "the address book selected in the menu has the correct address book URI"
      );
      is(listNameFocusEvent.type, "focus", "list name field is focused");
      is(listName.value, "", "no text in the list name field");
      is(listNickName.value, "", "no text in the list nickname field");
      is(listDescription.value, "", "no text in the description field");
      is(addressInput1.value, "", "no text in the addresses list");
      is(addressInputsCount, 1, "only one address list input exists");

      EventUtils.sendString(inputs.mlName, mlWindow);

      // Tab to nickname input.
      EventUtils.sendKey("TAB", mlWindow);
      EventUtils.sendString(inputs.nickName, mlWindow);

      // Tab to description input.
      EventUtils.sendKey("TAB", mlWindow);
      EventUtils.sendString(inputs.description, mlWindow);

      // Tab to address input and add addresses zero and one by entering
      // both of them there.
      EventUtils.sendKey("TAB", mlWindow);
      EventUtils.sendString(inputs.addresses.slice(0, 2).join(", "), mlWindow);

      mlDocElement.getButton("accept").click();
    }
  );

  is(
    global.dirTree.view.getCellText(2, global.dirTree.columns[0]),
    inputs.abName,
    `address book ("${inputs.abName}") is displayed in the address book list`
  );

  // Select the address book.
  global.dirTreeClick(2, 1);

  // Open the new mailing list dialog, the callback above interacts with it.
  EventUtils.synthesizeMouseAtCenter(
    global.abWindow.document.getElementById("button-newlist"),
    { clickCount: 1 },
    global.abWindow
  );

  await mailingListWindowPromise;

  // Confirm that the mailing list and addresses were saved in the backend.

  ok(
    DisplayNameUtils.getCardForEmail(inputs.addresses[0]).card,
    "address zero was saved"
  );
  ok(
    DisplayNameUtils.getCardForEmail(inputs.addresses[1]).card,
    "address one was saved"
  );

  let childCards = [...global.addressBook.childCards];

  ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[0]),
    "address zero was saved in the correct address book"
  );
  ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[1]),
    "address one was saved in the correct address book"
  );

  let mailList = MailUtils.findListInAddressBooks(inputs.mlName);

  // Save the mailing list UID so we can confirm it is the same later.
  global.mailListUID = mailList.UID;

  ok(mailList, "mailing list was created");
  ok(
    global.addressBook.hasMailListWithName(inputs.mlName),
    "mailing list was created in the correct address book"
  );
  is(mailList.dirName, inputs.mlName, "mailing list name was saved");
  is(
    mailList.listNickName,
    inputs.nickName,
    "mailing list nick name was saved"
  );
  is(
    mailList.description,
    inputs.description,
    "mailing list description was saved"
  );

  let listCards = [...fixIterator(mailList.addressLists, Ci.nsIAbCard)];

  ok(
    listCards[0].hasEmailAddress(inputs.addresses[0]),
    "address zero was saved in the mailing list"
  );
  ok(
    listCards[1].hasEmailAddress(inputs.addresses[1]),
    "address one was saved in the mailing list"
  );
  is(listCards.length, 2, "two cards exist in the mailing list");
});

/**
 * Open the mailing list dialog and modify the mailing list.
 */
add_task(async () => {
  let mailingListWindowPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abEditListDialog.xhtml",
    // A callback that can interact with the mailing list dialog.
    async mlWindow => {
      let mlDocument = mlWindow.document;
      let mlDocElement = mlDocument.querySelector("dialog");

      // The address input nodes are not there yet when the dialog window is
      // loaded, so wait until they exist.
      await mailTestUtils.awaitElementExistence(
        MutationObserver,
        mlDocument,
        "addressingWidget",
        "addressCol1#3"
      );

      await BrowserTestUtils.waitForEvent(
        mlDocument.getElementById("addressCol1#3"),
        "focus"
      );

      let listName = mlDocument.getElementById("ListName");
      let listNickName = mlDocument.getElementById("ListNickName");
      let listDescription = mlDocument.getElementById("ListDescription");
      let addressInput1 = mlDocument.getElementById("addressCol1#1");
      let addressInput2 = mlDocument.getElementById("addressCol1#2");

      is(listName.value, inputs.mlName, "list name is displayed correctly");
      is(
        listNickName.value,
        inputs.nickName,
        "list nickname is displayed correctly"
      );
      is(
        listDescription.value,
        inputs.description,
        "list description is displayed correctly"
      );
      is(
        addressInput1 && addressInput1.value,
        getDisplayedAddress(inputs.addresses[0]),
        "address zero is displayed correctly"
      );
      is(
        addressInput2 && addressInput2.value,
        getDisplayedAddress(inputs.addresses[1]),
        "address one is displayed correctly"
      );

      let textInputs = mlDocument.querySelectorAll(".textbox-addressingWidget");
      is(textInputs.length, 3, "no extraneous addresses are displayed");

      // Add addresses two and three.
      EventUtils.sendString(inputs.addresses.slice(2, 4).join(", "), mlWindow);
      EventUtils.sendKey("RETURN", mlWindow);
      await new Promise(resolve => mlWindow.setTimeout(resolve));

      // Delete the address in the second row (address one).
      EventUtils.synthesizeMouseAtCenter(
        addressInput2,
        { clickCount: 1 },
        mlWindow
      );
      EventUtils.synthesizeKey("a", { accelKey: true }, mlWindow);
      EventUtils.sendKey("BACK_SPACE", mlWindow);

      // Modify the list's name, nick name, and description fields.
      let modifyField = id => {
        EventUtils.synthesizeMouseAtCenter(id, { clickCount: 1 }, mlWindow);
        EventUtils.sendKey("END", mlWindow);
        EventUtils.sendString(inputs.modification, mlWindow);
      };
      modifyField(listName);
      modifyField(listNickName);
      modifyField(listDescription);

      mlDocElement.getButton("accept").click();
    }
  );

  is(
    global.dirTree.view.getCellText(2, global.dirTree.columns[0]),
    inputs.abName,
    `address book ("${inputs.abName}") is displayed in the address book list`
  );

  // Double-click on the address book name to reveal the mailing list.
  global.dirTreeClick(2, 2);

  is(
    global.dirTree.view.getCellText(3, global.dirTree.columns[0]),
    inputs.mlName,
    `mailing list ("${inputs.mlName}") is displayed in the address book list`
  );

  // Open the mailing list dialog, the callback above interacts with it.
  global.dirTreeClick(3, 2);

  await mailingListWindowPromise;

  // Confirm that the mailing list and addresses were saved in the backend.

  ok(
    DisplayNameUtils.getCardForEmail(inputs.addresses[2]).card,
    "address two was saved"
  );
  ok(
    DisplayNameUtils.getCardForEmail(inputs.addresses[3]).card,
    "address three was saved"
  );

  let childCards = [...global.addressBook.childCards];

  ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[2]),
    "address two was saved in the correct address book"
  );
  ok(
    childCards.find(card => card.primaryEmail == inputs.addresses[3]),
    "address three was saved in the correct address book"
  );

  let mailList = MailUtils.findListInAddressBooks(
    inputs.mlName + inputs.modification
  );

  is(mailList && mailList.UID, global.mailListUID, "mailing list still exists");

  ok(
    global.addressBook.hasMailListWithName(inputs.mlName + inputs.modification),
    "mailing list is still in the correct address book"
  );
  is(
    mailList.dirName,
    inputs.mlName + inputs.modification,
    "modified mailing list name was saved"
  );
  is(
    mailList.listNickName,
    inputs.nickName + inputs.modification,
    "modified mailing list nick name was saved"
  );
  is(
    mailList.description,
    inputs.description + inputs.modification,
    "modified mailing list description was saved"
  );

  let listCards = [...fixIterator(mailList.addressLists, Ci.nsIAbCard)];

  ok(
    listCards[0].hasEmailAddress(inputs.addresses[0]),
    "address zero was saved in the mailing list (is still there)"
  );
  ok(
    listCards[1].hasEmailAddress(inputs.addresses[2]),
    "address two was saved in the mailing list"
  );
  ok(
    listCards[2].hasEmailAddress(inputs.addresses[3]),
    "address three was saved in the mailing list"
  );

  let hasAddressOne = listCards.find(card =>
    card.hasEmailAddress(inputs.addresses[1])
  );

  ok(!hasAddressOne, "address one was deleted from the mailing list");

  is(listCards.length, 3, "three cards exist in the mailing list");
});

/**
 * Open the mailing list dialog and confirm the changes are displayed.
 */
add_task(async () => {
  let mailingListWindowPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abEditListDialog.xhtml",
    // A callback that can interact with the mailing list dialog.
    async mailingListWindow => {
      let mlDocument = mailingListWindow.document;
      let mlDocElement = mlDocument.querySelector("dialog");

      // The address input nodes are not there yet when the dialog window is
      // loaded, so wait until they exist.
      await mailTestUtils.awaitElementExistence(
        MutationObserver,
        mlDocument,
        "addressingWidget",
        "addressCol1#4"
      );

      await BrowserTestUtils.waitForEvent(
        mlDocument.getElementById("addressCol1#4"),
        "focus"
      );

      let listName = mlDocument.getElementById("ListName");
      let listNickName = mlDocument.getElementById("ListNickName");
      let listDescription = mlDocument.getElementById("ListDescription");
      let addressInput1 = mlDocument.getElementById("addressCol1#1");
      let addressInput2 = mlDocument.getElementById("addressCol1#2");
      let addressInput3 = mlDocument.getElementById("addressCol1#3");

      is(
        listName.value,
        inputs.mlName + inputs.modification,
        "modified list name is displayed correctly"
      );
      is(
        listNickName.value,
        inputs.nickName + inputs.modification,
        "modified list nickname is displayed correctly"
      );
      is(
        listDescription.value,
        inputs.description + inputs.modification,
        "modified list description is displayed correctly"
      );
      is(
        addressInput1 && addressInput1.value,
        getDisplayedAddress(inputs.addresses[0]),
        "address zero is displayed correctly (is still there)"
      );
      is(
        addressInput2 && addressInput2.value,
        getDisplayedAddress(inputs.addresses[2]),
        "address two is displayed correctly"
      );
      is(
        addressInput3 && addressInput3.value,
        getDisplayedAddress(inputs.addresses[3]),
        "address three is displayed correctly"
      );

      let textInputs = mlDocument.querySelectorAll(".textbox-addressingWidget");
      is(textInputs.length, 4, "no extraneous addresses are displayed");

      mlDocElement.getButton("cancel").click();
    }
  );

  is(
    global.dirTree.view.getCellText(3, global.dirTree.columns[0]),
    inputs.mlName,
    `mailing list ("${inputs.mlName}") is displayed in the address book list`
  );

  // Open the mailing list dialog, the callback above interacts with it.
  global.dirTreeClick(3, 2);

  await mailingListWindowPromise;
});

/**
 * Tear down: delete the address book and close the address book window.
 */
add_task(async () => {
  let mailingListWindowPromise = BrowserTestUtils.promiseAlertDialog(
    "accept",
    "chrome://global/content/commonDialog.xhtml"
  );

  is(
    global.dirTree.view.getCellText(2, global.dirTree.columns[0]),
    inputs.abName,
    `address book ("${inputs.abName}") is displayed in the address book list`
  );

  global.dirTreeClick(2, 1);
  EventUtils.sendKey("DELETE", global.abWindow);

  await mailingListWindowPromise;

  let addressBook = [...MailServices.ab.directories].find(
    directory => directory.dirName == inputs.abName
  );

  ok(!addressBook, "address book was deleted");

  global.abWindow.close();
});
