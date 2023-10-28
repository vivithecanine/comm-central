// Set some prefs that apply to all the tests in this file.
add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      // We don't have pre-pinned certificates for the local mochitest server.
      ["extensions.install.requireBuiltInCerts", false],
      ["extensions.update.requireBuiltInCerts", false],

      // Don't require the extensions to be signed.
      ["xpinstall.signatures.required", false],

      // Point updates to the local mochitest server.
      ["extensions.update.url", `${BASE}/browser_webext_update.json`],
    ],
  });
});

// Helper to test that an update of a given extension does not
// generate any permission prompts.
async function testUpdateNoPrompt(
  filename,
  id,
  initialVersion = "1.0",
  updateVersion = "2.0"
) {
  // Install initial version of the test extension
  let addon = await promiseInstallAddon(`${BASE}/${filename}`);
  ok(addon, "Addon was installed");
  is(addon.version, initialVersion, "Version 1 of the addon is installed");

  // Go to Extensions in about:addons
  const win = await openAddonsMgr("addons://list/extension");

  await waitAboutAddonsViewLoaded(win.document);

  let sawPopup = false;
  function popupListener() {
    sawPopup = true;
  }
  PopupNotifications.panel.addEventListener("popupshown", popupListener);

  // Trigger an update check, we should see the update get applied
  const updatePromise = waitForUpdate(addon);
  triggerPageOptionsAction(win, "check-for-updates");
  await updatePromise;

  addon = await AddonManager.getAddonByID(id);
  is(addon.version, updateVersion, "Should have upgraded");

  ok(!sawPopup, "Should not have seen a permission notification");
  PopupNotifications.panel.removeEventListener("popupshown", popupListener);

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);
  await addon.uninstall();
}

// Test that we don't see a prompt when no new promptable permissions
// are added.
add_task(() =>
  testUpdateNoPrompt(
    "addons/browser_webext_update_perms1.xpi",
    "update_perms@tests.mozilla.org"
  )
);

// Test that an update that narrows origin permissions is just applied without
// showing a notification prompt.
add_task(() =>
  testUpdateNoPrompt(
    "addons/browser_webext_update_origins1.xpi",
    "update_origins@tests.mozilla.org"
  )
);

// Test that an Experiment is not prompting for additional permissions.
add_task(() =>
  testUpdateNoPrompt(
    "addons/browser_webext_experiment.xpi",
    "experiment_test@tests.mozilla.org"
  )
);
