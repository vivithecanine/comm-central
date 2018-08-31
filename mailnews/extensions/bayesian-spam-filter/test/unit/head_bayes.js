ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/MailServices.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://testing-common/mailnews/mailTestUtils.js");
ChromeUtils.import("resource://testing-common/mailnews/localAccountUtils.js");

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

ChromeUtils.import("resource://gre/modules/Services.jsm");

function getSpec(aFileName)
{
  var file = do_get_file("resources/" + aFileName);
  var uri = Services.io.newFileURI(file).QueryInterface(Ci.nsIURL);
  uri = uri.mutate().setQuery("type=application/x-message-display").finalize();
  return uri.spec;
}

registerCleanupFunction(function() {
  load("../../../../resources/mailShutdown.js");
});
