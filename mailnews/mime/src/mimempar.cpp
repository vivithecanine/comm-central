/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimempar.h"
#include "prlog.h"

#define MIME_SUPERCLASS mimeMultipartClass
MimeDefClass(MimeMultipartParallel, MimeMultipartParallelClass,
             mimeMultipartParallelClass, &MIME_SUPERCLASS);

static int MimeMultipartParallelClassInitialize(MimeObjectClass* oclass) {
#ifdef DEBUG
  PR_ASSERT(!oclass->class_initialized);
#endif
  return 0;
}
