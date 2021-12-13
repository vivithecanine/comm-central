"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixEvent = exports.EventStatus = void 0;

var _events = require("events");

var _logger = require("../logger");

var _event = require("../@types/event");

var _utils = require("../utils");

var _thread = require("./thread");

var _ReEmitter = require("../ReEmitter");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * Enum for event statuses.
 * @readonly
 * @enum {string}
 */
let EventStatus;
exports.EventStatus = EventStatus;

(function (EventStatus) {
  EventStatus["NOT_SENT"] = "not_sent";
  EventStatus["ENCRYPTING"] = "encrypting";
  EventStatus["SENDING"] = "sending";
  EventStatus["QUEUED"] = "queued";
  EventStatus["SENT"] = "sent";
  EventStatus["CANCELLED"] = "cancelled";
})(EventStatus || (exports.EventStatus = EventStatus = {}));

const interns = {};

function intern(str) {
  if (!interns[str]) {
    interns[str] = str;
  }

  return interns[str];
}
/* eslint-disable camelcase */


class MatrixEvent extends _events.EventEmitter {
  /* curve25519 key which we believe belongs to the sender of the event. See
   * getSenderKey()
   */

  /* ed25519 key which the sender of this event (for olm) or the creator of
   * the megolm session (for megolm) claims to own. See getClaimedEd25519Key()
   */

  /* curve25519 keys of devices involved in telling us about the
   * senderCurve25519Key and claimedEd25519Key.
   * See getForwardingCurve25519KeyChain().
   */

  /* where the decryption key is untrusted
   */

  /* if we have a process decrypting this event, a Promise which resolves
   * when it is finished. Normally null.
   */

  /* flag to indicate if we should retry decrypting this event after the
   * first attempt (eg, we have received new data which means that a second
   * attempt may succeed)
   */

  /* The txnId with which this event was sent if it was during this session,
   * allows for a unique ID which does not change when the event comes back down sync.
   */

  /**
   * @experimental
   * A reference to the thread this event belongs to
   */

  /* Set an approximate timestamp for the event relative the local clock.
   * This will inherently be approximate because it doesn't take into account
   * the time between the server putting the 'age' field on the event as it sent
   * it to us and the time we're now constructing this event, but that's better
   * than assuming the local clock is in sync with the origin HS's clock.
   */
  // XXX: these should be read-only

  /* If the event is a `m.key.verification.request` (or to_device `m.key.verification.start`) event,
   * `Crypto` will set this the `VerificationRequest` for the event
   * so it can be easily accessed from the timeline.
   */

  /**
   * Construct a Matrix Event object
   * @constructor
   *
   * @param {Object} event The raw event to be wrapped in this DAO
   *
   * @prop {Object} event The raw (possibly encrypted) event. <b>Do not access
   * this property</b> directly unless you absolutely have to. Prefer the getter
   * methods defined on this class. Using the getter methods shields your app
   * from changes to event JSON between Matrix versions.
   *
   * @prop {RoomMember} sender The room member who sent this event, or null e.g.
   * this is a presence event. This is only guaranteed to be set for events that
   * appear in a timeline, ie. do not guarantee that it will be set on state
   * events.
   * @prop {RoomMember} target The room member who is the target of this event, e.g.
   * the invitee, the person being banned, etc.
   * @prop {EventStatus} status The sending status of the event.
   * @prop {Error} error most recent error associated with sending the event, if any
   * @prop {boolean} forwardLooking True if this event is 'forward looking', meaning
   * that getDirectionalContent() will return event.content and not event.prev_content.
   * Default: true. <strong>This property is experimental and may change.</strong>
   */
  constructor(event = {}) {
    super(); // intern the values of matrix events to force share strings and reduce the
    // amount of needless string duplication. This can save moderate amounts of
    // memory (~10% on a 350MB heap).
    // 'membership' at the event level (rather than the content level) is a legacy
    // field that Element never otherwise looks at, but it will still take up a lot
    // of space if we don't intern it.

    this.event = event;

    _defineProperty(this, "pushActions", null);

    _defineProperty(this, "_replacingEvent", null);

    _defineProperty(this, "_localRedactionEvent", null);

    _defineProperty(this, "_isCancelled", false);

    _defineProperty(this, "clearEvent", void 0);

    _defineProperty(this, "senderCurve25519Key", null);

    _defineProperty(this, "claimedEd25519Key", null);

    _defineProperty(this, "forwardingCurve25519KeyChain", []);

    _defineProperty(this, "untrusted", null);

    _defineProperty(this, "_decryptionPromise", null);

    _defineProperty(this, "retryDecryption", false);

    _defineProperty(this, "txnId", null);

    _defineProperty(this, "thread", null);

    _defineProperty(this, "localTimestamp", void 0);

    _defineProperty(this, "sender", null);

    _defineProperty(this, "target", null);

    _defineProperty(this, "status", null);

    _defineProperty(this, "error", null);

    _defineProperty(this, "forwardLooking", true);

    _defineProperty(this, "verificationRequest", null);

    _defineProperty(this, "reEmitter", void 0);

    ["state_key", "type", "sender", "room_id", "membership"].forEach(prop => {
      if (typeof event[prop] !== "string") return;
      event[prop] = intern(event[prop]);
    });
    ["membership", "avatar_url", "displayname"].forEach(prop => {
      if (typeof event.content?.[prop] !== "string") return;
      event.content[prop] = intern(event.content[prop]);
    });
    ["rel_type"].forEach(prop => {
      if (typeof event.content?.["m.relates_to"]?.[prop] !== "string") return;
      event.content["m.relates_to"][prop] = intern(event.content["m.relates_to"][prop]);
    });
    this.txnId = event.txn_id || null;
    this.localTimestamp = Date.now() - this.getAge();
    this.reEmitter = new _ReEmitter.ReEmitter(this);
  }
  /**
   * Gets the event as though it would appear unencrypted. If the event is already not
   * encrypted, it is simply returned as-is.
   * @returns {IEvent} The event in wire format.
   */


  getEffectiveEvent() {
    const content = Object.assign({}, this.getContent()); // clone for mutation

    if (this.getWireType() === _event.EventType.RoomMessageEncrypted) {
      // Encrypted events sometimes aren't symmetrical on the `content` so we'll copy
      // that over too, but only for missing properties. We don't copy over mismatches
      // between the plain and decrypted copies of `content` because we assume that the
      // app is relying on the decrypted version, so we want to expose that as a source
      // of truth here too.
      for (const [key, value] of Object.entries(this.getWireContent())) {
        // Skip fields from the encrypted event schema though - we don't want to leak
        // these.
        if (["algorithm", "ciphertext", "device_id", "sender_key", "session_id"].includes(key)) {
          continue;
        }

        if (content[key] === undefined) content[key] = value;
      }
    } // clearEvent doesn't have all the fields, so we'll copy what we can from this.event.
    // We also copy over our "fixed" content key.


    return Object.assign({}, this.event, this.clearEvent, {
      content
    });
  }
  /**
   * Get the event_id for this event.
   * @return {string} The event ID, e.g. <code>$143350589368169JsLZx:localhost
   * </code>
   */


  getId() {
    return this.event.event_id;
  }
  /**
   * Get the user_id for this event.
   * @return {string} The user ID, e.g. <code>@alice:matrix.org</code>
   */


  getSender() {
    return this.event.sender || this.event.user_id; // v2 / v1
  }
  /**
   * Get the (decrypted, if necessary) type of event.
   *
   * @return {string} The event type, e.g. <code>m.room.message</code>
   */


  getType() {
    if (this.clearEvent) {
      return this.clearEvent.type;
    }

    return this.event.type;
  }
  /**
   * Get the (possibly encrypted) type of the event that will be sent to the
   * homeserver.
   *
   * @return {string} The event type.
   */


  getWireType() {
    return this.event.type;
  }
  /**
   * Get the room_id for this event. This will return <code>undefined</code>
   * for <code>m.presence</code> events.
   * @return {string} The room ID, e.g. <code>!cURbafjkfsMDVwdRDQ:matrix.org
   * </code>
   */


  getRoomId() {
    return this.event.room_id;
  }
  /**
   * Get the timestamp of this event.
   * @return {Number} The event timestamp, e.g. <code>1433502692297</code>
   */


  getTs() {
    return this.event.origin_server_ts;
  }
  /**
   * Get the timestamp of this event, as a Date object.
   * @return {Date} The event date, e.g. <code>new Date(1433502692297)</code>
   */


  getDate() {
    return this.event.origin_server_ts ? new Date(this.event.origin_server_ts) : null;
  }
  /**
   * Get the (decrypted, if necessary) event content JSON, even if the event
   * was replaced by another event.
   *
   * @return {Object} The event content JSON, or an empty object.
   */


  getOriginalContent() {
    if (this._localRedactionEvent) {
      return {};
    }

    if (this.clearEvent) {
      return this.clearEvent.content || {};
    }

    return this.event.content || {};
  }
  /**
   * Get the (decrypted, if necessary) event content JSON,
   * or the content from the replacing event, if any.
   * See `makeReplaced`.
   *
   * @return {Object} The event content JSON, or an empty object.
   */


  getContent() {
    if (this._localRedactionEvent) {
      return {};
    } else if (this._replacingEvent) {
      return this._replacingEvent.getContent()["m.new_content"] || {};
    } else {
      return this.getOriginalContent();
    }
  }
  /**
   * Get the (possibly encrypted) event content JSON that will be sent to the
   * homeserver.
   *
   * @return {Object} The event content JSON, or an empty object.
   */


  getWireContent() {
    return this.event.content || {};
  }
  /**
   * @experimental
   * Get the event ID of the thread head
   */


  get threadRootId() {
    const relatesTo = this.getWireContent()?.["m.relates_to"];

    if (relatesTo?.rel_type === _event.RelationType.Thread) {
      return relatesTo.event_id;
    }
  }
  /**
   * @experimental
   */


  get isThreadRelation() {
    return !!this.threadRootId;
  }
  /**
   * @experimental
   */


  get isThreadRoot() {
    // TODO, change the inner working of this getter for it to use the
    // bundled relationship return on the event, view MSC3440
    const thread = this.getThread();
    return thread?.id === this.getId();
  }

  get parentEventId() {
    return this.replyEventId || this.relationEventId;
  }

  get replyEventId() {
    const relations = this.getWireContent()["m.relates_to"];
    return relations?.["m.in_reply_to"]?.["event_id"];
  }

  get relationEventId() {
    return this.getWireContent()?.["m.relates_to"]?.event_id;
  }
  /**
   * Get the previous event content JSON. This will only return something for
   * state events which exist in the timeline.
   * @return {Object} The previous event content JSON, or an empty object.
   */


  getPrevContent() {
    // v2 then v1 then default
    return this.getUnsigned().prev_content || this.event.prev_content || {};
  }
  /**
   * Get either 'content' or 'prev_content' depending on if this event is
   * 'forward-looking' or not. This can be modified via event.forwardLooking.
   * In practice, this means we get the chronologically earlier content value
   * for this event (this method should surely be called getEarlierContent)
   * <strong>This method is experimental and may change.</strong>
   * @return {Object} event.content if this event is forward-looking, else
   * event.prev_content.
   */


  getDirectionalContent() {
    return this.forwardLooking ? this.getContent() : this.getPrevContent();
  }
  /**
   * Get the age of this event. This represents the age of the event when the
   * event arrived at the device, and not the age of the event when this
   * function was called.
   * @return {Number} The age of this event in milliseconds.
   */


  getAge() {
    return this.getUnsigned().age || this.event.age; // v2 / v1
  }
  /**
   * Get the age of the event when this function was called.
   * This is the 'age' field adjusted according to how long this client has
   * had the event.
   * @return {Number} The age of this event in milliseconds.
   */


  getLocalAge() {
    return Date.now() - this.localTimestamp;
  }
  /**
   * Get the event state_key if it has one. This will return <code>undefined
   * </code> for message events.
   * @return {string} The event's <code>state_key</code>.
   */


  getStateKey() {
    return this.event.state_key;
  }
  /**
   * Check if this event is a state event.
   * @return {boolean} True if this is a state event.
   */


  isState() {
    return this.event.state_key !== undefined;
  }
  /**
   * Replace the content of this event with encrypted versions.
   * (This is used when sending an event; it should not be used by applications).
   *
   * @internal
   *
   * @param {string} cryptoType type of the encrypted event - typically
   * <tt>"m.room.encrypted"</tt>
   *
   * @param {object} cryptoContent raw 'content' for the encrypted event.
   *
   * @param {string} senderCurve25519Key curve25519 key to record for the
   *   sender of this event.
   *   See {@link module:models/event.MatrixEvent#getSenderKey}.
   *
   * @param {string} claimedEd25519Key claimed ed25519 key to record for the
   *   sender if this event.
   *   See {@link module:models/event.MatrixEvent#getClaimedEd25519Key}
   */


  makeEncrypted(cryptoType, cryptoContent, senderCurve25519Key, claimedEd25519Key) {
    // keep the plain-text data for 'view source'
    this.clearEvent = {
      type: this.event.type,
      content: this.event.content
    };
    this.event.type = cryptoType;
    this.event.content = cryptoContent;
    this.senderCurve25519Key = senderCurve25519Key;
    this.claimedEd25519Key = claimedEd25519Key;
  }
  /**
   * Check if this event is currently being decrypted.
   *
   * @return {boolean} True if this event is currently being decrypted, else false.
   */


  isBeingDecrypted() {
    return this._decryptionPromise != null;
  }

  getDecryptionPromise() {
    return this._decryptionPromise;
  }
  /**
   * Check if this event is an encrypted event which we failed to decrypt
   *
   * (This implies that we might retry decryption at some point in the future)
   *
   * @return {boolean} True if this event is an encrypted event which we
   *     couldn't decrypt.
   */


  isDecryptionFailure() {
    return this.clearEvent?.content?.msgtype === "m.bad.encrypted";
  }

  shouldAttemptDecryption() {
    return this.isEncrypted() && !this.isBeingDecrypted() && !this.clearEvent;
  }
  /**
   * Start the process of trying to decrypt this event.
   *
   * (This is used within the SDK: it isn't intended for use by applications)
   *
   * @internal
   *
   * @param {module:crypto} crypto crypto module
   * @param {object} options
   * @param {boolean} options.isRetry True if this is a retry (enables more logging)
   * @param {boolean} options.emit Emits "event.decrypted" if set to true
   *
   * @returns {Promise} promise which resolves (to undefined) when the decryption
   * attempt is completed.
   */


  async attemptDecryption(crypto, options = {}) {
    // For backwards compatibility purposes
    // The function signature used to be attemptDecryption(crypto, isRetry)
    if (typeof options === "boolean") {
      options = {
        isRetry: options
      };
    } // start with a couple of sanity checks.


    if (!this.isEncrypted()) {
      throw new Error("Attempt to decrypt event which isn't encrypted");
    }

    if (this.clearEvent && !this.isDecryptionFailure()) {
      // we may want to just ignore this? let's start with rejecting it.
      throw new Error("Attempt to decrypt event which has already been decrypted");
    } // if we already have a decryption attempt in progress, then it may
    // fail because it was using outdated info. We now have reason to
    // succeed where it failed before, but we don't want to have multiple
    // attempts going at the same time, so just set a flag that says we have
    // new info.
    //


    if (this._decryptionPromise) {
      _logger.logger.log(`Event ${this.getId()} already being decrypted; queueing a retry`);

      this.retryDecryption = true;
      return this._decryptionPromise;
    }

    this._decryptionPromise = this.decryptionLoop(crypto, options);
    return this._decryptionPromise;
  }
  /**
   * Cancel any room key request for this event and resend another.
   *
   * @param {module:crypto} crypto crypto module
   * @param {string} userId the user who received this event
   *
   * @returns {Promise} a promise that resolves when the request is queued
   */


  cancelAndResendKeyRequest(crypto, userId) {
    const wireContent = this.getWireContent();
    return crypto.requestRoomKey({
      algorithm: wireContent.algorithm,
      room_id: this.getRoomId(),
      session_id: wireContent.session_id,
      sender_key: wireContent.sender_key
    }, this.getKeyRequestRecipients(userId), true);
  }
  /**
   * Calculate the recipients for keyshare requests.
   *
   * @param {string} userId the user who received this event.
   *
   * @returns {Array} array of recipients
   */


  getKeyRequestRecipients(userId) {
    // send the request to all of our own devices, and the
    // original sending device if it wasn't us.
    const wireContent = this.getWireContent();
    const recipients = [{
      userId,
      deviceId: '*'
    }];
    const sender = this.getSender();

    if (sender !== userId) {
      recipients.push({
        userId: sender,
        deviceId: wireContent.device_id
      });
    }

    return recipients;
  }

  async decryptionLoop(crypto, options = {}) {
    // make sure that this method never runs completely synchronously.
    // (doing so would mean that we would clear _decryptionPromise *before*
    // it is set in attemptDecryption - and hence end up with a stuck
    // `_decryptionPromise`).
    await Promise.resolve(); // eslint-disable-next-line no-constant-condition

    while (true) {
      this.retryDecryption = false;
      let res;
      let err;

      try {
        if (!crypto) {
          res = this.badEncryptedMessage("Encryption not enabled");
        } else {
          res = await crypto.decryptEvent(this);

          if (options.isRetry === true) {
            _logger.logger.info(`Decrypted event on retry (id=${this.getId()})`);
          }
        }
      } catch (e) {
        if (e.name !== "DecryptionError") {
          // not a decryption error: log the whole exception as an error
          // (and don't bother with a retry)
          const re = options.isRetry ? 're' : '';

          _logger.logger.error(`Error ${re}decrypting event ` + `(id=${this.getId()}): ${e.stack || e}`);

          this._decryptionPromise = null;
          this.retryDecryption = false;
          return;
        }

        err = e; // see if we have a retry queued.
        //
        // NB: make sure to keep this check in the same tick of the
        //   event loop as `_decryptionPromise = null` below - otherwise we
        //   risk a race:
        //
        //   * A: we check retryDecryption here and see that it is
        //        false
        //   * B: we get a second call to attemptDecryption, which sees
        //        that _decryptionPromise is set so sets
        //        retryDecryption
        //   * A: we continue below, clear _decryptionPromise, and
        //        never do the retry.
        //

        if (this.retryDecryption) {
          // decryption error, but we have a retry queued.
          _logger.logger.log(`Got error decrypting event (id=${this.getId()}: ` + `${e}), but retrying`);

          continue;
        } // decryption error, no retries queued. Warn about the error and
        // set it to m.bad.encrypted.


        _logger.logger.warn(`Error decrypting event (id=${this.getId()}): ${e.detailedString}`);

        res = this.badEncryptedMessage(e.message);
      } // at this point, we've either successfully decrypted the event, or have given up
      // (and set res to a 'badEncryptedMessage'). Either way, we can now set the
      // cleartext of the event and raise Event.decrypted.
      //
      // make sure we clear '_decryptionPromise' before sending the 'Event.decrypted' event,
      // otherwise the app will be confused to see `isBeingDecrypted` still set when
      // there isn't an `Event.decrypted` on the way.
      //
      // see also notes on retryDecryption above.
      //


      this._decryptionPromise = null;
      this.retryDecryption = false;
      this.setClearData(res); // Before we emit the event, clear the push actions so that they can be recalculated
      // by relevant code. We do this because the clear event has now changed, making it
      // so that existing rules can be re-run over the applicable properties. Stuff like
      // highlighting when the user's name is mentioned rely on this happening. We also want
      // to set the push actions before emitting so that any notification listeners don't
      // pick up the wrong contents.

      this.setPushActions(null);

      if (options.emit !== false) {
        this.emit("Event.decrypted", this, err);
      }

      return;
    }
  }

  badEncryptedMessage(reason) {
    return {
      clearEvent: {
        type: "m.room.message",
        content: {
          msgtype: "m.bad.encrypted",
          body: "** Unable to decrypt: " + reason + " **"
        }
      }
    };
  }
  /**
   * Update the cleartext data on this event.
   *
   * (This is used after decrypting an event; it should not be used by applications).
   *
   * @internal
   *
   * @fires module:models/event.MatrixEvent#"Event.decrypted"
   *
   * @param {module:crypto~EventDecryptionResult} decryptionResult
   *     the decryption result, including the plaintext and some key info
   */


  setClearData(decryptionResult) {
    this.clearEvent = decryptionResult.clearEvent;
    this.senderCurve25519Key = decryptionResult.senderCurve25519Key || null;
    this.claimedEd25519Key = decryptionResult.claimedEd25519Key || null;
    this.forwardingCurve25519KeyChain = decryptionResult.forwardingCurve25519KeyChain || [];
    this.untrusted = decryptionResult.untrusted || false;
  }
  /**
   * Gets the cleartext content for this event. If the event is not encrypted,
   * or encryption has not been completed, this will return null.
   *
   * @returns {Object} The cleartext (decrypted) content for the event
   */


  getClearContent() {
    return this.clearEvent ? this.clearEvent.content : null;
  }
  /**
   * Check if the event is encrypted.
   * @return {boolean} True if this event is encrypted.
   */


  isEncrypted() {
    return !this.isState() && this.event.type === "m.room.encrypted";
  }
  /**
   * The curve25519 key for the device that we think sent this event
   *
   * For an Olm-encrypted event, this is inferred directly from the DH
   * exchange at the start of the session: the curve25519 key is involved in
   * the DH exchange, so only a device which holds the private part of that
   * key can establish such a session.
   *
   * For a megolm-encrypted event, it is inferred from the Olm message which
   * established the megolm session
   *
   * @return {string}
   */


  getSenderKey() {
    return this.senderCurve25519Key;
  }
  /**
   * The additional keys the sender of this encrypted event claims to possess.
   *
   * Just a wrapper for #getClaimedEd25519Key (q.v.)
   *
   * @return {Object<string, string>}
   */


  getKeysClaimed() {
    return {
      ed25519: this.claimedEd25519Key
    };
  }
  /**
   * Get the ed25519 the sender of this event claims to own.
   *
   * For Olm messages, this claim is encoded directly in the plaintext of the
   * event itself. For megolm messages, it is implied by the m.room_key event
   * which established the megolm session.
   *
   * Until we download the device list of the sender, it's just a claim: the
   * device list gives a proof that the owner of the curve25519 key used for
   * this event (and returned by #getSenderKey) also owns the ed25519 key by
   * signing the public curve25519 key with the ed25519 key.
   *
   * In general, applications should not use this method directly, but should
   * instead use MatrixClient.getEventSenderDeviceInfo.
   *
   * @return {string}
   */


  getClaimedEd25519Key() {
    return this.claimedEd25519Key;
  }
  /**
   * Get the curve25519 keys of the devices which were involved in telling us
   * about the claimedEd25519Key and sender curve25519 key.
   *
   * Normally this will be empty, but in the case of a forwarded megolm
   * session, the sender keys are sent to us by another device (the forwarding
   * device), which we need to trust to do this. In that case, the result will
   * be a list consisting of one entry.
   *
   * If the device that sent us the key (A) got it from another device which
   * it wasn't prepared to vouch for (B), the result will be [A, B]. And so on.
   *
   * @return {string[]} base64-encoded curve25519 keys, from oldest to newest.
   */


  getForwardingCurve25519KeyChain() {
    return this.forwardingCurve25519KeyChain;
  }
  /**
   * Whether the decryption key was obtained from an untrusted source. If so,
   * we cannot verify the authenticity of the message.
   *
   * @return {boolean}
   */


  isKeySourceUntrusted() {
    return this.untrusted;
  }

  getUnsigned() {
    return this.event.unsigned || {};
  }

  unmarkLocallyRedacted() {
    const value = this._localRedactionEvent;
    this._localRedactionEvent = null;

    if (this.event.unsigned) {
      this.event.unsigned.redacted_because = null;
    }

    return !!value;
  }

  markLocallyRedacted(redactionEvent) {
    if (this._localRedactionEvent) return;
    this.emit("Event.beforeRedaction", this, redactionEvent);
    this._localRedactionEvent = redactionEvent;

    if (!this.event.unsigned) {
      this.event.unsigned = {};
    }

    this.event.unsigned.redacted_because = redactionEvent.event;
  }
  /**
   * Update the content of an event in the same way it would be by the server
   * if it were redacted before it was sent to us
   *
   * @param {module:models/event.MatrixEvent} redactionEvent
   *     event causing the redaction
   */


  makeRedacted(redactionEvent) {
    // quick sanity-check
    if (!redactionEvent.event) {
      throw new Error("invalid redactionEvent in makeRedacted");
    }

    this._localRedactionEvent = null;
    this.emit("Event.beforeRedaction", this, redactionEvent);
    this._replacingEvent = null; // we attempt to replicate what we would see from the server if
    // the event had been redacted before we saw it.
    //
    // The server removes (most of) the content of the event, and adds a
    // "redacted_because" key to the unsigned section containing the
    // redacted event.

    if (!this.event.unsigned) {
      this.event.unsigned = {};
    }

    this.event.unsigned.redacted_because = redactionEvent.event;
    let key;

    for (key in this.event) {
      if (!this.event.hasOwnProperty(key)) {
        continue;
      }

      if (!REDACT_KEEP_KEYS.has(key)) {
        delete this.event[key];
      }
    }

    const keeps = REDACT_KEEP_CONTENT_MAP[this.getType()] || {};
    const content = this.getContent();

    for (key in content) {
      if (!content.hasOwnProperty(key)) {
        continue;
      }

      if (!keeps[key]) {
        delete content[key];
      }
    }
  }
  /**
   * Check if this event has been redacted
   *
   * @return {boolean} True if this event has been redacted
   */


  isRedacted() {
    return Boolean(this.getUnsigned().redacted_because);
  }
  /**
   * Check if this event is a redaction of another event
   *
   * @return {boolean} True if this event is a redaction
   */


  isRedaction() {
    return this.getType() === "m.room.redaction";
  }
  /**
   * Get the (decrypted, if necessary) redaction event JSON
   * if event was redacted
   *
   * @returns {object} The redaction event JSON, or an empty object
   */


  getRedactionEvent() {
    if (!this.isRedacted()) return null;

    if (this.clearEvent?.unsigned) {
      return this.clearEvent?.unsigned.redacted_because;
    } else if (this.event.unsigned.redacted_because) {
      return this.event.unsigned.redacted_because;
    } else {
      return {};
    }
  }
  /**
   * Get the push actions, if known, for this event
   *
   * @return {?Object} push actions
   */


  getPushActions() {
    return this.pushActions;
  }
  /**
   * Set the push actions for this event.
   *
   * @param {Object} pushActions push actions
   */


  setPushActions(pushActions) {
    this.pushActions = pushActions;
  }
  /**
   * Replace the `event` property and recalculate any properties based on it.
   * @param {Object} event the object to assign to the `event` property
   */


  handleRemoteEcho(event) {
    const oldUnsigned = this.getUnsigned();
    const oldId = this.getId();
    this.event = event; // if this event was redacted before it was sent, it's locally marked as redacted.
    // At this point, we've received the remote echo for the event, but not yet for
    // the redaction that we are sending ourselves. Preserve the locally redacted
    // state by copying over redacted_because so we don't get a flash of
    // redacted, not-redacted, redacted as remote echos come in

    if (oldUnsigned.redacted_because) {
      if (!this.event.unsigned) {
        this.event.unsigned = {};
      }

      this.event.unsigned.redacted_because = oldUnsigned.redacted_because;
    } // successfully sent.


    this.setStatus(null);

    if (this.getId() !== oldId) {
      // emit the event if it changed
      this.emit("Event.localEventIdReplaced", this);
    }
  }
  /**
   * Whether the event is in any phase of sending, send failure, waiting for
   * remote echo, etc.
   *
   * @return {boolean}
   */


  isSending() {
    return !!this.status;
  }
  /**
   * Update the event's sending status and emit an event as well.
   *
   * @param {String} status The new status
   */


  setStatus(status) {
    this.status = status;
    this.emit("Event.status", this, status);
  }

  replaceLocalEventId(eventId) {
    this.event.event_id = eventId;
    this.emit("Event.localEventIdReplaced", this);
  }
  /**
   * Get whether the event is a relation event, and of a given type if
   * `relType` is passed in.
   *
   * @param {string?} relType if given, checks that the relation is of the
   * given type
   * @return {boolean}
   */


  isRelation(relType = undefined) {
    // Relation info is lifted out of the encrypted content when sent to
    // encrypted rooms, so we have to check `getWireContent` for this.
    const content = this.getWireContent();
    const relation = content && content["m.relates_to"];
    return relation && relation.rel_type && relation.event_id && (relType && relation.rel_type === relType || !relType);
  }
  /**
   * Get relation info for the event, if any.
   *
   * @return {Object}
   */


  getRelation() {
    if (!this.isRelation()) {
      return null;
    }

    return this.getWireContent()["m.relates_to"];
  }
  /**
   * Set an event that replaces the content of this event, through an m.replace relation.
   *
   * @fires module:models/event.MatrixEvent#"Event.replaced"
   *
   * @param {MatrixEvent?} newEvent the event with the replacing content, if any.
   */


  makeReplaced(newEvent) {
    // don't allow redacted events to be replaced.
    // if newEvent is null we allow to go through though,
    // as with local redaction, the replacing event might get
    // cancelled, which should be reflected on the target event.
    if (this.isRedacted() && newEvent) {
      return;
    }

    if (this._replacingEvent !== newEvent) {
      this._replacingEvent = newEvent;
      this.emit("Event.replaced", this);
    }
  }
  /**
   * Returns the status of any associated edit or redaction
   * (not for reactions/annotations as their local echo doesn't affect the original event),
   * or else the status of the event.
   *
   * @return {EventStatus}
   */


  getAssociatedStatus() {
    if (this._replacingEvent) {
      return this._replacingEvent.status;
    } else if (this._localRedactionEvent) {
      return this._localRedactionEvent.status;
    }

    return this.status;
  }

  getServerAggregatedRelation(relType) {
    const relations = this.getUnsigned()["m.relations"];

    if (relations) {
      return relations[relType];
    }
  }
  /**
   * Returns the event ID of the event replacing the content of this event, if any.
   *
   * @return {string?}
   */


  replacingEventId() {
    const replaceRelation = this.getServerAggregatedRelation(_event.RelationType.Replace);

    if (replaceRelation) {
      return replaceRelation.event_id;
    } else if (this._replacingEvent) {
      return this._replacingEvent.getId();
    }
  }
  /**
   * Returns the event replacing the content of this event, if any.
   * Replacements are aggregated on the server, so this would only
   * return an event in case it came down the sync, or for local echo of edits.
   *
   * @return {MatrixEvent?}
   */


  replacingEvent() {
    return this._replacingEvent;
  }
  /**
   * Returns the origin_server_ts of the event replacing the content of this event, if any.
   *
   * @return {Date?}
   */


  replacingEventDate() {
    const replaceRelation = this.getServerAggregatedRelation(_event.RelationType.Replace);

    if (replaceRelation) {
      const ts = replaceRelation.origin_server_ts;

      if (Number.isFinite(ts)) {
        return new Date(ts);
      }
    } else if (this._replacingEvent) {
      return this._replacingEvent.getDate();
    }
  }
  /**
   * Returns the event that wants to redact this event, but hasn't been sent yet.
   * @return {MatrixEvent} the event
   */


  localRedactionEvent() {
    return this._localRedactionEvent;
  }
  /**
   * For relations and redactions, returns the event_id this event is referring to.
   *
   * @return {string?}
   */


  getAssociatedId() {
    const relation = this.getRelation();

    if (relation) {
      return relation.event_id;
    } else if (this.isRedaction()) {
      return this.event.redacts;
    }
  }
  /**
   * Checks if this event is associated with another event. See `getAssociatedId`.
   *
   * @return {boolean}
   */


  hasAssocation() {
    return !!this.getAssociatedId();
  }
  /**
   * Update the related id with a new one.
   *
   * Used to replace a local id with remote one before sending
   * an event with a related id.
   *
   * @param {string} eventId the new event id
   */


  updateAssociatedId(eventId) {
    const relation = this.getRelation();

    if (relation) {
      relation.event_id = eventId;
    } else if (this.isRedaction()) {
      this.event.redacts = eventId;
    }
  }
  /**
   * Flags an event as cancelled due to future conditions. For example, a verification
   * request event in the same sync transaction may be flagged as cancelled to warn
   * listeners that a cancellation event is coming down the same pipe shortly.
   * @param {boolean} cancelled Whether the event is to be cancelled or not.
   */


  flagCancelled(cancelled = true) {
    this._isCancelled = cancelled;
  }
  /**
   * Gets whether or not the event is flagged as cancelled. See flagCancelled() for
   * more information.
   * @returns {boolean} True if the event is cancelled, false otherwise.
   */


  isCancelled() {
    return this._isCancelled;
  }
  /**
   * Get a copy/snapshot of this event. The returned copy will be loosely linked
   * back to this instance, though will have "frozen" event information. Other
   * properties of this MatrixEvent instance will be copied verbatim, which can
   * mean they are in reference to this instance despite being on the copy too.
   * The reference the snapshot uses does not change, however members aside from
   * the underlying event will not be deeply cloned, thus may be mutated internally.
   * For example, the sender profile will be copied over at snapshot time, and
   * the sender profile internally may mutate without notice to the consumer.
   *
   * This is meant to be used to snapshot the event details themselves, not the
   * features (such as sender) surrounding the event.
   * @returns {MatrixEvent} A snapshot of this event.
   */


  toSnapshot() {
    const ev = new MatrixEvent(JSON.parse(JSON.stringify(this.event)));

    for (const [p, v] of Object.entries(this)) {
      if (p !== "event") {
        // exclude the thing we just cloned
        ev[p] = v;
      }
    }

    return ev;
  }
  /**
   * Determines if this event is equivalent to the given event. This only checks
   * the event object itself, not the other properties of the event. Intended for
   * use with toSnapshot() to identify events changing.
   * @param {MatrixEvent} otherEvent The other event to check against.
   * @returns {boolean} True if the events are the same, false otherwise.
   */


  isEquivalentTo(otherEvent) {
    if (!otherEvent) return false;
    if (otherEvent === this) return true;
    const myProps = (0, _utils.deepSortedObjectEntries)(this.event);
    const theirProps = (0, _utils.deepSortedObjectEntries)(otherEvent.event);
    return JSON.stringify(myProps) === JSON.stringify(theirProps);
  }
  /**
   * Summarise the event as JSON. This is currently used by React SDK's view
   * event source feature and Seshat's event indexing, so take care when
   * adjusting the output here.
   *
   * If encrypted, include both the decrypted and encrypted view of the event.
   *
   * This is named `toJSON` for use with `JSON.stringify` which checks objects
   * for functions named `toJSON` and will call them to customise the output
   * if they are defined.
   *
   * @return {Object}
   */


  toJSON() {
    const event = this.getEffectiveEvent();

    if (!this.isEncrypted()) {
      return event;
    }

    return {
      decrypted: event,
      encrypted: this.event
    };
  }

  setVerificationRequest(request) {
    this.verificationRequest = request;
  }

  setTxnId(txnId) {
    this.txnId = txnId;
  }

  getTxnId() {
    return this.txnId;
  }
  /**
   * @experimental
   */


  setThread(thread) {
    this.thread = thread;
    this.reEmitter.reEmit(thread, [_thread.ThreadEvent.Ready, _thread.ThreadEvent.Update]);
  }
  /**
   * @experimental
   */


  getThread() {
    return this.thread;
  }

}
/* REDACT_KEEP_KEYS gives the keys we keep when an event is redacted
 *
 * This is specified here:
 *  http://matrix.org/speculator/spec/HEAD/client_server/latest.html#redactions
 *
 * Also:
 *  - We keep 'unsigned' since that is created by the local server
 *  - We keep user_id for backwards-compat with v1
 */


exports.MatrixEvent = MatrixEvent;
const REDACT_KEEP_KEYS = new Set(['event_id', 'type', 'room_id', 'user_id', 'sender', 'state_key', 'prev_state', 'content', 'unsigned', 'origin_server_ts']); // a map from event type to the .content keys we keep when an event is redacted

const REDACT_KEEP_CONTENT_MAP = {
  'm.room.member': {
    'membership': 1
  },
  'm.room.create': {
    'creator': 1
  },
  'm.room.join_rules': {
    'join_rule': 1
  },
  'm.room.power_levels': {
    'ban': 1,
    'events': 1,
    'events_default': 1,
    'kick': 1,
    'redact': 1,
    'state_default': 1,
    'users': 1,
    'users_default': 1
  },
  'm.room.aliases': {
    'aliases': 1
  }
};
/**
 * Fires when an event is decrypted
 *
 * @event module:models/event.MatrixEvent#"Event.decrypted"
 *
 * @param {module:models/event.MatrixEvent} event
 *    The matrix event which has been decrypted
 * @param {module:crypto/algorithms/base.DecryptionError?} err
 *    The error that occurred during decryption, or `undefined` if no
 *    error occurred.
 */