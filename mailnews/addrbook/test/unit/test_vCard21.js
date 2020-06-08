/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

add_task(async () => {
  function check(vCardLines, expectedProps) {
    const propWhitelist = [
      "LastModifiedDate",
      "PopularityIndex",
      "PreferMailFormat",
    ];

    let vCard = `BEGIN:VCARD\r\nVERSION:2.1\r\n${vCardLines}\r\nEND:VCARD\r\n`;
    info(vCard);
    let abCard = VCardUtils.vCardToAbCard(vCard);
    // Check that every property in expectedProps is present in `abCard`.
    // No other property can be present unless it is in `propWhitelist`.
    for (let prop of abCard.properties) {
      if (prop.name in expectedProps) {
        equal(prop.value, expectedProps[prop.name], `expected ${prop.name}`);
        delete expectedProps[prop.name];
      } else if (!propWhitelist.includes(prop.name)) {
        ok(false, `unexpected ${prop.name}`);
      }
    }

    for (let name of Object.keys(expectedProps)) {
      ok(false, `expected ${name} not found`);
    }
  }

  // Different types of phone number.
  check("TEL:1234567", {
    WorkPhone: "1234567",
  });
  check("TEL;PREF:1234567", {
    WorkPhone: "1234567",
  });
  check("TEL;CELL:1234567", {
    CellularNumber: "1234567",
  });
  check("TEL;CELL;PREF:1234567", {
    CellularNumber: "1234567",
  });
  check("TEL;HOME:1234567", {
    HomePhone: "1234567",
  });
  check("TEL;HOME;PREF:1234567", {
    HomePhone: "1234567",
  });
  check("TEL;VOICE:1234567", {
    WorkPhone: "1234567",
  });
  check("TEL;VOICE;PREF:1234567", {
    WorkPhone: "1234567",
  });
  check("TEL;WORK:1234567", {
    WorkPhone: "1234567",
  });
  check("TEL;WORK;PREF:1234567", {
    WorkPhone: "1234567",
  });

  // Combinations of phone number types.
  check("TEL;CELL:1234567\r\nTEL;HOME:9876543", {
    CellularNumber: "1234567",
    HomePhone: "9876543",
  });
  check("TEL;CELL;PREF:1234567\r\nTEL;HOME:9876543", {
    CellularNumber: "1234567",
    HomePhone: "9876543",
  });

  // Phone number preference.
  check("TEL;CELL;PREF:1234567\r\nTEL;CELL:9876543", {
    CellularNumber: "1234567",
  });
  check("TEL;CELL:1234567\r\nTEL;CELL;PREF:9876543", {
    CellularNumber: "9876543",
  });

  // Different types of email.
  check("EMAIL:pref@invalid", {
    PrimaryEmail: "pref@invalid",
  });
  check("EMAIL;PREF:pref@invalid", {
    PrimaryEmail: "pref@invalid",
  });
  check("EMAIL;WORK:work@invalid", {
    PrimaryEmail: "work@invalid",
  });
  check("EMAIL;WORK;PREF:work@invalid", {
    PrimaryEmail: "work@invalid",
  });
  check("EMAIL;HOME:home@invalid", {
    PrimaryEmail: "home@invalid",
  });
  check("EMAIL;HOME;PREF:home@invalid", {
    PrimaryEmail: "home@invalid",
  });

  // Email preference.
  check("EMAIL;PREF:pref@invalid\r\nEMAIL:other@invalid", {
    PrimaryEmail: "pref@invalid",
    SecondEmail: "other@invalid",
  });
  check("EMAIL:other@invalid\r\nEMAIL;PREF:pref@invalid", {
    PrimaryEmail: "pref@invalid",
    SecondEmail: "other@invalid",
  });

  check("FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=54=C3=A9=24=74=20=23=31", {
    DisplayName: "Té$t #1",
  });
  check(
    "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=54=65=73=74=20=F0=9F=92=A9",
    {
      DisplayName: "Test 💩",
    }
  );
});
