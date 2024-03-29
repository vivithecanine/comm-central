/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// See chat/content/conversation-browser.js _exposeMethodsToContent
/* globals convScrollEnabled, scrollToElement */

/* [pseudo_color, pseudo_background, bubble_borders] */
const elements_lightness = [
  [75, 94, 80],
  [75, 94, 80],
  [70, 93, 75],
  [65, 92, 70],
  [55, 90, 65],
  [48, 90, 60],
  [44, 86, 50],
  [44, 88, 60],
  [45, 88, 70],
  [45, 90, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [45, 92, 70],
  [60, 92, 70],
  [70, 93, 75],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
  [75, 94, 80],
];

const bubble_background = "hsl(#, 100%, 97%)";
const bubble_borders = "hsl(#, 100%, #%)";
const pseudo_color = "hsl(#, 100%, #%)";
const pseudo_background = "hsl(#, 100%, #%)";

var alternating = null;

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

  var senderHue = (Math.round(parsed[1] / 10) * 10) % 360;
  var lightness = elements_lightness[senderHue / 10];

  target.style.backgroundColor = bubble_background.replace("#", senderHue);
  target.style.borderColor = bubble_borders
    .replace("#", senderHue)
    .replace("#", lightness[2]);

  var pseudo = target.getElementsByClassName("pseudo")[0];
  pseudo.style.color = pseudo_color
    .replace("#", senderHue)
    .replace("#", lightness[0]);
  pseudo.style.backgroundColor = pseudo_background
    .replace("#", senderHue)
    .replace("#", lightness[1]);

  var div_indicator = target.getElementsByClassName("indicator")[0];
  var imageURL = "url('Bitmaps/indicator_" + senderHue;
  if (target.classList.contains("incoming")) {
    // getComputedStyle is prohibitively expensive, and we need it only to
    // know if we are using an alternating variant, so we cache the result.
    if (alternating === null) {
      alternating = document.defaultView
        .getComputedStyle(div_indicator)
        .backgroundImage.endsWith('_alt.png")')
        ? "_alt"
        : "";
    }
    imageURL += alternating;
  }
  div_indicator.style.backgroundImage = imageURL + ".png')";
}

function prettyPrintTime(aValue, aNoSeconds) {
  if (aValue < 60 && aNoSeconds) {
    return "";
  }

  if (aNoSeconds) {
    aValue -= aValue % 60;
  }

  const valuesAndUnits = window.convertTimeUnits(aValue);
  if (!valuesAndUnits[2]) {
    valuesAndUnits.splice(2, 2);
  }
  return valuesAndUnits.join(" ");
}

// The "shadow" constant is the minimum acceptable margin-bottom for a bubble
// with a shadow, and the minimum spacing between the bubbles of two messages
// arriving in the same second. It should match the value of margin-bottom and
// box-shadow-bottom for the "bubble" class.
const shadow = 3;
const coef = 3;
const timebeforetextdisplay = 5 * 60;
const kRulerMarginTop = 11;

const kMsPerMinute = 60 * 1000;
const kMsPerHour = 60 * kMsPerMinute;
const kMsPerDay = 24 * kMsPerHour;

function computeSpace(aInterval) {
  return Math.round(coef * Math.log(aInterval + 1));
}

var lastMessageTimeout;
var lastMessageTimeoutTime = -1;

/* This function takes care of updating the amount of whitespace
 * between the last message and the bottom of the conversation area.
 * When the last message is more than timebeforetextdisplay old, we display
 * the time in text. To avoid blinking Mac scrollbar and visual distractions
 * for some very sensitive users, we update the whitespace only when a new
 * message is displayed or when the user switches between tabs. While the
 * conversation is visible, this function is called by timers, but we will
 * only update the time displayed in text (this behavior is obtained by
 * setting the aUpdateTextOnly parameter to true; otherwise it is omitted).
 */
function handleLastMessage(aUpdateTextOnly) {
  if (window.messageInsertPending) {
    return;
  }

  var intervalInMs = Date.now() - lastMsgTime * 1000;
  var interval = Math.round(intervalInMs / 1000);
  var p = document.getElementById("lastMessage");
  var margin;
  if (!aUpdateTextOnly) {
    // Impose a minimum to ensure the last bubble doesn't touch the editbox.
    margin = computeSpace(Math.max(intervalInMs, 5000) / 1000);
  }
  var text = "";
  if (interval >= timebeforetextdisplay) {
    if (!aUpdateTextOnly) {
      p.style.lineHeight = margin + shadow + "px";
    }
    p.setAttribute("class", "interval");
    text = prettyPrintTime(interval, true);
    margin = 0;
  }
  p.textContent = text;
  if (!aUpdateTextOnly) {
    p.style.marginTop = margin - shadow + "px";
    if (convScrollEnabled()) {
      scrollToElement(p);
    }
  }

  var next = timebeforetextdisplay * 1000 - intervalInMs;
  if (next <= 0) {
    if (intervalInMs > kMsPerDay) {
      next = kMsPerHour - (intervalInMs % kMsPerHour);
    } else {
      next = kMsPerMinute - (intervalInMs % kMsPerMinute);
    }
    aUpdateTextOnly = true;
  }

  // The setTimeout callbacks are frequently called a few ms early,
  // but our code prefers being called a little late, so add 20ms.
  lastMessageTimeoutTime = next + 20;
  lastMessageTimeout = setTimeout(
    handleLastMessage,
    lastMessageTimeoutTime,
    aUpdateTextOnly
  );
}

var lastMsgTime = 0;
function updateLastMsgTime(aMsgTime) {
  if (aMsgTime > lastMsgTime) {
    lastMsgTime = aMsgTime;
  }

  if (lastMsgTime && lastMessageTimeoutTime != 0 && !document.hidden) {
    clearTimeout(lastMessageTimeout);
    setTimeout(handleLastMessage, 0);
    lastMessageTimeoutTime = 0;
  }
}

function visibilityChanged() {
  if (document.hidden) {
    clearTimeout(lastMessageTimeout);
    lastMessageTimeoutTime = -1;
  } else if (lastMsgTime) {
    handleLastMessage();
  }
}

function checkNewText(target) {
  var nicks = target.getElementsByClassName("ib-nick");
  for (var i = 0; i < nicks.length; ++i) {
    var nick = nicks[i];
    if (nick.hasAttribute("data-left")) {
      continue;
    }
    var hue = nick.getAttribute("data-nickColor");
    var senderHue = (Math.round(hue / 10) * 10) % 360;
    var lightness = elements_lightness[senderHue / 10];
    nick.style.backgroundColor = pseudo_background
      .replace("#", senderHue)
      .replace("#", lightness[1]);
    nick.style.color = pseudo_color
      .replace("#", senderHue)
      .replace("#", lightness[0]);
    nick.style.borderColor = bubble_borders
      .replace("#", senderHue)
      .replace("#", lightness[2]);
  }

  var msgTime = null;
  if (target._originalMsg) {
    msgTime = target._originalMsg.time;
  }
  if (target.tagName == "DIV" && target.classList.contains("bubble")) {
    setColors(target);

    var prev = target.previousElementSibling;
    var shouldSetUnreadRuler = prev && prev.id && prev.id == "unread-ruler";
    var shouldSetSessionRuler =
      prev && prev.className && prev.className == "sessionstart-ruler";
    // We need an extra pixel of margin at the top to make the margins appear
    // to be of equal size, since the preceding bubble will have a shadow.
    var rulerMarginBottom = kRulerMarginTop - 1;

    if (lastMsgTime && msgTime >= lastMsgTime) {
      var interval = msgTime - lastMsgTime;
      var margin = computeSpace(interval);
      const isTimetext = interval >= timebeforetextdisplay;
      if (isTimetext) {
        const p = document.createElement("p");
        p.className = "interval";
        if (shouldSetSessionRuler) {
          // Hide the hr and style the time text accordingly instead.
          prev.classList.remove("sessionstart-ruler");
          prev.style.border = "none";
          p.classList.add("sessionstart-ruler");
          margin += 6;
          prev = p;
        }
        p.style.lineHeight = margin + shadow + "px";
        p.style.marginTop = -shadow + "px";
        p.textContent = prettyPrintTime(interval);
        target.parentNode.insertBefore(p, target);
        margin = 0;
      }
      target.style.marginTop = margin + "px";
      if (shouldSetUnreadRuler || shouldSetSessionRuler) {
        if (margin > rulerMarginBottom) {
          // Set the unread ruler margin so it is constant after margin collapse.
          // See https://developer.mozilla.org/en/CSS/margin_collapsing
          rulerMarginBottom -= margin;
        }
        if (isTimetext && shouldSetUnreadRuler) {
          // If a text display follows, use the minimum bubble margin after the
          // ruler, taking account of the absence of a shadow on the ruler.
          rulerMarginBottom = shadow - 1;
        }
      }
    }
    if (shouldSetUnreadRuler || shouldSetSessionRuler) {
      prev.style.marginBottom = rulerMarginBottom + "px";
      prev.style.marginTop = kRulerMarginTop + "px";
    }
  } else if (target.tagName == "P" && target.className == "event") {
    const parent = target.parentNode;
    // We need to start a group with this element if there are at least 4
    // system messages and they aren't already grouped.
    if (!parent?.grouped && parent?.querySelector("p.event:nth-of-type(4)")) {
      const p = document.createElement("p");
      p.className = "eventToggle";
      p.addEventListener("click", event =>
        event.target.parentNode.classList.toggle("hide-children")
      );
      parent.insertBefore(p, parent.querySelector("p.event:nth-of-type(2)"));
      parent.classList.add("hide-children");
      parent.grouped = true;
    }
  }

  if (msgTime) {
    updateLastMsgTime(msgTime);
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

document.addEventListener("visibilitychange", visibilityChanged);
