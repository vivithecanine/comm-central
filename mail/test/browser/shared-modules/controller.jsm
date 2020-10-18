// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// Adam Christian.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Adam Christian <adam.christian@gmail.com>
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Henrik Skupin <hskupin@mozilla.com>
//  Aaron Train <atrain@mozilla.com>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = ["MozMillController", "sleep"];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var events = ChromeUtils.import("resource://testing-common/mozmill/events.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var elementslib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);
var frame = ChromeUtils.import("resource://testing-common/mozmill/frame.jsm");
frame.log = function(obj) {
  frame.events.fireEvent("log", obj);
};

// Declare most used utils functions in the controller namespace
var sleep = utils.sleep;

var waitForEvents = function() {};

waitForEvents.prototype = {
  /**
   *  Initialize list of events for given node
   */
  init(node, events) {
    if (node.getNode != undefined) {
      node = node.getNode();
    }

    this.events = events;
    this.node = node;
    node.firedEvents = {};
    this.registry = {};

    for (var e of events) {
      var listener = function(event) {
        this.firedEvents[event.type] = true;
      };
      this.registry[e] = listener;
      this.registry[e].result = false;
      this.node.addEventListener(e, this.registry[e], true);
    }
  },

  /**
   * Wait until all assigned events have been fired
   */
  wait(timeout, interval) {
    for (var e in this.registry) {
      utils.waitFor(
        () => {
          return this.node.firedEvents[e];
        },
        "Timeout happened before event '" + e + "' was fired.",
        timeout,
        interval
      );

      this.node.removeEventListener(e, this.registry[e], true);
    }
  },
};

/**
 * Class to handle menus and context menus
 *
 * @constructor
 * @param {MozMillController} controller
 *        Mozmill controller of the window under test
 * @param {string} menuSelector
 *        jQuery like selector string of the element
 * @param {object} document
 *        Document to use for finding the menu
 *        [optional - default: aController.window.document]
 */
var Menu = function(controller, menuSelector, document) {
  this._controller = controller;
  this._menu = null;

  document = document || controller.window.document;
  var node = document.querySelector(menuSelector);
  if (node) {
    // We don't unwrap nodes automatically yet (Bug 573185)
    node = node.wrappedJSObject || node;
    this._menu = new elementslib.Elem(node);
  } else {
    throw new Error("Menu element '" + menuSelector + "' not found.");
  }
};

Menu.prototype = {
  /**
   * Open and populate the menu
   *
   * @param {ElemBase} contextElement
   *        Element whose context menu has to be opened
   * @returns {Menu} The Menu instance
   */
  open(contextElement) {
    // We have to open the context menu
    var menu = this._menu.getNode();
    if (
      (menu.localName == "popup" || menu.localName == "menupopup") &&
      contextElement &&
      contextElement.exists()
    ) {
      this._controller.rightClick(contextElement);
      this._controller.waitFor(function() {
        return menu.state == "open";
      }, "Context menu has been opened.");
    }

    // Run through the entire menu and populate with dynamic entries
    this._buildMenu(menu);

    return this;
  },

  /**
   * Close the menu
   *
   * @returns {Menu} The Menu instance
   */
  close() {
    var menu = this._menu.getNode();
    menu.focus();
    EventUtils.synthesizeKey("VK_ESCAPE", {}, this._controller.window);
    this._controller.waitFor(function() {
      return menu.state == "closed";
    }, "Context menu has been closed.");

    return this;
  },

  /**
   * Retrieve the specified menu entry
   *
   * @param {string} itemSelector
   *        jQuery like selector string of the menu item
   * @returns {ElemBase} Menu element
   * @throws Error If menu element has not been found
   */
  getItem(itemSelector) {
    var node = this._menu.getNode().querySelector(itemSelector);

    if (!node) {
      throw new Error("Menu entry '" + itemSelector + "' not found.");
    }

    return new elementslib.Elem(node);
  },

  /**
   * Click the specified menu entry
   *
   * @param {string} itemSelector
   *        jQuery like selector string of the menu item
   *
   * @returns {Menu} The Menu instance
   */
  click(itemSelector) {
    this._controller.click(this.getItem(itemSelector));

    return this;
  },

  /**
   * Opens the context menu, click the specified entry and
   * make sure that the menu has been closed.
   *
   * @param {string} itemSelector
   *        jQuery like selector string of the element
   * @param {ElemBase} contextElement
   *        Element whose context menu has to be opened
   *
   * @returns {Menu} The Menu instance
   */
  select(itemSelector, contextElement) {
    this.open(contextElement);
    this.click(itemSelector);
    this.close();
  },

  /**
   * Recursive function which iterates through all menu elements and
   * populates the menus with dynamic menu entries.
   *
   * @param {node} menu
   *        Top menu node whose elements have to be populated
   */
  _buildMenu(menu) {
    var items = menu ? menu.children : [];

    Array.from(items).forEach(function(item) {
      // When we have a menu node, fake a click onto it to populate
      // the sub menu with dynamic entries
      if (item.tagName == "menu") {
        var popup = item.querySelector("menupopup");
        if (popup) {
          if (popup.allowevents) {
            events.fakeOpenPopup(this._controller.window, popup);
          }
          this._buildMenu(popup);
        }
      }
    }, this);
  },
};

/**
 * Deprecated - Has to be removed with Mozmill 2.0
 */
var MenuTree = function(aWindow, aMenu) {
  var items = aMenu ? aMenu.children : null;
  if (!items) {
    return;
  }
  for (var node of items) {
    var entry = null;

    switch (node.tagName) {
      case "menu":
        // Fake a click onto the menu to add dynamic entries
        var popup = node.querySelector("menupopup");
        if (popup) {
          if (popup.allowevents) {
            events.fakeOpenPopup(aWindow, popup);
          }
          entry = new MenuTree(aWindow, popup);
        }
        break;
      case "menuitem":
        entry = node;
        break;
      default:
        continue;
    }

    if (entry) {
      var label = node.getAttribute("label");
      this[label] = entry;

      if (node.id) {
        this[node.id] = this[label];
      }
    }
  }
};

var MozMillController = function(window) {
  this.window = window;

  utils.waitFor(
    function() {
      return window != null && this.isLoaded();
    },
    "controller(): Window could not be initialized.",
    undefined,
    undefined,
    this
  );
};

MozMillController.prototype.sleep = utils.sleep;

/**
 * Synthesize keypress events for each character on the given element
 *
 * @param {ElemBase} aTarget
 *        Element which will receive the type event
 * @param {string} aText
 *        The text to send as single keypress events
 * @param {object} aExpectedEvent
 *        Information about the expected event to occur
 *        Elements: target     - Element which should receive the event
 *                               [optional - default: current element]
 *                  type       - Type of the expected key event
 */
MozMillController.prototype.type = function(aTarget, aText, aExpectedEvent) {
  var element = aTarget == null ? this.window : aTarget.getNode();
  if (!element) {
    throw new Error("could not find element " + aTarget.getInfo());
  }

  Array.from(aText).forEach(function(letter) {
    events.triggerKeyEvent(element, "keypress", letter, {}, aExpectedEvent);
  });

  frame.events.pass({ function: "Controller.type()" });
  return true;
};

/**
 * Synthesize a general mouse event on the given element
 *
 * @param {ElemBase} aTarget
 *        Element which will receive the mouse event
 * @param {number} aOffsetX
 *        Relative x offset in the elements bounds to click on
 * @param {number} aOffsetY
 *        Relative y offset in the elements bounds to click on
 * @param {object} aEvent
 *        Information about the event to send
 *        Elements: accelKey   - Hold down the accelerator key (ctrl/meta)
 *                               [optional - default: false]
 *                  altKey     - Hold down the alt key
 *                               [optional - default: false]
 *                  button     - Mouse button to use
 *                               [optional - default: 0]
 *                  clickCount - Number of counts to click
 *                               [optional - default: 1]
 *                  ctrlKey    - Hold down the ctrl key
 *                               [optional - default: false]
 *                  metaKey    - Hold down the meta key (command key on Mac)
 *                               [optional - default: false]
 *                  shiftKey   - Hold down the shift key
 *                               [optional - default: false]
 *                  type       - Type of the mouse event ('click', 'mousedown',
 *                               'mouseup', 'mouseover', 'mouseout')
 *                               [optional - default: 'mousedown' + 'mouseup']
 * @param {object} aExpectedEvent
 *        Information about the expected event to occur
 *        Elements: target     - Element which should receive the event
 *                               [optional - default: current element]
 *                  type       - Type of the expected mouse event
 */
MozMillController.prototype.mouseEvent = function(
  aTarget,
  aOffsetX,
  aOffsetY,
  aEvent,
  aExpectedEvent
) {
  var element = aTarget.getNode();
  if (!element) {
    throw new Error("mouseEvent: could not find element " + aTarget.getInfo());
  }

  // If no offset is given we will use the center of the element to click on.
  var rect = element.getBoundingClientRect();
  if (isNaN(aOffsetX)) {
    aOffsetX = rect.width / 2;
  }
  if (isNaN(aOffsetY)) {
    aOffsetY = rect.height / 2;
  }

  // Scroll element into view otherwise the click will fail
  if (element.scrollIntoView) {
    element.scrollIntoView();
  }

  if (aExpectedEvent) {
    // The expected event type has to be set
    if (!aExpectedEvent.type) {
      throw new Error("mouseEvent: Expected event type not specified");
    }

    // If no target has been specified use the specified element
    var target = aExpectedEvent.target
      ? aExpectedEvent.target.getNode()
      : element;
    if (!target) {
      throw new Error(
        "mouseEvent: could not find element " + aExpectedEvent.target.getInfo()
      );
    }

    EventUtils.synthesizeMouseExpectEvent(
      element,
      aOffsetX,
      aOffsetY,
      aEvent,
      target,
      aExpectedEvent.event,
      "controller.mouseEvent()",
      element.ownerGlobal
    );
  } else {
    EventUtils.synthesizeMouse(
      element,
      aOffsetX,
      aOffsetY,
      aEvent,
      element.ownerGlobal
    );
  }

  sleep(0);
};

/**
 * Synthesize a mouse click event on the given element
 */
MozMillController.prototype.click = function(elem, left, top, expectedEvent) {
  var element = elem.getNode();

  // Handle menu items differently
  if (element && element.tagName == "menuitem") {
    element.click();
  } else {
    this.mouseEvent(elem, left, top, {}, expectedEvent);
  }

  frame.events.pass({ function: "controller.click()" });
};

/**
 * Synthesize a double click on the given element
 */
MozMillController.prototype.doubleClick = function(
  elem,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(elem, left, top, { clickCount: 2 }, expectedEvent);

  frame.events.pass({ function: "controller.doubleClick()" });
  return true;
};

/**
 * Synthesize a mouse down event on the given element
 */
MozMillController.prototype.mouseDown = function(
  elem,
  button,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(
    elem,
    left,
    top,
    { button, type: "mousedown" },
    expectedEvent
  );

  frame.events.pass({ function: "controller.mouseDown()" });
  return true;
};

/**
 * Synthesize a mouse out event on the given element
 */
MozMillController.prototype.mouseOut = function(
  elem,
  button,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(elem, left, top, { button, type: "mouseout" }, expectedEvent);

  frame.events.pass({ function: "controller.mouseOut()" });
  return true;
};

/**
 * Synthesize a mouse over event on the given element
 */
MozMillController.prototype.mouseOver = function(
  elem,
  button,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(
    elem,
    left,
    top,
    { button, type: "mouseover" },
    expectedEvent
  );

  frame.events.pass({ function: "controller.mouseOver()" });
  return true;
};

/**
 * Synthesize a mouse up event on the given element
 */
MozMillController.prototype.mouseUp = function(
  elem,
  button,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(elem, left, top, { button, type: "mouseup" }, expectedEvent);

  frame.events.pass({ function: "controller.mouseUp()" });
  return true;
};

/**
 * Synthesize a mouse middle click event on the given element
 */
MozMillController.prototype.middleClick = function(
  elem,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(elem, left, top, { button: 1 }, expectedEvent);

  frame.events.pass({ function: "controller.middleClick()" });
  return true;
};

/**
 * Synthesize a mouse right click event on the given element
 */
MozMillController.prototype.rightClick = function(
  elem,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(
    elem,
    left,
    top,
    { type: "contextmenu", button: 2 },
    expectedEvent
  );

  frame.events.pass({ function: "controller.rightClick()" });
  return true;
};

/**
 * Synthesize a mouse right click event on the given element (deprecated)
 */
MozMillController.prototype.rightclick = function(...aArgs) {
  frame.log({
    function: "rightclick - Deprecation Warning",
    message: "Controller.rightclick should be renamed to Controller.rightClick",
  });
  this.rightClick(...aArgs);
};

/**
 * Enable/Disable a checkbox depending on the target state
 */
MozMillController.prototype.check = function(el, state) {
  var result = false;
  var element = el.getNode();

  if (!element) {
    throw new Error("could not find element " + el.getInfo());
  }

  state = typeof state == "boolean" ? state : false;
  if (state != element.checked) {
    this.click(el);
    this.waitFor(
      function() {
        return element.checked == state;
      },
      "Checkbox " + el.getInfo() + " could not be checked/unchecked",
      500
    );

    result = true;
  }

  frame.events.pass({
    function: "Controller.check(" + el.getInfo() + ", state: " + state + ")",
  });
  return result;
};

/**
 * Select the given radio button
 */
MozMillController.prototype.radio = function(el) {
  var element = el.getNode();
  if (!element) {
    throw new Error("could not find element " + el.getInfo());
  }

  this.click(el);
  this.waitFor(
    function() {
      return element.checked || element.selected;
    },
    "Radio button " + el.getInfo() + " could not be selected",
    500
  );

  frame.events.pass({ function: "Controller.radio(" + el.getInfo() + ")" });
  return true;
};

/**
 * Checks if the specified window has been loaded
 *
 * @param {DOMWindow} [window=this.window] Window object to check for loaded state
 */
MozMillController.prototype.isLoaded = function(window) {
  var win = window || this.window;

  return (
    win.document.readyState == "complete" && win.location.href != "about:blank"
  );
};

MozMillController.prototype.waitFor = function(
  callback,
  message,
  timeout,
  interval,
  thisObject
) {
  utils.waitFor(callback, message, timeout, interval, thisObject);

  frame.events.pass({ function: "controller.waitFor()" });
};

MozMillController.prototype.waitForElement = function(elem, timeout, interval) {
  this.waitFor(
    function() {
      return elem.exists();
    },
    "Timeout exceeded for waitForElement " + elem.getInfo(),
    timeout,
    interval
  );

  frame.events.pass({ function: "Controller.waitForElement()" });
};

MozMillController.prototype.waitForElementNotPresent = function(
  elem,
  timeout,
  interval
) {
  this.waitFor(
    function() {
      return !elem.exists();
    },
    "Timeout exceeded for waitForElementNotPresent " + elem.getInfo(),
    timeout,
    interval
  );

  frame.events.pass({ function: "Controller.waitForElementNotPresent()" });
};

MozMillController.prototype.__defineGetter__("waitForEvents", function() {
  if (this._waitForEvents == undefined) {
    this._waitForEvents = new waitForEvents();
  }
  return this._waitForEvents;
});

/**
 * Wrapper function to create a new instance of a menu
 * @see Menu
 */
MozMillController.prototype.getMenu = function(menuSelector, document) {
  return new Menu(this, menuSelector, document);
};

MozMillController.prototype.__defineGetter__("mainMenu", function() {
  return this.getMenu("menubar");
});

MozMillController.prototype.__defineGetter__("menus", function() {
  frame.log({
    property: "controller.menus - DEPRECATED",
    message: "Use controller.mainMenu instead.",
  });

  var menubar = this.window.document.querySelector("menubar");
  return new MenuTree(this.window, menubar);
});

MozMillController.prototype.waitForImage = function(elem, timeout, interval) {
  this.waitFor(
    function() {
      return elem.getNode().complete;
    },
    "timeout exceeded for waitForImage " + elem.getInfo(),
    timeout,
    interval
  );

  frame.events.pass({ function: "Controller.waitForImage()" });
};

MozMillController.prototype.waitThenClick = function(elem, timeout, interval) {
  this.waitForElement(elem, timeout, interval);
  this.click(elem);
};

MozMillController.prototype.fireEvent = function(name, obj) {
  if (name == "userShutdown") {
    frame.events.toggleUserShutdown();
  }
  frame.events.fireEvent(name, obj);
};

MozMillController.prototype.startUserShutdown = function(timeout, restart) {
  // 0 = default shutdown, 1 = user shutdown, 2 = user restart
  this.fireEvent("userShutdown", restart ? 2 : 1);
  this.window.setTimeout(this.fireEvent, timeout, "userShutdown", 0);
};

/* Select the specified option and trigger the relevant events of the element.*/
MozMillController.prototype.select = function(el, indx, option, value) {
  var element = el.getNode();
  if (!element) {
    throw new Error("Could not find element " + el.getInfo());
  }

  // if we have a select drop down
  if (element.localName.toLowerCase() == "select") {
    let item = null;

    // The selected item should be set via its index
    if (indx != undefined) {
      // Resetting a menulist has to be handled separately
      if (indx == -1) {
        events.triggerEvent(element, "focus", false);
        element.selectedIndex = indx;
        events.triggerEvent(element, "change", true);

        frame.events.pass({ function: "Controller.select()" });
        return true;
      }
      item = element.options.item(indx);
    } else {
      for (let i = 0; i < element.options.length; i++) {
        let entry = element.options.item(i);
        if (
          (option != undefined && entry.innerHTML == option) ||
          (value != undefined && entry.value == value)
        ) {
          item = entry;
          break;
        }
      }
    }

    // Click the item
    try {
      // EventUtils.synthesizeMouse doesn't work.
      events.triggerEvent(element, "focus", false);
      item.selected = true;
      events.triggerEvent(element, "change", true);

      frame.events.pass({ function: "Controller.select()" });
      return true;
    } catch (ex) {
      throw new Error("No item selected for element " + el.getInfo());
    }
  } else if (element.localName.toLowerCase() == "menulist") {
    // if we have a xul menulist select accordingly
    var ownerDoc = element.ownerDocument;
    let item = null;

    if (indx != undefined) {
      if (indx == -1) {
        events.triggerEvent(element, "focus", false);
        element.selectedIndex = indx;
        events.triggerEvent(element, "change", true);

        frame.events.pass({ function: "Controller.select()" });
        return true;
      }
      item = element.getItemAtIndex(indx);
    } else {
      for (let i = 0; i < element.itemCount; i++) {
        let entry = element.getItemAtIndex(i);
        if (
          (option != undefined && entry.label == option) ||
          (value != undefined && entry.value == value)
        ) {
          item = entry;
          break;
        }
      }
    }

    // Click the item
    try {
      EventUtils.synthesizeMouse(element, 1, 1, {}, ownerDoc.defaultView);
      this.sleep(0);

      // Scroll down until item is visible
      let i, s;
      for (i = s = element.selectedIndex; i <= element.itemCount + s; ++i) {
        let entry = element.getItemAtIndex((i + 1) % element.itemCount);
        EventUtils.synthesizeKey("VK_DOWN", {}, ownerDoc.defaultView);
        if (entry.label == item.label) {
          break;
        } else if (entry.label == "") {
          i += 1;
        }
      }

      EventUtils.synthesizeMouse(item, 1, 1, {}, ownerDoc.defaultView);
      this.sleep(0);

      frame.events.pass({ function: "Controller.select()" });
      return true;
    } catch (ex) {
      throw new Error("No item selected for element " + el.getInfo());
    }
  }
  return false;
};

// Browser navigation functions
MozMillController.prototype.goBack = function() {
  // this.window.focus();
  this.window.content.history.back();
  frame.events.pass({ function: "Controller.goBack()" });
  return true;
};
MozMillController.prototype.goForward = function() {
  // this.window.focus();
  this.window.content.history.forward();
  frame.events.pass({ function: "Controller.goForward()" });
  return true;
};
MozMillController.prototype.refresh = function() {
  // this.window.focus();
  this.window.content.location.reload(true);
  frame.events.pass({ function: "Controller.refresh()" });
  return true;
};

MozMillController.prototype.assertText = function(el, text) {
  // this.window.focus();
  var n = el.getNode();

  if (n && n.innerHTML == text) {
    frame.events.pass({ function: "Controller.assertText()" });
    return true;
  }

  throw new Error(
    "could not validate element " + el.getInfo() + " with text " + text
  );
};

// Assert that a specified node exists
MozMillController.prototype.assertNode = function(el) {
  // this.window.focus();
  var element = el.getNode();
  if (!element) {
    throw new Error("could not find element " + el.getInfo());
  }
  frame.events.pass({ function: "Controller.assertNode()" });
  return true;
};

// Assert that a specified node doesn't exist
MozMillController.prototype.assertNodeNotExist = function(el) {
  // this.window.focus();
  try {
    var element = el.getNode();
  } catch (err) {
    frame.events.pass({ function: "Controller.assertNodeNotExist()" });
    return true;
  }

  if (element) {
    throw new Error("Unexpectedly found element " + el.getInfo());
  }
  frame.events.pass({ function: "Controller.assertNodeNotExist()" });
  return true;
};

// Assert that a form element contains the expected value
MozMillController.prototype.assertValue = function(el, value) {
  // this.window.focus();
  var n = el.getNode();

  if (n && n.value == value) {
    frame.events.pass({ function: "Controller.assertValue()" });
    return true;
  }
  throw new Error(
    "could not validate element " + el.getInfo() + " with value " + value
  );
};

/**
 * Check if the callback function evaluates to true
 */
MozMillController.prototype.assert = function(callback, message, thisObject) {
  if (!callback.call(thisObject)) {
    throw new Error(message || "assert: Failed for '" + callback + "'");
  }

  frame.events.pass({ function: ": controller.assert('" + callback + "')" });
  return true;
};

// Assert that a provided value is selected in a select element
MozMillController.prototype.assertSelected = function(el, value) {
  // this.window.focus();
  var n = el.getNode();
  var validator = value;

  if (n && n.options[n.selectedIndex].value == validator) {
    frame.events.pass({ function: "Controller.assertSelected()" });
    return true;
  }
  throw new Error(
    "could not assert value for element " +
      el.getInfo() +
      " with value " +
      value
  );
};

// Assert that a provided checkbox is checked
MozMillController.prototype.assertChecked = function(el) {
  // this.window.focus();
  var element = el.getNode();

  if (element && element.checked) {
    frame.events.pass({ function: "Controller.assertChecked()" });
    return true;
  }
  throw new Error("assert failed for checked element " + el.getInfo());
};

// Assert that a provided checkbox is not checked
MozMillController.prototype.assertNotChecked = function(el) {
  var element = el.getNode();

  if (!element) {
    throw new Error("Could not find element" + el.getInfo());
  }

  if (!element.hasAttribute("checked") || !element.checked) {
    frame.events.pass({ function: "Controller.assertNotChecked()" });
    return true;
  }
  throw new Error("assert failed for not checked element " + el.getInfo());
};

/**
 * Assert that an element's javascript property exists or has a particular value
 *
 * if val is undefined, will return true if the property exists.
 * if val is specified, will return true if the property exists and has the correct value
 */
MozMillController.prototype.assertJSProperty = function(el, attrib, val) {
  var element = el.getNode();
  if (!element) {
    throw new Error("could not find element " + el.getInfo());
  }
  var value = element[attrib];
  var res =
    value !== undefined &&
    (val === undefined ? true : String(value) == String(val));
  if (res) {
    frame.events.pass({
      function: 'Controller.assertJSProperty("' + el.getInfo() + '") : ' + val,
    });
  } else {
    throw new Error(
      "Controller.assertJSProperty(" +
        el.getInfo() +
        ") : " +
        (val === undefined
          ? "property '" + attrib + "' doesn't exist"
          : val + " == " + value)
    );
  }
  return res;
};
