"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SPEAKING_THRESHOLD = exports.CallFeedEvent = exports.CallFeed = void 0;
var _typedEventEmitter = require("../models/typed-event-emitter");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
const POLLING_INTERVAL = 200; // ms
const SPEAKING_THRESHOLD = -60; // dB
exports.SPEAKING_THRESHOLD = SPEAKING_THRESHOLD;
const SPEAKING_SAMPLE_COUNT = 8; // samples
let CallFeedEvent;
exports.CallFeedEvent = CallFeedEvent;
(function (CallFeedEvent) {
  CallFeedEvent["NewStream"] = "new_stream";
  CallFeedEvent["MuteStateChanged"] = "mute_state_changed";
  CallFeedEvent["VolumeChanged"] = "volume_changed";
  CallFeedEvent["Speaking"] = "speaking";
})(CallFeedEvent || (exports.CallFeedEvent = CallFeedEvent = {}));
class CallFeed extends _typedEventEmitter.TypedEventEmitter {
  constructor(opts) {
    super();
    _defineProperty(this, "stream", void 0);
    _defineProperty(this, "userId", void 0);
    _defineProperty(this, "purpose", void 0);
    _defineProperty(this, "speakingVolumeSamples", void 0);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "roomId", void 0);
    _defineProperty(this, "audioMuted", void 0);
    _defineProperty(this, "videoMuted", void 0);
    _defineProperty(this, "measuringVolumeActivity", false);
    _defineProperty(this, "audioContext", void 0);
    _defineProperty(this, "analyser", void 0);
    _defineProperty(this, "frequencyBinCount", void 0);
    _defineProperty(this, "speakingThreshold", SPEAKING_THRESHOLD);
    _defineProperty(this, "speaking", false);
    _defineProperty(this, "volumeLooperTimeout", void 0);
    _defineProperty(this, "onAddTrack", () => {
      this.emit(CallFeedEvent.NewStream, this.stream);
    });
    _defineProperty(this, "volumeLooper", () => {
      if (!this.analyser) return;
      if (!this.measuringVolumeActivity) return;
      this.analyser.getFloatFrequencyData(this.frequencyBinCount);
      let maxVolume = -Infinity;
      for (let i = 0; i < this.frequencyBinCount.length; i++) {
        if (this.frequencyBinCount[i] > maxVolume) {
          maxVolume = this.frequencyBinCount[i];
        }
      }
      this.speakingVolumeSamples.shift();
      this.speakingVolumeSamples.push(maxVolume);
      this.emit(CallFeedEvent.VolumeChanged, maxVolume);
      let newSpeaking = false;
      for (let i = 0; i < this.speakingVolumeSamples.length; i++) {
        const volume = this.speakingVolumeSamples[i];
        if (volume > this.speakingThreshold) {
          newSpeaking = true;
          break;
        }
      }
      if (this.speaking !== newSpeaking) {
        this.speaking = newSpeaking;
        this.emit(CallFeedEvent.Speaking, this.speaking);
      }
      this.volumeLooperTimeout = setTimeout(this.volumeLooper, POLLING_INTERVAL);
    });
    this.client = opts.client;
    this.roomId = opts.roomId;
    this.userId = opts.userId;
    this.purpose = opts.purpose;
    this.audioMuted = opts.audioMuted;
    this.videoMuted = opts.videoMuted;
    this.speakingVolumeSamples = new Array(SPEAKING_SAMPLE_COUNT).fill(-Infinity);
    this.updateStream(null, opts.stream);
    this.stream = opts.stream; // updateStream does this, but this makes TS happier

    if (this.hasAudioTrack) {
      this.initVolumeMeasuring();
    }
  }
  get hasAudioTrack() {
    return this.stream.getAudioTracks().length > 0;
  }
  updateStream(oldStream, newStream) {
    if (newStream === oldStream) return;
    if (oldStream) {
      oldStream.removeEventListener("addtrack", this.onAddTrack);
      this.measureVolumeActivity(false);
    }
    this.stream = newStream;
    newStream.addEventListener("addtrack", this.onAddTrack);
    if (this.hasAudioTrack) {
      this.initVolumeMeasuring();
    } else {
      this.measureVolumeActivity(false);
    }
    this.emit(CallFeedEvent.NewStream, this.stream);
  }
  initVolumeMeasuring() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!this.hasAudioTrack || !AudioContext) return;
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.1;
    const mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(this.stream);
    mediaStreamAudioSourceNode.connect(this.analyser);
    this.frequencyBinCount = new Float32Array(this.analyser.frequencyBinCount);
  }
  /**
   * Returns callRoom member
   * @returns member of the callRoom
   */
  getMember() {
    const callRoom = this.client.getRoom(this.roomId);
    return callRoom?.getMember(this.userId) ?? null;
  }

  /**
   * Returns true if CallFeed is local, otherwise returns false
   * @returns {boolean} is local?
   */
  isLocal() {
    return this.userId === this.client.getUserId();
  }

  /**
   * Returns true if audio is muted or if there are no audio
   * tracks, otherwise returns false
   * @returns {boolean} is audio muted?
   */
  isAudioMuted() {
    return this.stream.getAudioTracks().length === 0 || this.audioMuted;
  }

  /**
   * Returns true video is muted or if there are no video
   * tracks, otherwise returns false
   * @returns {boolean} is video muted?
   */
  isVideoMuted() {
    // We assume only one video track
    return this.stream.getVideoTracks().length === 0 || this.videoMuted;
  }
  isSpeaking() {
    return this.speaking;
  }

  /**
   * Set one or both of feed's internal audio and video video mute state
   * Either value may be null to leave it as-is
   * @param audioMuted is the feed's audio muted?
   * @param videoMuted is the feed's video muted?
   */
  setAudioVideoMuted(audioMuted, videoMuted) {
    if (audioMuted !== null) {
      if (this.audioMuted !== audioMuted) {
        this.speakingVolumeSamples.fill(-Infinity);
      }
      this.audioMuted = audioMuted;
    }
    if (videoMuted !== null) this.videoMuted = videoMuted;
    this.emit(CallFeedEvent.MuteStateChanged, this.audioMuted, this.videoMuted);
  }

  /**
   * Starts emitting volume_changed events where the emitter value is in decibels
   * @param enabled emit volume changes
   */
  measureVolumeActivity(enabled) {
    if (enabled) {
      if (!this.audioContext || !this.analyser || !this.frequencyBinCount || !this.hasAudioTrack) return;
      this.measuringVolumeActivity = true;
      this.volumeLooper();
    } else {
      this.measuringVolumeActivity = false;
      this.speakingVolumeSamples.fill(-Infinity);
      this.emit(CallFeedEvent.VolumeChanged, -Infinity);
    }
  }
  setSpeakingThreshold(threshold) {
    this.speakingThreshold = threshold;
  }
  dispose() {
    clearTimeout(this.volumeLooperTimeout);
  }
}
exports.CallFeed = CallFeed;