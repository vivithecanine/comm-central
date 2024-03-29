/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsCOMPtr.h"
#include "objbase.h"
#include "nsISupports.h"

#include "mozilla/ModuleUtils.h"
#include "mozilla/Services.h"
#include "nsIObserverService.h"
#include "Registry.h"
#include "msgMapiSupport.h"

#include "msgMapiImp.h"

/** Implementation of the nsIMapiSupport interface.
 *  Use standard implementation of nsISupports stuff.
 */

NS_IMPL_ISUPPORTS(nsMapiSupport, nsIMapiSupport, nsIObserver)

NS_IMETHODIMP
nsMapiSupport::Observe(nsISupports* aSubject, const char* aTopic,
                       const char16_t* aData) {
  nsresult rv = NS_OK;

  if (!strcmp(aTopic, "profile-after-change")) return InitializeMAPISupport();

  if (!strcmp(aTopic, NS_XPCOM_SHUTDOWN_OBSERVER_ID))
    return ShutdownMAPISupport();

  nsCOMPtr<nsIObserverService> observerService =
      mozilla::services::GetObserverService();
  NS_ENSURE_TRUE(observerService, NS_ERROR_UNEXPECTED);

  rv = observerService->AddObserver(this, "profile-after-change", false);
  if (NS_FAILED(rv)) return rv;

  rv = observerService->AddObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);
  if (NS_FAILED(rv)) return rv;

  return rv;
}

nsMapiSupport::nsMapiSupport() : m_dwRegister(0), m_nsMapiFactory(nullptr) {}

nsMapiSupport::~nsMapiSupport() {}

NS_IMETHODIMP
nsMapiSupport::InitializeMAPISupport() {
  ::OleInitialize(nullptr);

  if (m_nsMapiFactory ==
      nullptr)  // No Registering if already done.  Sanity Check!!
  {
    m_nsMapiFactory = new CMapiFactory();

    if (m_nsMapiFactory != nullptr) {
      HRESULT hr = ::CoRegisterClassObject(CLSID_CMapiImp, m_nsMapiFactory,
                                           CLSCTX_LOCAL_SERVER,
                                           REGCLS_MULTIPLEUSE, &m_dwRegister);

      if (FAILED(hr)) {
        m_nsMapiFactory->Release();
        m_nsMapiFactory = nullptr;
        return NS_ERROR_FAILURE;
      }
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMapiSupport::ShutdownMAPISupport() {
  if (m_dwRegister != 0) ::CoRevokeClassObject(m_dwRegister);

  if (m_nsMapiFactory != nullptr) {
    m_nsMapiFactory->Release();
    m_nsMapiFactory = nullptr;
  }

  ::OleUninitialize();

  return NS_OK;
}

NS_IMETHODIMP
nsMapiSupport::RegisterServer() {
  // TODO: Figure out what kind of error propagation to pass back
  ::RegisterServer(CLSID_CMapiImp, L"Mozilla MAPI", L"MozillaMapi",
                   L"MozillaMapi.1");
  return NS_OK;
}

NS_IMETHODIMP
nsMapiSupport::UnRegisterServer() {
  // TODO: Figure out what kind of error propagation to pass back
  ::UnregisterServer(CLSID_CMapiImp, L"MozillaMapi", L"MozillaMapi.1");
  return NS_OK;
}
