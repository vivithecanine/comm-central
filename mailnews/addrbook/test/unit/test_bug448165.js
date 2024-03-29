/**
 * A simple test to check for a regression of bug 448165: Mailnews crashes in
 * nsAbMDBDirectory::DeleteCards if aCards is null
 */
function run_test() {
  // get the Personal Address Book
  const pab = MailServices.ab.getDirectory(kPABData.URI);
  Assert.ok(pab instanceof Ci.nsIAbDirectory);
  try {
    pab.deleteCards(null); // this should throw an error
    do_throw(
      "Error, deleteCards should throw an error when null is passed to it"
    );
  } catch (e) {
    // make sure the correct error message was thrown
    Assert.equal(e.result, Cr.NS_ERROR_XPC_CANT_CONVERT_PRIMITIVE_TO_ARRAY);
  }
}
