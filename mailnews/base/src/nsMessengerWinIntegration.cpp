/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <windows.h>
#include <shellapi.h>
#include <strsafe.h>

#include "nsMessengerWinIntegration.h"
#include "nsMsgDBFolder.h"
#include "nsIBaseWindow.h"
#include "nsIWidget.h"
#include "mozilla/Services.h"
#include "nsIObserverService.h"

#define IDI_MAILBIFF 32576

// since we are including windows.h in this file, undefine get user name....
#ifdef GetUserName
#  undef GetUserName
#endif

#ifndef NIIF_USER
#  define NIIF_USER 0x00000004
#endif

#ifndef NIIF_NOSOUND
#  define NIIF_NOSOUND 0x00000010
#endif

using namespace mozilla;

nsMessengerWinIntegration::nsMessengerWinIntegration() {}

nsMessengerWinIntegration::~nsMessengerWinIntegration() {}

NS_IMPL_ADDREF(nsMessengerWinIntegration)
NS_IMPL_RELEASE(nsMessengerWinIntegration)

NS_INTERFACE_MAP_BEGIN(nsMessengerWinIntegration)
  NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIMessengerOSIntegration)
  NS_INTERFACE_MAP_ENTRY(nsIMessengerWindowsIntegration)
  NS_INTERFACE_MAP_ENTRY(nsIMessengerOSIntegration)
NS_INTERFACE_MAP_END

NOTIFYICONDATAW sMailIconData = {
    /* cbSize */ (DWORD)NOTIFYICONDATAW_V2_SIZE,
    /* hWnd */ 0,
    /* uID */ 2,
    /* uFlags */ NIF_ICON | NIF_MESSAGE | NIF_TIP | NIF_INFO,
    /* uCallbackMessage */ WM_USER,
    /* hIcon */ 0,
    /* szTip */ L"",
    /* dwState */ 0,
    /* dwStateMask */ 0,
    /* szInfo */ L"",
    /* uVersion */ {30000},
    /* szInfoTitle */ L"",
    /* dwInfoFlags */ NIIF_USER | NIIF_NOSOUND};

static nsCOMArray<nsIBaseWindow> sHiddenWindows;
static HWND sIconWindow;
static LRESULT CALLBACK IconWindowProc(HWND msgWindow, UINT msg, WPARAM wp,
                                       LPARAM lp) {
  if (msg == WM_USER && lp == WM_LBUTTONDOWN) {
    ::Shell_NotifyIconW(NIM_DELETE, &sMailIconData);

    for (uint32_t i = 0; i < sHiddenWindows.Length(); i++) {
      sHiddenWindows[i]->SetVisibility(true);

      nsCOMPtr<nsIWidget> widget;
      sHiddenWindows[i]->GetMainWidget(getter_AddRefs(widget));
      if (!widget) {
        continue;
      }

      HWND hwnd = (HWND)(widget->GetNativeData(NS_NATIVE_WIDGET));
      ::ShowWindow(hwnd, SW_RESTORE);
      ::SetForegroundWindow(hwnd);

      nsCOMPtr<nsIObserverService> obs =
          mozilla::services::GetObserverService();
      obs->NotifyObservers(sHiddenWindows[i], "window-restored-from-tray", 0);
    }

    sHiddenWindows.Clear();
  }
  return TRUE;
}

WNDCLASS sClassStruct = {
    /* style */ 0,
    /* lpfnWndProc */ &IconWindowProc,
    /* cbClsExtra */ 0,
    /* cbWndExtra */ 0,
    /* hInstance */ 0,
    /* hIcon */ 0,
    /* hCursor */ 0,
    /* hbrBackground */ 0,
    /* lpszMenuName */ 0,
    /* lpszClassName */ L"IconWindowClass"};

nsresult nsMessengerWinIntegration::HideWindow(nsIBaseWindow* aWindow) {
  NS_ENSURE_ARG(aWindow);
  aWindow->SetVisibility(false);
  sHiddenWindows.AppendElement(aWindow);

  if (sMailIconData.hWnd == 0) {
    // Register the window class.
    NS_ENSURE_TRUE(::RegisterClass(&sClassStruct), NS_ERROR_FAILURE);
    // Create the window.
    NS_ENSURE_TRUE(sIconWindow = ::CreateWindow(
                       /* className */ L"IconWindowClass",
                       /* title */ 0,
                       /* style */ WS_CAPTION,
                       /* x, y, cx, cy */ 0, 0, 0, 0,
                       /* parent */ 0,
                       /* menu */ 0,
                       /* instance */ 0,
                       /* create struct */ 0),
                   NS_ERROR_FAILURE);
    sMailIconData.hWnd = sIconWindow;
  }

  auto idi = IDI_APPLICATION;
  if (mUnreadCount > 0) {
    idi = MAKEINTRESOURCE(IDI_MAILBIFF);
  }
  sMailIconData.hIcon = ::LoadIcon(::GetModuleHandle(NULL), idi);
  nsresult rv = SetTooltip();
  NS_ENSURE_SUCCESS(rv, rv);

  ::Shell_NotifyIconW(NIM_ADD, &sMailIconData);
  ::Shell_NotifyIconW(NIM_SETVERSION, &sMailIconData);
  return NS_OK;
}

NS_IMETHODIMP
nsMessengerWinIntegration::UpdateUnreadCount(uint32_t unreadCount,
                                             const nsAString& unreadTooltip) {
  if (sHiddenWindows.Length() > 0) {
    // sHiddenWindows is not empty means tray icon is visible.
    if (mUnreadCount == 0 && unreadCount > 0) {
      // Unread count changes from 0, update tray icon.
      sMailIconData.hIcon =
          ::LoadIcon(::GetModuleHandle(NULL), MAKEINTRESOURCE(IDI_MAILBIFF));
    } else if (mUnreadCount > 0 && unreadCount == 0) {
      // Unread count changes to 0, update tray icon.
      sMailIconData.hIcon =
          ::LoadIcon(::GetModuleHandle(NULL), IDI_APPLICATION);
    }
    mUnreadCount = unreadCount;
    mUnreadTooltip = unreadTooltip;
    nsresult rv = SetTooltip();
    NS_ENSURE_SUCCESS(rv, rv);
    ::Shell_NotifyIconW(NIM_MODIFY, &sMailIconData);
    return rv;
  }
  mUnreadCount = unreadCount;
  mUnreadTooltip = unreadTooltip;
  return NS_OK;
}

/**
 * Set a tooltip to the tray icon. Including the brand short name, and unread
 * message count.
 */
nsresult nsMessengerWinIntegration::SetTooltip() {
  nsresult rv = NS_OK;
  if (mBrandShortName.IsEmpty()) {
    nsCOMPtr<nsIStringBundleService> bundleService =
        mozilla::services::GetStringBundleService();
    NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
    nsCOMPtr<nsIStringBundle> bundle;
    rv = bundleService->CreateBundle(
        "chrome://branding/locale/brand.properties", getter_AddRefs(bundle));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = bundle->GetStringFromName("brandShortName", mBrandShortName);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  nsString tooltip = mBrandShortName;
  if (!mUnreadTooltip.IsEmpty()) {
    tooltip.AppendLiteral("\n");
    tooltip.Append(mUnreadTooltip);
  }
  size_t destLength =
      sizeof sMailIconData.szTip / (sizeof sMailIconData.szTip[0]);
  ::StringCchCopyNW(sMailIconData.szTip, destLength, tooltip.get(),
                    tooltip.Length());
  return rv;
}
