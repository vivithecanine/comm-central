/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessengerUnixIntegration.h"

/**
 * This is only a placeholder for now, register it in components.conf later if
 * needed.
 */
nsMessengerUnixIntegration::nsMessengerUnixIntegration() {}

NS_IMPL_ISUPPORTS(nsMessengerUnixIntegration, nsIMessengerOSIntegration)

NS_IMETHODIMP
nsMessengerUnixIntegration::UpdateUnreadCount(const uint32_t unreadCount) {
  return NS_OK;
}
