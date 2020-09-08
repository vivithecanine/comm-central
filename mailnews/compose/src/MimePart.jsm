/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MimePart"];

let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
let { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");
let { MimeEncoder } = ChromeUtils.import("resource:///modules/MimeEncoder.jsm");
let { MsgUtils } = ChromeUtils.import(
  "resource:///modules/MimeMessageUtils.jsm"
);

Cu.importGlobalProperties(["fetch"]);

/**
 * A class to represent a RFC2045 message. MimePart can be nested, each MimePart
 * can contain a list of MimePart. HTML and plain text are parts as well.
 */
class MimePart {
  /**
   * Init private properties, it's best not to access those properties directly
   * from the outside.
   */
  constructor(contentType = "", forceMsgEncoding = false, isMainBody = false) {
    this._charset = "UTF-8";
    this._contentType = contentType;
    this._forceMsgEncoding = forceMsgEncoding;
    this._isMainBody = isMainBody;

    this._headers = new Map();
    // 8-bit string to avoid converting back and forth.
    this._bodyText = "";
    this._bodyAttachment = null;
    this._separator = "";
    this._parts = [];
  }

  /**
   * Set a header.
   * @param {string} name - The header name, e.g. "Content-Type".
   * @param {string} content - The header content, e.g. "text/plain".
   */
  setHeader(name, content) {
    if (!content) {
      return;
    }
    // There is no Content-Type encoder in jsmime yet. If content is not string,
    // assume it's already a structured header.
    if (name == "content-type" || typeof content != "string") {
      // _headers will be passed to jsmime, which requires header content to be
      // an array.
      this._headers.set(name, [content]);
      return;
    }
    try {
      this._headers.set(name, [
        jsmime.headerparser.parseStructuredHeader(name, content),
      ]);
    } catch (e) {
      this._headers.set(name, [content.trim()]);
    }
  }

  /**
   * Set headers by an iterable.
   * @param {Iterable.<string, string>} entries - The header entries.
   */
  setHeaders(entries) {
    for (let [name, content] of entries) {
      this.setHeader(name, content);
    }
  }

  /**
   * @type {string} text - The string to use as body
   */
  set bodyText(text) {
    this._bodyText = text;
  }

  /**
   * @type {nsIMsgAttachment} attachment - The attachment to use as body
   */
  set bodyAttachment(attachment) {
    this._bodyAttachment = attachment;
  }

  /**
   * Set the content type to multipart/<subtype>.
   * @param {string} subtype - usually "alternative" or "mixed".
   */
  initMultipart(subtype) {
    this._separator = this._makePartSeparator();
    this.setHeader(
      "content-type",
      `multipart/${subtype}; boundary="${this._separator}"`
    );
  }

  /**
   * Add a child part.
   * @param {MimePart} part - A MimePart.
   */
  addPart(part) {
    this._parts.push(part);
  }

  /**
   * Add child parts.
   * @param {MimePart[]} parts - An array of MimePart.
   */
  addParts(parts) {
    this._parts.push(...parts);
  }

  /**
   * Fetch the attachment file to get its content type and content.
   * @returns {string}
   */
  async fetchFile() {
    let res = await fetch(this._bodyAttachment.url);
    // Content-Type is sometimes text/plain;charset=US-ASCII, discard the
    // charset.
    this._contentType = res.headers.get("content-type").split(";")[0];

    let parmFolding = Services.prefs.getIntPref(
      "mail.strictly_mime.parm_folding",
      2
    );
    // File name can contain non-ASCII chars, encode according to RFC 2231.
    let encodedName = MsgUtils.rfc2047EncodeParam(this._bodyAttachment.name);
    let encodedFileName = MsgUtils.rfc2231ParamFolding(
      "filename",
      this._bodyAttachment.name
    );

    let buf = await res.arrayBuffer();
    let content = jsmime.mimeutils.typedArrayToString(new Uint8Array(buf));
    this._charset = MsgUtils.pickCharset(this._contentType, content);

    let contentTypeParams = "";
    if (this._charset) {
      contentTypeParams += `; charset=${this._charset}`;
    }
    if (parmFolding != 2) {
      contentTypeParams += `; name="${encodedName}"`;
    }
    this.setHeader("content-type", `${this._contentType}${contentTypeParams}`);
    this.setHeader("content-disposition", `attachment; ${encodedFileName}`);
    if (this._contentType == "text/html") {
      let contentLocation = MsgUtils.getContentLocation(
        this._bodyAttachment.url
      );
      this.setHeader("content-location", contentLocation);
    }

    return content;
  }

  /**
   * Recursively write a MimePart and its parts to a file.
   * @param {OS.File} file - The output file to contain a RFC2045 message.
   * @param {number} [depth=0] - Nested level of a part.
   */
  async write(file, depth = 0) {
    this._outFile = file;
    let bodyString = this._bodyText;
    // If this is an attachment part, use the attachment content as bodyString.
    if (this._bodyAttachment) {
      bodyString = await this.fetchFile();
    }
    if (bodyString) {
      let encoder = new MimeEncoder(
        this._charset,
        this._contentType,
        this._forceMsgEncoding,
        this._isMainBody,
        bodyString
      );
      encoder.pickEncoding();
      this.setHeader("content-transfer-encoding", encoder.encoding);
      bodyString = encoder.encode();
    } else if (this._isMainBody) {
      this.setHeader("content-transfer-encoding", "7bit");
    }

    // Write out headers.
    await this._writeString(
      jsmime.headeremitter.emitStructuredHeaders(this._headers, {
        useASCII: true,
      })
    );

    // Recursively write out parts.
    if (this._parts.length) {
      // single part message
      if (!this._separator && this._parts.length === 1) {
        await this._parts[0].write(file, depth + 1);
        await this._writeString(`${bodyString}\r\n`);
        return;
      }

      await this._writeString("\r\n");
      if (depth == 0) {
        // Current part is a top part and multipart container.
        await this._writeString(
          "This is a multi-part message in MIME format.\r\n"
        );
      }

      // multipart message
      for (let part of this._parts) {
        await this._writeString(`--${this._separator}\r\n`);
        await part.write(file, depth + 1);
      }
      await this._writeString(`--${this._separator}--\r\n`);
    }

    // Write out body.
    await this._writeString(`\r\n${bodyString}\r\n`);
  }

  /**
   * Write a string to this._outFile.
   * @param {string} str - The string to write.
   */
  async _writeString(str) {
    await this._outFile.write(new TextEncoder().encode(str));
  }

  /**
   * Use 12 hyphen characters and 24 random base64 characters as separator.
   */
  _makePartSeparator() {
    return (
      "------------" +
      btoa(
        String.fromCharCode(
          ...[...Array(18)].map(() => Math.floor(Math.random() * 256))
        )
      )
        // Boundary is used to construct RegExp in tests, + would break those
        // tests.
        .replaceAll("+", "-")
    );
  }
}
