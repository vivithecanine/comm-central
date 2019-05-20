# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

start-label = Start private conversation
refresh-label = Refresh private conversation
auth-label = Verify your contact's identity
reauth-label = Reverify your contact's identity

auth-cancel = Cancel
auth-cancelAccessKey = C

auth-error = An error occurred while verifying your contact's identity.
auth-success = Verifying your contact's identity completed successfully.
auth-successThem = Your contact has successfully verified your identity. You may want to verify their identity as well by asking your own question.
auth-fail = Failed to verify your contact's identity.
auth-waiting = Waiting for contact to complete verification …

finger-verify = Verify
finger-verify-accessKey = V

# Do not translate 'OTR' (name of an encryption protocol)
buddycontextmenu-label = Add Contact's OTR Fingerprint

# Variables:
#   $name (String) - the screen name of a chat contact person
alert-start = Attempting to start a private conversation with { $name }.

# Variables:
#   $name (String) - the screen name of a chat contact person
alert-refresh = Attempting to refresh the private conversation with { $name }.

# Variables:
#   $name (String) - the screen name of a chat contact person
alert-gone_insecure = Private conversation with { $name } ended.

# Variables:
#   $name (String) - the screen name of a chat contact person
finger-unseen = The identity of { $name } has not been verified yet. Casual eavesdropping is not possible, but with some effort someone could be listening in. You should verify this contact's identity.

state-not_private = The current conversation is not private.

# Variables:
#   $name (String) - the screen name of a chat contact person
state-unverified = The current conversation is private but the identity of { $name } has not been verified.

# Variables:
#   $name (String) - the screen name of a chat contact person
state-private = The current conversation is private and the identity of { $name } has been verified.

# Variables:
#   $name (String) - the screen name of a chat contact person
state-finished = { $name } has ended their private conversation with you; you should do the same.

state-not_private-label = Insecure
state-unverified-label = Unverified
state-private-label = Private
state-finished-label = Finished

# Variables:
#   $name (String) - the screen name of a chat contact person
afterauth-private = You have verified the identity of { $name }.

# Variables:
#   $name (String) - the screen name of a chat contact person
afterauth-unverified = The identity of { $name } has not been verified.

verify-title = Verify your contact's identity
error-title = Error
success-title = End to End Encryption
successThem-title = Verify your contact's identity
fail-title = Unable to verify
waiting-title = Verification request sent
