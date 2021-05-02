/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testMUCMessageSenderTooltip() {
  const account = Services.accounts.createAccount("testuser", "prpl-mochitest");
  account.password = "this is a test";
  account.connect();

  await openChatTab();
  const conversation = account.prplAccount.wrappedJSObject.makeMUC("tooltips");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv);
  ok(BrowserTestUtils.is_visible(chatConv));
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addParticipant("foo", "1");
  conversation.addParticipant("bar", "2");
  conversation.addParticipant("loremipsum", "3");
  conversation.addMessages([
    // Message without alias
    {
      who: "foo",
      content: "hi",
      options: {
        incoming: true,
      },
    },
    // Message with alias
    {
      who: "bar",
      content: "o/",
      options: {
        incoming: true,
        _alias: "Bar",
      },
    },
    // Alias is not directly related to nick
    {
      who: "loremipsum",
      content: "what's up?",
      options: {
        incoming: true,
        _alias: "Dolor sit amet",
      },
    },
  ]);
  await BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );

  const tooltip = document.getElementById("imTooltip");
  const tooltipTests = [
    {
      messageIndex: 1,
      who: "foo",
      alias: "1",
      displayed: "foo",
    },
    {
      messageIndex: 2,
      who: "bar",
      alias: "2",
      displayed: "Bar",
    },
    {
      messageIndex: 3,
      who: "loremipsum",
      alias: "3",
      displayed: "Dolor sit amet",
    },
  ];
  window.windowUtils.disableNonTestMouseEvents(true);
  try {
    for (const testInfo of tooltipTests) {
      const usernameSelector = `.message:nth-child(${testInfo.messageIndex}) .ib-sender`;
      const username = messageParent.querySelector(usernameSelector);
      is(username.textContent, testInfo.displayed);

      let buddyInfo = TestUtils.topicObserved(
        "user-info-received",
        (subject, data) => data === testInfo.who
      );
      await showTooltip(usernameSelector, tooltip, chatConv.convBrowser);

      is(tooltip.getAttribute("displayname"), testInfo.who);
      await buddyInfo;
      is(tooltip.table.querySelector("td").textContent, testInfo.alias);
      await hideTooltip(tooltip, chatConv.convBrowser);
    }
  } finally {
    window.windowUtils.disableNonTestMouseEvents(false);
  }

  conversation.close();
  account.disconnect();
  Services.accounts.deleteAccount(account.id);
});

async function showTooltip(elementSelector, tooltip, browser) {
  const popupShown = BrowserTestUtils.waitForEvent(tooltip, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    elementSelector,
    { type: "mousemove" },
    browser
  );
  return popupShown;
}

async function hideTooltip(tooltip, browser) {
  const popupHidden = BrowserTestUtils.waitForEvent(tooltip, "popuphidden");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".message .body",
    { type: "mousemove" },
    browser
  );
  return popupHidden;
}
