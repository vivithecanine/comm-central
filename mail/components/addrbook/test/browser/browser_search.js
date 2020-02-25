/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
const { toXPCOMArray } = ChromeUtils.import(
  "resource:///modules/iteratorUtils.jsm"
);

add_task(async () => {
  function doSearch(searchString, ...expectedCards) {
    return new Promise(resolve => {
      abWindow.addEventListener(
        "viewchange",
        function onCountChange() {
          checkRows(...expectedCards);
          resolve();
        },
        { once: true }
      );
      EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
      if (searchString) {
        EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
        EventUtils.sendString(searchString, abWindow);
        EventUtils.synthesizeKey("VK_RETURN", {}, abWindow);
      } else {
        EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
      }
    });
  }

  function checkRows(...expectedCards) {
    is(resultsTree.view.rowCount, expectedCards.length, "rowCount correct");
    for (let i = 0; i < expectedCards.length; i++) {
      is(
        resultsTree.view.getCardFromRow(i).displayName,
        expectedCards[i].displayName,
        `row ${i} has the right contact`
      );
    }
  }

  let personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
  let historyBook = MailServices.ab.getDirectoryFromId(
    "ldap_2.servers.history"
  );

  let cards = {};
  let cardsToRemove = {
    personal: [],
    history: [],
  };
  for (let name of ["daniel", "jonathan", "nathan"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = name;

    card = personalBook.addCard(card);
    cards[name] = card;
    cardsToRemove.personal.push(card);
  }
  for (let name of ["danielle", "katherine", "natalie", "susanah"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = name;

    card = historyBook.addCard(card);
    cards[name] = card;
    cardsToRemove.history.push(card);
  }

  let abWindow = await openAddressBookWindow();

  registerCleanupFunction(() => {
    abWindow.close();
    personalBook.deleteCards(
      toXPCOMArray(cardsToRemove.personal, Ci.nsIMutableArray)
    );
    historyBook.deleteCards(
      toXPCOMArray(cardsToRemove.history, Ci.nsIMutableArray)
    );
  });

  let abDocument = abWindow.document;
  let dirTree = abDocument.getElementById("dirTree");
  let resultsTree = abDocument.getElementById("abResultsTree");
  let searchBox = abDocument.getElementById("peopleSearchInput");

  // All address books.

  checkRows(
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah
  );

  // Personal address book.

  is(dirTree.view.getCellText(1, dirTree.columns[0]), "Personal Address Book");
  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 1, 0, {});
  checkRows(cards.daniel, cards.jonathan, cards.nathan);

  await doSearch("daniel", cards.daniel);
  await doSearch("nathan", cards.jonathan, cards.nathan);

  // History address book.

  is(dirTree.view.getCellText(2, dirTree.columns[0]), "Collected Addresses");
  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 2, 0, {});
  checkRows(cards.danielle, cards.katherine, cards.natalie, cards.susanah);

  await doSearch("daniel", cards.danielle);
  await doSearch("nathan");

  // All address books.

  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 0, 0, {});
  checkRows(
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah
  );

  await doSearch("daniel", cards.daniel, cards.danielle);
  await doSearch("nathan", cards.jonathan, cards.nathan);
  await doSearch(
    null,
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah
  );
});
