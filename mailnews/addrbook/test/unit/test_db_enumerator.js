/**
 * This test verifies that we don't crash if we have an enumerator on an
 * addr database and delete the underlying directory, which forces the ab
 * closed.
 */
var ab_prefix = "test-537815-";
var card_properties = {
  FirstName: "01-first-3",
  LastName: "02-last",
  PrimaryEmail: "08-email-1@zindus.invalid",
};
var max_addressbooks = 10;

function bug_537815_fixture_setup() {
  let i, key;

  for (i = 1; i <= max_addressbooks; i++) {
    const ab_name = ab_prefix + i;
    MailServices.ab.newAddressBook(
      ab_name,
      "",
      Ci.nsIAbManager.JS_DIRECTORY_TYPE
    );
    dump("created: " + ab_name + "\n");

    for (var j = 1; j < 2; j++) {
      for (const elem of MailServices.ab.directories) {
        const uri = elem.URI;
        const dir = MailServices.ab.getDirectory(uri);

        dump("considering: j: " + j + " " + elem.dirName + "\n");

        if (j == 1 && elem.dirName.startsWith(ab_prefix)) {
          for (i = 1; i <= 1000; i++) {
            let abCard = Cc["@mozilla.org/addressbook/cardproperty;1"]
              .createInstance()
              .QueryInterface(Ci.nsIAbCard);

            for (key in card_properties) {
              abCard.setProperty(key, card_properties[key]);
            }

            abCard = dir.addCard(abCard);
          }
          dump("populated: " + elem.dirName + "\n");
        }
      }
    }
  }
}

function bug_537815_test() {
  for (const elem of MailServices.ab.directories) {
    const uri = elem.URI;
    const dir = MailServices.ab.getDirectory(uri);
    if (elem.dirName.startsWith(ab_prefix)) {
      for (const abCard of dir.childCards) {
        for (const key in card_properties) {
          abCard.getProperty(key, null);
        }
      }
      dump("visited all cards in: " + elem.dirName + "\n");
    }
  }
}

function test_bug_537815() {
  bug_537815_fixture_setup();
  bug_537815_test();
  bug_537815_fixture_tear_down();
}

function bug_537815_fixture_tear_down() {
  const a_uri = {};
  for (const elem of MailServices.ab.directories) {
    if (elem.dirName.startsWith(ab_prefix)) {
      a_uri[elem.URI] = true;
      dump("to be deleted: " + elem.dirName + "\n");
    }
  }

  for (const uri in a_uri) {
    MailServices.ab.deleteAddressBook(uri);
  }
}

function run_test() {
  test_bug_537815();
}
