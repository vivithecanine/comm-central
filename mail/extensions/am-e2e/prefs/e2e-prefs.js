/* global pref: false */
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Prefs shared by OpenPGP and S/MIME
 */

pref("mail.identity.default.encryptionpolicy", 0);
pref("mail.identity.default.sign_mail", false);

/**
 * S/MIME prefs
*/

pref("mail.identity.default.encryption_cert_name", "");
pref("mail.identity.default.signing_cert_name", "");

/**
 * OpenPGP prefs
 */

pref("mail.identity.default.openpgp_key_id", "");


// the last configured Enigmail version
pref("temp.openpgp.configuredVersion", "");

// Hide prefs and menu entries from non-advanced users
pref("temp.openpgp.advancedUser", false);

// ** enigmail keySel preferences:
// use rules to assign keys
pref("temp.openpgp.assignKeysByRules", true);
// use email addresses to assign keys
pref("temp.openpgp.assignKeysByEmailAddr", true);
// use manual dialog to assign missing keys
pref("temp.openpgp.assignKeysManuallyIfMissing", true);
// always srats manual dialog for keys
pref("temp.openpgp.assignKeysManuallyAlways", false);

// automatically download missing keys from keyserver
pref("temp.openpgp.autoKeyRetrieve", "");

// enable automatically decrypt/verify
pref("temp.openpgp.autoDecrypt", true);

// enable X-Enigmail-xxx headers
pref("temp.openpgp.addHeaders", false);

// countdown for alerts when composing inline PGP HTML msgs
pref("temp.openpgp.composeHtmlAlertCount", 3);

// show warning message when clicking on sign icon
pref("temp.openpgp.displaySignWarn", true);

// display warning as info for partially signed message
pref("temp.openpgp.displayPartiallySigned", true);

// try to match secondary uid to from address
pref("temp.openpgp.displaySecondaryUid", true);

// treat '-- ' as signature separator
pref("temp.openpgp.doubleDashSeparator", true);

// skip the attachments dialog
pref("temp.openpgp.encryptAttachmentsSkipDlg", 0);

// Encrypt to self
pref("temp.openpgp.encryptToSelf", true);

// enable 'Decrypt & open' for double click on attachment (if possible)
pref("temp.openpgp.handleDoubleClick", true);

// disable '<' and '>' around email addresses
pref("temp.openpgp.hushMailSupport", false);

// display alert for 'failed to initialize enigmime'
pref("temp.openpgp.initAlert", true);

// use -a for encrypting attachments for inline PGP
pref("temp.openpgp.inlineAttachAsciiArmor", false);

// extension to append for inline-encrypted attachments
pref("temp.openpgp.inlineAttachExt", ".pgp");

// extension to append for inline-signed attachments
pref("temp.openpgp.inlineSigAttachExt", ".sig");

// debug log directory (if set, also enabled debugging)
pref("temp.openpgp.logDirectory", "");

// display all or no keys by default in the key manager
pref("temp.openpgp.keyManShowAllKeys", true);


// list of keyservers to use
pref("temp.openpgp.keyserver", "vks://keys.openpgp.org, hkps://hkps.pool.sks-keyservers.net, hkps://pgp.mit.edu");

// auto select the first keyserver in the key server list
pref("temp.openpgp.autoKeyServerSelection", true);

// keep passphrase for ... minutes
pref("temp.openpgp.maxIdleMinutes", 5);

// maximum number of parallel decrypt processes that Enigmaik will handle
// (requests aboved the threshold are ignored)
pref("temp.openpgp.maxNumProcesses", 3);

// GnuPG hash algorithm
// 0: automatic seletion (i.e. let GnuPG choose)
// 1: SHA1, 2: RIPEMD160, 3: SHA256, 4: SHA384, 5: SHA512, 6: SHA224
pref("temp.openpgp.mimeHashAlgorithm", 0);

// no passphrase for GnuPG key needed
pref("temp.openpgp.noPassphrase", false);

// show quoted printable warning message (and remember selected state)
pref("temp.openpgp.quotedPrintableWarn", 0);

// use http proxy settings as set in Mozilla/Thunderbird
pref("temp.openpgp.respectHttpProxy", true);

// selection for which encryption model to prefer
// 0: convenient encryption settings DEFAULT
// 1: manual encryption settings
pref("temp.openpgp.encryptionModel", 0);

// enable encryption for replies to encrypted mails
pref("temp.openpgp.keepSettingsForReply", true);

// Warn if a key expires in less than N days.
// 0 will disable the check
pref("temp.openpgp.warnKeyExpiryNumDays", 30);

// holds the last result of the dayily key expiry check
pref("temp.openpgp.keyCheckResult", "");


// selection for which keys to accept
// 0: accept valid/authenticated keys
// 1: accept all keys (except disabled, ...) DEFAULT
pref("temp.openpgp.acceptedKeys", 1);

// selection for automatic send encrypted if all keys valid
// 0: never
// 1: if all keys found and accepted DEFAULT
pref("temp.openpgp.autoSendEncrypted", 1);

// enable automatic lookup of keys using Web Key Directory (WKD)
// (see https://tools.ietf.org/html/draft-koch-openpgp-webkey-service)
// 0: no
// 1: yes DEFAULT
pref("temp.openpgp.autoWkdLookup", 1);

// ask to confirm before sending
// 0: never DEFAULT
// 1: always
// 2: if send encrypted
// 3: if send unencrypted
// 4: if send (un)encrypted due to rules
pref("temp.openpgp.confirmBeforeSending", 0);

// show "Missing Trust in own keys" message (and remember selected state)
pref("temp.openpgp.warnOnMissingOwnerTrust", true);

// use GnuPG's default instead of Enigmail/Mozilla comment of for signed messages
pref("temp.openpgp.useDefaultComment", true);

// allow encryption to newsgroups
pref("temp.openpgp.encryptToNews", false);
pref("temp.openpgp.warnOnSendingNewsgroups", true);

// holds the timestamp of the last check for GnuPG updates
pref("temp.openpgp.gpgLastUpdate", "0");

// set locale for GnuPG calls to en-US (Windows only)
pref("temp.openpgp.gpgLocaleEn", true);

// use PGP/MIME (0=never, 1=allow, 2=always)
// pref("temp.openpgp.usePGPMimeOption",1); -- OBSOLETE, see mail.identity.default.pgpMimeMode

// Use gpg for keyserver operations (vs. Thunderbird)
pref("temp.openpgp.useGpgKeysTool", false);

// show "conflicting rules" message (and remember selected state)
pref("temp.openpgp.warnOnRulesConflict", 0);

// display a warning when the passphrase is cleared
pref("temp.openpgp.warnClearPassphrase", true);

// display a warning if the GnuPG version is deprecated
pref("temp.openpgp.warnDeprecatedGnuPG", true);

// warn if gpg-agent is found and "remember passphrase for X minutes is active"
pref("temp.openpgp.warnGpgAgentAndIdleTime", true);

// display a warning when all keys are to be refreshed
pref("temp.openpgp.warnRefreshAll", true);

// display a warning when the keys for all contacts are downloaded
pref("temp.openpgp.warnDownloadContactKeys", true);

// wrap HTML messages before sending inline PGP messages
pref("temp.openpgp.wrapHtmlBeforeSend", true);

// enable encryption/signing of headers like subject, from, to
// 1: default: ask user at 1st time use / 0: off /  2: on
pref("temp.openpgp.protectedHeaders", 1);
pref("temp.openpgp.protectedSubjectText", "");

// do reset the "references" and "in-reply-to" headers?
pref("temp.openpgp.protectReferencesHdr", false);

// tor configuration
pref("temp.openpgp.torIpAddr", "127.0.0.1");
pref("temp.openpgp.torServicePort", "9050");
pref("temp.openpgp.torBrowserBundlePort", "9150");

// gpg tor actions
pref("temp.openpgp.downloadKeyWithTor", false);
pref("temp.openpgp.downloadKeyRequireTor", false);
pref("temp.openpgp.searchKeyWithTor", false);
pref("temp.openpgp.searchKeyRequireTor", false);
pref("temp.openpgp.uploadKeyWithTor", false);
pref("temp.openpgp.uploadKeyRequireTor", false);
pref("temp.openpgp.refreshAllKeysWithTor", false);
pref("temp.openpgp.refreshAllKeysRequireTor", false);

// Hours per week that Enigmail is available for refreshing keys
// The smaller the hours available, the more often the refresh
// will happen to accommodate.
pref("temp.openpgp.hoursPerWeekEnigmailIsOn", 40);

// The minimum number of seconds to wait between refreshing keys.
// Applied if the refresh frequence from hoursPerWeekEnigmailIsOn
// goes too low
pref("temp.openpgp.refreshMinDelaySeconds", 300);

// Toggle to have user keys continuously refreshed
pref("temp.openpgp.keyRefreshOn", false);

// enable experimental features.
// WARNING: such features may unfinished functions or tests that can break
// existing functionality in Enigmail and Thunderbird!
pref("temp.openpgp.enableExperiments", false);


/*
   Default pref values for the enigmail per-identity
   settings
*/

pref("mail.identity.default.defaultSigningPolicy", 0);
pref("mail.identity.default.defaultEncryptionPolicy", 0);
pref("mail.identity.default.openPgpUrlName", "");
pref("mail.identity.default.pgpMimeMode", true);
pref("mail.identity.default.attachPgpKey", false);
pref("mail.identity.default.autoEncryptDrafts", true);
pref("mail.identity.default.protectSubject", true);
pref("mail.identity.default.warnWeakReply", false);

// prefer S/MIME or PGP/MIME (0: S/MIME, 1: PGP/MIME)
pref("mail.identity.default.mimePreferOpenPGP", 1);

/*
   Other settings (change Mozilla behaviour)
*/

// disable flowed text by default
// TODO: pref("mailnews.send_plaintext_flowed", false);

// disable loading of IMAP parts on demand
// TODO: pref("mail.server.default.mime_parts_on_demand", false);
