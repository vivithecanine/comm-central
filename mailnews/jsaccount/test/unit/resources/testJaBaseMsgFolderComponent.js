/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80 filetype=javascript: */
/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

// This file is the component definition for a demo base implementation of a
// javascript msgFolder.

const { JSAccountUtils } = ChromeUtils.import(
  "resource:///modules/jsaccount/JSAccountUtils.jsm"
);
var { JaBaseMsgFolderProperties, JaBaseMsgFolder } = ChromeUtils.import(
  "resource://testing-common/mailnews/testJaBaseMsgFolder.jsm"
);

var xpcomFactory = JSAccountUtils.jaFactory(
  JaBaseMsgFolderProperties,
  JaBaseMsgFolder
);
