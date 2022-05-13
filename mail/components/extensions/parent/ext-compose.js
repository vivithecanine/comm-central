/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["IOUtils", "PathUtils"]);

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
let { MsgUtils } = ChromeUtils.import(
  "resource:///modules/MimeMessageUtils.jsm"
);

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "FileReader"]);

const deliveryFormats = [
  { id: Ci.nsIMsgCompSendFormat.Auto, value: "auto" },
  { id: Ci.nsIMsgCompSendFormat.PlainText, value: "plaintext" },
  { id: Ci.nsIMsgCompSendFormat.HTML, value: "html" },
  { id: Ci.nsIMsgCompSendFormat.Both, value: "both" },
];

async function parseComposeRecipientList(
  list,
  requireSingleValidEmail = false
) {
  if (!list) {
    return list;
  }

  function isValidAddress(address) {
    return address.includes("@", 1) && !address.endsWith("@");
  }

  // A ComposeRecipientList could be just a single ComposeRecipient.
  if (!Array.isArray(list)) {
    list = [list];
  }

  let recipients = [];
  for (let recipient of list) {
    if (typeof recipient == "string") {
      let addressObjects = MailServices.headerParser.makeFromDisplayAddress(
        recipient
      );

      for (let ao of addressObjects) {
        if (requireSingleValidEmail && !isValidAddress(ao.email)) {
          throw new ExtensionError(`Invalid address: ${ao.email}`);
        }
        recipients.push(
          MailServices.headerParser.makeMimeAddress(ao.name, ao.email)
        );
      }
      continue;
    }
    if (!("addressBookCache" in this)) {
      await extensions.asyncLoadModule("addressBook");
    }
    if (recipient.type == "contact") {
      let contactNode = this.addressBookCache.findContactById(recipient.id);

      if (
        requireSingleValidEmail &&
        !isValidAddress(contactNode.item.primaryEmail)
      ) {
        throw new ExtensionError(
          `Contact does not have a valid email address: ${recipient.id}`
        );
      }
      recipients.push(
        MailServices.headerParser.makeMimeAddress(
          contactNode.item.displayName,
          contactNode.item.primaryEmail
        )
      );
    } else {
      if (requireSingleValidEmail) {
        throw new ExtensionError("Mailing list not allowed.");
      }

      let mailingListNode = this.addressBookCache.findMailingListById(
        recipient.id
      );
      recipients.push(
        MailServices.headerParser.makeMimeAddress(
          mailingListNode.item.dirName,
          mailingListNode.item.description || mailingListNode.item.dirName
        )
      );
    }
  }
  if (requireSingleValidEmail && recipients.length != 1) {
    throw new ExtensionError(
      `Exactly one address instead of ${recipients.length} is required.`
    );
  }
  return recipients.join(",");
}

function composeWindowIsReady(composeWindow) {
  return new Promise(resolve => {
    if (composeWindow.composeEditorReady) {
      resolve();
      return;
    }
    composeWindow.addEventListener("compose-editor-ready", resolve, {
      once: true,
    });
  });
}

async function openComposeWindow(relatedMessageId, type, details, extension) {
  function waitForWindow() {
    return new Promise(resolve => {
      function observer(subject, topic, data) {
        if (subject.location.href == COMPOSE_WINDOW_URI) {
          Services.obs.removeObserver(observer, "chrome-document-loaded");
          resolve(subject.ownerGlobal);
        }
      }
      Services.obs.addObserver(observer, "chrome-document-loaded");
    });
  }

  let format = Ci.nsIMsgCompFormat.Default;
  let identity = null;

  if (details) {
    if (details.isPlainText != null) {
      format = details.isPlainText
        ? Ci.nsIMsgCompFormat.PlainText
        : Ci.nsIMsgCompFormat.HTML;
    } else {
      // If none or both of details.body and details.plainTextBody are given, the
      // default compose format will be used.
      if (details.body != null && details.plainTextBody == null) {
        format = Ci.nsIMsgCompFormat.HTML;
      }
      if (details.plainTextBody != null && details.body == null) {
        format = Ci.nsIMsgCompFormat.PlainText;
      }
    }

    if (details.identityId != null) {
      if (!extension.hasPermission("accountsRead")) {
        throw new ExtensionError(
          'Using identities requires the "accountsRead" permission'
        );
      }

      identity = MailServices.accounts.allIdentities.find(
        i => i.key == details.identityId
      );
      if (!identity) {
        throw new ExtensionError(`Identity not found: ${details.identityId}`);
      }
    }
  }

  // ForwardInline is totally broken, see bug 1513824. Fake it 'til we make it.
  if (
    [
      Ci.nsIMsgCompType.ForwardInline,
      Ci.nsIMsgCompType.Redirect,
      Ci.nsIMsgCompType.EditAsNew,
      Ci.nsIMsgCompType.Template,
    ].includes(type)
  ) {
    let msgHdr = null;
    let msgURI = null;
    if (relatedMessageId) {
      msgHdr = messageTracker.getMessage(relatedMessageId);
      msgURI = msgHdr.folder.getUriForMsg(msgHdr);
    }

    // For the types in this code path, OpenComposeWindow only uses
    // nsIMsgCompFormat.Default or OppositeOfDefault. Check which is needed.
    // See https://hg.mozilla.org/comm-central/file/592fb5c396ebbb75d4acd1f1287a26f56f4164b3/mailnews/compose/src/nsMsgComposeService.cpp#l395
    if (format != Ci.nsIMsgCompFormat.Default) {
      // The mimeConverter used in this code path is not setting any format but
      // defaults to plaintext if no identity and also no default account is set.
      // The "mail.identity.default.compose_html" preference is NOT used.
      let usedIdentity =
        identity || MailServices.accounts.defaultAccount?.defaultIdentity;
      let defaultFormat = usedIdentity?.composeHtml
        ? Ci.nsIMsgCompFormat.HTML
        : Ci.nsIMsgCompFormat.PlainText;
      format =
        format == defaultFormat
          ? Ci.nsIMsgCompFormat.Default
          : Ci.nsIMsgCompFormat.OppositeOfDefault;
    }

    let newWindowPromise = waitForWindow();
    MailServices.compose.OpenComposeWindow(
      null,
      msgHdr,
      msgURI,
      type,
      format,
      identity,
      null,
      null
    );
    let composeWindow = await newWindowPromise;
    await composeWindowIsReady(composeWindow);

    if (details) {
      await setComposeDetails(composeWindow, details, extension);
      if (details.attachments != null) {
        let attachmentData = [];
        for (let data of details.attachments) {
          attachmentData.push(await createAttachment(data));
        }
        await AddAttachmentsToWindow(composeWindow, attachmentData);
      }
    }
    composeWindow.gContentChanged = false;
    return composeWindow;
  }

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  let composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  if (relatedMessageId) {
    let msgHdr = messageTracker.getMessage(relatedMessageId);
    params.originalMsgURI = msgHdr.folder.getUriForMsg(msgHdr);
  }

  params.type = type;
  params.format = format;
  if (identity) {
    params.identity = identity;
  }

  params.composeFields = composeFields;
  let newWindowPromise = waitForWindow();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let composeWindow = await newWindowPromise;
  await composeWindowIsReady(composeWindow);

  // Not all details can be set with params for all types, so some need an extra
  // call to setComposeDetails here. Since we have to use setComposeDetails for
  // the EditAsNew code path, unify API behavior by always calling it here too.
  if (details) {
    await setComposeDetails(composeWindow, details, extension);
    if (details.attachments != null) {
      let attachmentData = [];
      for (let data of details.attachments) {
        attachmentData.push(await createAttachment(data));
      }
      await AddAttachmentsToWindow(composeWindow, attachmentData);
    }
  }
  composeWindow.gContentChanged = false;
  return composeWindow;
}

/**
 * Converts "\r\n" line breaks to "\n" and removes trailing line breaks.
 *
 * @param {string} content - original content
 * @returns {string} - trimmed content
 */
function trimContent(content) {
  let data = content.replaceAll("\r\n", "\n").split("\n");
  while (data[data.length - 1] == "") {
    data.pop();
  }
  return data.join("\n");
}

async function getComposeDetails(composeWindow, extension) {
  await composeWindowIsReady(composeWindow);

  let composeFields = composeWindow.GetComposeDetails();
  let editor = composeWindow.GetCurrentEditor();

  let type;
  // check all known nsIMsgComposeParams
  switch (composeWindow.gComposeType) {
    case Ci.nsIMsgCompType.Draft:
      type = "draft";
      break;
    case Ci.nsIMsgCompType.New:
    case Ci.nsIMsgCompType.Template:
    case Ci.nsIMsgCompType.MailToUrl:
    case Ci.nsIMsgCompType.EditAsNew:
    case Ci.nsIMsgCompType.EditTemplate:
    case Ci.nsIMsgCompType.NewsPost:
      type = "new";
      break;
    case Ci.nsIMsgCompType.Reply:
    case Ci.nsIMsgCompType.ReplyAll:
    case Ci.nsIMsgCompType.ReplyToSender:
    case Ci.nsIMsgCompType.ReplyToGroup:
    case Ci.nsIMsgCompType.ReplyToSenderAndGroup:
    case Ci.nsIMsgCompType.ReplyWithTemplate:
    case Ci.nsIMsgCompType.ReplyToList:
      type = "reply";
      break;
    case Ci.nsIMsgCompType.ForwardAsAttachment:
    case Ci.nsIMsgCompType.ForwardInline:
      type = "forward";
      break;
    case Ci.nsIMsgCompType.Redirect:
      type = "redirect";
      break;
  }

  let relatedMessageId = null;
  if (composeWindow.gMsgCompose.originalMsgURI) {
    try {
      // This throws for messages opened from file and then being replied to.
      let relatedMsgHdr = composeWindow.gMessenger.msgHdrFromURI(
        composeWindow.gMsgCompose.originalMsgURI
      );
      relatedMessageId = messageTracker.getId(relatedMsgHdr);
    } catch (ex) {
      // We are currently unable to get the fake msgHdr from the uri of messages
      // opened from file.
    }
  }

  let customHeaders = [...composeFields.headerNames]
    .map(h => h.toLowerCase())
    .filter(h => h.startsWith("x-"))
    .map(h => {
      return {
        // All-lower-case-names are ugly, so capitalize first letters.
        name: h.replace(/(^|-)[a-z]/g, function(match) {
          return match.toUpperCase();
        }),
        value: composeFields.getHeader(h),
      };
    });

  // We have two file carbon copy settings: fcc and fcc2. fcc allows to override
  // the default identity fcc and fcc2 is coupled to the UI selection.
  let overrideDefaultFcc = false;
  if (composeFields.fcc && composeFields.fcc != "") {
    overrideDefaultFcc = true;
  }
  let overrideDefaultFccFolder = "";
  if (overrideDefaultFcc && !composeFields.fcc.startsWith("nocopy://")) {
    let folder = MailUtils.getExistingFolder(composeFields.fcc);
    if (folder) {
      overrideDefaultFccFolder = convertFolder(folder);
    }
  }
  let additionalFccFolder = "";
  if (composeFields.fcc2 && !composeFields.fcc2.startsWith("nocopy://")) {
    let folder = MailUtils.getExistingFolder(composeFields.fcc2);
    if (folder) {
      additionalFccFolder = convertFolder(folder);
    }
  }

  let deliveryFormat = composeWindow.IsHTMLEditor()
    ? deliveryFormats.find(f => f.id == composeFields.deliveryFormat).value
    : null;

  let body = trimContent(
    editor.outputToString("text/html", Ci.nsIDocumentEncoder.OutputRaw)
  );
  let plainTextBody = trimContent(MsgUtils.convertToPlainText(body, true));

  let details = {
    from: composeFields.splitRecipients(composeFields.from, false).shift(),
    to: composeFields.splitRecipients(composeFields.to, false),
    cc: composeFields.splitRecipients(composeFields.cc, false),
    bcc: composeFields.splitRecipients(composeFields.bcc, false),
    overrideDefaultFcc,
    overrideDefaultFccFolder: overrideDefaultFcc
      ? overrideDefaultFccFolder
      : null,
    additionalFccFolder,
    type,
    relatedMessageId,
    replyTo: composeFields.splitRecipients(composeFields.replyTo, false),
    followupTo: composeFields.splitRecipients(composeFields.followupTo, false),
    newsgroups: composeFields.newsgroups
      ? composeFields.newsgroups.split(",")
      : [],
    subject: composeFields.subject,
    isPlainText: !composeWindow.IsHTMLEditor(),
    deliveryFormat,
    body,
    plainTextBody,
    customHeaders,
    priority: composeFields.priority.toLowerCase() || "normal",
    returnReceipt: composeFields.returnReceipt,
    deliveryStatusNotification: composeFields.DSN,
    attachVCard: composeFields.attachVCard,
  };
  if (extension.hasPermission("accountsRead")) {
    details.identityId = composeWindow.getCurrentIdentityKey();
  }
  return details;
}

async function setFromField(composeWindow, details, extension) {
  if (!details || details.from == null) {
    return;
  }

  let from;
  // Re-throw exceptions from parseComposeRecipientList with a prefix to
  // minimize developers debugging time and make clear where restrictions are
  // coming from.
  try {
    from = await parseComposeRecipientList(details.from, true);
  } catch (ex) {
    throw new ExtensionError(`ComposeDetails.from: ${ex.message}`);
  }
  if (!from) {
    throw new ExtensionError(
      "ComposeDetails.from: Address must not be set to an empty string."
    );
  }

  let identityList = composeWindow.document.getElementById("msgIdentity");
  // Make the from field editable only, if from differs from the currently shown identity.
  if (from != identityList.value) {
    let activeElement = composeWindow.document.activeElement;
    // Manually update from, using the same approach used in
    // https://hg.mozilla.org/comm-central/file/1283451c02926e2b7506a6450445b81f6d076f89/mail/components/compose/content/MsgComposeCommands.js#l3621
    composeWindow.MakeFromFieldEditable(true);
    identityList.value = from;
    activeElement.focus();
  }
}

async function setComposeDetails(composeWindow, details, extension) {
  await composeWindowIsReady(composeWindow);
  let activeElement = composeWindow.document.activeElement;

  // Check if conflicting formats have been specified.
  if (
    details.isPlainText === true &&
    details.body != null &&
    details.plainTextBody == null
  ) {
    throw new ExtensionError(
      "Conflicting format setting: isPlainText =  true and providing a body but no plainTextBody."
    );
  }
  if (
    details.isPlainText === false &&
    details.body == null &&
    details.plainTextBody != null
  ) {
    throw new ExtensionError(
      "Conflicting format setting: isPlainText = false and providing a plainTextBody but no body."
    );
  }

  // Remove any unsupported body type. Otherwise, this will throw an
  // NS_UNEXPECTED_ERROR later. Note: setComposeDetails cannot change the compose
  // format, details.isPlainText is ignored.
  if (composeWindow.IsHTMLEditor()) {
    delete details.plainTextBody;
  } else {
    delete details.body;
  }

  if (details.identityId) {
    if (!extension.hasPermission("accountsRead")) {
      throw new ExtensionError(
        'Using identities requires the "accountsRead" permission'
      );
    }

    let identity = MailServices.accounts.allIdentities.find(
      i => i.key == details.identityId
    );
    if (!identity) {
      throw new ExtensionError(`Identity not found: ${details.identityId}`);
    }
    let identityElement = composeWindow.document.getElementById("msgIdentity");
    identityElement.selectedItem = [
      ...identityElement.childNodes[0].childNodes,
    ].find(e => e.getAttribute("identitykey") == details.identityId);
    composeWindow.LoadIdentity(false);
  }
  for (let field of ["to", "cc", "bcc", "replyTo", "followupTo"]) {
    if (field in details) {
      details[field] = await parseComposeRecipientList(details[field]);
    }
  }
  if (Array.isArray(details.newsgroups)) {
    details.newsgroups = details.newsgroups.join(",");
  }

  composeWindow.SetComposeDetails(details);
  await setFromField(composeWindow, details, extension);

  // Set file carbon copy values.
  if (details.overrideDefaultFcc === false) {
    composeWindow.gMsgCompose.compFields.fcc = "";
  } else if (details.overrideDefaultFccFolder != null) {
    // Override identity fcc with enforced value.
    if (details.overrideDefaultFccFolder) {
      let uri = folderPathToURI(
        details.overrideDefaultFccFolder.accountId,
        details.overrideDefaultFccFolder.path
      );
      let folder = MailUtils.getExistingFolder(uri);
      if (folder) {
        composeWindow.gMsgCompose.compFields.fcc = uri;
      } else {
        throw new ExtensionError(
          `Invalid MailFolder: {accountId:${details.overrideDefaultFccFolder.accountId}, path:${details.overrideDefaultFccFolder.path}}`
        );
      }
    } else {
      composeWindow.gMsgCompose.compFields.fcc = "nocopy://";
    }
  } else if (
    details.overrideDefaultFcc === true &&
    composeWindow.gMsgCompose.compFields.fcc == ""
  ) {
    throw new ExtensionError(
      `Setting overrideDefaultFcc to true requires setting overrideDefaultFccFolder as well`
    );
  }

  if (details.additionalFccFolder != null) {
    if (details.additionalFccFolder) {
      let uri = folderPathToURI(
        details.additionalFccFolder.accountId,
        details.additionalFccFolder.path
      );
      let folder = MailUtils.getExistingFolder(uri);
      if (folder) {
        composeWindow.gMsgCompose.compFields.fcc2 = uri;
      } else {
        throw new ExtensionError(
          `Invalid MailFolder: {accountId:${details.additionalFccFolder.accountId}, path:${details.additionalFccFolder.path}}`
        );
      }
    } else {
      composeWindow.gMsgCompose.compFields.fcc2 = "";
    }
  }

  // Update custom headers, if specified.
  if (details.customHeaders) {
    let newHeaderNames = details.customHeaders.map(h => h.name.toUpperCase());
    let obsoleteHeaderNames = [
      ...composeWindow.gMsgCompose.compFields.headerNames,
    ].filter(h => !newHeaderNames.hasOwnProperty(h.toUpperCase()));
    for (let headerName of obsoleteHeaderNames) {
      composeWindow.gMsgCompose.compFields.deleteHeader(headerName);
    }
    for (let { name, value } of details.customHeaders) {
      composeWindow.gMsgCompose.compFields.setHeader(name, value);
    }
  }

  // Update priorities. The enum in the schema defines all allowed values, no
  // need to validate here.
  if (details.priority) {
    if (details.priority == "normal") {
      composeWindow.gMsgCompose.compFields.priority = "";
    } else {
      composeWindow.gMsgCompose.compFields.priority =
        details.priority[0].toUpperCase() + details.priority.slice(1);
    }
    composeWindow.updatePriorityToolbarButton(
      composeWindow.gMsgCompose.compFields.priority
    );
  }

  // Update receipt notifications.
  if (details.returnReceipt != null) {
    composeWindow.gMsgCompose.compFields.returnReceipt = details.returnReceipt;
    composeWindow.gReceiptOptionChanged = true;
  }
  if (details.deliveryStatusNotification != null) {
    composeWindow.gMsgCompose.compFields.DSN =
      details.deliveryStatusNotification;
    composeWindow.gDSNOptionChanged = true;
  }

  if (details.deliveryFormat && composeWindow.IsHTMLEditor()) {
    // Do not throw when a deliveryFormat is set on a plaint text composer, because
    // it is allowed to set ComposeDetails of an html composer onto a plain text
    // composer (and automatically pick the plainText body). The deliveryFormat
    // will be ignored.
    composeWindow.gMsgCompose.compFields.deliveryFormat = deliveryFormats.find(
      f => f.value == details.deliveryFormat
    ).id;
  }

  if (details.attachVCard != null) {
    composeWindow.gMsgCompose.compFields.attachVCard = details.attachVCard;
    composeWindow.gAttachVCardOptionChanged = true;
  }

  activeElement.focus();
}

async function realFileForFile(file) {
  if (file.mozFullPath) {
    let realFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    realFile.initWithPath(file.mozFullPath);
    return realFile;
  }

  let pathTempDir = Services.dirsvc.get("TmpD", Ci.nsIFile).path;
  let pathTempFile = await IOUtils.createUniqueFile(
    pathTempDir,
    file.name,
    0o600
  );

  let tempFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  tempFile.initWithPath(pathTempFile);
  let extAppLauncher = Cc[
    "@mozilla.org/uriloader/external-helper-app-service;1"
  ].getService(Ci.nsPIExternalAppLauncher);
  extAppLauncher.deleteTemporaryFileOnExit(tempFile);

  let bytes = await new Promise(function(resolve) {
    let reader = new FileReader();
    reader.onloadend = function() {
      let _arrayBuffer = reader.result;
      let _bytes = new Uint8Array(_arrayBuffer);
      resolve(_bytes);
    };
    reader.readAsArrayBuffer(file);
  });

  await IOUtils.write(pathTempFile, bytes);
  return tempFile;
}
async function fileURLForFile(file) {
  let realFile = await realFileForFile(file);
  return Services.io.newFileURI(realFile).spec;
}

async function createAttachment(data) {
  let attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);

  if (data.id) {
    if (!composeAttachmentTracker.hasAttachment(data.id)) {
      throw new ExtensionError(`Invalid attachment ID: ${data.id}`);
    }

    let {
      attachment: originalAttachment,
      window: originalWindow,
    } = composeAttachmentTracker.getAttachment(data.id);

    let originalAttachmentItem = originalWindow.gAttachmentBucket.findItemForAttachment(
      originalAttachment
    );

    attachment.name = data.name || originalAttachment.name;
    attachment.size = originalAttachment.size;
    attachment.url = originalAttachment.url;

    return {
      attachment,
      originalAttachment,
      originalCloudFileAccount: originalAttachmentItem.cloudFileAccount,
      originalCloudFileUpload: originalAttachmentItem.cloudFileUpload,
    };
  }

  if (data.file) {
    attachment.name = data.name || data.file.name;
    attachment.size = data.file.size;
    attachment.url = await fileURLForFile(data.file);
    attachment.contentType = data.file.type;
    return { attachment };
  }

  throw new ExtensionError(`Failed to create attachment.`);
}

async function AddAttachmentsToWindow(window, attachmentData) {
  await window.AddAttachments(attachmentData.map(a => a.attachment));
  // Check if an attachment has been cloned and the cloudFileUpload needs to be
  // re-applied.
  for (let entry of attachmentData) {
    let addedAttachmentItem = window.gAttachmentBucket.findItemForAttachment(
      entry.attachment
    );
    if (!addedAttachmentItem) {
      continue;
    }

    if (
      !entry.originalAttachment ||
      !entry.originalCloudFileAccount ||
      !entry.originalCloudFileUpload
    ) {
      continue;
    }

    let updateSettings = {
      cloudFileAccount: entry.originalCloudFileAccount,
      relatedCloudFileUpload: entry.originalCloudFileUpload,
    };
    if (entry.originalAttachment.name != entry.attachment.name) {
      updateSettings.name = entry.attachment.name;
    }

    try {
      await window.UpdateAttachment(addedAttachmentItem, updateSettings);
    } catch (ex) {
      throw new ExtensionError(ex.message);
    }
  }
}

var composeStates = {
  _states: {
    canSendNow: "cmd_sendNow",
    canSendLater: "cmd_sendLater",
  },

  getStates(tab) {
    let states = {};
    for (let [state, command] of Object.entries(this._states)) {
      state[state] = tab.nativeTab.defaultController.isCommandEnabled(command);
    }
    return states;
  },

  // Translate core states (commands) to API states.
  convert(states) {
    let converted = {};
    for (let [state, command] of Object.entries(this._states)) {
      if (states.hasOwnProperty(command)) {
        converted[state] = states[command];
      }
    }
    return converted;
  },
};

var composeCommands = {
  _commands: {
    sendNow: "cmd_sendNow",
    sendLater: "cmd_sendLater",
    default: "cmd_sendButton",
  },

  // Translate API modes to commands.
  getCommand(mode = "default") {
    return this._commands[mode];
  },

  goDoCommand(tab, command) {
    if (!tab.nativeTab.defaultController.isCommandEnabled(command)) {
      return false;
    }
    tab.nativeTab.goDoCommand(command);
    return true;
  },
};

var composeEventTracker = {
  listeners: new Set(),

  addListener(listener) {
    this.listeners.add(listener);
    if (this.listeners.size == 1) {
      windowTracker.addListener("beforesend", this);
    }
  },
  removeListener(listener) {
    this.listeners.delete(listener);
    if (this.listeners.size == 0) {
      windowTracker.removeListener("beforesend", this);
    }
  },
  async handleEvent(event) {
    event.preventDefault();

    let msgType = event.detail;
    let composeWindow = event.target;

    composeWindow.ToggleWindowLock(true);

    for (let { handler, extension } of this.listeners) {
      let result = await handler(
        composeWindow,
        await getComposeDetails(composeWindow, extension)
      );
      if (!result) {
        continue;
      }
      if (result.cancel) {
        composeWindow.ToggleWindowLock(false);
        return;
      }
      if (result.details) {
        await setComposeDetails(composeWindow, result.details, extension);
      }
    }

    // Load the new details into gMsgCompose.compFields for sending.
    composeWindow.GetComposeDetails();

    // Calling getComposeDetails collapses mailing lists. Expand them again.
    composeWindow.expandRecipients();
    composeWindow.ToggleWindowLock(false);
    await composeWindow.CompleteGenericSendMessage(msgType);
  },
};

var composeAttachmentTracker = {
  _nextId: 1,
  _attachments: new Map(),
  _attachmentIds: new Map(),

  getId(attachment, window) {
    if (this._attachmentIds.has(attachment)) {
      return this._attachmentIds.get(attachment).id;
    }
    let id = this._nextId++;
    this._attachments.set(id, { attachment, window });
    this._attachmentIds.set(attachment, { id, window });
    return id;
  },

  getAttachment(id) {
    return this._attachments.get(id);
  },

  hasAttachment(id) {
    return this._attachments.has(id);
  },

  forgetAttachment(attachment) {
    // This is called on all attachments when the window closes, whether the
    // attachments have been assigned IDs or not.
    let id = this._attachmentIds.get(attachment)?.id;
    if (id) {
      this._attachmentIds.delete(attachment);
      this._attachments.delete(id);
    }
  },

  forgetAttachments(window) {
    if (window.location.href == COMPOSE_WINDOW_URI) {
      let bucket = window.document.getElementById("attachmentBucket");
      for (let item of bucket.itemChildren) {
        this.forgetAttachment(item.attachment);
      }
    }
  },

  convert(attachment, window) {
    return {
      id: this.getId(attachment, window),
      name: attachment.name,
      size: attachment.size,
    };
  },

  getFile(attachment) {
    if (!attachment) {
      return null;
    }
    let uri = Services.io.newURI(attachment.url).QueryInterface(Ci.nsIFileURL);
    // Enforce the actual filename used in the composer, do not leak internal or
    // temporary filenames.
    return File.createFromNsIFile(uri.file, { name: attachment.name });
  },
};

windowTracker.addCloseListener(
  composeAttachmentTracker.forgetAttachments.bind(composeAttachmentTracker)
);

this.compose = class extends ExtensionAPI {
  getAPI(context) {
    function getComposeTab(tabId) {
      let tab = tabManager.get(tabId);
      if (tab instanceof TabmailTab) {
        throw new ExtensionError("Not a valid compose window");
      }
      let location = tab.nativeTab.location.href;
      if (location != COMPOSE_WINDOW_URI) {
        throw new ExtensionError(`Not a valid compose window: ${location}`);
      }
      return tab;
    }

    let { extension } = context;
    let { tabManager, windowManager } = extension;

    return {
      compose: {
        onBeforeSend: new EventManager({
          context,
          name: "compose.onBeforeSend",
          inputHandling: true,
          register: fire => {
            let listener = {
              handler(window, details) {
                let win = windowManager.wrapWindow(window);
                return fire.async(
                  tabManager.convert(win.activeTab.nativeTab),
                  details
                );
              },
              extension,
            };

            composeEventTracker.addListener(listener);
            return () => {
              composeEventTracker.removeListener(listener);
            };
          },
        }).api(),
        onAttachmentAdded: new ExtensionCommon.EventManager({
          context,
          name: "compose.onAttachmentAdded",
          register(fire) {
            async function callback(event) {
              for (let attachment of event.detail) {
                attachment = composeAttachmentTracker.convert(
                  attachment,
                  event.target.ownerGlobal
                );
                fire.async(
                  tabManager.convert(event.target.ownerGlobal),
                  attachment
                );
              }
            }

            windowTracker.addListener("attachments-added", callback);
            return function() {
              windowTracker.removeListener("attachments-added", callback);
            };
          },
        }).api(),
        onAttachmentRemoved: new ExtensionCommon.EventManager({
          context,
          name: "compose.onAttachmentRemoved",
          register(fire) {
            function callback(event) {
              for (let attachment of event.detail) {
                let attachmentId = composeAttachmentTracker.getId(
                  attachment,
                  event.target.ownerGlobal
                );
                fire.async(
                  tabManager.convert(event.target.ownerGlobal),
                  attachmentId
                );
                composeAttachmentTracker.forgetAttachment(attachment);
              }
            }

            windowTracker.addListener("attachments-removed", callback);
            return function() {
              windowTracker.removeListener("attachments-removed", callback);
            };
          },
        }).api(),
        onIdentityChanged: new ExtensionCommon.EventManager({
          context,
          name: "compose.onIdentityChanged",
          register(fire) {
            function callback(event) {
              fire.async(
                tabManager.convert(event.target.ownerGlobal),
                event.target.getCurrentIdentityKey()
              );
            }

            windowTracker.addListener("compose-from-changed", callback);
            return function() {
              windowTracker.removeListener("compose-from-changed", callback);
            };
          },
        }).api(),
        onComposeStateChanged: new ExtensionCommon.EventManager({
          context,
          name: "compose.onComposeStateChanged",
          register(fire) {
            function callback(event) {
              fire.async(
                tabManager.convert(event.target.ownerGlobal),
                composeStates.convert(event.detail)
              );
            }

            windowTracker.addListener("compose-state-changed", callback);
            return function() {
              windowTracker.removeListener("compose-state-changed", callback);
            };
          },
        }).api(),
        onActiveDictionariesChanged: new ExtensionCommon.EventManager({
          context,
          name: "compose.onActiveDictionariesChanged",
          register(fire) {
            function callback(event) {
              let activeDictionaries = event.detail.split(",");
              fire.async(
                tabManager.convert(event.target.ownerGlobal),
                Cc["@mozilla.org/spellchecker/engine;1"]
                  .getService(Ci.mozISpellCheckingEngine)
                  .getDictionaryList()
                  .reduce((list, dict) => {
                    list[dict] = activeDictionaries.includes(dict);
                    return list;
                  }, {})
              );
            }

            windowTracker.addListener("active-dictionaries-changed", callback);
            return function() {
              windowTracker.removeListener(
                "active-dictionaries-changed",
                callback
              );
            };
          },
        }).api(),
        async beginNew(messageId, details) {
          let type = Ci.nsIMsgCompType.New;
          if (messageId) {
            let msgHdr = messageTracker.getMessage(messageId);
            type =
              msgHdr.flags & Ci.nsMsgMessageFlags.Template
                ? Ci.nsIMsgCompType.Template
                : Ci.nsIMsgCompType.EditAsNew;
          }
          let composeWindow = await openComposeWindow(
            messageId,
            type,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        async beginReply(messageId, replyType, details) {
          let type = Ci.nsIMsgCompType.Reply;
          if (replyType == "replyToList") {
            type = Ci.nsIMsgCompType.ReplyToList;
          } else if (replyType == "replyToAll") {
            type = Ci.nsIMsgCompType.ReplyAll;
          }
          let composeWindow = await openComposeWindow(
            messageId,
            type,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        async beginForward(messageId, forwardType, details) {
          let type = Ci.nsIMsgCompType.ForwardInline;
          if (forwardType == "forwardAsAttachment") {
            type = Ci.nsIMsgCompType.ForwardAsAttachment;
          } else if (
            forwardType === null &&
            Services.prefs.getIntPref("mail.forward_message_mode") == 0
          ) {
            type = Ci.nsIMsgCompType.ForwardAsAttachment;
          }
          let composeWindow = await openComposeWindow(
            messageId,
            type,
            details,
            extension
          );
          return tabManager.convert(composeWindow);
        },
        async sendMessage(tabId, options) {
          let command = composeCommands.getCommand(options?.mode);
          let tab = getComposeTab(tabId);
          return composeCommands.goDoCommand(tab, command);
        },
        getComposeState(tabId) {
          let tab = getComposeTab(tabId);
          return composeStates.getStates(tab);
        },
        getComposeDetails(tabId) {
          let tab = getComposeTab(tabId);
          return getComposeDetails(tab.nativeTab, extension);
        },
        setComposeDetails(tabId, details) {
          let tab = getComposeTab(tabId);
          return setComposeDetails(tab.nativeTab, details, extension);
        },
        getActiveDictionaries(tabId) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }

          let dictionaries = tab.nativeTab.gActiveDictionaries;

          // Return the list of installed dictionaries, setting those who are
          // enabled to true.
          return Cc["@mozilla.org/spellchecker/engine;1"]
            .getService(Ci.mozISpellCheckingEngine)
            .getDictionaryList()
            .reduce((list, dict) => {
              list[dict] = dictionaries.has(dict);
              return list;
            }, {});
        },
        async setActiveDictionaries(tabId, activeDictionaries) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }

          let installedDictionaries = Cc["@mozilla.org/spellchecker/engine;1"]
            .getService(Ci.mozISpellCheckingEngine)
            .getDictionaryList();

          for (let dict of activeDictionaries) {
            if (!installedDictionaries.includes(dict)) {
              throw new ExtensionError(`Dictionary not found: ${dict}`);
            }
          }

          await tab.nativeTab.ComposeChangeLanguage(activeDictionaries);
        },
        async listAttachments(tabId) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          let bucket = tab.nativeTab.document.getElementById(
            "attachmentBucket"
          );
          let attachments = [];
          for (let item of bucket.itemChildren) {
            attachments.push(
              composeAttachmentTracker.convert(item.attachment, tab.nativeTab)
            );
          }
          return attachments;
        },
        async getAttachmentFile(attachmentId) {
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment } = composeAttachmentTracker.getAttachment(
            attachmentId
          );
          return composeAttachmentTracker.getFile(attachment);
        },
        async addAttachment(tabId, data) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }

          let attachmentData = await createAttachment(data);
          await AddAttachmentsToWindow(tab.nativeTab, [attachmentData]);
          return composeAttachmentTracker.convert(
            attachmentData.attachment,
            tab.nativeTab
          );
        },
        async updateAttachment(tabId, attachmentId, data) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment, window } = composeAttachmentTracker.getAttachment(
            attachmentId
          );
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          let attachmentItem = window.gAttachmentBucket.findItemForAttachment(
            attachment
          );
          if (!attachmentItem) {
            throw new ExtensionError(`Unexpected invalid attachment item`);
          }

          if (!data.file && !data.name) {
            throw new ExtensionError(
              `Either data.file or data.name property must be specified`
            );
          }

          let realFile = data.file ? await realFileForFile(data.file) : null;
          try {
            await window.UpdateAttachment(attachmentItem, {
              file: realFile,
              name: data.name,
              relatedCloudFileUpload: attachmentItem.cloudFileUpload,
            });
          } catch (ex) {
            throw new ExtensionError(ex.message);
          }

          return composeAttachmentTracker.convert(attachmentItem.attachment);
        },
        async removeAttachment(tabId, attachmentId) {
          let tab = tabManager.get(tabId);
          if (tab.type != "messageCompose") {
            throw new ExtensionError(`Invalid compose tab: ${tabId}`);
          }
          if (!composeAttachmentTracker.hasAttachment(attachmentId)) {
            throw new ExtensionError(`Invalid attachment: ${attachmentId}`);
          }
          let { attachment, window } = composeAttachmentTracker.getAttachment(
            attachmentId
          );
          if (window != tab.nativeTab) {
            throw new ExtensionError(
              `Attachment ${attachmentId} is not associated with tab ${tabId}`
            );
          }

          let item = window.gAttachmentBucket.findItemForAttachment(attachment);
          await window.RemoveAttachments([item]);
        },
      },
    };
  }
};
