/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);
const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

let account;

add_task(async () => {
  account = createAccount();
  addIdentity(account);
});

// This test clicks on the action button to open the popup.
add_task(async function test_popup_open_with_click() {
  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    disable_button: true,
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    use_default_popup: true,
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    default_area: "formattoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    default_area: "formattoolbar",
    disable_button: true,
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-mouse-click",
    default_area: "formattoolbar",
    use_default_popup: true,
    window: composeWindow,
  });

  composeWindow.close();
  Services.xulStore.removeDocument(
    "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
});

// This test uses a command from the menus API to open the popup.
add_task(async function test_popup_open_with_menu_command() {
  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    default_area: "maintoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    use_default_popup: true,
    default_area: "formattoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    disable_button: true,
    default_area: "maintoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    disable_button: true,
    default_area: "formattoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    default_area: "maintoolbar",
    window: composeWindow,
  });

  await run_popup_test({
    actionType: "compose_action",
    testType: "open-with-menu-command",
    default_area: "formattoolbar",
    window: composeWindow,
  });

  composeWindow.close();
});

add_task(async function test_theme_icons() {
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      applications: {
        gecko: {
          id: "compose_action@mochi.test",
        },
      },
      compose_action: {
        default_title: "default",
        default_icon: "default.png",
        theme_icons: [
          {
            dark: "dark.png",
            light: "light.png",
            size: 16,
          },
        ],
      },
    },
  });

  await extension.startup();

  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  let uuid = extension.uuid;
  let button = composeWindow.document.getElementById(
    "compose_action_mochi_test-composeAction-toolbarbutton"
  );

  let dark_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-dark@mozilla.org"
  );
  await dark_theme.enable();
  await new Promise(resolve => requestAnimationFrame(resolve));
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/light.png")`,
    `Dark theme should use light icon.`
  );

  let light_theme = await AddonManager.getAddonByID(
    "thunderbird-compact-light@mozilla.org"
  );
  await light_theme.enable();
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/dark.png")`,
    `Light theme should use dark icon.`
  );

  // Disabling a theme will enable the default theme.
  await light_theme.disable();
  Assert.equal(
    composeWindow.getComputedStyle(button).listStyleImage,
    `url("moz-extension://${uuid}/default.png")`,
    `Default theme should use default icon.`
  );

  composeWindow.close();
  await extension.unload();
});

add_task(async function test_button_order() {
  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  await run_action_button_order_test(
    [
      {
        name: "addon1",
        area: "maintoolbar",
        toolbar: "composeToolbar2",
      },
      {
        name: "addon2",
        area: "formattoolbar",
        toolbar: "FormatToolbar",
      },
      {
        name: "addon3",
        area: "maintoolbar",
        toolbar: "composeToolbar2",
      },
      {
        name: "addon4",
        area: "formattoolbar",
        toolbar: "FormatToolbar",
      },
    ],
    composeWindow,
    "compose_action"
  );

  composeWindow.close();
});

add_task(async function test_upgrade() {
  let composeWindow = await openComposeWindow(account);
  await focusWindow(composeWindow);

  // Add a compose_action, to make sure the currentSet has been initialized.
  let extension1 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "1.0",
      name: "Extension1",
      applications: { gecko: { id: "Extension1@mochi.test" } },
      compose_action: {
        default_title: "Extension1",
      },
    },
    background() {
      browser.test.sendMessage("Extension1 ready");
    },
  });
  await extension1.startup();
  await extension1.awaitMessage("Extension1 ready");

  // Add extension without a compose_action.
  let extension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "1.0",
      name: "Extension2",
      applications: { gecko: { id: "Extension2@mochi.test" } },
    },
    background() {
      browser.test.sendMessage("Extension2 ready");
    },
  });
  await extension2.startup();
  await extension2.awaitMessage("Extension2 ready");

  // Update the extension, now including a compose_action.
  let updatedExtension2 = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: {
      manifest_version: 2,
      version: "2.0",
      name: "Extension2",
      applications: { gecko: { id: "Extension2@mochi.test" } },
      compose_action: {
        default_title: "Extension2",
      },
    },
    background() {
      browser.test.sendMessage("Extension2 updated");
    },
  });
  await updatedExtension2.startup();
  await updatedExtension2.awaitMessage("Extension2 updated");

  let button = composeWindow.document.getElementById(
    "extension2_mochi_test-composeAction-toolbarbutton"
  );

  Assert.ok(button, "Button should exist");

  await extension1.unload();
  await extension2.unload();
  await updatedExtension2.unload();

  composeWindow.close();
});
