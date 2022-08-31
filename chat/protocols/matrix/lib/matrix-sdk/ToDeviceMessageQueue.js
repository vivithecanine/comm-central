"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ToDeviceMessageQueue = void 0;

var _logger = require("./logger");

var _scheduler = require("./scheduler");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const MAX_BATCH_SIZE = 20;
/**
 * Maintains a queue of outgoing to-device messages, sending them
 * as soon as the homeserver is reachable.
 */

class ToDeviceMessageQueue {
  constructor(client) {
    this.client = client;

    _defineProperty(this, "sending", false);

    _defineProperty(this, "running", true);

    _defineProperty(this, "retryTimeout", null);

    _defineProperty(this, "retryAttempts", 0);

    _defineProperty(this, "sendQueue", async () => {
      if (this.retryTimeout !== null) clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
      if (this.sending || !this.running) return;

      _logger.logger.debug("Attempting to send queued to-device messages");

      this.sending = true;
      let headBatch;

      try {
        while (this.running) {
          headBatch = await this.client.store.getOldestToDeviceBatch();
          if (headBatch === null) break;
          await this.sendBatch(headBatch);
          await this.client.store.removeToDeviceBatch(headBatch.id);
          this.retryAttempts = 0;
        } // Make sure we're still running after the async tasks: if not, stop.


        if (!this.running) return;

        _logger.logger.debug("All queued to-device messages sent");
      } catch (e) {
        ++this.retryAttempts; // eslint-disable-next-line @typescript-eslint/naming-convention
        // eslint-disable-next-line new-cap

        const retryDelay = _scheduler.MatrixScheduler.RETRY_BACKOFF_RATELIMIT(null, this.retryAttempts, e);

        if (retryDelay === -1) {
          // the scheduler function doesn't differentiate between fatal errors and just getting
          // bored and giving up for now
          if (Math.floor(e.httpStatus / 100) === 4) {
            _logger.logger.error("Fatal error when sending to-device message - dropping to-device batch!", e);

            await this.client.store.removeToDeviceBatch(headBatch.id);
          } else {
            _logger.logger.info("Automatic retry limit reached for to-device messages.");
          }

          return;
        }

        _logger.logger.info(`Failed to send batch of to-device messages. Will retry in ${retryDelay}ms`, e);

        this.retryTimeout = setTimeout(this.sendQueue, retryDelay);
      } finally {
        this.sending = false;
      }
    });
  }

  start() {
    this.running = true;
    this.sendQueue();
  }

  stop() {
    this.running = false;
    if (this.retryTimeout !== null) clearTimeout(this.retryTimeout);
    this.retryTimeout = null;
  }

  async queueBatch(batch) {
    const batches = [];

    for (let i = 0; i < batch.batch.length; i += MAX_BATCH_SIZE) {
      batches.push({
        eventType: batch.eventType,
        batch: batch.batch.slice(i, i + MAX_BATCH_SIZE),
        txnId: this.client.makeTxnId()
      });
    }

    await this.client.store.saveToDeviceBatches(batches);
    this.sendQueue();
  }

  /**
   * Attempts to send a batch of to-device messages.
   */
  async sendBatch(batch) {
    const contentMap = {};

    for (const item of batch.batch) {
      if (!contentMap[item.userId]) {
        contentMap[item.userId] = {};
      }

      contentMap[item.userId][item.deviceId] = item.payload;
    }

    _logger.logger.info(`Sending batch of ${batch.batch.length} to-device messages with ID ${batch.id}`);

    await this.client.sendToDevice(batch.eventType, contentMap, batch.txnId);
  }

}

exports.ToDeviceMessageQueue = ToDeviceMessageQueue;