"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDesktopCapturerSources = getDesktopCapturerSources;
exports.setAudioOutput = setAudioOutput;
exports.setAudioInput = setAudioInput;
exports.setVideoInput = setVideoInput;
exports.createNewMatrixCall = createNewMatrixCall;
exports.MatrixCall = exports.CallError = exports.CallErrorCode = exports.CallEvent = exports.CallParty = exports.CallDirection = exports.CallType = exports.CallState = void 0;

var _logger = require("../logger");

var _events = require("events");

var utils = _interopRequireWildcard(require("../utils"));

var _event = require("../@types/event");

var _randomstring = require("../randomstring");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

let CallState;
exports.CallState = CallState;

(function (CallState) {
  CallState["Fledgling"] = "fledgling";
  CallState["InviteSent"] = "invite_sent";
  CallState["WaitLocalMedia"] = "wait_local_media";
  CallState["CreateOffer"] = "create_offer";
  CallState["CreateAnswer"] = "create_answer";
  CallState["Connecting"] = "connecting";
  CallState["Connected"] = "connected";
  CallState["Ringing"] = "ringing";
  CallState["Ended"] = "ended";
})(CallState || (exports.CallState = CallState = {}));

let CallType;
exports.CallType = CallType;

(function (CallType) {
  CallType["Voice"] = "voice";
  CallType["Video"] = "video";
})(CallType || (exports.CallType = CallType = {}));

let CallDirection;
exports.CallDirection = CallDirection;

(function (CallDirection) {
  CallDirection["Inbound"] = "inbound";
  CallDirection["Outbound"] = "outbound";
})(CallDirection || (exports.CallDirection = CallDirection = {}));

let CallParty;
exports.CallParty = CallParty;

(function (CallParty) {
  CallParty["Local"] = "local";
  CallParty["Remote"] = "remote";
})(CallParty || (exports.CallParty = CallParty = {}));

let CallEvent;
exports.CallEvent = CallEvent;

(function (CallEvent) {
  CallEvent["Hangup"] = "hangup";
  CallEvent["State"] = "state";
  CallEvent["Error"] = "error";
  CallEvent["Replaced"] = "replaced";
  CallEvent["LocalHoldUnhold"] = "local_hold_unhold";
  CallEvent["RemoteHoldUnhold"] = "remote_hold_unhold";
  CallEvent["HoldUnhold"] = "hold_unhold";
})(CallEvent || (exports.CallEvent = CallEvent = {}));

let CallErrorCode;
/**
 * The version field that we set in m.call.* events
 */

exports.CallErrorCode = CallErrorCode;

(function (CallErrorCode) {
  CallErrorCode["UserHangup"] = "user_hangup";
  CallErrorCode["LocalOfferFailed"] = "local_offer_failed";
  CallErrorCode["NoUserMedia"] = "no_user_media";
  CallErrorCode["UnknownDevices"] = "unknown_devices";
  CallErrorCode["SendInvite"] = "send_invite";
  CallErrorCode["CreateAnswer"] = "create_answer";
  CallErrorCode["SendAnswer"] = "send_answer";
  CallErrorCode["SetRemoteDescription"] = "set_remote_description";
  CallErrorCode["SetLocalDescription"] = "set_local_description";
  CallErrorCode["AnsweredElsewhere"] = "answered_elsewhere";
  CallErrorCode["IceFailed"] = "ice_failed";
  CallErrorCode["InviteTimeout"] = "invite_timeout";
  CallErrorCode["Replaced"] = "replaced";
  CallErrorCode["SignallingFailed"] = "signalling_timeout";
})(CallErrorCode || (exports.CallErrorCode = CallErrorCode = {}));

const VOIP_PROTO_VERSION = 1;
/** The fallback ICE server to use for STUN or TURN protocols. */

const FALLBACK_ICE_SERVER = 'stun:turn.matrix.org';
/** The length of time a call can be ringing for. */

const CALL_TIMEOUT_MS = 60000;
/** Retrieves sources from desktopCapturer */

function getDesktopCapturerSources() {
  const options = {
    thumbnailSize: {
      height: 176,
      width: 312
    },
    types: ["screen", "window"]
  };
  return window.electron.getDesktopCapturerSources(options);
}

class CallError extends Error {
  constructor(code, msg, err) {
    // Stil ldon't think there's any way to have proper nested errors
    super(msg + ": " + err);

    _defineProperty(this, "code", void 0);

    this.code = code;
  }

}

exports.CallError = CallError;

function genCallID() {
  return Date.now().toString() + (0, _randomstring.randomString)(16);
}
/**
 * Construct a new Matrix Call.
 * @constructor
 * @param {Object} opts Config options.
 * @param {string} opts.roomId The room ID for this call.
 * @param {Object} opts.webRtc The WebRTC globals from the browser.
 * @param {boolean} opts.forceTURN whether relay through TURN should be forced.
 * @param {Object} opts.URL The URL global.
 * @param {Array<Object>} opts.turnServers Optional. A list of TURN servers.
 * @param {MatrixClient} opts.client The Matrix Client instance to send events to.
 */


class MatrixCall extends _events.EventEmitter {
  // Fix when client is TSified
  // XXX: This is either the invite or answer from remote...
  // XXX: I don't know why this is called 'config'.
  // The party ID of the other side: undefined if we haven't chosen a partner
  // yet, null if we have but they didn't send a party ID.
  // in the browser it's 'number'
  // The logic of when & if a call is on hold is nontrivial and explained in is*OnHold
  // This flag represents whether we want the other party to be on hold
  // and this one we set when we're transitioning out of the hold state because we
  // can't tell the difference between that and the other party holding us
  // the stats for the call at the point it ended. We can't get these after we
  // tear the call down, so we just grab a snapshot before we stop the call.
  // The typescript definitions have this type as 'any' :(
  // Perfect negotiation state: https://www.w3.org/TR/webrtc/#perfect-negotiation-example
  constructor(opts) {
    super();

    _defineProperty(this, "roomId", void 0);

    _defineProperty(this, "type", void 0);

    _defineProperty(this, "callId", void 0);

    _defineProperty(this, "state", void 0);

    _defineProperty(this, "hangupParty", void 0);

    _defineProperty(this, "hangupReason", void 0);

    _defineProperty(this, "direction", void 0);

    _defineProperty(this, "ourPartyId", void 0);

    _defineProperty(this, "client", void 0);

    _defineProperty(this, "forceTURN", void 0);

    _defineProperty(this, "turnServers", void 0);

    _defineProperty(this, "candidateSendQueue", void 0);

    _defineProperty(this, "candidateSendTries", void 0);

    _defineProperty(this, "sentEndOfCandidates", void 0);

    _defineProperty(this, "peerConn", void 0);

    _defineProperty(this, "localVideoElement", void 0);

    _defineProperty(this, "remoteVideoElement", void 0);

    _defineProperty(this, "remoteAudioElement", void 0);

    _defineProperty(this, "screenSharingStream", void 0);

    _defineProperty(this, "remoteStream", void 0);

    _defineProperty(this, "localAVStream", void 0);

    _defineProperty(this, "inviteOrAnswerSent", void 0);

    _defineProperty(this, "waitForLocalAVStream", void 0);

    _defineProperty(this, "msg", void 0);

    _defineProperty(this, "config", void 0);

    _defineProperty(this, "successor", void 0);

    _defineProperty(this, "opponentMember", void 0);

    _defineProperty(this, "opponentVersion", void 0);

    _defineProperty(this, "opponentPartyId", void 0);

    _defineProperty(this, "opponentCaps", void 0);

    _defineProperty(this, "inviteTimeout", void 0);

    _defineProperty(this, "remoteOnHold", void 0);

    _defineProperty(this, "unholdingRemote", void 0);

    _defineProperty(this, "micMuted", void 0);

    _defineProperty(this, "vidMuted", void 0);

    _defineProperty(this, "callStatsAtEnd", void 0);

    _defineProperty(this, "makingOffer", void 0);

    _defineProperty(this, "ignoreOffer", void 0);

    _defineProperty(this, "gotUserMediaForInvite", async stream => {
      if (this.successor) {
        this.successor.gotUserMediaForAnswer(stream);
        return;
      }

      if (this.callHasEnded()) {
        return;
      }

      this.setState(CallState.CreateOffer);

      _logger.logger.debug("gotUserMediaForInvite -> " + this.type);

      const videoEl = this.getLocalVideoElement();

      if (videoEl && this.type === CallType.Video) {
        videoEl.autoplay = true;

        if (this.screenSharingStream) {
          _logger.logger.debug("Setting screen sharing stream to the local video element");

          videoEl.srcObject = this.screenSharingStream;
        } else {
          videoEl.srcObject = stream;
        }

        videoEl.muted = true;

        try {
          await videoEl.play();
        } catch (e) {
          _logger.logger.info("Failed to play local video element", e);
        }
      }

      this.localAVStream = stream;

      _logger.logger.info("Got local AV stream with id " + this.localAVStream.id); // why do we enable audio (and only audio) tracks here? -- matthew


      setTracksEnabled(stream.getAudioTracks(), true);
      this.peerConn = this.createPeerConnection();

      for (const audioTrack of stream.getAudioTracks()) {
        _logger.logger.info("Adding audio track with id " + audioTrack.id);

        this.peerConn.addTrack(audioTrack, stream);
      }

      for (const videoTrack of (this.screenSharingStream || stream).getVideoTracks()) {
        _logger.logger.info("Adding video track with id " + videoTrack.id);

        this.peerConn.addTrack(videoTrack, stream);
      } // Now we wait for the negotiationneeded event

    });

    _defineProperty(this, "gotUserMediaForAnswer", async stream => {
      if (this.callHasEnded()) {
        return;
      }

      const localVidEl = this.getLocalVideoElement();

      if (localVidEl && this.type === CallType.Video) {
        localVidEl.autoplay = true;
        localVidEl.srcObject = stream;
        localVidEl.muted = true;

        try {
          await localVidEl.play();
        } catch (e) {
          _logger.logger.info("Failed to play local video element", e);
        }
      }

      this.localAVStream = stream;

      _logger.logger.info("Got local AV stream with id " + this.localAVStream.id);

      setTracksEnabled(stream.getAudioTracks(), true);

      for (const track of stream.getTracks()) {
        this.peerConn.addTrack(track, stream);
      }

      this.setState(CallState.CreateAnswer);
      let myAnswer;

      try {
        myAnswer = await this.peerConn.createAnswer();
      } catch (err) {
        _logger.logger.debug("Failed to create answer: ", err);

        this.terminate(CallParty.Local, CallErrorCode.CreateAnswer, true);
        return;
      }

      try {
        await this.peerConn.setLocalDescription(myAnswer);
        this.setState(CallState.Connecting); // Allow a short time for initial candidates to be gathered

        await new Promise(resolve => {
          setTimeout(resolve, 200);
        });
        this.sendAnswer();
      } catch (err) {
        _logger.logger.debug("Error setting local description!", err);

        this.terminate(CallParty.Local, CallErrorCode.SetLocalDescription, true);
        return;
      }
    });

    _defineProperty(this, "gotLocalIceCandidate", event => {
      if (event.candidate) {
        _logger.logger.debug("Got local ICE " + event.candidate.sdpMid + " candidate: " + event.candidate.candidate);

        if (this.callHasEnded()) return; // As with the offer, note we need to make a copy of this object, not
        // pass the original: that broke in Chrome ~m43.

        if (event.candidate.candidate !== '' || !this.sentEndOfCandidates) {
          this.queueCandidate(event.candidate);
          if (event.candidate.candidate === '') this.sentEndOfCandidates = true;
        }
      }
    });

    _defineProperty(this, "onIceGatheringStateChange", event => {
      _logger.logger.debug("ice gathering state changed to " + this.peerConn.iceGatheringState);

      if (this.peerConn.iceGatheringState === 'complete' && !this.sentEndOfCandidates) {
        // If we didn't get an empty-string candidate to signal the end of candidates,
        // create one ourselves now gathering has finished.
        // We cast because the interface lists all the properties as required but we
        // only want to send 'candidate'
        // XXX: We probably want to send either sdpMid or sdpMLineIndex, as it's not strictly
        // correct to have a candidate that lacks both of these. We'd have to figure out what
        // previous candidates had been sent with and copy them.
        const c = {
          candidate: ''
        };
        this.queueCandidate(c);
        this.sentEndOfCandidates = true;
      }
    });

    _defineProperty(this, "gotLocalOffer", async description => {
      _logger.logger.debug("Created offer: ", description);

      if (this.callHasEnded()) {
        _logger.logger.debug("Ignoring newly created offer on call ID " + this.callId + " because the call has ended");

        return;
      }

      try {
        await this.peerConn.setLocalDescription(description);
      } catch (err) {
        _logger.logger.debug("Error setting local description!", err);

        this.terminate(CallParty.Local, CallErrorCode.SetLocalDescription, true);
        return;
      }

      if (this.peerConn.iceGatheringState === 'gathering') {
        // Allow a short time for initial candidates to be gathered
        await new Promise(resolve => {
          setTimeout(resolve, 200);
        });
      }

      if (this.callHasEnded()) return;
      const eventType = this.state === CallState.CreateOffer ? _event.EventType.CallInvite : _event.EventType.CallNegotiate;
      const content = {
        lifetime: CALL_TIMEOUT_MS
      }; // clunky because TypeScript can't folow the types through if we use an expression as the key

      if (this.state === CallState.CreateOffer) {
        content.offer = this.peerConn.localDescription;
      } else {
        content.description = this.peerConn.localDescription;
      }

      if (this.client._supportsCallTransfer) {
        content.capabilities = {
          'm.call.transferee': true
        };
      } // Get rid of any candidates waiting to be sent: they'll be included in the local
      // description we just got and will send in the offer.


      _logger.logger.info(`Discarding ${this.candidateSendQueue.length} candidates that will be sent in offer`);

      this.candidateSendQueue = [];

      try {
        await this.sendVoipEvent(eventType, content);
        this.sendCandidateQueue();

        if (this.state === CallState.CreateOffer) {
          this.inviteOrAnswerSent = true;
          this.setState(CallState.InviteSent);
          this.inviteTimeout = setTimeout(() => {
            this.inviteTimeout = null;

            if (this.state === CallState.InviteSent) {
              this.hangup(CallErrorCode.InviteTimeout, false);
            }
          }, CALL_TIMEOUT_MS);
        }
      } catch (error) {
        this.client.cancelPendingEvent(error.event);
        let code = CallErrorCode.SignallingFailed;
        let message = "Signalling failed";

        if (this.state === CallState.CreateOffer) {
          code = CallErrorCode.SendInvite;
          message = "Failed to send invite";
        }

        if (error.name == 'UnknownDeviceError') {
          code = CallErrorCode.UnknownDevices;
          message = "Unknown devices present in the room";
        }

        this.emit(CallEvent.Error, new CallError(code, message, error));
        this.terminate(CallParty.Local, code, false);
      }
    });

    _defineProperty(this, "getLocalOfferFailed", err => {
      _logger.logger.error("Failed to get local offer", err);

      this.emit(CallEvent.Error, new CallError(CallErrorCode.LocalOfferFailed, "Failed to get local offer!", err));
      this.terminate(CallParty.Local, CallErrorCode.LocalOfferFailed, false);
    });

    _defineProperty(this, "getUserMediaFailed", err => {
      if (this.successor) {
        this.successor.getUserMediaFailed(err);
        return;
      }

      _logger.logger.warn("Failed to get user media - ending call", err);

      this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Couldn't start capturing media! Is your microphone set up and " + "does this app have permission?", err));
      this.terminate(CallParty.Local, CallErrorCode.NoUserMedia, false);
    });

    _defineProperty(this, "onIceConnectionStateChanged", () => {
      if (this.callHasEnded()) {
        return; // because ICE can still complete as we're ending the call
      }

      _logger.logger.debug("Call ID " + this.callId + ": ICE connection state changed to: " + this.peerConn.iceConnectionState); // ideally we'd consider the call to be connected when we get media but
      // chrome doesn't implement any of the 'onstarted' events yet


      if (this.peerConn.iceConnectionState == 'connected') {
        this.setState(CallState.Connected);
      } else if (this.peerConn.iceConnectionState == 'failed') {
        this.hangup(CallErrorCode.IceFailed, false);
      }
    });

    _defineProperty(this, "onSignallingStateChanged", () => {
      _logger.logger.debug("call " + this.callId + ": Signalling state changed to: " + this.peerConn.signalingState);
    });

    _defineProperty(this, "onTrack", ev => {
      if (ev.streams.length === 0) {
        _logger.logger.warn(`Streamless ${ev.track.kind} found: ignoring.`);

        return;
      } // If we already have a stream, check this track is from the same one


      if (this.remoteStream && ev.streams[0].id !== this.remoteStream.id) {
        _logger.logger.warn(`Ignoring new stream ID ${ev.streams[0].id}: we already have stream ID ${this.remoteStream.id}`);

        return;
      }

      if (!this.remoteStream) {
        _logger.logger.info("Got remote stream with id " + ev.streams[0].id);
      } // Note that we check by ID above and always set the remote stream: Chrome appears
      // to make new stream objects when tranciever directionality is changed and the 'active'
      // status of streams change


      this.remoteStream = ev.streams[0];

      _logger.logger.debug(`Track id ${ev.track.id} of kind ${ev.track.kind} added`);

      if (ev.track.kind === 'video') {
        if (this.remoteVideoElement) {
          this.playRemoteVideo();
        }
      } else {
        if (this.remoteAudioElement) this.playRemoteAudio();
      }
    });

    _defineProperty(this, "onNegotiationNeeded", async () => {
      _logger.logger.info("Negotation is needed!");

      if (this.state !== CallState.CreateOffer && this.opponentVersion === 0) {
        _logger.logger.info("Opponent does not support renegotiation: ignoring negotiationneeded event");

        return;
      }

      this.makingOffer = true;

      try {
        const myOffer = await this.peerConn.createOffer();
        await this.gotLocalOffer(myOffer);
      } catch (e) {
        this.getLocalOfferFailed(e);
        return;
      } finally {
        this.makingOffer = false;
      }
    });

    _defineProperty(this, "onHangupReceived", msg => {
      _logger.logger.debug("Hangup received for call ID " + this.callId); // party ID must match (our chosen partner hanging up the call) or be undefined (we haven't chosen
      // a partner yet but we're treating the hangup as a reject as per VoIP v0)


      if (this.partyIdMatches(msg) || this.state === CallState.Ringing) {
        // default reason is user_hangup
        this.terminate(CallParty.Remote, msg.reason || CallErrorCode.UserHangup, true);
      } else {
        _logger.logger.info(`Ignoring message from party ID ${msg.party_id}: our partner is ${this.opponentPartyId}`);
      }
    });

    _defineProperty(this, "onRejectReceived", msg => {
      _logger.logger.debug("Reject received for call ID " + this.callId); // No need to check party_id for reject because if we'd received either
      // an answer or reject, we wouldn't be in state InviteSent


      const shouldTerminate = // reject events also end the call if it's ringing: it's another of
      // our devices rejecting the call.
      [CallState.InviteSent, CallState.Ringing].includes(this.state) || // also if we're in the init state and it's an inbound call, since
      // this means we just haven't entered the ringing state yet
      this.state === CallState.Fledgling && this.direction === CallDirection.Inbound;

      if (shouldTerminate) {
        this.terminate(CallParty.Remote, CallErrorCode.UserHangup, true);
      } else {
        _logger.logger.debug(`Call is in state: ${this.state}: ignoring reject`);
      }
    });

    _defineProperty(this, "onAnsweredElsewhere", msg => {
      _logger.logger.debug("Call ID " + this.callId + " answered elsewhere");

      this.terminate(CallParty.Remote, CallErrorCode.AnsweredElsewhere, true);
    });

    this.roomId = opts.roomId;
    this.client = opts.client;
    this.type = null;
    this.forceTURN = opts.forceTURN;
    this.ourPartyId = this.client.deviceId; // We compare this to null to checks the presence of a party ID:
    // make sure it's null, not undefined

    this.opponentPartyId = null; // Array of Objects with urls, username, credential keys

    this.turnServers = opts.turnServers || [];

    if (this.turnServers.length === 0 && this.client.isFallbackICEServerAllowed()) {
      this.turnServers.push({
        urls: [FALLBACK_ICE_SERVER]
      });
    }

    for (const server of this.turnServers) {
      utils.checkObjectHasKeys(server, ["urls"]);
    }

    this.callId = genCallID();
    this.state = CallState.Fledgling; // A queue for candidates waiting to go out.
    // We try to amalgamate candidates into a single candidate message where
    // possible

    this.candidateSendQueue = [];
    this.candidateSendTries = 0;
    this.sentEndOfCandidates = false;
    this.inviteOrAnswerSent = false;
    this.makingOffer = false;
    this.remoteOnHold = false;
    this.unholdingRemote = false;
    this.micMuted = false;
    this.vidMuted = false;
  }
  /**
   * Place a voice call to this room.
   * @throws If you have not specified a listener for 'error' events.
   */


  placeVoiceCall() {
    _logger.logger.debug("placeVoiceCall");

    this.checkForErrorListener();
    this.placeCallWithConstraints(getUserMediaVideoContraints(CallType.Voice));
    this.type = CallType.Voice;
  }
  /**
   * Place a video call to this room.
   * @param {Element} remoteVideoElement a <code>&lt;video&gt;</code> DOM element
   * to render video to.
   * @param {Element} localVideoElement a <code>&lt;video&gt;</code> DOM element
   * to render the local camera preview.
   * @throws If you have not specified a listener for 'error' events.
   */


  placeVideoCall(remoteVideoElement, localVideoElement) {
    _logger.logger.debug("placeVideoCall");

    this.checkForErrorListener();
    this.localVideoElement = localVideoElement;
    this.remoteVideoElement = remoteVideoElement;
    this.placeCallWithConstraints(getUserMediaVideoContraints(CallType.Video));
    this.type = CallType.Video;
  }
  /**
   * Place a screen-sharing call to this room. This includes audio.
   * <b>This method is EXPERIMENTAL and subject to change without warning. It
   * only works in Google Chrome and Firefox >= 44.</b>
   * @param {Element} remoteVideoElement a <code>&lt;video&gt;</code> DOM element
   * to render video to.
   * @param {Element} localVideoElement a <code>&lt;video&gt;</code> DOM element
   * to render the local camera preview.
   * @throws If you have not specified a listener for 'error' events.
   */


  async placeScreenSharingCall(remoteVideoElement, localVideoElement, selectDesktopCapturerSource) {
    _logger.logger.debug("placeScreenSharingCall");

    this.checkForErrorListener();
    this.localVideoElement = localVideoElement;
    this.remoteVideoElement = remoteVideoElement;

    if (window.electron?.getDesktopCapturerSources) {
      // We have access to getDesktopCapturerSources()
      _logger.logger.debug("Electron getDesktopCapturerSources() is available...");

      try {
        const selectedSource = await selectDesktopCapturerSource(); // If no source was selected cancel call

        if (!selectedSource) return;
        const getUserMediaOptions = {
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: selectedSource.id
            }
          }
        };
        this.screenSharingStream = await window.navigator.mediaDevices.getUserMedia(getUserMediaOptions);

        _logger.logger.debug("Got screen stream, requesting audio stream...");

        const audioConstraints = getUserMediaVideoContraints(CallType.Voice);
        this.placeCallWithConstraints(audioConstraints);
      } catch (err) {
        this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Failed to get screen-sharing stream: ", err));
      }
    } else {
      /* We do not have access to the Electron desktop capturer,
       * therefore we can assume we are on the web */
      _logger.logger.debug("Electron desktopCapturer is not available...");

      try {
        this.screenSharingStream = await navigator.mediaDevices.getDisplayMedia({
          'audio': false
        });

        _logger.logger.debug("Got screen stream, requesting audio stream...");

        const audioConstraints = getUserMediaVideoContraints(CallType.Voice);
        this.placeCallWithConstraints(audioConstraints);
      } catch (err) {
        this.emit(CallEvent.Error, new CallError(CallErrorCode.NoUserMedia, "Failed to get screen-sharing stream: ", err));
      }
    }

    this.type = CallType.Video;
  }

  getOpponentMember() {
    return this.opponentMember;
  }

  opponentCanBeTransferred() {
    return Boolean(this.opponentCaps && this.opponentCaps["m.call.transferee"]);
  }
  /**
   * Retrieve the local <code>&lt;video&gt;</code> DOM element.
   * @return {Element} The dom element
   */


  getLocalVideoElement() {
    return this.localVideoElement;
  }
  /**
   * Retrieve the remote <code>&lt;video&gt;</code> DOM element
   * used for playing back video capable streams.
   * @return {Element} The dom element
   */


  getRemoteVideoElement() {
    return this.remoteVideoElement;
  }
  /**
   * Retrieve the remote <code>&lt;audio&gt;</code> DOM element
   * used for playing back audio only streams.
   * @return {Element} The dom element
   */


  getRemoteAudioElement() {
    return this.remoteAudioElement;
  }
  /**
   * Set the local <code>&lt;video&gt;</code> DOM element. If this call is active,
   * video will be rendered to it immediately.
   * @param {Element} element The <code>&lt;video&gt;</code> DOM element.
   */


  async setLocalVideoElement(element) {
    this.localVideoElement = element;

    if (element && this.localAVStream && this.type === CallType.Video) {
      element.autoplay = true;
      element.srcObject = this.localAVStream;
      element.muted = true;

      try {
        await element.play();
      } catch (e) {
        _logger.logger.info("Failed to play local video element", e);
      }
    }
  }
  /**
   * Set the remote <code>&lt;video&gt;</code> DOM element. If this call is active,
   * the first received video-capable stream will be rendered to it immediately.
   * @param {Element} element The <code>&lt;video&gt;</code> DOM element.
   */


  setRemoteVideoElement(element) {
    if (element === this.remoteVideoElement) return;
    element.autoplay = true; // if we already have an audio element set, use that instead and mute the audio
    // on this video element.

    if (this.remoteAudioElement) element.muted = true;
    this.remoteVideoElement = element;

    if (this.remoteStream) {
      this.playRemoteVideo();
    }
  }
  /**
   * Set the remote <code>&lt;audio&gt;</code> DOM element. If this call is active,
   * the first received audio-only stream will be rendered to it immediately.
   * The audio will *not* be rendered from the remoteVideoElement.
   * @param {Element} element The <code>&lt;video&gt;</code> DOM element.
   */


  async setRemoteAudioElement(element) {
    if (element === this.remoteAudioElement) return;
    this.remoteAudioElement = element;
    if (this.remoteStream) this.playRemoteAudio();
  } // The typescript definitions have this type as 'any' :(


  async getCurrentCallStats() {
    if (this.callHasEnded()) {
      return this.callStatsAtEnd;
    }

    return this.collectCallStats();
  }

  async collectCallStats() {
    // This happens when the call fails before it starts.
    // For example when we fail to get capture sources
    if (!this.peerConn) return;
    const statsReport = await this.peerConn.getStats();
    const stats = [];

    for (const item of statsReport) {
      stats.push(item[1]);
    }

    return stats;
  }
  /**
   * Configure this call from an invite event. Used by MatrixClient.
   * @param {MatrixEvent} event The m.call.invite event
   */


  async initWithInvite(event) {
    this.msg = event.getContent();
    this.direction = CallDirection.Inbound;
    this.peerConn = this.createPeerConnection();

    try {
      await this.peerConn.setRemoteDescription(this.msg.offer);
    } catch (e) {
      _logger.logger.debug("Failed to set remote description", e);

      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    } // According to previous comments in this file, firefox at some point did not
    // add streams until media started ariving on them. Testing latest firefox
    // (81 at time of writing), this is no longer a problem, so let's do it the correct way.


    if (!this.remoteStream || this.remoteStream.getTracks().length === 0) {
      _logger.logger.error("No remote stream or no tracks after setting remote description!");

      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    }

    this.type = this.remoteStream.getTracks().some(t => t.kind === 'video') ? CallType.Video : CallType.Voice;
    this.setState(CallState.Ringing);
    this.opponentVersion = this.msg.version;

    if (this.opponentVersion !== 0) {
      // ignore party ID in v0 calls: party ID isn't a thing until v1
      this.opponentPartyId = this.msg.party_id || null;
    }

    this.opponentCaps = this.msg.capabilities || {};
    this.opponentMember = event.sender;

    if (event.getLocalAge()) {
      setTimeout(() => {
        if (this.state == CallState.Ringing) {
          _logger.logger.debug("Call invite has expired. Hanging up.");

          this.hangupParty = CallParty.Remote; // effectively

          this.setState(CallState.Ended);
          this.stopAllMedia();

          if (this.peerConn.signalingState != 'closed') {
            this.peerConn.close();
          }

          this.emit(CallEvent.Hangup);
        }
      }, this.msg.lifetime - event.getLocalAge());
    }
  }
  /**
   * Configure this call from a hangup or reject event. Used by MatrixClient.
   * @param {MatrixEvent} event The m.call.hangup event
   */


  initWithHangup(event) {
    // perverse as it may seem, sometimes we want to instantiate a call with a
    // hangup message (because when getting the state of the room on load, events
    // come in reverse order and we want to remember that a call has been hung up)
    this.msg = event.getContent();
    this.setState(CallState.Ended);
  }
  /**
   * Answer a call.
   */


  async answer() {
    if (this.inviteOrAnswerSent) {
      return;
    }

    _logger.logger.debug(`Answering call ${this.callId} of type ${this.type}`);

    if (!this.localAVStream && !this.waitForLocalAVStream) {
      const constraints = getUserMediaVideoContraints(this.type);

      _logger.logger.log("Getting user media with constraints", constraints);

      this.setState(CallState.WaitLocalMedia);
      this.waitForLocalAVStream = true;

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.waitForLocalAVStream = false;
        this.gotUserMediaForAnswer(mediaStream);
      } catch (e) {
        this.getUserMediaFailed(e);
        return;
      }
    } else if (this.localAVStream) {
      this.gotUserMediaForAnswer(this.localAVStream);
    } else if (this.waitForLocalAVStream) {
      this.setState(CallState.WaitLocalMedia);
    }
  }
  /**
   * Replace this call with a new call, e.g. for glare resolution. Used by
   * MatrixClient.
   * @param {MatrixCall} newCall The new call.
   */


  replacedBy(newCall) {
    _logger.logger.debug(this.callId + " being replaced by " + newCall.callId);

    if (this.state === CallState.WaitLocalMedia) {
      _logger.logger.debug("Telling new call to wait for local media");

      newCall.waitForLocalAVStream = true;
    } else if (this.state === CallState.CreateOffer) {
      _logger.logger.debug("Handing local stream to new call");

      newCall.gotUserMediaForAnswer(this.localAVStream);
      delete this.localAVStream;
    } else if (this.state === CallState.InviteSent) {
      _logger.logger.debug("Handing local stream to new call");

      newCall.gotUserMediaForAnswer(this.localAVStream);
      delete this.localAVStream;
    }

    newCall.localVideoElement = this.localVideoElement;
    newCall.remoteVideoElement = this.remoteVideoElement;
    newCall.remoteAudioElement = this.remoteAudioElement;
    this.successor = newCall;
    this.emit(CallEvent.Replaced, newCall);
    this.hangup(CallErrorCode.Replaced, true);
  }
  /**
   * Hangup a call.
   * @param {string} reason The reason why the call is being hung up.
   * @param {boolean} suppressEvent True to suppress emitting an event.
   */


  hangup(reason, suppressEvent) {
    if (this.callHasEnded()) return;

    _logger.logger.debug("Ending call " + this.callId);

    this.terminate(CallParty.Local, reason, !suppressEvent);
    const content = {}; // Continue to send no reason for user hangups temporarily, until
    // clients understand the user_hangup reason (voip v1)

    if (reason !== CallErrorCode.UserHangup) content['reason'] = reason;
    this.sendVoipEvent(_event.EventType.CallHangup, {});
  }
  /**
   * Reject a call
   * This used to be done by calling hangup, but is a separate method and protocol
   * event as of MSC2746.
   */


  reject() {
    if (this.state !== CallState.Ringing) {
      throw Error("Call must be in 'ringing' state to reject!");
    }

    if (this.opponentVersion < 1) {
      _logger.logger.info(`Opponent version is less than 1 (${this.opponentVersion}): sending hangup instead of reject`);

      this.hangup(CallErrorCode.UserHangup, true);
      return;
    }

    _logger.logger.debug("Rejecting call: " + this.callId);

    this.terminate(CallParty.Local, CallErrorCode.UserHangup, true);
    this.sendVoipEvent(_event.EventType.CallReject, {});
  }
  /**
   * Set whether our outbound video should be muted or not.
   * @param {boolean} muted True to mute the outbound video.
   */


  setLocalVideoMuted(muted) {
    this.vidMuted = muted;
    this.updateMuteStatus();
  }
  /**
   * Check if local video is muted.
   *
   * If there are multiple video tracks, <i>all</i> of the tracks need to be muted
   * for this to return true. This means if there are no video tracks, this will
   * return true.
   * @return {Boolean} True if the local preview video is muted, else false
   * (including if the call is not set up yet).
   */


  isLocalVideoMuted() {
    return this.vidMuted;
  }
  /**
   * Set whether the microphone should be muted or not.
   * @param {boolean} muted True to mute the mic.
   */


  setMicrophoneMuted(muted) {
    this.micMuted = muted;
    this.updateMuteStatus();
  }
  /**
   * Check if the microphone is muted.
   *
   * If there are multiple audio tracks, <i>all</i> of the tracks need to be muted
   * for this to return true. This means if there are no audio tracks, this will
   * return true.
   * @return {Boolean} True if the mic is muted, else false (including if the call
   * is not set up yet).
   */


  isMicrophoneMuted() {
    return this.micMuted;
  }
  /**
   * @returns true if we have put the party on the other side of the call on hold
   * (that is, we are signalling to them that we are not listening)
   */


  isRemoteOnHold() {
    return this.remoteOnHold;
  }

  setRemoteOnHold(onHold) {
    if (this.isRemoteOnHold() === onHold) return;
    this.remoteOnHold = onHold;
    if (!onHold) this.unholdingRemote = true;

    for (const tranceiver of this.peerConn.getTransceivers()) {
      // We set 'inactive' rather than 'sendonly' because we're not planning on
      // playing music etc. to the other side.
      tranceiver.direction = onHold ? 'inactive' : 'sendrecv';
    }

    this.updateMuteStatus();

    if (!onHold) {
      this.playRemoteAudio();
    }

    this.emit(CallEvent.RemoteHoldUnhold, this.remoteOnHold);
  }
  /**
   * Indicates whether we are 'on hold' to the remote party (ie. if true,
   * they cannot hear us). Note that this will return true when we put the
   * remote on hold too due to the way hold is implemented (since we don't
   * wish to play hold music when we put a call on hold, we use 'inactive'
   * rather than 'sendonly')
   * @returns true if the other party has put us on hold
   */


  isLocalOnHold() {
    if (this.state !== CallState.Connected) return false;
    if (this.unholdingRemote) return false;
    let callOnHold = true; // We consider a call to be on hold only if *all* the tracks are on hold
    // (is this the right thing to do?)

    for (const tranceiver of this.peerConn.getTransceivers()) {
      const trackOnHold = ['inactive', 'recvonly'].includes(tranceiver.currentDirection);
      if (!trackOnHold) callOnHold = false;
    }

    return callOnHold;
  }
  /**
   * Sends a DTMF digit to the other party
   * @param digit The digit (nb. string - '#' and '*' are dtmf too)
   */


  sendDtmfDigit(digit) {
    for (const sender of this.peerConn.getSenders()) {
      if (sender.track.kind === 'audio' && sender.dtmf) {
        sender.dtmf.insertDTMF(digit);
        return;
      }
    }

    throw new Error("Unable to find a track to send DTMF on");
  }

  updateMuteStatus() {
    if (!this.localAVStream) {
      return;
    }

    const micShouldBeMuted = this.micMuted || this.remoteOnHold;
    setTracksEnabled(this.localAVStream.getAudioTracks(), !micShouldBeMuted);
    const vidShouldBeMuted = this.vidMuted || this.remoteOnHold;
    setTracksEnabled(this.localAVStream.getVideoTracks(), !vidShouldBeMuted);

    if (this.remoteOnHold) {
      if (this.remoteAudioElement && this.remoteAudioElement.srcObject === this.remoteStream) {
        this.remoteAudioElement.muted = true;
      } else if (this.remoteVideoElement && this.remoteVideoElement.srcObject === this.remoteStream) {
        this.remoteVideoElement.muted = true;
      }
    } else {
      this.playRemoteAudio();
    }
  }
  /**
   * Internal
   * @param {Object} stream
   */


  sendAnswer() {
    const answerContent = {
      answer: {
        sdp: this.peerConn.localDescription.sdp,
        // type is now deprecated as of Matrix VoIP v1, but
        // required to still be sent for backwards compat
        type: this.peerConn.localDescription.type
      }
    };

    if (this.client._supportsCallTransfer) {
      answerContent.capabilities = {
        'm.call.transferee': true
      };
    } // We have just taken the local description from the peerconnection which will
    // contain all the local candidates added so far, so we can discard any candidates
    // we had queued up because they'll be in the answer.


    _logger.logger.info(`Discarding ${this.candidateSendQueue.length} candidates that will be sent in answer`);

    this.candidateSendQueue = [];
    this.sendVoipEvent(_event.EventType.CallAnswer, answerContent).then(() => {
      // If this isn't the first time we've tried to send the answer,
      // we may have candidates queued up, so send them now.
      this.inviteOrAnswerSent = true;
      this.sendCandidateQueue();
    }).catch(error => {
      // We've failed to answer: back to the ringing state
      this.setState(CallState.Ringing);
      this.client.cancelPendingEvent(error.event);
      let code = CallErrorCode.SendAnswer;
      let message = "Failed to send answer";

      if (error.name == 'UnknownDeviceError') {
        code = CallErrorCode.UnknownDevices;
        message = "Unknown devices present in the room";
      }

      this.emit(CallEvent.Error, new CallError(code, message, error));
      throw error;
    });
  }

  onRemoteIceCandidatesReceived(ev) {
    if (this.callHasEnded()) {
      //debuglog("Ignoring remote ICE candidate because call has ended");
      return;
    }

    if (!this.partyIdMatches(ev.getContent())) {
      _logger.logger.info(`Ignoring candidates from party ID ${ev.getContent().party_id}: ` + `we have chosen party ID ${this.opponentPartyId}`);

      return;
    }

    const cands = ev.getContent().candidates;

    if (!cands) {
      _logger.logger.info("Ignoring candidates event with no candidates!");

      return;
    }

    for (const cand of cands) {
      if ((cand.sdpMid === null || cand.sdpMid === undefined) && (cand.sdpMLineIndex === null || cand.sdpMLineIndex === undefined)) {
        _logger.logger.debug("Ignoring remote ICE candidate with no sdpMid or sdpMLineIndex");

        return;
      }

      _logger.logger.debug("Got remote ICE " + cand.sdpMid + " candidate: " + cand.candidate);

      try {
        this.peerConn.addIceCandidate(cand);
      } catch (err) {
        if (!this.ignoreOffer) {
          _logger.logger.info("Failed to add remore ICE candidate", err);
        }
      }
    }
  }
  /**
   * Used by MatrixClient.
   * @param {Object} msg
   */


  async onAnswerReceived(event) {
    if (this.callHasEnded()) {
      return;
    }

    if (this.opponentPartyId !== null) {
      _logger.logger.info(`Ignoring answer from party ID ${event.getContent().party_id}: ` + `we already have an answer/reject from ${this.opponentPartyId}`);

      return;
    }

    this.opponentVersion = event.getContent().version;

    if (this.opponentVersion !== 0) {
      this.opponentPartyId = event.getContent().party_id || null;
    }

    this.opponentCaps = event.getContent().capabilities || {};
    this.opponentMember = event.sender;
    this.setState(CallState.Connecting);

    try {
      await this.peerConn.setRemoteDescription(event.getContent().answer);
    } catch (e) {
      _logger.logger.debug("Failed to set remote description", e);

      this.terminate(CallParty.Local, CallErrorCode.SetRemoteDescription, false);
      return;
    } // If the answer we selected has a party_id, send a select_answer event
    // We do this after setting the remote description since otherwise we'd block
    // call setup on it


    if (this.opponentPartyId !== null) {
      try {
        await this.sendVoipEvent(_event.EventType.CallSelectAnswer, {
          selected_party_id: this.opponentPartyId
        });
      } catch (err) {
        // This isn't fatal, and will just mean that if another party has raced to answer
        // the call, they won't know they got rejected, so we carry on & don't retry.
        _logger.logger.warn("Failed to send select_answer event", err);
      }
    }
  }

  async onSelectAnswerReceived(event) {
    if (this.direction !== CallDirection.Inbound) {
      _logger.logger.warn("Got select_answer for an outbound call: ignoring");

      return;
    }

    const selectedPartyId = event.getContent().selected_party_id;

    if (selectedPartyId === undefined || selectedPartyId === null) {
      _logger.logger.warn("Got nonsensical select_answer with null/undefined selected_party_id: ignoring");

      return;
    }

    if (selectedPartyId !== this.ourPartyId) {
      _logger.logger.info(`Got select_answer for party ID ${selectedPartyId}: we are party ID ${this.ourPartyId}.`); // The other party has picked somebody else's answer


      this.terminate(CallParty.Remote, CallErrorCode.AnsweredElsewhere, true);
    }
  }

  async onNegotiateReceived(event) {
    const description = event.getContent().description;

    if (!description || !description.sdp || !description.type) {
      _logger.logger.info("Ignoring invalid m.call.negotiate event");

      return;
    } // Politeness always follows the direction of the call: in a glare situation,
    // we pick either the inbound or outbound call, so one side will always be
    // inbound and one outbound


    const polite = this.direction === CallDirection.Inbound; // Here we follow the perfect negotiation logic from
    // https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation

    const offerCollision = description.type === 'offer' && (this.makingOffer || this.peerConn.signalingState != 'stable');
    this.ignoreOffer = !polite && offerCollision;

    if (this.ignoreOffer) {
      _logger.logger.info("Ignoring colliding negotiate event because we're impolite");

      return;
    }

    const prevLocalOnHold = this.isLocalOnHold();

    if (description.type === 'answer') {
      // whenever we get an answer back, clear the flag we set whilst trying to un-hold
      // the other party: the state of the channels now reflects reality
      this.unholdingRemote = false;
    }

    try {
      await this.peerConn.setRemoteDescription(description);

      if (description.type === 'offer') {
        // First we sent the direction of the tranciever to what we'd like it to be,
        // irresepective of whether the other side has us on hold - so just whether we
        // want the call to be on hold or not. This is necessary because in a few lines,
        // we'll adjust the direction and unless we do this too, we'll never come off hold.
        for (const tranceiver of this.peerConn.getTransceivers()) {
          tranceiver.direction = this.isRemoteOnHold() ? 'inactive' : 'sendrecv';
        }

        const localDescription = await this.peerConn.createAnswer();
        await this.peerConn.setLocalDescription(localDescription); // Now we've got our answer, set the direction to the outcome of the negotiation.
        // We need to do this otherwise Firefox will notice that the direction is not the
        // currentDirection and try to negotiate itself off hold again.

        for (const tranceiver of this.peerConn.getTransceivers()) {
          tranceiver.direction = tranceiver.currentDirection;
        }

        this.sendVoipEvent(_event.EventType.CallNegotiate, {
          description: this.peerConn.localDescription
        });
      }
    } catch (err) {
      _logger.logger.warn("Failed to complete negotiation", err);
    }

    const newLocalOnHold = this.isLocalOnHold();

    if (prevLocalOnHold !== newLocalOnHold) {
      this.emit(CallEvent.LocalHoldUnhold, newLocalOnHold); // also this one for backwards compat

      this.emit(CallEvent.HoldUnhold, newLocalOnHold);
    }
  }

  callHasEnded() {
    // This exists as workaround to typescript trying to be clever and erroring
    // when putting if (this.state === CallState.Ended) return; twice in the same
    // function, even though that function is async.
    return this.state === CallState.Ended;
  }

  async playRemoteAudio() {
    if (this.remoteVideoElement) this.remoteVideoElement.muted = true;
    this.remoteAudioElement.muted = false;
    this.remoteAudioElement.srcObject = this.remoteStream; // if audioOutput is non-default:

    try {
      if (audioOutput) {
        // This seems quite unreliable in Chrome, although I haven't yet managed to make a jsfiddle where
        // it fails.
        // It seems reliable if you set the sink ID after setting the srcObject and then set the sink ID
        // back to the default after the call is over
        _logger.logger.info("Setting audio sink to " + audioOutput + ", was " + this.remoteAudioElement.sinkId);

        await this.remoteAudioElement.setSinkId(audioOutput);
      }
    } catch (e) {
      _logger.logger.warn("Couldn't set requested audio output device: using default", e);
    }

    try {
      await this.remoteAudioElement.play();
    } catch (e) {
      _logger.logger.error("Failed to play remote audio element", e);
    }
  }

  async playRemoteVideo() {
    // A note on calling methods on media elements:
    // We used to have queues per media element to serialise all calls on those elements.
    // The reason given for this was that load() and play() were racing. However, we now
    // never call load() explicitly so this seems unnecessary. However, serialising every
    // operation was causing bugs where video would not resume because some play command
    // had got stuck and all media operations were queued up behind it. If necessary, we
    // should serialise the ones that need to be serialised but then be able to interrupt
    // them with another load() which will cancel the pending one, but since we don't call
    // load() explicitly, it shouldn't be a problem.
    this.remoteVideoElement.srcObject = this.remoteStream;

    _logger.logger.info("playing remote video. stream active? " + this.remoteStream.active);

    try {
      await this.remoteVideoElement.play();
    } catch (e) {
      _logger.logger.info("Failed to play remote video element", e);
    }
  }

  setState(state) {
    const oldState = this.state;
    this.state = state;
    this.emit(CallEvent.State, state, oldState);
  }
  /**
   * Internal
   * @param {string} eventType
   * @param {Object} content
   * @return {Promise}
   */


  sendVoipEvent(eventType, content) {
    return this.client.sendEvent(this.roomId, eventType, Object.assign({}, content, {
      version: VOIP_PROTO_VERSION,
      call_id: this.callId,
      party_id: this.ourPartyId
    }));
  }

  queueCandidate(content) {
    // Sends candidates with are sent in a special way because we try to amalgamate
    // them into one message
    this.candidateSendQueue.push(content); // Don't send the ICE candidates yet if the call is in the ringing state: this
    // means we tried to pick (ie. started generating candidates) and then failed to
    // send the answer and went back to the ringing state. Queue up the candidates
    // to send if we sucessfully send the answer.
    // Equally don't send if we haven't yet sent the answer because we can send the
    // first batch of candidates along with the answer

    if (this.state === CallState.Ringing || !this.inviteOrAnswerSent) return; // MSC2746 reccomends these values (can be quite long when calling because the
    // callee will need a while to answer the call)

    const delay = this.direction === CallDirection.Inbound ? 500 : 2000;

    if (this.candidateSendTries === 0) {
      setTimeout(() => {
        this.sendCandidateQueue();
      }, delay);
    }
  }

  async transfer(targetUserId, targetRoomId) {
    // Fetch the target user's global profile info: their room avatar / displayname
    // could be different in whatever room we shae with them.
    const profileInfo = await this.client.getProfileInfo(targetUserId);
    const replacementId = genCallID();
    const body = {
      replacement_id: genCallID(),
      target_user: {
        id: targetUserId,
        display_name: profileInfo.display_name,
        avatar_url: profileInfo.avatar_url
      },
      create_call: replacementId
    };
    if (targetRoomId) body.target_room = targetRoomId;
    return this.sendVoipEvent(_event.EventType.CallReplaces, body);
  }

  async terminate(hangupParty, hangupReason, shouldEmit) {
    if (this.callHasEnded()) return;
    this.callStatsAtEnd = await this.collectCallStats();

    if (this.inviteTimeout) {
      clearTimeout(this.inviteTimeout);
      this.inviteTimeout = null;
    }

    const remoteVid = this.getRemoteVideoElement();
    const remoteAud = this.getRemoteAudioElement();
    const localVid = this.getLocalVideoElement();

    if (remoteVid) {
      remoteVid.pause();
      remoteVid.srcObject = null;
    }

    if (remoteAud) {
      remoteAud.pause();
      remoteAud.srcObject = null;

      try {
        // As per comment in playRemoteAudio, setting the sink ID back to the default
        // once the call is over makes setSinkId work reliably.
        await this.remoteAudioElement.setSinkId('');
      } catch (e) {
        _logger.logger.warn("Failed to set sink ID back to default");
      }
    }

    if (localVid) {
      localVid.pause();
      localVid.srcObject = null;
    }

    this.hangupParty = hangupParty;
    this.hangupReason = hangupReason;
    this.setState(CallState.Ended);
    this.stopAllMedia();

    if (this.peerConn && this.peerConn.signalingState !== 'closed') {
      this.peerConn.close();
    }

    if (shouldEmit) {
      this.emit(CallEvent.Hangup, this);
    }
  }

  stopAllMedia() {
    _logger.logger.debug(`stopAllMedia (stream=${this.localAVStream})`);

    if (this.localAVStream) {
      for (const track of this.localAVStream.getTracks()) {
        track.stop();
      }
    }

    if (this.screenSharingStream) {
      for (const track of this.screenSharingStream.getTracks()) {
        track.stop();
      }
    }

    if (this.remoteStream) {
      for (const track of this.remoteStream.getTracks()) {
        track.stop();
      }
    }
  }

  checkForErrorListener() {
    if (this.listeners("error").length === 0) {
      throw new Error("You MUST attach an error listener using call.on('error', function() {})");
    }
  }

  sendCandidateQueue() {
    if (this.candidateSendQueue.length === 0) {
      return;
    }

    const cands = this.candidateSendQueue;
    this.candidateSendQueue = [];
    ++this.candidateSendTries;
    const content = {
      candidates: cands
    };

    _logger.logger.debug("Attempting to send " + cands.length + " candidates");

    this.sendVoipEvent(_event.EventType.CallCandidates, content).then(() => {
      this.candidateSendTries = 0;
      this.sendCandidateQueue();
    }, error => {
      for (let i = 0; i < cands.length; i++) {
        this.candidateSendQueue.push(cands[i]);
      }

      if (this.candidateSendTries > 5) {
        _logger.logger.debug("Failed to send candidates on attempt " + this.candidateSendTries + ". Giving up for now.", error);

        this.candidateSendTries = 0;
        return;
      }

      const delayMs = 500 * Math.pow(2, this.candidateSendTries);
      ++this.candidateSendTries;

      _logger.logger.debug("Failed to send candidates. Retrying in " + delayMs + "ms", error);

      setTimeout(() => {
        this.sendCandidateQueue();
      }, delayMs);
    });
  }

  async placeCallWithConstraints(constraints) {
    _logger.logger.log("Getting user media with constraints", constraints); // XXX Find a better way to do this


    this.client._callEventHandler.calls.set(this.callId, this);

    this.setState(CallState.WaitLocalMedia);
    this.direction = CallDirection.Outbound;
    this.config = constraints; // It would be really nice if we could start gathering candidates at this point
    // so the ICE agent could be gathering while we open our media devices: we already
    // know the type of the call and therefore what tracks we want to send.
    // Perhaps we could do this by making fake tracks now and then using replaceTrack()
    // once we have the actual tracks? (Can we make fake tracks?)

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.gotUserMediaForInvite(mediaStream);
    } catch (e) {
      this.getUserMediaFailed(e);
      return;
    }
  }

  createPeerConnection() {
    const pc = new window.RTCPeerConnection({
      iceTransportPolicy: this.forceTURN ? 'relay' : undefined,
      iceServers: this.turnServers,
      iceCandidatePoolSize: this.client._iceCandidatePoolSize
    }); // 'connectionstatechange' would be better, but firefox doesn't implement that.

    pc.addEventListener('iceconnectionstatechange', this.onIceConnectionStateChanged);
    pc.addEventListener('signalingstatechange', this.onSignallingStateChanged);
    pc.addEventListener('icecandidate', this.gotLocalIceCandidate);
    pc.addEventListener('icegatheringstatechange', this.onIceGatheringStateChange);
    pc.addEventListener('track', this.onTrack);
    pc.addEventListener('negotiationneeded', this.onNegotiationNeeded);
    return pc;
  }

  partyIdMatches(msg) {
    // They must either match or both be absent (in which case opponentPartyId will be null)
    const msgPartyId = msg.party_id || null;
    return msgPartyId === this.opponentPartyId;
  }

}

exports.MatrixCall = MatrixCall;

function setTracksEnabled(tracks, enabled) {
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].enabled = enabled;
  }
}

function getUserMediaVideoContraints(callType) {
  const isWebkit = !!navigator.webkitGetUserMedia;

  switch (callType) {
    case CallType.Voice:
      return {
        audio: {
          deviceId: audioInput ? {
            ideal: audioInput
          } : undefined
        },
        video: false
      };

    case CallType.Video:
      return {
        audio: {
          deviceId: audioInput ? {
            ideal: audioInput
          } : undefined
        },
        video: {
          deviceId: videoInput ? {
            ideal: videoInput
          } : undefined,

          /* We want 640x360.  Chrome will give it only if we ask exactly,
             FF refuses entirely if we ask exactly, so have to ask for ideal
             instead
             XXX: Is this still true?
           */
          width: isWebkit ? {
            exact: 640
          } : {
            ideal: 640
          },
          height: isWebkit ? {
            exact: 360
          } : {
            ideal: 360
          }
        }
      };
  }
}

let audioOutput;
let audioInput;
let videoInput;
/**
 * Set an audio output device to use for MatrixCalls
 * @function
 * @param {string=} deviceId the identifier for the device
 * undefined treated as unset
 */

function setAudioOutput(deviceId) {
  audioOutput = deviceId;
}
/**
 * Set an audio input device to use for MatrixCalls
 * @function
 * @param {string=} deviceId the identifier for the device
 * undefined treated as unset
 */


function setAudioInput(deviceId) {
  audioInput = deviceId;
}
/**
 * Set a video input device to use for MatrixCalls
 * @function
 * @param {string=} deviceId the identifier for the device
 * undefined treated as unset
 */


function setVideoInput(deviceId) {
  videoInput = deviceId;
}
/**
 * Create a new Matrix call for the browser.
 * @param {MatrixClient} client The client instance to use.
 * @param {string} roomId The room the call is in.
 * @param {Object?} options DEPRECATED optional options map.
 * @param {boolean} options.forceTURN DEPRECATED whether relay through TURN should be
 * forced. This option is deprecated - use opts.forceTURN when creating the matrix client
 * since it's only possible to set this option on outbound calls.
 * @return {MatrixCall} the call or null if the browser doesn't support calling.
 */


function createNewMatrixCall(client, roomId, options) {
  // typeof prevents Node from erroring on an undefined reference
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    // NB. We don't log here as apps try to create a call object as a test for
    // whether calls are supported, so we shouldn't fill the logs up.
    return null;
  } // Firefox throws on so little as accessing the RTCPeerConnection when operating in
  // a secure mode. There's some information at https://bugzilla.mozilla.org/show_bug.cgi?id=1542616
  // though the concern is that the browser throwing a SecurityError will brick the
  // client creation process.


  try {
    const supported = Boolean(window.RTCPeerConnection || window.RTCSessionDescription || window.RTCIceCandidate || navigator.mediaDevices);

    if (!supported) {
      _logger.logger.error("WebRTC is not supported in this browser / environment");

      return null;
    }
  } catch (e) {
    _logger.logger.error("Exception thrown when trying to access WebRTC", e);

    return null;
  }

  const optionsForceTURN = options ? options.forceTURN : false;
  const opts = {
    client: client,
    roomId: roomId,
    turnServers: client.getTurnServers(),
    // call level options
    forceTURN: client._forceTURN || optionsForceTURN
  };
  const call = new MatrixCall(opts);
  client.reEmitter.reEmit(call, Object.values(CallEvent));
  return call;
}