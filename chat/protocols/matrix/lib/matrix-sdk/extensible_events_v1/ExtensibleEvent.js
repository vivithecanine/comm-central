"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ExtensibleEvent = void 0;
/*
Copyright 2021 - 2023 The Matrix.org Foundation C.I.C.

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
 * Represents an Extensible Event in Matrix.
 */
class ExtensibleEvent {
  constructor(wireFormat) {
    this.wireFormat = wireFormat;
  }

  /**
   * Shortcut to wireFormat.content
   */
  get wireContent() {
    return this.wireFormat.content;
  }

  /**
   * Serializes the event into a format which can be used to send the
   * event to the room.
   * @returns The serialized event.
   */

  /**
   * Determines if this event is equivalent to the provided event type.
   * This is recommended over `instanceof` checks due to issues in the JS
   * runtime (and layering of dependencies in some projects).
   *
   * Implementations should pass this check off to their super classes
   * if their own checks fail. Some primary implementations do not extend
   * fallback classes given they support the primary type first. Thus,
   * those classes may return false if asked about their fallback
   * representation.
   *
   * Note that this only checks primary event types: legacy events, like
   * m.room.message, should/will fail this check.
   * @param primaryEventType - The (potentially namespaced) event
   * type.
   * @returns True if this event *could* be represented as the
   * given type.
   */
}
exports.ExtensibleEvent = ExtensibleEvent;