/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the GuessConfig module, starting with the basic function for checking
 * a server's response, then adding more layers until finally doing a full
 * configuration guess.
 *
 * This test uses mock servers, behind a SOCKS proxy pretending they exist
 * with known hostnames and standard ports.
 */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/IMAPServer.sys.mjs"
);
const { NetworkTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/NetworkTestUtils.jsm"
);
const { POP3Server } = ChromeUtils.importESModule(
  "resource://testing-common/POP3Server.sys.mjs"
);
const { SMTPServer } = ChromeUtils.importESModule(
  "resource://testing-common/SMTPServer.sys.mjs"
);
const { GuessConfig, GuessConfigForTests } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/GuessConfig.sys.mjs"
);
const { doProxy, HostDetector, SocketUtil } = GuessConfigForTests;

// Change this for more server debugging output. See Maild.jsm for values.
const serverDebugLevel = 0;

add_setup(async function () {
  const imapServer = new IMAPServer(this, { extensions: ["RFC2195"] });
  imapServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 143, imapServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 143, imapServer.port);

  const pop3Server = new POP3Server(this);
  pop3Server.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 110, pop3Server.port);
  NetworkTestUtils.configureProxy("alt.test.test", 110, pop3Server.port);

  const smtpServer = new SMTPServer(this);
  smtpServer.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy("test.test", 587, smtpServer.port);
  NetworkTestUtils.configureProxy("alt.test.test", 587, smtpServer.port);
});

registerCleanupFunction(function () {
  NetworkTestUtils.clearProxy();
});

const imapCommands = ["1 CAPABILITY\r\n", "2 LOGOUT\r\n"];
const expectedIMAPResponse = [
  "* OK IMAP4rev1 Fakeserver started up",
  "* CAPABILITY IMAP4rev1 CLIENTID AUTH=CRAM-MD5 AUTH=PLAIN AUTH=LOGIN",
  "1 OK CAPABILITY completed",
  "* BYE IMAP4rev1 Logging out",
  "2 OK LOGOUT completed",
  "",
];

/**
 * Tests that `SocketUtil` correctly connects to the IMAP server and gets the
 * expected response.
 */
add_task(async function testSocketUtilIMAP() {
  const proxy = await new Promise(resolve => doProxy("test.test", resolve));
  const { promise, resolve, reject } = Promise.withResolvers();
  SocketUtil(
    "test.test",
    143,
    Ci.nsMsgSocketType.plain,
    imapCommands,
    10, // timeout
    proxy,
    null, // sslErrorHandler
    resolve,
    reject
  );

  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedIMAPResponse);
});

const pop3Commands = ["CAPA\r\n", "QUIT\r\n"];
const expectedPOP3Response = [
  "+OK Fake POP3 server ready",
  "+OK List of our wanna-be capabilities follows:",
  "UIDL",
  "TOP",
  "SASL CRAM-MD5 PLAIN LOGIN",
  "IMPLEMENTATION fakeserver",
  ".",
  "+OK fakeserver signing off",
  "",
];

/**
 * Tests that `SocketUtil` correctly connects to the POP3 server and gets the
 * expected response.
 */
add_task(async function testSocketUtilPOP3() {
  const proxy = await new Promise(resolve => doProxy("test.test", resolve));
  const { promise, resolve, reject } = Promise.withResolvers();
  SocketUtil(
    "test.test",
    110,
    Ci.nsMsgSocketType.plain,
    pop3Commands,
    10, // timeout
    proxy,
    null, // sslErrorHandler
    resolve,
    reject
  );

  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedPOP3Response);
});

const smtpCommands = ["EHLO we-guess.mozilla.org\r\n", "QUIT\r\n"];
const expectedSMTPResponse = [
  "220 ok",
  "250-fakeserver greets you",
  "250-8BITMIME",
  "250-SIZE",
  "250-CLIENTID",
  "250-AUTH CRAM-MD5 PLAIN LOGIN",
  "250 HELP",
  "221 done",
  "",
];

/**
 * Tests that `SocketUtil` correctly connects to the SMTP server and gets the
 * expected response.
 */
add_task(async function testSocketUtilSMTP() {
  const proxy = await new Promise(resolve => doProxy("test.test", resolve));
  const { promise, resolve, reject } = Promise.withResolvers();
  SocketUtil(
    "test.test",
    587,
    Ci.nsMsgSocketType.plain,
    smtpCommands,
    10, // timeout
    proxy,
    null, // sslErrorHandler
    resolve,
    reject
  );

  const response = await promise;
  Assert.deepEqual(response.join("").split("\r\n"), expectedSMTPResponse);
});

async function subtestHostDetector({
  type,
  port,
  socketType = -1,
  authMethod = -1,
  hostnamesToTry,
  portsToTry,
}) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const detector = new HostDetector(
    function progressCallback(hostTry) {},
    function successCallback(result, alts) {
      resolve({ result, alts });
    },
    function errorCallback(exception) {
      reject(exception);
    }
  );
  detector._hostnamesToTry = hostnamesToTry;
  detector._portsToTry = portsToTry;
  detector.start("test.test", false, type, port, socketType, authMethod);
  return promise;
}

async function subtestHostDetectorGivenValues(type, port, portsToTry) {
  const { result } = await subtestHostDetector({
    type,
    port,
    socketType: Ci.nsMsgSocketType.plain,
    authMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    hostnamesToTry(protocol, domain) {
      return [domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, "test.test", "hostname");
  Assert.equal(result.port, port, "port");
  Assert.equal(result.status, 3, "status");
  Assert.equal(result.socketType, Ci.nsMsgSocketType.plain, "socketType");
  Assert.equal(
    result.authMethod,
    Ci.nsMsgAuthMethod.passwordCleartext,
    "authMethod"
  );
  Assert.deepEqual(
    result.authMethods,
    [
      Ci.nsMsgAuthMethod.passwordEncrypted,
      Ci.nsMsgAuthMethod.passwordCleartext,
    ],
    "authMethods"
  );
}

/**
 * Test that `HostDetector` finds the IMAP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesIMAP() {
  await subtestHostDetectorGivenValues(
    "imap",
    143,
    GuessConfig.getIncomingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the POP3 server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesPOP3() {
  await subtestHostDetectorGivenValues(
    "pop3",
    110,
    GuessConfig.getIncomingTryOrder
  );
});

/**
 * Test that `HostDetector` finds the SMTP server given the configuration,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorGivenValuesSMTP() {
  await subtestHostDetectorGivenValues(
    "smtp",
    587,
    GuessConfig.getOutgoingTryOrder
  );
});

async function subtestHostDetectorAuto(type, portsToTry, expectedPort) {
  const { result } = await subtestHostDetector({
    type,
    hostnamesToTry(protocol, domain) {
      return [domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, "test.test", "hostname");
  Assert.equal(result.port, expectedPort, "port");
  Assert.equal(result.status, 3, "status");
  Assert.equal(result.socketType, Ci.nsMsgSocketType.plain, "socketType");
  Assert.equal(result.authMethod, -1, "authMethod");
  Assert.deepEqual(
    result.authMethods,
    [
      Ci.nsMsgAuthMethod.passwordEncrypted,
      Ci.nsMsgAuthMethod.passwordCleartext,
    ],
    "authMethods"
  );
}

/**
 * Test that `HostDetector` finds the IMAP server given only the hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAutoIMAP() {
  await subtestHostDetectorAuto("imap", GuessConfig.getIncomingTryOrder, 143);
});

/**
 * Test that `HostDetector` finds the POP3 server given only the hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAutoPOP3() {
  await subtestHostDetectorAuto("pop3", GuessConfig.getIncomingTryOrder, 110);
});

/**
 * Test that `HostDetector` finds the SMTP server given only the hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAutoSMTP() {
  await subtestHostDetectorAuto("smtp", GuessConfig.getOutgoingTryOrder, 587);
});

async function subtestHostDetectorAlternateHostname(
  type,
  portsToTry,
  expectedPort
) {
  const { result, alts } = await subtestHostDetector({
    type,
    hostnamesToTry(protocol, domain) {
      return [`bad.${domain}`, `alt.${domain}`, domain];
    },
    portsToTry,
  });
  Assert.equal(result.hostname, "alt.test.test", "hostname");
  Assert.equal(result.port, expectedPort, "port");
  Assert.equal(result.status, 3, "status");
  Assert.equal(result.socketType, Ci.nsMsgSocketType.plain, "socketType");
  Assert.equal(result.authMethod, -1, "authMethod");
  Assert.deepEqual(
    result.authMethods,
    [
      Ci.nsMsgAuthMethod.passwordEncrypted,
      Ci.nsMsgAuthMethod.passwordCleartext,
    ],
    "authMethods"
  );
  Assert.deepEqual(alts, []);
}

/**
 * Test that `HostDetector` finds the IMAP server at an alternate hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAlternateHostnameIMAP() {
  await subtestHostDetectorAlternateHostname(
    "imap",
    GuessConfig.getIncomingTryOrder,
    143
  );
});

/**
 * Test that `HostDetector` finds the POP3 server at an alternate hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAlternateHostnamePOP3() {
  await subtestHostDetectorAlternateHostname(
    "pop3",
    GuessConfig.getIncomingTryOrder,
    110
  );
});

/**
 * Test that `HostDetector` finds the SMTP server at an alternate hostname,
 * and returns a correct `HostTry` result.
 */
add_task(async function testHostDetectorAlternateHostnameSMTP() {
  await subtestHostDetectorAlternateHostname(
    "smtp",
    GuessConfig.getOutgoingTryOrder,
    587
  );
});

/**
 * Tests a complete `guessConfig` operation returns a correct `AccountConfig`
 * result for the configured servers.
 */
add_task(async function testGuessConfig() {
  const { promise, resolve, reject } = Promise.withResolvers();
  GuessConfig.guessConfig(
    "test.test",
    function progressCallback() {},
    function successCallback(accountConfig) {
      resolve(accountConfig);
    },
    function errorCallback(exception) {
      reject(exception);
    }
  );

  const accountConfig = await promise;
  const { incoming, incomingAlternatives, outgoing, outgoingAlternatives } =
    accountConfig;

  Assert.equal(incoming.type, "imap");
  Assert.equal(incoming.hostname, "test.test");
  Assert.equal(incoming.port, 143);
  Assert.equal(incoming.socketType, 0);
  Assert.equal(incoming.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(incoming.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.equal(incomingAlternatives.length, 1);
  Assert.equal(incomingAlternatives[0].type, "pop3");
  Assert.equal(incomingAlternatives[0].hostname, "test.test");
  Assert.equal(incomingAlternatives[0].port, 110);
  Assert.equal(incomingAlternatives[0].socketType, 0);
  Assert.equal(
    incomingAlternatives[0].auth,
    Ci.nsMsgAuthMethod.passwordEncrypted
  );
  Assert.deepEqual(incomingAlternatives[0].authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.equal(outgoing.type, "smtp");
  Assert.equal(outgoing.hostname, "test.test");
  Assert.equal(outgoing.port, 587);
  Assert.equal(outgoing.socketType, 0);
  Assert.equal(outgoing.auth, Ci.nsMsgAuthMethod.passwordEncrypted);
  Assert.deepEqual(outgoing.authAlternatives, [
    Ci.nsMsgAuthMethod.passwordCleartext,
  ]);

  Assert.deepEqual(outgoingAlternatives, []);
});
