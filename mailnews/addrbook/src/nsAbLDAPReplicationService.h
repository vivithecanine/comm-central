/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Rajiv Dayal <rdayal@netscape.com>
 * Portions created by the Initial Developer are Copyright (C) 2002
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */



#ifndef nsAbLDAPReplicationService_h___
#define nsAbLDAPReplicationService_h___

#include "nsIAbLDAPReplicationService.h"
#include "nsIAbLDAPReplicationQuery.h"
#include "nsStringGlue.h"

class nsAbLDAPReplicationService : public nsIAbLDAPReplicationService
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIABLDAPREPLICATIONSERVICE

  nsAbLDAPReplicationService();
  virtual ~nsAbLDAPReplicationService();

  PRInt32 DecideProtocol();

protected:
  nsCOMPtr<nsIAbLDAPReplicationQuery> mQuery; 
  bool           mReplicating;
  nsCOMPtr<nsIAbLDAPDirectory> mDirectory;

};


#endif /* nsAbLDAPReplicationService_h___ */
