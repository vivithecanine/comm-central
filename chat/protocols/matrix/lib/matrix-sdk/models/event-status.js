"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventStatus = void 0;
/*
Copyright 2015 - 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/**
 * Enum for event statuses.
 * @readonly
 */
let EventStatus = /*#__PURE__*/function (EventStatus) {
  EventStatus["NOT_SENT"] = "not_sent";
  EventStatus["ENCRYPTING"] = "encrypting";
  EventStatus["SENDING"] = "sending";
  EventStatus["QUEUED"] = "queued";
  EventStatus["SENT"] = "sent";
  EventStatus["CANCELLED"] = "cancelled";
  return EventStatus;
}({});
exports.EventStatus = EventStatus;