/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsAbAddressCollector_H_
#define _nsAbAddressCollector_H_

#include "nsIAbAddressCollector.h"
#include "nsCOMPtr.h"
#include "nsIAbDirectory.h"
#include "nsIAbCard.h"
#include "nsIObserver.h"
#include "nsString.h"

class nsIPrefBranch;

class nsAbAddressCollector : public nsIAbAddressCollector, public nsIObserver {
 public:
  nsAbAddressCollector();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIABADDRESSCOLLECTOR
  NS_DECL_NSIOBSERVER

  nsresult Init();

 private:
  virtual ~nsAbAddressCollector();
  already_AddRefed<nsIAbCard> GetCardForAddress(const char* aProperty,
                                                const nsACString& aEmailAddress,
                                                nsIAbDirectory** aDirectory);
  void AutoCollectScreenName(nsIAbCard* aCard, const nsACString& aEmail);
  bool SetNamesForCard(nsIAbCard* aSenderCard, const nsACString& aFullName);
  void SplitFullName(const nsACString& aFullName, nsACString& aFirstName,
                     nsACString& aLastName);
  void SetUpAbFromPrefs(nsIPrefBranch* aPrefBranch);
  nsCOMPtr<nsIAbDirectory> mDirectory;
  nsCString mABURI;
};

#endif  // _nsAbAddressCollector_H_
