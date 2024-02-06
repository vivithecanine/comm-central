/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  jsmime: "resource:///modules/jsmime.jsm",
  EnigmailArmor: "chrome://openpgp/content/modules/armor.jsm",
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  EnigmailFixExchangeMsg:
    "chrome://openpgp/content/modules/fixExchangeMessage.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  MailCryptoUtils: "resource:///modules/MailCryptoUtils.jsm",
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
});

ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

/**
 * @typedef {object} MimeTreePart - A mime part generated by jsmime using the
 *   jsMimeTreeEmitter (see getMimeTree() defined below).
 *
 * @property {string} partNum
 * @property {Map} headers - Map, containing all headers. Special headers for
 *   contentType and charset.
 * @property {string} [body] - Body, may be omitted
 * @property {MimeTreePart[]} subParts - Array of MimeTreePart with sub parts
 */

/**
 * Class to decrypt a MimeTreePart.
 */
export class MimeTreeDecrypter {
  constructor() {
    this.cryptoChanged = false;
    this.decryptFailure = false;
    this.mimeTree = null;
    this.subject = "";
  }

  /**
   * Decrypts the provided MimeTreePart in-place.
   *
   * @param {MimeTreePart} mimeTreePart
   * @returns {object} a status object
   */
  async decrypt(mimeTreePart) {
    this.mimeTree = mimeTreePart;
    await this.decryptMimeTree(mimeTreePart);
    return {
      cryptoChanged: this.cryptoChanged,
      decryptFailure: this.decryptFailure,
    };
  }

  /**
   *  Walk through the MIME message structure and decrypt the body if there is something to decrypt
   */
  async decryptMimeTree(mimePart) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: decryptMimeTree:\n");

    if (this.isBrokenByExchange(mimePart)) {
      this.fixExchangeMessage(mimePart);
    }

    if (this.isSMIME(mimePart)) {
      this.decryptSMIME(mimePart);
    } else if (this.isPgpMime(mimePart)) {
      this.decryptPGPMIME(mimePart);
    } else if (isAttachment(mimePart)) {
      this.pgpDecryptAttachment(mimePart);
    } else {
      this.decryptINLINE(mimePart);
    }

    for (const i in mimePart.subParts) {
      await this.decryptMimeTree(mimePart.subParts[i]);
    }
  }

  /***
   *
   * Detect if MimeTreePart is PGP/MIME message that got modified by MS-Exchange:
   *
   * - multipart/mixed Container with
   *   - application/pgp-encrypted Attachment with name "PGPMIME Version Identification"
   *   - application/octet-stream Attachment with name "encrypted.asc" having the encrypted content in base64
   * - see:
   *   - https://doesnotexist-openpgp-integration.thunderbird/forum/viewtopic.php?f=4&t=425
   *   - https://sourceforge.net/p/enigmail/forum/support/thread/4add2b69/
   */

  isBrokenByExchange(mime) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: isBrokenByExchange:\n");

    try {
      if (
        mime.subParts &&
        mime.subParts.length === 3 &&
        mime.fullContentType.toLowerCase().includes("multipart/mixed") &&
        mime.subParts[0].subParts.length === 0 &&
        mime.subParts[0].fullContentType.search(/multipart\/encrypted/i) < 0 &&
        mime.subParts[0].fullContentType.toLowerCase().includes("text/plain") &&
        mime.subParts[1].fullContentType
          .toLowerCase()
          .includes("application/pgp-encrypted") &&
        mime.subParts[1].fullContentType
          .toLowerCase()
          .search(/multipart\/encrypted/i) < 0 &&
        mime.subParts[1].fullContentType
          .toLowerCase()
          .search(/PGPMIME Versions? Identification/i) >= 0 &&
        mime.subParts[2].fullContentType
          .toLowerCase()
          .includes("application/octet-stream") &&
        mime.subParts[2].fullContentType.toLowerCase().includes("encrypted.asc")
      ) {
        lazy.EnigmailLog.DEBUG(
          "mimeTree.sys.mjs: isBrokenByExchange: found message broken by MS-Exchange\n"
        );
        return true;
      }
    } catch (ex) {}

    return false;
  }

  decryptSMIME(mimePart) {
    const encrypted = lazy.MailCryptoUtils.binaryStringToTypedArray(
      mimePart.body
    );

    const cmsDecoderJS = Cc["@mozilla.org/nsCMSDecoderJS;1"].createInstance(
      Ci.nsICMSDecoderJS
    );
    const decrypted = cmsDecoderJS.decrypt(encrypted);

    if (decrypted.length === 0) {
      // fail if no data found
      this.decryptFailure = true;
      return;
    }

    let data = "";
    for (const c of decrypted) {
      data += String.fromCharCode(c);
    }

    if (lazy.EnigmailLog.getLogLevel() > 5) {
      lazy.EnigmailLog.DEBUG(
        "*** start data ***\n'" + data + "'\n***end data***\n"
      );
    }

    // Search for the separator between headers and message body.
    let bodyIndex = data.search(/\n\s*\r?\n/);
    if (bodyIndex < 0) {
      // not found, body starts at beginning.
      bodyIndex = 0;
    } else {
      // found, body starts after the headers.
      const wsSize = data.match(/\n\s*\r?\n/);
      bodyIndex += wsSize[0].length;
    }

    if (data.substr(bodyIndex).search(/\r?\n$/) === 0) {
      return;
    }

    const m = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    // headers are found from the beginning up to the start of the body
    m.initialize(data.substr(0, bodyIndex));

    for (const hdrName of [
      "content-type",
      "content-transfer-encoding",
      "content-disposition",
      "content-description",
    ]) {
      mimePart.headers._rawHeaders.delete(hdrName);
      const val = m.extractHeader(hdrName, false);
      if (val) {
        mimePart.headers._rawHeaders.set(hdrName, val);
      }
    }

    mimePart.subParts = [];
    mimePart.body = data.substr(bodyIndex);

    this.cryptoChanged = true;
  }

  isSMIME(mimePart) {
    if (!mimePart.headers.has("content-type")) {
      return false;
    }

    return (
      mimePart.headers.get("content-type").type.toLowerCase() ===
        "application/pkcs7-mime" &&
      mimePart.headers.get("content-type").get("smime-type").toLowerCase() ===
        "enveloped-data" &&
      mimePart.subParts.length === 0
    );
  }

  isPgpMime(mimePart) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: isPgpMime()\n");

    try {
      if (mimePart.headers.has("content-type")) {
        if (
          mimePart.headers.get("content-type").type.toLowerCase() ===
            "multipart/encrypted" &&
          mimePart.headers.get("content-type").get("protocol").toLowerCase() ===
            "application/pgp-encrypted" &&
          mimePart.subParts.length === 2
        ) {
          return true;
        }
      }
    } catch (x) {}
    return false;
  }

  async decryptPGPMIME(mimePart) {
    lazy.EnigmailLog.DEBUG(
      "mimeTree.sys.mjs: decryptPGPMIME(" + mimePart.partNum + ")\n"
    );

    if (!mimePart.subParts[1]) {
      throw new Error("Not a correct PGP/MIME message");
    }

    const uiFlags =
      lazy.EnigmailConstants.UI_INTERACTIVE |
      lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK |
      lazy.EnigmailConstants.UI_IGNORE_MDC_ERROR;
    const exitCodeObj = {};
    const statusFlagsObj = {};
    const userIdObj = {};
    const sigDetailsObj = {};
    const errorMsgObj = {};
    const keyIdObj = {};
    const blockSeparationObj = {
      value: "",
    };
    const encToDetailsObj = {};
    var signatureObj = {};
    signatureObj.value = "";

    const data = lazy.EnigmailDecryption.decryptMessage(
      null,
      uiFlags,
      mimePart.subParts[1].body,
      null, // date
      signatureObj,
      exitCodeObj,
      statusFlagsObj,
      keyIdObj,
      userIdObj,
      sigDetailsObj,
      errorMsgObj,
      blockSeparationObj,
      encToDetailsObj
    );

    if (!data || data.length === 0) {
      if (statusFlagsObj.value & lazy.EnigmailConstants.DISPLAY_MESSAGE) {
        Services.prompt.alert(null, null, errorMsgObj.value);
        throw new Error("Decryption impossible");
      }
    }

    lazy.EnigmailLog.DEBUG(
      "mimeTree.sys.mjs: analyzeDecryptedData: got " + data.length + " bytes\n"
    );

    if (lazy.EnigmailLog.getLogLevel() > 5) {
      lazy.EnigmailLog.DEBUG(
        "*** start data ***\n'" + data + "'\n***end data***\n"
      );
    }

    if (data.length === 0) {
      // fail if no data found
      this.decryptFailure = true;
      return;
    }

    let bodyIndex = data.search(/\n\s*\r?\n/);
    if (bodyIndex < 0) {
      bodyIndex = 0;
    } else {
      const wsSize = data.match(/\n\s*\r?\n/);
      bodyIndex += wsSize[0].length;
    }

    if (data.substr(bodyIndex).search(/\r?\n$/) === 0) {
      return;
    }

    const m = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    m.initialize(data.substr(0, bodyIndex));
    let ct = m.extractHeader("content-type", false) || "";
    const part = mimePart.partNum;

    if (part.length > 0 && part.search(/[^01.]/) < 0) {
      if (ct.search(/protected-headers/i) >= 0) {
        if (m.hasHeader("subject")) {
          let subject = m.extractHeader("subject", false) || "";
          subject = subject.replace(/^(Re: )+/, "Re: ");
          this.mimeTree.headers._rawHeaders.set("subject", [subject]);
        }
      } else if (this.mimeTree.headers.get("subject") === "p≡p") {
        let subject = getPepSubject(data);
        if (subject) {
          subject = subject.replace(/^(Re: )+/, "Re: ");
          this.mimeTree.headers._rawHeaders.set("subject", [subject]);
        }
      } else if (
        !(statusFlagsObj.value & lazy.EnigmailConstants.GOOD_SIGNATURE) &&
        /^multipart\/signed/i.test(ct)
      ) {
        // RFC 3156, Section 6.1 message
        const innerMsg = getMimeTree(data, false);
        if (innerMsg.subParts.length > 0) {
          ct = innerMsg.subParts[0].fullContentType;
          const hdrMap = innerMsg.subParts[0].headers._rawHeaders;
          if (ct.search(/protected-headers/i) >= 0 && hdrMap.has("subject")) {
            let subject = innerMsg.subParts[0].headers._rawHeaders
              .get("subject")
              .join("");
            subject = subject.replace(/^(Re: )+/, "Re: ");
            this.mimeTree.headers._rawHeaders.set("subject", [subject]);
          }
        }
      }
    }

    let boundary = getBoundary(mimePart);
    if (!boundary) {
      boundary = lazy.EnigmailMime.createBoundary();
    }

    // append relevant headers
    mimePart.headers.get("content-type").type = "multipart/mixed";
    mimePart.headers._rawHeaders.set("content-type", [
      'multipart/mixed; boundary="' + boundary + '"',
    ]);
    mimePart.subParts = [
      {
        body: data,
        decryptedPgpMime: true,
        partNum: mimePart.partNum + ".1",
        headers: {
          _rawHeaders: new Map(),
          get() {
            return null;
          },
          has() {
            return false;
          },
        },
        subParts: [],
      },
    ];

    this.cryptoChanged = true;
  }

  pgpDecryptAttachment(mimePart) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: pgpDecryptAttachment()\n");
    const attachmentHead = mimePart.body.substr(0, 30);
    if (attachmentHead.search(/-----BEGIN PGP \w{5,10} KEY BLOCK-----/) >= 0) {
      // attachment appears to be a PGP key file, skip
      return;
    }

    const uiFlags =
      lazy.EnigmailConstants.UI_INTERACTIVE |
      lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK |
      lazy.EnigmailConstants.UI_IGNORE_MDC_ERROR;
    const exitCodeObj = {};
    const statusFlagsObj = {};
    const userIdObj = {};
    const sigDetailsObj = {};
    const errorMsgObj = {};
    const keyIdObj = {};
    const blockSeparationObj = {
      value: "",
    };
    const encToDetailsObj = {};
    var signatureObj = {};
    signatureObj.value = "";

    let attachmentName = getAttachmentName(mimePart);
    attachmentName = attachmentName
      ? attachmentName.replace(/\.(pgp|asc|gpg)$/, "")
      : "";

    const data = lazy.EnigmailDecryption.decryptMessage(
      null,
      uiFlags,
      mimePart.body,
      null, // date
      signatureObj,
      exitCodeObj,
      statusFlagsObj,
      keyIdObj,
      userIdObj,
      sigDetailsObj,
      errorMsgObj,
      blockSeparationObj,
      encToDetailsObj
    );

    if (data || statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_OKAY) {
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: pgpDecryptAttachment: decryption OK\n"
      );
    } else if (
      statusFlagsObj.value &
      (lazy.EnigmailConstants.DECRYPTION_FAILED |
        lazy.EnigmailConstants.MISSING_MDC)
    ) {
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: pgpDecryptAttachment: decryption without MDC protection\n"
      );
    } else if (
      statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_FAILED
    ) {
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: pgpDecryptAttachment: decryption failed\n"
      );
      // Enigmail prompts the user here, but we just keep going.
    } else if (
      statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_INCOMPLETE
    ) {
      // failure; message not complete
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: pgpDecryptAttachment: decryption incomplete\n"
      );
      return;
    } else {
      // there is nothing to be decrypted
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: pgpDecryptAttachment: no decryption required\n"
      );
      return;
    }

    lazy.EnigmailLog.DEBUG(
      "mimeTree.sys.mjs: pgpDecryptAttachment: decrypted to " +
        data.length +
        " bytes\n"
    );
    if (statusFlagsObj.encryptedFileName) {
      attachmentName = statusFlagsObj.encryptedFileName;
    }

    mimePart.body = data;
    mimePart.headers._rawHeaders.set(
      "content-disposition",
      `attachment; filename="${attachmentName}"`
    );
    mimePart.headers._rawHeaders.set("content-transfer-encoding", ["base64"]);
    const origCt = mimePart.headers.get("content-type");
    let ct = origCt.type;

    for (const i of origCt.entries()) {
      if (i[0].toLowerCase() === "name") {
        i[1] = i[1].replace(/\.(pgp|asc|gpg)$/, "");
      }
      ct += `; ${i[0]}="${i[1]}"`;
    }

    mimePart.headers._rawHeaders.set("content-type", [ct]);
  }

  async decryptINLINE(mimePart) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: decryptINLINE()\n");

    if ("decryptedPgpMime" in mimePart && mimePart.decryptedPgpMime) {
      return 0;
    }

    if ("body" in mimePart && mimePart.body.length > 0) {
      const ct = getContentType(mimePart);

      if (ct === "text/html") {
        mimePart.body = this.stripHTMLFromArmoredBlocks(mimePart.body);
      }

      var exitCodeObj = {};
      var statusFlagsObj = {};
      var userIdObj = {};
      var sigDetailsObj = {};
      var errorMsgObj = {};
      var keyIdObj = {};
      var blockSeparationObj = {
        value: "",
      };
      var encToDetailsObj = {};
      var signatureObj = {};
      signatureObj.value = "";

      const uiFlags =
        lazy.EnigmailConstants.UI_INTERACTIVE |
        lazy.EnigmailConstants.UI_UNVERIFIED_ENC_OK |
        lazy.EnigmailConstants.UI_IGNORE_MDC_ERROR;

      var plaintexts = [];
      var blocks = lazy.EnigmailArmor.locateArmoredBlocks(mimePart.body);
      var tmp = [];

      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].blocktype == "MESSAGE") {
          tmp.push(blocks[i]);
        }
      }

      blocks = tmp;

      if (blocks.length < 1) {
        return 0;
      }

      let charset = "utf-8";

      for (let i = 0; i < blocks.length; i++) {
        let plaintext = null;
        do {
          const ciphertext = mimePart.body.substring(
            blocks[i].begin,
            blocks[i].end + 1
          );

          if (ciphertext.length === 0) {
            break;
          }

          const hdr = ciphertext.search(/(\r\r|\n\n|\r\n\r\n)/);
          if (hdr > 0) {
            const chset = ciphertext.substr(0, hdr).match(/^(charset:)(.*)$/im);
            if (chset && chset.length == 3) {
              charset = chset[2].trim();
            }
          }
          plaintext = lazy.EnigmailDecryption.decryptMessage(
            null,
            uiFlags,
            ciphertext,
            null, // date
            signatureObj,
            exitCodeObj,
            statusFlagsObj,
            keyIdObj,
            userIdObj,
            sigDetailsObj,
            errorMsgObj,
            blockSeparationObj,
            encToDetailsObj
          );
          if (!plaintext || plaintext.length === 0) {
            if (statusFlagsObj.value & lazy.EnigmailConstants.DISPLAY_MESSAGE) {
              Services.prompt.alert(null, null, errorMsgObj.value);
              this.cryptoChanged = false;
              this.decryptFailure = true;
              return -1;
            }

            if (
              statusFlagsObj.value &
              (lazy.EnigmailConstants.DECRYPTION_FAILED |
                lazy.EnigmailConstants.MISSING_MDC)
            ) {
              lazy.EnigmailLog.DEBUG(
                "mimeTree.sys.mjs: decryptINLINE: no MDC protection, decrypting anyway\n"
              );
            }
            if (
              statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_FAILED
            ) {
              // since we cannot find out if the user wants to cancel
              // we should ask
              const msg = await lazy.l10n.formatValue(
                "converter-decrypt-body-failed",
                {
                  subject: this.subject,
                }
              );

              if (
                Services.prompt.confirmEx(
                  null,
                  null,
                  msg,
                  Services.prompt.STD_OK_CANCEL_BUTTONS,
                  lazy.l10n.formatValueSync("dlg-button-retry"),
                  lazy.l10n.formatValueSync("dlg-button-skip"),
                  null,
                  null,
                  {}
                )
              ) {
                this.cryptoChanged = false;
                this.decryptFailure = true;
                return -1;
              }
            } else if (
              statusFlagsObj.value &
              lazy.EnigmailConstants.DECRYPTION_INCOMPLETE
            ) {
              this.cryptoChanged = false;
              this.decryptFailure = true;
              return -1;
            } else {
              plaintext = " ";
            }
          }

          if (ct === "text/html") {
            plaintext = plaintext.replace(/\n/gi, "<br/>\n");
          }

          let subject = "";
          if (this.mimeTree.headers.has("subject")) {
            subject = this.mimeTree.headers.get("subject");
          }

          if (
            i == 0 &&
            subject === "pEp" &&
            mimePart.partNum.length > 0 &&
            mimePart.partNum.search(/[^01.]/) < 0
          ) {
            const m = lazy.EnigmailMime.extractSubjectFromBody(plaintext);
            if (m) {
              plaintext = m.messageBody;
              this.mimeTree.headers._rawHeaders.set("subject", [m.subject]);
            }
          }

          if (plaintext) {
            plaintexts.push(plaintext);
          }
        } while (!plaintext || plaintext === "");
      }

      var decryptedMessage =
        mimePart.body.substring(0, blocks[0].begin) + plaintexts[0];
      for (let i = 1; i < blocks.length; i++) {
        decryptedMessage +=
          mimePart.body.substring(blocks[i - 1].end + 1, blocks[i].begin + 1) +
          plaintexts[i];
      }

      decryptedMessage += mimePart.body.substring(
        blocks[blocks.length - 1].end + 1
      );

      // enable base64 encoding if non-ASCII character(s) found
      const j = decryptedMessage.search(/[^\x01-\x7F]/); // eslint-disable-line no-control-regex
      if (j >= 0) {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", [
          "base64",
        ]);
      } else {
        mimePart.headers._rawHeaders.set("content-transfer-encoding", ["8bit"]);
      }
      mimePart.body = decryptedMessage;

      const origCharset = getCharset(mimePart, "content-type");
      if (origCharset) {
        mimePart.headers_rawHeaders.set(
          "content-type",
          getHeaderValue(mimePart, "content-type").replace(origCharset, charset)
        );
      } else {
        mimePart.headers._rawHeaders.set(
          "content-type",
          getHeaderValue(mimePart, "content-type") + "; charset=" + charset
        );
      }

      this.cryptoChanged = true;
      return 1;
    }

    const ct = getContentType(mimePart);
    lazy.EnigmailLog.DEBUG(
      "mimeTree.sys.mjs: Decryption skipped:  " + ct + "\n"
    );

    return 0;
  }

  stripHTMLFromArmoredBlocks(text) {
    var index = 0;
    var begin = text.indexOf("-----BEGIN PGP");
    var end = text.indexOf("-----END PGP");

    while (begin > -1 && end > -1) {
      let sub = text.substring(begin, end);

      sub = sub.replace(/(<([^>]+)>)/gi, "");
      sub = sub.replace(/&[A-z]+;/gi, "");

      text = text.substring(0, begin) + sub + text.substring(end);

      index = end + 10;
      begin = text.indexOf("-----BEGIN PGP", index);
      end = text.indexOf("-----END PGP", index);
    }

    return text;
  }

  fixExchangeMessage(mimePart) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: fixExchangeMessage()\n");

    const msg = mimeTreeToString(mimePart, true);

    try {
      const fixedMsg = lazy.EnigmailFixExchangeMsg.getRepairedMessage(msg);
      const replacement = getMimeTree(fixedMsg, true);

      for (const i in replacement) {
        mimePart[i] = replacement[i];
      }
    } catch (ex) {}
  }
}

function getHeaderValue(mimeStruct, header) {
  lazy.EnigmailLog.DEBUG(
    "mimeTree.sys.mjs: getHeaderValue: '" + header + "'\n"
  );

  try {
    if (mimeStruct.headers.has(header)) {
      const hdrVal = mimeStruct.headers.get(header);
      if (typeof hdrVal == "string") {
        return hdrVal;
      }
      return mimeStruct.headers[header].join(" ");
    }
    return "";
  } catch (ex) {
    lazy.EnigmailLog.DEBUG(
      "mimeTree.sys.mjs: getHeaderValue: header not present\n"
    );
    return "";
  }
}

function getContentType(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      return mime.headers.get("content-type").type.toLowerCase();
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: getContentType: " + e + "\n");
  }
  return null;
}

// return the content of the boundary parameter
function getBoundary(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      return mime.headers.get("content-type").get("boundary");
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: getBoundary: " + e + "\n");
  }
  return null;
}

function getCharset(mime) {
  try {
    if (mime && "headers" in mime && mime.headers.has("content-type")) {
      const c = mime.headers.get("content-type").get("charset");
      if (c) {
        return c.toLowerCase();
      }
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: getCharset: " + e + "\n");
  }
  return null;
}

function getTransferEncoding(mime) {
  try {
    if (
      mime &&
      "headers" in mime &&
      mime.headers._rawHeaders.has("content-transfer-encoding")
    ) {
      const c = mime.headers._rawHeaders.get("content-transfer-encoding")[0];
      if (c) {
        return c.toLowerCase();
      }
    }
  } catch (e) {
    lazy.EnigmailLog.DEBUG(
      "mimeTree.sys.mjs: getTransferEncoding: " + e + "\n"
    );
  }
  return "8Bit";
}

function isAttachment(mime) {
  try {
    if (mime && "headers" in mime) {
      if (mime.fullContentType.search(/^multipart\//i) === 0) {
        return false;
      }
      if (mime.fullContentType.search(/^text\//i) < 0) {
        return true;
      }

      if (mime.headers.has("content-disposition")) {
        const c = mime.headers.get("content-disposition")[0];
        if (c) {
          if (c.search(/^attachment/i) === 0) {
            return true;
          }
        }
      }
    }
  } catch (x) {}
  return false;
}

/**
 * If the given MimeTreePart is an attachment, return its filename.
 *
 * @param {MimeTreePart} mimeTreePart
 * @return {?string} the filename or null
 */
function getAttachmentName(mime) {
  if ("headers" in mime && mime.headers.has("content-disposition")) {
    const c = mime.headers.get("content-disposition")[0];
    if (/^attachment/i.test(c)) {
      return lazy.EnigmailMime.getParameter(c, "filename");
    }
  }
  return null;
}

function getPepSubject(mimeString) {
  lazy.EnigmailLog.DEBUG("mimeTree.sys.mjs: getPepSubject()\n");

  let subject = null;

  const emitter = {
    ct: "",
    firstPlainText: false,
    startPart(partNum, headers) {
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: getPepSubject.startPart: partNum=" + partNum + "\n"
      );
      try {
        this.ct = String(headers.getRawHeader("content-type")).toLowerCase();
        if (!subject && !this.firstPlainText) {
          const s = headers.getRawHeader("subject");
          if (s) {
            subject = String(s);
            this.firstPlainText = true;
          }
        }
      } catch (ex) {
        this.ct = "";
      }
    },

    endPart(partNum) {},

    deliverPartData(partNum, data) {
      lazy.EnigmailLog.DEBUG(
        "mimeTree.sys.mjs: getPepSubject.deliverPartData: partNum=" +
          partNum +
          " ct=" +
          this.ct +
          "\n"
      );
      if (!this.firstPlainText && this.ct.search(/^text\/plain/) === 0) {
        // check data
        this.firstPlainText = true;

        const o = lazy.EnigmailMime.extractSubjectFromBody(data);
        if (o) {
          subject = o.subject;
        }
      }
    },
  };

  const opt = {
    strformat: "unicode",
    bodyformat: "decode",
  };

  try {
    const p = new lazy.jsmime.MimeParser(emitter, opt);
    p.deliverData(mimeString);
  } catch (ex) {}

  return subject;
}

/**
 * Function to reassemble the message from a MimeTreePart.
 *
 * @param {mimeTreePart} mimeTreePart
 * @param {boolean} includeHeaders
 * @returns {string}
 */
export function mimeTreeToString(mimeTreePart, includeHeaders) {
  lazy.EnigmailLog.DEBUG(
    "mimeTree.sys.mjs: mimeTreeToString: part: '" + mimeTreePart.partNum + "'\n"
  );

  let msg = "";
  const rawHdr = mimeTreePart.headers._rawHeaders;

  if (includeHeaders && rawHdr.size > 0) {
    for (const hdr of rawHdr.keys()) {
      const formatted = lazy.EnigmailMime.formatMimeHeader(
        hdr,
        rawHdr.get(hdr)
      );
      msg += formatted;
      if (!formatted.endsWith("\r\n")) {
        msg += "\r\n";
      }
    }

    msg += "\r\n";
  }

  if (mimeTreePart.body.length > 0) {
    let encoding = getTransferEncoding(mimeTreePart);
    if (!encoding) {
      encoding = "8bit";
    }

    if (encoding === "base64") {
      msg += lazy.EnigmailData.encodeBase64(mimeTreePart.body);
    } else {
      const charset = getCharset(mimeTreePart, "content-type");
      if (charset) {
        msg += lazy.EnigmailData.convertFromUnicode(mimeTreePart.body, charset);
      } else {
        msg += mimeTreePart.body;
      }
    }
  }

  if (mimeTreePart.subParts.length > 0) {
    const boundary = lazy.EnigmailMime.getBoundary(
      rawHdr.get("content-type").join("")
    );

    for (const i in mimeTreePart.subParts) {
      msg += `--${boundary}\r\n`;
      msg += mimeTreeToString(mimeTreePart.subParts[i], true);
      if (msg.search(/[\r\n]$/) < 0) {
        msg += "\r\n";
      }
      msg += "\r\n";
    }

    msg += `--${boundary}--\r\n`;
  }
  return msg;
}

/**
 * @callback MimeTreeFromUrlCallback
 *
 * Function is called when parsing is complete.
 * @param {MimeTreePart} aimeTreePart
 */

/**
 * Parse a MIME message and return a tree structure of MimeTreePart
 *
 * @param {string} url - the URL to load and parse
 * @param {boolean} getBody - if true, delivers the body of each MimeTreePart
 * @param {MimeTreeFromUrlCallback} callbackFunc - the callback function that is
 *   called asynchronously when parsing is complete.
 *
 * @returns undefined
 */
export function getMimeTreeFromUrl(url, getBody = false, callbackFunc) {
  function onData(data) {
    const tree = getMimeTree(data, getBody);
    callbackFunc(tree);
  }

  const chan = lazy.EnigmailStreams.createChannel(url);
  const bufferListener = lazy.EnigmailStreams.newStringStreamListener(onData);
  chan.asyncOpen(bufferListener, null);
}

/**
 * Parse a MIME message and return a tree structure of MimeTreePart.
 *
 * @param {string} mimeStr - string of a MIME message
 * @param {boolean} getBody - returned MimeTreePart includes body
 *
 * @returns {MimeTreePart}
 */
export function getMimeTree(mimeStr, getBody = false) {
  const mimeTree = {
    partNum: "",
    headers: null,
    body: "",
    parent: null,
    subParts: [],
  };
  let currentPart = "";
  let currPartNum = "";
  const jsMimeTreeEmitter = {
    createPartObj(partNum, headers, parent) {
      let ct;

      if (headers.has("content-type")) {
        ct = headers.contentType.type;
        const it = headers.get("content-type").entries();
        for (const i of it) {
          ct += "; " + i[0] + '="' + i[1] + '"';
        }
      }

      return {
        partNum,
        headers,
        fullContentType: ct,
        body: "",
        parent,
        subParts: [],
      };
    },

    /** JSMime API */
    startMessage() {
      currentPart = mimeTree;
    },

    endMessage() {},

    startPart(partNum, headers) {
      partNum = "1" + (partNum !== "" ? "." : "") + partNum;
      const newPart = this.createPartObj(partNum, headers, currentPart);

      if (partNum.indexOf(currPartNum) === 0) {
        // found sub-part
        currentPart.subParts.push(newPart);
      } else {
        // found same or higher level
        currentPart.subParts.push(newPart);
      }
      currPartNum = partNum;
      currentPart = newPart;
    },
    endPart(partNum) {
      currentPart = currentPart.parent;
    },

    deliverPartData(partNum, data) {
      if (typeof data === "string") {
        currentPart.body += data;
      } else {
        currentPart.body += lazy.MailStringUtils.uint8ArrayToByteString(data);
      }
    },
  };

  const opt = {
    strformat: "unicode",
    bodyformat: getBody ? "decode" : "none",
    stripcontinuations: false,
  };

  try {
    const p = new lazy.jsmime.MimeParser(jsMimeTreeEmitter, opt);
    p.deliverData(mimeStr);
    return mimeTree.subParts[0];
  } catch (ex) {
    return null;
  }
}
