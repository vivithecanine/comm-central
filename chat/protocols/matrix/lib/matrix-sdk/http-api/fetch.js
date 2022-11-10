"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FetchHttpApi = void 0;
var utils = _interopRequireWildcard(require("../utils"));
var _method = require("./method");
var _errors = require("./errors");
var _interface = require("./interface");
var _utils2 = require("./utils");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
class FetchHttpApi {
  constructor(eventEmitter, opts) {
    this.eventEmitter = eventEmitter;
    this.opts = opts;
    _defineProperty(this, "abortController", new AbortController());
    utils.checkObjectHasKeys(opts, ["baseUrl", "prefix"]);
    opts.onlyData = !!opts.onlyData;
    opts.useAuthorizationHeader = opts.useAuthorizationHeader ?? true;
  }
  abort() {
    this.abortController.abort();
    this.abortController = new AbortController();
  }
  fetch(resource, options) {
    if (this.opts.fetchFn) {
      return this.opts.fetchFn(resource, options);
    }
    return global.fetch(resource, options);
  }

  /**
   * Sets the base URL for the identity server
   * @param {string} url The new base url
   */
  setIdBaseUrl(url) {
    this.opts.idBaseUrl = url;
  }
  idServerRequest(method, path, params, prefix, accessToken) {
    if (!this.opts.idBaseUrl) {
      throw new Error("No identity server base URL set");
    }
    let queryParams = undefined;
    let body = undefined;
    if (method === _method.Method.Get) {
      queryParams = params;
    } else {
      body = params;
    }
    const fullUri = this.getUrl(path, queryParams, prefix, this.opts.idBaseUrl);
    const opts = {
      json: true,
      headers: {}
    };
    if (accessToken) {
      opts.headers.Authorization = `Bearer ${accessToken}`;
    }
    return this.requestOtherUrl(method, fullUri, body, opts);
  }

  /**
   * Perform an authorised request to the homeserver.
   * @param {string} method The HTTP method e.g. "GET".
   * @param {string} path The HTTP path <b>after</b> the supplied prefix e.g.
   * "/createRoom".
   *
   * @param {Object=} queryParams A dict of query params (these will NOT be
   * urlencoded). If unspecified, there will be no query params.
   *
   * @param {Object} [body] The HTTP JSON body.
   *
   * @param {Object|Number=} opts additional options. If a number is specified,
   * this is treated as `opts.localTimeoutMs`.
   *
   * @param {Number=} opts.localTimeoutMs The maximum amount of time to wait before
   * timing out the request. If not specified, there is no timeout.
   *
   * @param {string=} opts.prefix The full prefix to use e.g.
   * "/_matrix/client/v2_alpha". If not specified, uses this.opts.prefix.
   *
   * @param {string=} opts.baseUrl The alternative base url to use.
   * If not specified, uses this.opts.baseUrl
   *
   * @param {Object=} opts.headers map of additional request headers
   *
   * @return {Promise} Resolves to <code>{data: {Object},
   * headers: {Object}, code: {Number}}</code>.
   * If <code>onlyData</code> is set, this will resolve to the <code>data</code>
   * object only.
   * @return {module:http-api.MatrixError} Rejects with an error if a problem
   * occurred. This includes network problems and Matrix-specific error JSON.
   */
  authedRequest(method, path, queryParams, body, opts = {}) {
    if (!queryParams) queryParams = {};
    if (this.opts.accessToken) {
      if (this.opts.useAuthorizationHeader) {
        if (!opts.headers) {
          opts.headers = {};
        }
        if (!opts.headers.Authorization) {
          opts.headers.Authorization = "Bearer " + this.opts.accessToken;
        }
        if (queryParams.access_token) {
          delete queryParams.access_token;
        }
      } else if (!queryParams.access_token) {
        queryParams.access_token = this.opts.accessToken;
      }
    }
    const requestPromise = this.request(method, path, queryParams, body, opts);
    requestPromise.catch(err => {
      if (err.errcode == 'M_UNKNOWN_TOKEN' && !opts?.inhibitLogoutEmit) {
        this.eventEmitter.emit(_interface.HttpApiEvent.SessionLoggedOut, err);
      } else if (err.errcode == 'M_CONSENT_NOT_GIVEN') {
        this.eventEmitter.emit(_interface.HttpApiEvent.NoConsent, err.message, err.data.consent_uri);
      }
    });

    // return the original promise, otherwise tests break due to it having to
    // go around the event loop one more time to process the result of the request
    return requestPromise;
  }

  /**
   * Perform a request to the homeserver without any credentials.
   * @param {string} method The HTTP method e.g. "GET".
   * @param {string} path The HTTP path <b>after</b> the supplied prefix e.g.
   * "/createRoom".
   *
   * @param {Object=} queryParams A dict of query params (these will NOT be
   * urlencoded). If unspecified, there will be no query params.
   *
   * @param {Object} [body] The HTTP JSON body.
   *
   * @param {Object=} opts additional options
   *
   * @param {Number=} opts.localTimeoutMs The maximum amount of time to wait before
   * timing out the request. If not specified, there is no timeout.
   *
   * @param {string=} opts.prefix The full prefix to use e.g.
   * "/_matrix/client/v2_alpha". If not specified, uses this.opts.prefix.
   *
   * @param {Object=} opts.headers map of additional request headers
   *
   * @return {Promise} Resolves to <code>{data: {Object},
   * headers: {Object}, code: {Number}}</code>.
   * If <code>onlyData</code> is set, this will resolve to the <code>data</code>
   * object only.
   * @return {module:http-api.MatrixError} Rejects with an error if a problem
   * occurred. This includes network problems and Matrix-specific error JSON.
   */
  request(method, path, queryParams, body, opts) {
    const fullUri = this.getUrl(path, queryParams, opts?.prefix, opts?.baseUrl);
    return this.requestOtherUrl(method, fullUri, body, opts);
  }

  /**
   * Perform a request to an arbitrary URL.
   * @param {string} method The HTTP method e.g. "GET".
   * @param {string} url The HTTP URL object.
   *
   * @param {Object} [body] The HTTP JSON body.
   *
   * @param {Object=} opts additional options
   *
   * @param {Number=} opts.localTimeoutMs The maximum amount of time to wait before
   * timing out the request. If not specified, there is no timeout.
   *
   * @param {Object=} opts.headers map of additional request headers
   *
   * @return {Promise} Resolves to data unless `onlyData` is specified as false,
   * where the resolved value will be a fetch Response object.
   * @return {module:http-api.MatrixError} Rejects with an error if a problem
   * occurred. This includes network problems and Matrix-specific error JSON.
   */
  async requestOtherUrl(method, url, body, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const json = opts.json ?? true;
    // We can't use getPrototypeOf here as objects made in other contexts e.g. over postMessage won't have same ref
    const jsonBody = json && body?.constructor?.name === Object.name;
    if (json) {
      if (jsonBody && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      if (!headers["Accept"]) {
        headers["Accept"] = "application/json";
      }
    }
    const timeout = opts.localTimeoutMs ?? this.opts.localTimeoutMs;
    const signals = [this.abortController.signal];
    if (timeout !== undefined) {
      signals.push((0, _utils2.timeoutSignal)(timeout));
    }
    if (opts.abortSignal) {
      signals.push(opts.abortSignal);
    }
    let data;
    if (jsonBody) {
      data = JSON.stringify(body);
    } else {
      data = body;
    }
    const {
      signal,
      cleanup
    } = (0, _utils2.anySignal)(signals);
    let res;
    try {
      res = await this.fetch(url, {
        signal,
        method,
        body: data,
        headers,
        mode: "cors",
        redirect: "follow",
        referrer: "",
        referrerPolicy: "no-referrer",
        cache: "no-cache",
        credentials: "omit" // we send credentials via headers
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw e;
      }
      throw new _errors.ConnectionError("fetch failed", e);
    } finally {
      cleanup();
    }
    if (!res.ok) {
      throw (0, _utils2.parseErrorResponse)(res, await res.text());
    }
    if (this.opts.onlyData) {
      return json ? res.json() : res.text();
    }
    return res;
  }

  /**
   * Form and return a homeserver request URL based on the given path params and prefix.
   * @param {string} path The HTTP path <b>after</b> the supplied prefix e.g. "/createRoom".
   * @param {Object} queryParams A dict of query params (these will NOT be urlencoded).
   * @param {string} prefix The full prefix to use e.g. "/_matrix/client/v2_alpha", defaulting to this.opts.prefix.
   * @param {string} baseUrl The baseUrl to use e.g. "https://matrix.org/", defaulting to this.opts.baseUrl.
   * @return {string} URL
   */
  getUrl(path, queryParams, prefix, baseUrl) {
    const url = new URL((baseUrl ?? this.opts.baseUrl) + (prefix ?? this.opts.prefix) + path);
    if (queryParams) {
      utils.encodeParams(queryParams, url.searchParams);
    }
    return url;
  }
}
exports.FetchHttpApi = FetchHttpApi;