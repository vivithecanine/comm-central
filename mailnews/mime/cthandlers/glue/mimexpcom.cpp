/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIMimeObjectClassAccess.h"
#include "nsCOMPtr.h"
#include "nsComponentManagerUtils.h"

// {403B0540-B7C3-11d2-B35E-525400E2D63A}
#define NS_MIME_OBJECT_CLASS_ACCESS_CID             \
  {                                                 \
    0x403b0540, 0xb7c3, 0x11d2, {                   \
      0xb3, 0x5e, 0x52, 0x54, 0x0, 0xe2, 0xd6, 0x3a \
    }                                               \
  }
static NS_DEFINE_CID(kMimeObjectClassAccessCID,
                     NS_MIME_OBJECT_CLASS_ACCESS_CID);

/*
 * These calls are necessary to expose the object class hierarchy
 * to externally developed content type handlers.
 */
extern "C" void* COM_GetmimeInlineTextClass(void) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess) objAccess->GetmimeInlineTextClass(&ptr);

  return ptr;
}

extern "C" void* COM_GetmimeLeafClass(void) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess) objAccess->GetmimeLeafClass(&ptr);

  return ptr;
}

extern "C" void* COM_GetmimeObjectClass(void) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess) objAccess->GetmimeObjectClass(&ptr);

  return ptr;
}

extern "C" void* COM_GetmimeContainerClass(void) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess) objAccess->GetmimeContainerClass(&ptr);

  return ptr;
}

extern "C" void* COM_GetmimeMultipartClass(void) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess) objAccess->GetmimeMultipartClass(&ptr);

  return ptr;
}

extern "C" void* COM_GetmimeMultipartSignedClass(void) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess)
    objAccess->GetmimeMultipartSignedClass(&ptr);

  return ptr;
}

extern "C" int COM_MimeObject_write(void* mimeObject, char* data,
                                    int32_t length, bool user_visible_p) {
  int32_t rc = -1;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess) {
    if (NS_SUCCEEDED(objAccess->MimeObjectWrite(mimeObject, data, length,
                                                user_visible_p)))
      rc = length;
    else
      rc = -1;
  }

  return rc;
}

extern "C" void* COM_MimeCreate(char* content_type, void* hdrs, void* opts) {
  void* ptr = NULL;

  nsresult res;
  nsCOMPtr<nsIMimeObjectClassAccess> objAccess =
      do_CreateInstance(kMimeObjectClassAccessCID, &res);
  if (NS_SUCCEEDED(res) && objAccess)
    objAccess->MimeCreate(content_type, hdrs, opts, &ptr);

  return ptr;
}
