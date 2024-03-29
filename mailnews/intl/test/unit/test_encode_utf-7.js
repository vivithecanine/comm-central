// Tests conversion from Unicode to UTF-7. The conversion should fail!

var inString =
  "\u2C62-\u2132\u22A5\u2229 \u0287\u0279oddns \u01DD\u028D s\u0131\u0265\u0287 p\u0250\u01DD\u0279 u\u0250\u0254 no\u028E \u025FI";

var expectedString = "?-??? ??oddns ?? s??? p??? u?? no? ?I";

var aliases = [
  "UTF-7",
  "utf-7",
  "x-unicode-2-0-utf-7",
  "unicode-2-0-utf-7",
  "unicode-1-1-utf-7",
  "csunicode11utf7",
];

function run_test() {
  const converter = CreateScriptableConverter();
  for (let i = 0; i < aliases.length; ++i) {
    checkEncode(converter, aliases[i], inString, expectedString);
  }
}
