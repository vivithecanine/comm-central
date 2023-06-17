"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TransportStatsBuilder = void 0;
class TransportStatsBuilder {
  static buildReport(report, now, conferenceStatsTransport, isFocus) {
    const localUsedCandidate = report?.get(now.localCandidateId);
    const remoteUsedCandidate = report?.get(now.remoteCandidateId);

    // RTCIceCandidateStats
    // https://w3c.github.io/webrtc-stats/#icecandidate-dict*
    if (remoteUsedCandidate && localUsedCandidate) {
      const remoteIpAddress = remoteUsedCandidate.ip !== undefined ? remoteUsedCandidate.ip : remoteUsedCandidate.address;
      const remotePort = remoteUsedCandidate.port;
      const ip = `${remoteIpAddress}:${remotePort}`;
      const localIpAddress = localUsedCandidate.ip !== undefined ? localUsedCandidate.ip : localUsedCandidate.address;
      const localPort = localUsedCandidate.port;
      const localIp = `${localIpAddress}:${localPort}`;
      const type = remoteUsedCandidate.protocol;

      // Save the address unless it has been saved already.
      if (!conferenceStatsTransport.some(t => t.ip === ip && t.type === type && t.localIp === localIp)) {
        conferenceStatsTransport.push({
          ip,
          type,
          localIp,
          isFocus,
          localCandidateType: localUsedCandidate.candidateType,
          remoteCandidateType: remoteUsedCandidate.candidateType,
          networkType: localUsedCandidate.networkType,
          rtt: now.currentRoundTripTime ? now.currentRoundTripTime * 1000 : NaN
        });
      }
    }
    return conferenceStatsTransport;
  }
}
exports.TransportStatsBuilder = TransportStatsBuilder;