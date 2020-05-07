/*
 * Copyright (c) 2017, [Ribose Inc](https://www.ribose.com).
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * 1.  Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *
 * 2.  Redistributions in binary form must reproduce the above copyright notice,
 *     this list of conditions and the following disclaimer in the documentation
 *     and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#include "config.h"
#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <string.h>
#include <sys/stat.h>
#include <stdarg.h>
#include <errno.h>
#ifdef HAVE_FCNTL_H
#include <fcntl.h>
#endif
#ifdef HAVE_LIMITS_H
#include <limits.h>
#endif
#include <rnp/rnp_def.h>
#include "rnp.h"
#include "stream-common.h"
#include "types.h"
#include <algorithm>

bool
src_read(pgp_source_t *src, void *buf, size_t len, size_t *readres)
{
    size_t              left = len;
    size_t              read;
    pgp_source_cache_t *cache = src->cache;
    bool                readahead = cache ? cache->readahead : false;

    if (src->error) {
        return false;
    }

    if (src->eof || (len == 0)) {
        *readres = 0;
        return true;
    }

    // Do not read more then available if source size is known
    if (src->knownsize && (src->readb + len > src->size)) {
        len = src->size - src->readb;
        left = len;
        readahead = false;
    }

    // Check whether we have cache and there is data inside
    if (cache && (cache->len > cache->pos)) {
        read = cache->len - cache->pos;
        if (read >= len) {
            memcpy(buf, &cache->buf[cache->pos], len);
            cache->pos += len;
            goto finish;
        } else {
            memcpy(buf, &cache->buf[cache->pos], read);
            cache->pos += read;
            buf = (uint8_t *) buf + read;
            left = len - read;
        }
    }

    // If we got here then we have empty cache or no cache at all
    while (left > 0) {
        if (left > sizeof(cache->buf) || !readahead || !cache) {
            // If there is no cache or chunk is larger then read directly
            if (!src->read(src, buf, left, &read)) {
                src->error = 1;
                return false;
            }
            if (!read) {
                src->eof = 1;
                len = len - left;
                goto finish;
            }
            left -= read;
            buf = (uint8_t *) buf + read;
        } else {
            // Try to fill the cache to avoid small reads
            if (!src->read(src, &cache->buf[0], sizeof(cache->buf), &read)) {
                src->error = 1;
                return false;
            }
            if (!read) {
                src->eof = 1;
                len = len - left;
                goto finish;
            } else if (read < left) {
                memcpy(buf, &cache->buf[0], read);
                left -= read;
                buf = (uint8_t *) buf + read;
            } else {
                memcpy(buf, &cache->buf[0], left);
                cache->pos = left;
                cache->len = read;
                goto finish;
            }
        }
    }

finish:
    src->readb += len;
    if (src->knownsize && (src->readb == src->size)) {
        src->eof = 1;
    }
    *readres = len;
    return true;
}

bool
src_read_eq(pgp_source_t *src, void *buf, size_t len)
{
    size_t res = 0;
    return src_read(src, buf, len, &res) && (res == len);
}

bool
src_peek(pgp_source_t *src, void *buf, size_t len, size_t *peeked)
{
    pgp_source_cache_t *cache = src->cache;
    if (src->error) {
        return false;
    }
    if (!cache || (len > sizeof(cache->buf))) {
        return false;
    }
    if (src->eof) {
        *peeked = 0;
        return true;
    }

    size_t read = 0;
    bool   readahead = cache->readahead;
    // Do not read more then available if source size is known
    if (src->knownsize && (src->readb + len > src->size)) {
        len = src->size - src->readb;
        readahead = false;
    }

    if (cache->len - cache->pos >= len) {
        if (buf) {
            memcpy(buf, &cache->buf[cache->pos], len);
        }
        *peeked = len;
        return true;
    }

    if (cache->pos > 0) {
        memmove(&cache->buf[0], &cache->buf[cache->pos], cache->len - cache->pos);
        cache->len -= cache->pos;
        cache->pos = 0;
    }

    while (cache->len < len) {
        read = readahead ? sizeof(cache->buf) - cache->len : len - cache->len;
        if (src->knownsize && (src->readb + read > src->size)) {
            read = src->size - src->readb;
        }
        if (!src->read(src, &cache->buf[cache->len], read, &read)) {
            src->error = 1;
            return false;
        }
        if (!read) {
            if (buf) {
                memcpy(buf, &cache->buf[0], cache->len);
            }
            *peeked = cache->len;
            return true;
        }
        cache->len += read;
        if (cache->len >= len) {
            if (buf) {
                memcpy(buf, cache->buf, len);
            }
            *peeked = len;
            return true;
        }
    }
    return false;
}

bool
src_peek_eq(pgp_source_t *src, void *buf, size_t len)
{
    size_t res = 0;
    return src_peek(src, buf, len, &res) && (res == len);
}

void
src_skip(pgp_source_t *src, size_t len)
{
    if (src->cache && (src->cache->len - src->cache->pos >= len)) {
        src->readb += len;
        src->cache->pos += len;
        return;
    }

    size_t  res = 0;
    uint8_t sbuf[16];
    if (len < sizeof(sbuf)) {
        (void) src_read(src, sbuf, len, &res);
        return;
    }

    void *buf = calloc(1, std::min((size_t) PGP_INPUT_CACHE_SIZE, len));
    if (!buf) {
        src->error = 1;
        return;
    }

    while (len && !src_eof(src)) {
        if (!src_read(src, buf, std::min((size_t) PGP_INPUT_CACHE_SIZE, len), &res)) {
            break;
        }
        len -= res;
    }
    free(buf);
}

rnp_result_t
src_finish(pgp_source_t *src)
{
    rnp_result_t res = RNP_SUCCESS;
    if (src->finish) {
        res = src->finish(src);
    }

    return res;
}

bool
src_error(const pgp_source_t *src)
{
    return src->error;
}

bool
src_eof(pgp_source_t *src)
{
    if (src->eof) {
        return true;
    }
    /* Error on stream read is NOT considered as eof. See src_error(). */
    uint8_t check;
    size_t  read = 0;
    return src_peek(src, &check, 1, &read) && (read == 0);
}

void
src_close(pgp_source_t *src)
{
    if (src->close) {
        src->close(src);
    }

    if (src->cache) {
        free(src->cache);
        src->cache = NULL;
    }
}

bool
src_skip_eol(pgp_source_t *src)
{
    uint8_t eol[2];
    size_t  read;

    if (!src_peek(src, eol, 2, &read) || !read) {
        return false;
    }
    if (eol[0] == '\n') {
        src_skip(src, 1);
        return true;
    }
    if ((read == 2) && (eol[0] == '\r') && (eol[1] == '\n')) {
        src_skip(src, 2);
        return true;
    }
    return false;
}

bool
src_peek_line(pgp_source_t *src, char *buf, size_t len, size_t *readres)
{
    size_t clen = 0;
    size_t read;

    /* we need some place for \0 */
    len--;

    do {
        read = clen + 64 > len ? len - clen : 64;
        if (!src_peek(src, buf + clen, read, &read) || !read) {
            return false;
        }

        for (size_t i = 0; i < read; i++) {
            if (buf[clen] == '\n') {
                if ((clen > 0) && (buf[clen - 1] == '\r')) {
                    clen--;
                }
                buf[clen] = '\0';
                *readres = clen;
                return true;
            }
            clen++;
        }
    } while (clen < len);
    return false;
}

bool
init_src_common(pgp_source_t *src, size_t paramsize)
{
    memset(src, 0, sizeof(*src));

    if ((src->cache = (pgp_source_cache_t *) calloc(1, sizeof(pgp_source_cache_t))) == NULL) {
        RNP_LOG("cache allocation failed");
        return false;
    }
    src->cache->readahead = true;

    if (paramsize > 0) {
        if ((src->param = calloc(1, paramsize)) == NULL) {
            RNP_LOG("param allocation failed");
            free(src->cache);
            src->cache = NULL;
            return false;
        }
    }

    return true;
}

typedef struct pgp_source_file_param_t {
    int fd;
} pgp_source_file_param_t;

static bool
file_src_read(pgp_source_t *src, void *buf, size_t len, size_t *readres)
{
    pgp_source_file_param_t *param = (pgp_source_file_param_t *) src->param;
    if (!param) {
        return false;
    }

    int64_t rres = read(param->fd, buf, len);
    if (rres < 0) {
        return false;
    }
    *readres = rres;
    return true;
}

static void
file_src_close(pgp_source_t *src)
{
    pgp_source_file_param_t *param = (pgp_source_file_param_t *) src->param;
    if (param) {
        if (src->type == PGP_STREAM_FILE) {
            close(param->fd);
        }
        free(src->param);
        src->param = NULL;
    }
}

rnp_result_t
init_file_src(pgp_source_t *src, const char *path)
{
    int                      fd;
    struct stat              st;
    pgp_source_file_param_t *param;

    if (stat(path, &st) != 0) {
        RNP_LOG("can't stat '%s'", path);
        return RNP_ERROR_READ;
    }

    /* read call may succeed on directory depending on OS type */
    if (S_ISDIR(st.st_mode)) {
        RNP_LOG("source is directory");
        return RNP_ERROR_BAD_PARAMETERS;
    }

    int flags = O_RDONLY;
#ifdef HAVE_O_BINARY
    flags |= O_BINARY;
#else
#ifdef HAVE__O_BINARY
    flags |= _O_BINARY;
#endif
#endif
    fd = open(path, flags);

    if (fd < 0) {
        RNP_LOG("can't open '%s'", path);
        return RNP_ERROR_READ;
    }

    if (!init_src_common(src, sizeof(pgp_source_file_param_t))) {
        close(fd);
        return RNP_ERROR_OUT_OF_MEMORY;
    }

    param = (pgp_source_file_param_t *) src->param;
    param->fd = fd;
    src->read = file_src_read;
    src->close = file_src_close;
    src->type = PGP_STREAM_FILE;
    src->size = st.st_size;
    src->knownsize = 1;

    return RNP_SUCCESS;
}

rnp_result_t
init_stdin_src(pgp_source_t *src)
{
    pgp_source_file_param_t *param;

    if (!init_src_common(src, sizeof(pgp_source_file_param_t))) {
        return RNP_ERROR_OUT_OF_MEMORY;
    }

    param = (pgp_source_file_param_t *) src->param;
    param->fd = 0;
    src->read = file_src_read;
    src->close = file_src_close;
    src->type = PGP_STREAM_STDIN;

    return RNP_SUCCESS;
}

typedef struct pgp_source_mem_param_t {
    const void *memory;
    bool        free;
    size_t      len;
    size_t      pos;
} pgp_source_mem_param_t;

typedef struct pgp_dest_mem_param_t {
    unsigned maxalloc;
    unsigned allocated;
    void *   memory;
    bool     free;
    bool     discard_overflow;
} pgp_dest_mem_param_t;

static bool
mem_src_read(pgp_source_t *src, void *buf, size_t len, size_t *read)
{
    pgp_source_mem_param_t *param = (pgp_source_mem_param_t *) src->param;
    if (!param) {
        return false;
    }

    if (len > param->len - param->pos) {
        len = param->len - param->pos;
    }
    memcpy(buf, (uint8_t *) param->memory + param->pos, len);
    param->pos += len;
    *read = len;
    return true;
}

static void
mem_src_close(pgp_source_t *src)
{
    pgp_source_mem_param_t *param = (pgp_source_mem_param_t *) src->param;
    if (param) {
        if (param->free) {
            free((void *) param->memory);
        }
        free(src->param);
        src->param = NULL;
    }
}

rnp_result_t
init_mem_src(pgp_source_t *src, const void *mem, size_t len, bool free)
{
    pgp_source_mem_param_t *param;

    /* this is actually double buffering, but then src_peek will fail */
    if (!init_src_common(src, sizeof(pgp_source_mem_param_t))) {
        return RNP_ERROR_OUT_OF_MEMORY;
    }

    param = (pgp_source_mem_param_t *) src->param;
    param->memory = mem;
    param->len = len;
    param->pos = 0;
    param->free = free;
    src->read = mem_src_read;
    src->close = mem_src_close;
    src->finish = NULL;
    src->size = len;
    src->knownsize = 1;
    src->type = PGP_STREAM_MEMORY;

    return RNP_SUCCESS;
}

static bool
null_src_read(pgp_source_t *src, void *buf, size_t len, size_t *read)
{
    return false;
}

rnp_result_t
init_null_src(pgp_source_t *src)
{
    memset(src, 0, sizeof(*src));
    src->read = null_src_read;
    src->type = PGP_STREAM_NULL;
    src->error = true;
    return RNP_SUCCESS;
}

rnp_result_t
read_mem_src(pgp_source_t *src, pgp_source_t *readsrc)
{
    pgp_dest_t   dst;
    rnp_result_t ret;
    uint8_t      buf[4096];
    size_t       read;

    if ((ret = init_mem_dest(&dst, NULL, 0))) {
        return ret;
    }

    while (!src_eof(readsrc)) {
        if (!src_read(readsrc, buf, sizeof(buf), &read)) {
            goto done;
        }
        if (read) {
            dst_write(&dst, buf, read);
        }
    }

    if (dst.werr) {
        ret = dst.werr;
        goto done;
    }

    if ((ret = init_mem_src(src, mem_dest_own_memory(&dst), dst.writeb, true))) {
        goto done;
    }

    ret = RNP_SUCCESS;
done:
    dst_close(&dst, true);
    return ret;
}

rnp_result_t
file_to_mem_src(pgp_source_t *src, const char *filename)
{
    pgp_source_t fsrc = {};
    rnp_result_t res = RNP_ERROR_GENERIC;

    if ((res = init_file_src(&fsrc, filename))) {
        return res;
    }

    res = read_mem_src(src, &fsrc);
    src_close(&fsrc);

    return res;
}

const void *
mem_src_get_memory(pgp_source_t *src)
{
    pgp_source_mem_param_t *param;

    if (src->type != PGP_STREAM_MEMORY) {
        RNP_LOG("wrong function call");
        return NULL;
    }

    if (!src->param) {
        return NULL;
    }

    param = (pgp_source_mem_param_t *) src->param;
    return param->memory;
}

bool
init_dst_common(pgp_dest_t *dst, size_t paramsize)
{
    memset(dst, 0, sizeof(*dst));

    if (paramsize > 0) {
        if ((dst->param = calloc(1, paramsize)) == NULL) {
            RNP_LOG("allocation failed");
            return false;
        }
    }

    dst->werr = RNP_SUCCESS;

    return true;
}

void
dst_write(pgp_dest_t *dst, const void *buf, size_t len)
{
    /* we call write function only if all previous calls succeeded */
    if ((len > 0) && (dst->write) && (dst->werr == RNP_SUCCESS)) {
        /* if cache non-empty and len will overflow it then fill it and write out */
        if ((dst->clen > 0) && (dst->clen + len > sizeof(dst->cache))) {
            memcpy(dst->cache + dst->clen, buf, sizeof(dst->cache) - dst->clen);
            buf = (uint8_t *) buf + sizeof(dst->cache) - dst->clen;
            len -= sizeof(dst->cache) - dst->clen;
            dst->werr = dst->write(dst, dst->cache, sizeof(dst->cache));
            dst->writeb += sizeof(dst->cache);
            dst->clen = 0;
            if (dst->werr != RNP_SUCCESS) {
                return;
            }
        }

        /* here everything will fit into the cache or cache is empty */
        if (dst->no_cache || (len > sizeof(dst->cache))) {
            dst->werr = dst->write(dst, buf, len);
            if (!dst->werr) {
                dst->writeb += len;
            }
        } else {
            memcpy(dst->cache + dst->clen, buf, len);
            dst->clen += len;
        }
    }
}

void
dst_printf(pgp_dest_t *dst, const char *format, ...)
{
    char    buf[1024];
    size_t  len;
    va_list ap;

    va_start(ap, format);
    len = vsnprintf(buf, sizeof(buf), format, ap);
    va_end(ap);

    if (len >= sizeof(buf)) {
        RNP_LOG("too long dst_printf");
        len = sizeof(buf) - 1;
    }
    dst_write(dst, buf, len);
}

void
dst_flush(pgp_dest_t *dst)
{
    if ((dst->clen > 0) && (dst->write) && (dst->werr == RNP_SUCCESS)) {
        dst->werr = dst->write(dst, dst->cache, dst->clen);
        dst->writeb += dst->clen;
        dst->clen = 0;
    }
}

rnp_result_t
dst_finish(pgp_dest_t *dst)
{
    rnp_result_t res = RNP_SUCCESS;

    if (!dst->finished) {
        /* flush write cache in the dst */
        dst_flush(dst);
        if (dst->finish) {
            res = dst->finish(dst);
        }
        dst->finished = true;
    }

    return res;
}

void
dst_close(pgp_dest_t *dst, bool discard)
{
    if (!discard && !dst->finished) {
        dst_finish(dst);
    }

    if (dst->close) {
        dst->close(dst, discard);
    }
}

typedef struct pgp_dest_file_param_t {
    int  fd;
    int  errcode;
    bool overwrite;
    char path[PATH_MAX];
} pgp_dest_file_param_t;

static rnp_result_t
file_dst_write(pgp_dest_t *dst, const void *buf, size_t len)
{
    ssize_t                ret;
    pgp_dest_file_param_t *param = (pgp_dest_file_param_t *) dst->param;

    if (!param) {
        RNP_LOG("wrong param");
        return RNP_ERROR_BAD_PARAMETERS;
    }

    /* we assyme that blocking I/O is used so everything is written or error received */
    ret = write(param->fd, buf, len);
    if (ret < 0) {
        param->errcode = errno;
        RNP_LOG("write failed, error %d", param->errcode);
        return RNP_ERROR_WRITE;
    } else {
        param->errcode = 0;
        return RNP_SUCCESS;
    }
}

static void
file_dst_close(pgp_dest_t *dst, bool discard)
{
    pgp_dest_file_param_t *param = (pgp_dest_file_param_t *) dst->param;

    if (!param) {
        return;
    }

    if (dst->type == PGP_STREAM_FILE) {
        close(param->fd);
        if (discard) {
            unlink(param->path);
        }
    }

    free(param);
    dst->param = NULL;
}

rnp_result_t
init_file_dest(pgp_dest_t *dst, const char *path, bool overwrite)
{
    int                    fd;
    int                    flags;
    struct stat            st;
    pgp_dest_file_param_t *param;

    if (strlen(path) > sizeof(param->path)) {
        RNP_LOG("path too long");
        return RNP_ERROR_BAD_PARAMETERS;
    }

    /* check whether file/dir already exists */
    if (!stat(path, &st)) {
        if (!overwrite) {
            RNP_LOG("file already exists: '%s'", path);
            return RNP_ERROR_WRITE;
        }

        /* if we are overwriting empty directory then should first remove it */
        if (S_ISDIR(st.st_mode)) {
            if (rmdir(path) == -1) {
                RNP_LOG("failed to remove directory: error %d", errno);
                return RNP_ERROR_BAD_PARAMETERS;
            }
        }
    }

    flags = O_WRONLY | O_CREAT;
    flags |= overwrite ? O_TRUNC : O_EXCL;
#ifdef HAVE_O_BINARY
    flags |= O_BINARY;
#else
#ifdef HAVE__O_BINARY
    flags |= _O_BINARY;
#endif
#endif
    fd = open(path, flags, 0600);
    if (fd < 0) {
        RNP_LOG("failed to create file '%s'. Error %d.", path, errno);
        return RNP_ERROR_WRITE;
    }

    if (!init_dst_common(dst, sizeof(*param))) {
        close(fd);
        return RNP_ERROR_OUT_OF_MEMORY;
    }

    param = (pgp_dest_file_param_t *) dst->param;
    param->fd = fd;
    strcpy(param->path, path);
    dst->write = file_dst_write;
    dst->close = file_dst_close;
    dst->type = PGP_STREAM_FILE;

    return RNP_SUCCESS;
}

#define TMPDST_SUFFIX ".rnp-tmp.XXXXXX"

static rnp_result_t
file_tmpdst_finish(pgp_dest_t *dst)
{
    pgp_dest_file_param_t *param = (pgp_dest_file_param_t *) dst->param;
    size_t                 plen = 0;
    struct stat            st;
    char                   origpath[PATH_MAX] = {0};

    if (!param) {
        return RNP_ERROR_BAD_PARAMETERS;
    }

    /* remove suffix so we have required path */
    plen = strnlen(param->path, sizeof(param->path));
    if (plen < strlen(TMPDST_SUFFIX)) {
        return RNP_ERROR_BAD_PARAMETERS;
    }
    strncpy(origpath, param->path, plen - strlen(TMPDST_SUFFIX));

    /* rename the temporary file */
    close(param->fd);
    param->fd = 0;

    /* check if file already exists */
    if (!stat(origpath, &st)) {
        if (!param->overwrite) {
            RNP_LOG("target path already exists");
            return RNP_ERROR_BAD_STATE;
        }
#ifdef _WIN32
        /* rename() call on Windows fails if destination exists */
        else {
            unlink(origpath);
        }
#endif

        /* we should remove dir if overwriting, file will be unlinked in rename call */
        if (S_ISDIR(st.st_mode) && rmdir(origpath)) {
            RNP_LOG("failed to remove directory");
            return RNP_ERROR_BAD_STATE;
        }
    }

    if (rename(param->path, origpath)) {
        RNP_LOG("failed to rename temporary path to target file: %s", strerror(errno));
        return RNP_ERROR_BAD_STATE;
    }

    return RNP_SUCCESS;
}

static void
file_tmpdst_close(pgp_dest_t *dst, bool discard)
{
    pgp_dest_file_param_t *param = (pgp_dest_file_param_t *) dst->param;

    if (!param) {
        return;
    }

    /* we close file in finish function, except the case when some error occurred */
    if (!dst->finished && (dst->type == PGP_STREAM_FILE)) {
        close(param->fd);
        if (discard) {
            unlink(param->path);
        }
    }

    free(param);
    dst->param = NULL;
}

rnp_result_t
init_tmpfile_dest(pgp_dest_t *dst, const char *path, bool overwrite)
{
    char                   tmp[PATH_MAX];
    pgp_dest_file_param_t *param = NULL;
    rnp_result_t           res = RNP_ERROR_GENERIC;
    int                    ires = 0;

    ires = snprintf(tmp, sizeof(tmp), "%s%s", path, TMPDST_SUFFIX);
    if ((ires < 0) || ((size_t) ires >= sizeof(tmp))) {
        RNP_LOG("failed to build file path");
        return RNP_ERROR_BAD_PARAMETERS;
    }
    mktemp(tmp);

    if ((res = init_file_dest(dst, tmp, overwrite))) {
        return res;
    }

    /* now let's change some parameters to handle temporary file correctly */
    param = (pgp_dest_file_param_t *) dst->param;
    param->overwrite = overwrite;
    dst->finish = file_tmpdst_finish;
    dst->close = file_tmpdst_close;
    return RNP_SUCCESS;
}

rnp_result_t
init_stdout_dest(pgp_dest_t *dst)
{
    pgp_dest_file_param_t *param;

    if (!init_dst_common(dst, sizeof(*param))) {
        return RNP_ERROR_OUT_OF_MEMORY;
    }

    param = (pgp_dest_file_param_t *) dst->param;
    param->fd = STDOUT_FILENO;
    dst->write = file_dst_write;
    dst->close = file_dst_close;
    dst->type = PGP_STREAM_STDOUT;

    return RNP_SUCCESS;
}

static rnp_result_t
mem_dst_write(pgp_dest_t *dst, const void *buf, size_t len)
{
    size_t                alloc;
    void *                newalloc;
    pgp_dest_mem_param_t *param = (pgp_dest_mem_param_t *) dst->param;

    if (!param) {
        return RNP_ERROR_BAD_PARAMETERS;
    }

    /* checking whether we need to realloc or discard extra bytes */
    if (param->discard_overflow && (dst->writeb >= param->allocated)) {
        return RNP_SUCCESS;
    }
    if (param->discard_overflow && (dst->writeb + len > param->allocated)) {
        len = param->allocated - dst->writeb;
    }

    if (dst->writeb + len > param->allocated) {
        if ((param->maxalloc > 0) && (dst->writeb + len > param->maxalloc)) {
            RNP_LOG("attempt to alloc more then allowed");
            return RNP_ERROR_OUT_OF_MEMORY;
        }

        /* round up to the page boundary and do it exponentially */
        alloc = ((dst->writeb + len) * 2 + 4095) / 4096 * 4096;
        if ((param->maxalloc > 0) && (alloc > param->maxalloc)) {
            alloc = param->maxalloc;
        }

        if ((newalloc = realloc(param->memory, alloc)) == NULL) {
            return RNP_ERROR_OUT_OF_MEMORY;
        }

        param->memory = newalloc;
        param->allocated = alloc;
    }

    memcpy((uint8_t *) param->memory + dst->writeb, buf, len);
    return RNP_SUCCESS;
}

static void
mem_dst_close(pgp_dest_t *dst, bool discard)
{
    pgp_dest_mem_param_t *param = (pgp_dest_mem_param_t *) dst->param;

    if (param) {
        if (param->free) {
            free(param->memory);
        }
        free(param);
        dst->param = NULL;
    }
}

rnp_result_t
init_mem_dest(pgp_dest_t *dst, void *mem, unsigned len)
{
    pgp_dest_mem_param_t *param;

    if (!init_dst_common(dst, sizeof(*param))) {
        return RNP_ERROR_OUT_OF_MEMORY;
    }

    param = (pgp_dest_mem_param_t *) dst->param;

    param->maxalloc = len;
    param->allocated = mem ? len : 0;
    param->memory = mem;
    param->free = !mem;

    dst->write = mem_dst_write;
    dst->close = mem_dst_close;
    dst->type = PGP_STREAM_MEMORY;
    dst->werr = RNP_SUCCESS;
    dst->no_cache = true;

    return RNP_SUCCESS;
}

void
mem_dest_discard_overflow(pgp_dest_t *dst, bool discard)
{
    if (dst->type != PGP_STREAM_MEMORY) {
        RNP_LOG("wrong function call");
        return;
    }

    pgp_dest_mem_param_t *param = (pgp_dest_mem_param_t *) dst->param;
    if (param) {
        param->discard_overflow = discard;
    }
}

void *
mem_dest_get_memory(pgp_dest_t *dst)
{
    if (dst->type != PGP_STREAM_MEMORY) {
        RNP_LOG("wrong function call");
        return NULL;
    }

    pgp_dest_mem_param_t *param = (pgp_dest_mem_param_t *) dst->param;

    if (param) {
        return param->memory;
    }

    return NULL;
}

void *
mem_dest_own_memory(pgp_dest_t *dst)
{
    if (dst->type != PGP_STREAM_MEMORY) {
        RNP_LOG("wrong function call");
        return NULL;
    }

    pgp_dest_mem_param_t *param = (pgp_dest_mem_param_t *) dst->param;

    if (!param) {
        RNP_LOG("null param");
        return NULL;
    }

    dst_finish(dst);

    if (param->free) {
        /* it may be larger then required */
        param->memory = realloc(param->memory, dst->writeb);
        param->allocated = dst->writeb;
        param->free = false;
        return param->memory;
    }

    /* in this case we should copy the memory */
    void *res = malloc(dst->writeb);
    if (res) {
        memcpy(res, param->memory, dst->writeb);
    }
    return res;
}

static rnp_result_t
null_dst_write(pgp_dest_t *dst, const void *buf, size_t len)
{
    return RNP_SUCCESS;
}

static void
null_dst_close(pgp_dest_t *dst, bool discard)
{
    ;
}

rnp_result_t
init_null_dest(pgp_dest_t *dst)
{
    dst->param = NULL;
    dst->write = null_dst_write;
    dst->close = null_dst_close;
    dst->type = PGP_STREAM_NULL;
    dst->writeb = 0;
    dst->clen = 0;
    dst->werr = RNP_SUCCESS;
    dst->no_cache = true;

    return RNP_SUCCESS;
}
