/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const p_border_top = "1px solid hsla(#, 100%, 80%, 0.4)";
const p_background =
  "-moz-linear-gradient(top, hsla(#, 100%, 80%, 0.3), hsla(#, 100%, 80%, 0.1) 30px)";
const nick_background =
  "-moz-linear-gradient(top, hsla(#, 100%, 80%, 0.3), hsla(#, 100%, 80%, 0.1) 1em)";

function setColors(target) {
  var senderColor = target.getAttribute("data-senderColor");

  if (!senderColor) {
    return;
  }

  var regexp =
    /color:\s*hsl\(\s*(\d{1,3})\s*,\s*\d{1,3}\%\s*,\s*\d{1,3}\%\s*\)/;
  var parsed = regexp.exec(senderColor);

  if (!parsed) {
    return;
  }

  var senderHue = parsed[1];

  target.style.borderTop = p_border_top.replace("#", senderHue);
  target.style.background = p_background.replace(/#/g, senderHue);
}

function checkNewText(target) {
  if (target.tagName == "P" && target.className != "event-messages") {
    setColors(target);
  }

  var nicks = target.getElementsByClassName("ib-nick");
  for (var i = 0; i < nicks.length; ++i) {
    var nick = nicks[i];
    if (!nick.hasAttribute("data-left")) {
      nick.style.background = nick_background.replace(
        /#/g,
        nick.getAttribute("data-nickColor")
      );
    }
  }
}

new MutationObserver(function (aMutations) {
  for (const mutation of aMutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) {
        checkNewText(node);
      }
    }
  }
}).observe(document.getElementById("ibcontent"), {
  childList: true,
  subtree: true,
});
