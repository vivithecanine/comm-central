/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function check_focus() {
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        let win;

        browser.runtime.onMessage.addListener(msg => {
          return window.sendMessage(msg, win.id);
        });

        win = await browser.windows.create({
          url: "focus.html",
          type: "popup",
          allowScriptsToClose: true,
        });

        await new Promise(resolve => {
          browser.windows.onRemoved.addListener(id => {
            if (id == win.id) {
              resolve();
            }
          });
        });

        browser.test.notifyPass("finished");
      },
      "focus.html": `<!DOCTYPE html>
      <html>
        <head>
        <script src="utils.js"></script>
        <script src="focus.js"></script>
        <title>Focus Test</title>
        </head>
        <body>
          <input id="email" type="text"/>
          <input id="delay" type="number" min="0" max="10" size="2"/>
        </body>
      </html>`,
      "focus.js": () => {
        async function load() {
          let email = document.getElementById("email");
          email.focus();

          await new Promise(r => window.setTimeout(r));
          let [expectedString] = await browser.runtime.sendMessage(
            "sendKeyStrokes"
          );

          // Fails as expected if focus is not set in
          // https://searchfox.org/comm-central/rev/be2751632bd695d17732ff590a71acb9b1ef920c/mail/components/extensions/extensionPopup.js#126-130
          await window.waitForCondition(
            () => email.value == expectedString,
            `Input field should have the correct value. Expected: ${expectedString},  actual: ${email.value}`
          );

          window.close();
        }
        document.addEventListener("DOMContentLoaded", load, { once: true });
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("sendKeyStrokes", id => {
    let window = Services.wm.getOuterWindowWithId(id);
    EventUtils.sendString("happy typing", window);
    extension.sendMessage("happy typing");
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
