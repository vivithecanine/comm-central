/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include <string.h>
#include "nsMimeRebuffer.h"
#include "prmem.h"

MimeRebuffer::MimeRebuffer(void)
{
  mSize = 0;
  mBuf = NULL;
}

MimeRebuffer::~MimeRebuffer(void)
{
  if (mBuf)
  {
    PR_FREEIF(mBuf);
    mBuf = NULL;
  }
}

PRUint32
MimeRebuffer::GetSize()
{
  return mSize;
}

PRUint32      
MimeRebuffer::IncreaseBuffer(const char *addBuf, PRUint32 size)
{
  if ( (!addBuf) || (size == 0) )
    return mSize;

  mBuf = (char *)PR_Realloc(mBuf, size + mSize);
  if (!mBuf)
  {
    mSize = 0;
    return mSize;
  }

  memcpy(mBuf+mSize, addBuf, size);
  mSize += size;
  return mSize;
}

PRUint32      
MimeRebuffer::ReduceBuffer(PRUint32 numBytes)
{
  if (numBytes == 0)
    return mSize;

  if (!mBuf)
  {
    mSize = 0;
    return mSize;
  }

  if (numBytes >= mSize)
  {
    PR_FREEIF(mBuf);
    mBuf = NULL;
    mSize = 0;
    return mSize;
  }

  memcpy(mBuf, mBuf+numBytes, (mSize - numBytes));
  mSize -= numBytes;
  return mSize;
}

char *
MimeRebuffer::GetBuffer()
{
  return mBuf;
}
