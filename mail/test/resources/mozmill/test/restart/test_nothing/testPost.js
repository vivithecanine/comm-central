var jum = {}; ChromeUtils.import("chrome://mozmill/content/modules/jum.js", jum);
var mozmill = {}; ChromeUtils.import("chrome://mozmill/content/modules/mozmill.js", mozmill);


var testAsserts = function() {
  jum.assert(true);
  jum.assertTrue(true);
  jum.assertFalse(false);
  jum.assertEquals('asdf', 'asdf');
  jum.assertNotEquals('asdf', 'fdsa');
  jum.assertNull(null);
  jum.assertNotNull(true);
  jum.assertUndefined({}.asdf);
  jum.assertNotUndefined('asdf');
  jum.assertNaN('a');
  jum.assertNotNaN(4);
  jum.pass();
}

var testAsyncPass = new mozmill.MozMillAsyncTest();

testAsyncPass.testOnePasses = function () {
  jum.assert(true);
  jum.assertTrue(true);
  jum.assertFalse(false);
  jum.assertEquals('asdf', 'asdf');
  jum.assertNotEquals('asdf', 'fdsa');
  jum.assertNull(null);
  jum.assertNotNull(true);
  jum.assertUndefined({}.asdf);
  jum.assertNotUndefined('asdf');
  jum.assertNaN('a');
  jum.assertNotNaN(4);
  jum.pass();
  testAsyncPass.finish();
}
