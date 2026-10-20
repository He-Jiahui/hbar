#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string.h>
#include <stdint.h>
#include <wchar.h>
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT1

#define PROBE_NAME "hbar_readonly_v1"
#define DIRECT_BUFFER_BYTES 65536u
#define RAW_MAX_BYTES 1048576
#define OWNER_LIMIT 64
typedef struct Owner Owner;
typedef struct ProbeFile ProbeFile;
struct Owner {
  sqlite3_vfs vfs;
  sqlite3_vfs *baseVfs;
  SRWLOCK gate;
  volatile LONG references, functionReferences, registered;
  volatile LONG64 opens, closes, active, reads, readBytes, writes, locks, unlocks;
  volatile LONG64 shmMaps, shmLocks, fetches, fetchedBytes;
  volatile LONG64 directReads, directReadBytes, kernelRequests, kernelBytesReturned;
  volatile LONG64 directActiveHandles, directActiveBuffers, shortReads, mappingFallbacks;
  volatile LONG64 sequentialReads, sequentialReadBytes, directIoPriorityHints;
  volatile LONG64 alignmentMaximum, lastRawReadCode, lastOpenError;
  char name[64];
  WCHAR root[32768];
  DWORD rootLength;
};
struct ProbeFile {
  sqlite3_file file;
  sqlite3_file *real;
  Owner *owner;
  HANDLE direct;
  void *buffer;
  DWORD alignment;
  int directMode;
};
typedef void (*ProbeSymbol)(void);
static SRWLOCK apiGate = SRWLOCK_INIT;
static volatile LONG modulePinClaimed;
static volatile LONG64 globalOwners, globalRegistered, globalFiles, nextOwnerId;

static void ownerRelease(Owner *owner) {
  if (InterlockedDecrement(&owner->references) == 0) {
    InterlockedDecrement64(&globalOwners);
    HeapFree(GetProcessHeap(),0,owner);
  }
}
static int ownerUnregister(Owner *owner, int requireNoFiles) {
  int rc = SQLITE_OK;
  AcquireSRWLockExclusive(&owner->gate);
  if (requireNoFiles && InterlockedCompareExchange64(&owner->active,0,0) != 0) rc = SQLITE_BUSY;
  else if (owner->registered) {
    rc = sqlite3_vfs_unregister(&owner->vfs);
    if (rc == SQLITE_OK) {
      InterlockedExchange(&owner->registered,0);
      InterlockedDecrement64(&globalRegistered);
    }
  }
  ReleaseSRWLockExclusive(&owner->gate);
  return rc;
}
static void functionDestroyed(void *data) {
  Owner *owner = (Owner *)data;
  if (InterlockedDecrement(&owner->functionReferences) == 0) ownerUnregister(owner,0);
  ownerRelease(owner);
}
static size_t fileOffset(void) { return (sizeof(ProbeFile) + 7u) & ~(size_t)7u; }
static ProbeFile *pf(sqlite3_file *f) { return (ProbeFile *)f; }

static int closeDirect(ProbeFile *p) {
  Owner *owner = p->owner;
  int rc = SQLITE_OK;
  if (p->direct != INVALID_HANDLE_VALUE) {
    if (CloseHandle(p->direct)) InterlockedDecrement64(&owner->directActiveHandles);
    else rc = SQLITE_IOERR_CLOSE;
    p->direct = INVALID_HANDLE_VALUE;
  }
  if (p->buffer) {
    if (VirtualFree(p->buffer, 0, MEM_RELEASE)) InterlockedDecrement64(&owner->directActiveBuffers);
    else rc = SQLITE_IOERR_CLOSE;
    p->buffer = 0;
  }
  return rc;
}
static int pathInScope(Owner *owner, const WCHAR *path, DWORD length) {
  return owner->rootLength > 0 && length > owner->rootLength
    && CompareStringOrdinal(path, (int)owner->rootLength, owner->root, (int)owner->rootLength, TRUE) == CSTR_EQUAL;
}
static int powerOfTwo(DWORD n) { return n > 0 && (n & (n - 1u)) == 0; }
static int openDirect(ProbeFile *p) {
  Owner *owner = p->owner;
  WCHAR path[32768], filesystem[32];
  WCHAR drive[4];
  DWORD length, alignment, candidates[5], i;
  HANDLE borrowed = INVALID_HANDLE_VALUE;
  FILE_ID_INFO originalId, directId;
  FILE_STORAGE_INFO storage;
  FILE_ALIGNMENT_INFO fileAlignment;
  __declspec(align(8)) FILE_IO_PRIORITY_HINT_INFO hint;
  int rc = p->real->pMethods->xFileControl(p->real, SQLITE_FCNTL_WIN32_GET_HANDLE, &borrowed);
  if (rc != SQLITE_OK || borrowed == INVALID_HANDLE_VALUE || borrowed == 0) return SQLITE_CANTOPEN;
  length = GetFinalPathNameByHandleW(borrowed, path, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  if (!length || length >= 32768 || !pathInScope(owner, path, length)) return SQLITE_CANTOPEN;
  if (length < 7 || wcsncmp(path, L"\\\\?\\", 4) != 0 || path[5] != L':' || path[6] != L'\\')
    return SQLITE_CANTOPEN;
  drive[0] = path[4]; drive[1] = L':'; drive[2] = L'\\'; drive[3] = 0;
  if (GetDriveTypeW(drive) != DRIVE_FIXED) return SQLITE_CANTOPEN;
  if (!GetVolumeInformationByHandleW(borrowed, 0, 0, 0, 0, 0, filesystem, 32)
      || wcscmp(filesystem, L"NTFS") != 0) return SQLITE_CANTOPEN;
  if (!GetFileInformationByHandleEx(borrowed, FileIdInfo, &originalId, sizeof(originalId)))
    return SQLITE_CANTOPEN;
  p->direct = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    0, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_NO_BUFFERING, 0);
  if (p->direct == INVALID_HANDLE_VALUE) return SQLITE_CANTOPEN;
  InterlockedIncrement64(&owner->directActiveHandles);
  hint.PriorityHint = IoPriorityHintVeryLow;
  if (!SetFileInformationByHandle(p->direct, FileIoPriorityHintInfo, &hint, sizeof(hint)))
    return SQLITE_IOERR_READ;
  InterlockedIncrement64(&owner->directIoPriorityHints);
  if (!GetFileInformationByHandleEx(p->direct, FileIdInfo, &directId, sizeof(directId))
      || originalId.VolumeSerialNumber != directId.VolumeSerialNumber
      || memcmp(originalId.FileId.Identifier, directId.FileId.Identifier, sizeof(originalId.FileId.Identifier)) != 0)
    return SQLITE_CANTOPEN;
  if (!GetFileInformationByHandleEx(p->direct, FileStorageInfo, &storage, sizeof(storage))
      || !GetFileInformationByHandleEx(p->direct, FileAlignmentInfo, &fileAlignment, sizeof(fileAlignment)))
    return SQLITE_CANTOPEN;
  if (fileAlignment.AlignmentRequirement == MAXDWORD) return SQLITE_CANTOPEN;
  candidates[0] = storage.LogicalBytesPerSector;
  candidates[1] = storage.PhysicalBytesPerSectorForAtomicity;
  candidates[2] = storage.PhysicalBytesPerSectorForPerformance;
  candidates[3] = storage.FileSystemEffectivePhysicalBytesPerSectorForAtomicity;
  candidates[4] = fileAlignment.AlignmentRequirement + 1u;
  alignment = 1;
  for (i = 0; i < 5; ++i) {
    if (!powerOfTwo(candidates[i]) || candidates[i] > DIRECT_BUFFER_BYTES) return SQLITE_CANTOPEN;
    if (candidates[i] > alignment) alignment = candidates[i];
  }
  p->alignment = alignment;
  p->buffer = VirtualAlloc(0, DIRECT_BUFFER_BYTES, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
  if (!p->buffer) return SQLITE_NOMEM;
  InterlockedIncrement64(&owner->directActiveBuffers);
  if (((uintptr_t)p->buffer % alignment) != 0) return SQLITE_NOMEM;
  if ((LONG64)alignment > InterlockedCompareExchange64(&owner->alignmentMaximum, 0, 0))
    InterlockedExchange64(&owner->alignmentMaximum, alignment);
  p->directMode = 1;
  return SQLITE_OK;
}
static int directRead(ProbeFile *p, void *b, int n, sqlite3_int64 o) {
  Owner *owner = p->owner;
  int done = 0;
  if (n < 0 || o < 0 || o > INT64_MAX - n) return SQLITE_IOERR_READ;
  memset(b, 0, (size_t)n);
  InterlockedIncrement64(&owner->directReads);
  InterlockedAdd64(&owner->directReadBytes, n);
  while (done < n) {
    sqlite3_int64 position = o + done;
    sqlite3_int64 aligned = position - (position % p->alignment);
    DWORD skip = (DWORD)(position - aligned);
    DWORD need = (DWORD)(n - done);
    DWORD request, received = 0, copied;
    LARGE_INTEGER offset;
    if (need > DIRECT_BUFFER_BYTES - skip) need = DIRECT_BUFFER_BYTES - skip;
    request = (skip + need + p->alignment - 1u) & ~(p->alignment - 1u);
    offset.QuadPart = aligned;
    if (!SetFilePointerEx(p->direct, offset, 0, FILE_BEGIN)) return SQLITE_IOERR_SEEK;
    InterlockedIncrement64(&owner->kernelRequests);
    if (!ReadFile(p->direct, p->buffer, request, &received, 0)) {
      if (GetLastError() == ERROR_HANDLE_EOF) received = 0;
      else return SQLITE_IOERR_READ;
    }
    InterlockedAdd64(&owner->kernelBytesReturned, received);
    copied = received > skip ? received - skip : 0;
    if (copied > need) copied = need;
    if (copied) memcpy((char *)b + done, (char *)p->buffer + skip, copied);
    done += (int)copied;
    if (copied < need) {
      InterlockedIncrement64(&owner->shortReads);
      return SQLITE_IOERR_SHORT_READ;
    }
  }
  return SQLITE_OK;
}
static int pClose(sqlite3_file *f) {
  Owner *owner = pf(f)->owner;
  int directRc = closeDirect(pf(f));
  int rc = pf(f)->real->pMethods->xClose(pf(f)->real);
  f->pMethods = 0;
  InterlockedIncrement64(&owner->closes);
  InterlockedDecrement64(&owner->active);
  InterlockedDecrement64(&globalFiles);
  ownerRelease(owner);
  return directRc != SQLITE_OK ? directRc : rc;
}
static int pRead(sqlite3_file *f, void *b, int n, sqlite3_int64 o) {
  Owner *owner = pf(f)->owner;
  InterlockedIncrement64(&owner->reads); InterlockedAdd64(&owner->readBytes, n);
  if (pf(f)->directMode) return directRead(pf(f), b, n, o);
  return pf(f)->real->pMethods->xRead(pf(f)->real, b, n, o);
}
static int pWrite(sqlite3_file *f, const void *b, int n, sqlite3_int64 o) {
  Owner *owner = pf(f)->owner;
  InterlockedIncrement64(&owner->writes);
  return pf(f)->real->pMethods->xWrite(pf(f)->real, b, n, o);
}
static int pTruncate(sqlite3_file *f, sqlite3_int64 n) { return pf(f)->real->pMethods->xTruncate(pf(f)->real,n); }
static int pSync(sqlite3_file *f, int flags) { return pf(f)->real->pMethods->xSync(pf(f)->real,flags); }
static int pSize(sqlite3_file *f, sqlite3_int64 *n) { return pf(f)->real->pMethods->xFileSize(pf(f)->real,n); }
static int pLock(sqlite3_file *f, int n) {
  Owner *owner = pf(f)->owner; InterlockedIncrement64(&owner->locks); return pf(f)->real->pMethods->xLock(pf(f)->real,n); }
static int pUnlock(sqlite3_file *f, int n) {
  Owner *owner = pf(f)->owner; InterlockedIncrement64(&owner->unlocks); return pf(f)->real->pMethods->xUnlock(pf(f)->real,n); }
static int pReserved(sqlite3_file *f, int *n) { return pf(f)->real->pMethods->xCheckReservedLock(pf(f)->real,n); }
static int pControl(sqlite3_file *f, int op, void *b) { return pf(f)->real->pMethods->xFileControl(pf(f)->real,op,b); }
static int pSector(sqlite3_file *f) { return pf(f)->real->pMethods->xSectorSize(pf(f)->real); }
static int pDevice(sqlite3_file *f) { return pf(f)->real->pMethods->xDeviceCharacteristics(pf(f)->real); }
static int pShmMap(sqlite3_file *f, int a, int b, int c, void volatile **d) {
  Owner *owner = pf(f)->owner;
  InterlockedIncrement64(&owner->shmMaps); return pf(f)->real->pMethods->xShmMap(pf(f)->real,a,b,c,d);
}
static int pShmLock(sqlite3_file *f, int a, int b, int c) {
  Owner *owner = pf(f)->owner;
  InterlockedIncrement64(&owner->shmLocks); return pf(f)->real->pMethods->xShmLock(pf(f)->real,a,b,c);
}
static void pShmBarrier(sqlite3_file *f) { pf(f)->real->pMethods->xShmBarrier(pf(f)->real); }
static int pShmUnmap(sqlite3_file *f, int a) { return pf(f)->real->pMethods->xShmUnmap(pf(f)->real,a); }
static int pFetch(sqlite3_file *f, sqlite3_int64 o, int n, void **b) {
  Owner *owner = pf(f)->owner;
  int rc;
  InterlockedIncrement64(&owner->fetches);
  if (pf(f)->directMode) {
    *b = 0;
    InterlockedIncrement64(&owner->mappingFallbacks);
    return SQLITE_OK;
  }
  rc = pf(f)->real->pMethods->xFetch(pf(f)->real,o,n,b);
  if (rc == SQLITE_OK && *b) InterlockedAdd64(&owner->fetchedBytes,n);
  return rc;
}
static int pUnfetch(sqlite3_file *f, sqlite3_int64 o, void *b) {
  if (pf(f)->directMode) return b == 0 ? SQLITE_OK : SQLITE_MISUSE;
  return pf(f)->real->pMethods->xUnfetch(pf(f)->real,o,b);
}
#define IO_METHODS(v) {v,pClose,pRead,pWrite,pTruncate,pSync,pSize,pLock,pUnlock,pReserved,pControl,pSector,pDevice,pShmMap,pShmLock,pShmBarrier,pShmUnmap,pFetch,pUnfetch}
static const sqlite3_io_methods methods[] = {IO_METHODS(1), IO_METHODS(2), IO_METHODS(3)};

static int vOpen(sqlite3_vfs *v, sqlite3_filename name, sqlite3_file *f, int flags, int *out) {
  Owner *owner = (Owner *)v->pAppData;
  ProbeFile *p = pf(f);
  int rc = SQLITE_CANTOPEN, version;
  memset(p, 0, sizeof(*p));
  p->owner = owner;
  p->direct = INVALID_HANDLE_VALUE;
  p->real = (sqlite3_file *)((char *)f + fileOffset());
  memset(p->real, 0, (size_t)owner->baseVfs->szOsFile);
  AcquireSRWLockShared(&owner->gate);
  if (!owner->registered) goto failed;
  if ((flags & SQLITE_OPEN_MAIN_DB) &&
      (!(flags & SQLITE_OPEN_READONLY) || (flags & SQLITE_OPEN_READWRITE) || !owner->rootLength)) {
    rc = SQLITE_READONLY; goto failed;
  }
  rc = owner->baseVfs->xOpen(owner->baseVfs,name,p->real,flags,out);
  if (rc != SQLITE_OK) goto failed;
  if (!p->real->pMethods) { rc = SQLITE_IOERR; goto failed; }
  version = p->real->pMethods->iVersion;
  if (version < 1) { rc = SQLITE_IOERR; goto failed; }
  if (flags & SQLITE_OPEN_MAIN_DB) {
    rc = openDirect(p);
    if (rc != SQLITE_OK) {
      InterlockedExchange64(&owner->lastOpenError, GetLastError());
      goto failed;
    }
  }
  p->file.pMethods = &methods[(version > 3 ? 3 : version) - 1];
  InterlockedIncrement(&owner->references);
  InterlockedIncrement64(&owner->opens);
  InterlockedIncrement64(&owner->active);
  InterlockedIncrement64(&globalFiles);
  ReleaseSRWLockShared(&owner->gate);
  return SQLITE_OK;
failed:
  closeDirect(p);
  if (p->real->pMethods) p->real->pMethods->xClose(p->real);
  p->file.pMethods = 0;
  ReleaseSRWLockShared(&owner->gate);
  return rc;
}
static int vDelete(sqlite3_vfs *v, const char *n, int s) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xDelete(owner->baseVfs,n,s); }
static int vAccess(sqlite3_vfs *v, const char *n, int a, int *b) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xAccess(owner->baseVfs,n,a,b); }
static int vFull(sqlite3_vfs *v, const char *n, int a, char *b) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xFullPathname(owner->baseVfs,n,a,b); }
static void *vDlOpen(sqlite3_vfs *v, const char *n) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xDlOpen(owner->baseVfs,n); }
static void vDlError(sqlite3_vfs *v, int n, char *b) { Owner *owner = (Owner *)v->pAppData; owner->baseVfs->xDlError(owner->baseVfs,n,b); }
static ProbeSymbol vDlSym(sqlite3_vfs *v, void *h, const char *n) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xDlSym(owner->baseVfs,h,n); }
static void vDlClose(sqlite3_vfs *v, void *h) { Owner *owner = (Owner *)v->pAppData; owner->baseVfs->xDlClose(owner->baseVfs,h); }
static int vRandom(sqlite3_vfs *v, int n, char *b) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xRandomness(owner->baseVfs,n,b); }
static int vSleep(sqlite3_vfs *v, int n) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xSleep(owner->baseVfs,n); }
static int vTime(sqlite3_vfs *v, double *d) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xCurrentTime(owner->baseVfs,d); }
static int vError(sqlite3_vfs *v, int n, char *b) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xGetLastError(owner->baseVfs,n,b); }
static int vTime64(sqlite3_vfs *v, sqlite3_int64 *n) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xCurrentTimeInt64(owner->baseVfs,n); }
static int vSetSystem(sqlite3_vfs *v, const char *n, sqlite3_syscall_ptr p) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xSetSystemCall(owner->baseVfs,n,p); }
static sqlite3_syscall_ptr vGetSystem(sqlite3_vfs *v, const char *n) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xGetSystemCall(owner->baseVfs,n); }
static const char *vNextSystem(sqlite3_vfs *v, const char *n) { Owner *owner = (Owner *)v->pAppData; return owner->baseVfs->xNextSystemCall(owner->baseVfs,n); }

static void statSql(sqlite3_context *c, int argc, sqlite3_value **argv) {
  Owner *owner = (Owner *)sqlite3_user_data(c);
  const char *key;
  (void)argc;
  key = (const char *)sqlite3_value_text(argv[0]);
  if (!key) { sqlite3_result_error(c,"stat key required",-1); return; }
#define STAT(k,x) if (strcmp(key,k)==0) { sqlite3_result_int64(c,InterlockedCompareExchange64(&(x),0,0)); return; }
  STAT("opens",owner->opens) STAT("closes",owner->closes) STAT("active",owner->active) STAT("reads",owner->reads)
  STAT("readBytes",owner->readBytes) STAT("writes",owner->writes) STAT("locks",owner->locks) STAT("unlocks",owner->unlocks)
  STAT("shmMaps",owner->shmMaps) STAT("shmLocks",owner->shmLocks) STAT("fetches",owner->fetches) STAT("fetchedBytes",owner->fetchedBytes)
  STAT("directReads",owner->directReads) STAT("directReadBytes",owner->directReadBytes)
  STAT("kernelRequests",owner->kernelRequests) STAT("kernelBytesReturned",owner->kernelBytesReturned)
  STAT("directActiveHandles",owner->directActiveHandles) STAT("directActiveBuffers",owner->directActiveBuffers)
  STAT("shortReads",owner->shortReads) STAT("mappingFallbacks",owner->mappingFallbacks)
  STAT("alignmentMaximum",owner->alignmentMaximum) STAT("lastRawReadCode",owner->lastRawReadCode) STAT("lastOpenError",owner->lastOpenError)
  STAT("sequentialReads",owner->sequentialReads) STAT("sequentialReadBytes",owner->sequentialReadBytes)
  STAT("directIoPriorityHints",owner->directIoPriorityHints)
#undef STAT
  if (strcmp(key,"name")==0) sqlite3_result_text(c,owner->name,-1,SQLITE_TRANSIENT);
  else if (strcmp(key,"parent")==0) sqlite3_result_text(c,owner->baseVfs->zName,-1,SQLITE_STATIC);
  else if (strcmp(key,"headerVersion")==0) sqlite3_result_text(c,SQLITE_VERSION,-1,SQLITE_STATIC);
  else if (strcmp(key,"defaultUnchanged")==0) sqlite3_result_int(c,sqlite3_vfs_find(0)==owner->baseVfs);
  else if (strcmp(key,"registered")==0) sqlite3_result_int(c,InterlockedCompareExchange(&owner->registered,0,0));
  else if (strcmp(key,"scopeConfigured")==0) sqlite3_result_int(c,owner->rootLength > 0);
  else if (strcmp(key,"globalOwners")==0) sqlite3_result_int64(c,InterlockedCompareExchange64(&globalOwners,0,0));
  else if (strcmp(key,"globalRegistered")==0) sqlite3_result_int64(c,InterlockedCompareExchange64(&globalRegistered,0,0));
  else if (strcmp(key,"globalFiles")==0) sqlite3_result_int64(c,InterlockedCompareExchange64(&globalFiles,0,0));
  else if (strcmp(key,"modulePinCount")==0) sqlite3_result_int(c,InterlockedCompareExchange(&modulePinClaimed,0,0));
  else if (strcmp(key,"ownerLimit")==0) sqlite3_result_int(c,OWNER_LIMIT);
  else if (strcmp(key,"ownerBytes")==0) sqlite3_result_int64(c,(sqlite3_int64)sizeof(Owner));
  else sqlite3_result_error(c,"unknown stat key",-1);
}
static DWORD directoryPath(const WCHAR *path, WCHAR *resolved) {
  HANDLE handle = CreateFileW(path, FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, 0, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, 0);
  DWORD length;
  if (handle == INVALID_HANDLE_VALUE) return 0;
  length = GetFinalPathNameByHandleW(handle, resolved, 32768, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  if (!CloseHandle(handle)) return 0;
  return length > 0 && length < 32767 ? length : 0;
}
static void scopeSql(sqlite3_context *c, int argc, sqlite3_value **argv) {
  Owner *owner = (Owner *)sqlite3_user_data(c);
  const char *utf8;
  const char *failure = 0;
  WCHAR input[32768], resolvedRoot[32768], drive[4], filesystem[32];
  DWORD rootLength, attributes;
  int converted;
  (void)argc;
  AcquireSRWLockExclusive(&owner->gate);
  if (owner->rootLength || !owner->registered || InterlockedCompareExchange64(&owner->active,0,0)) {
    failure = "scope is fixed once before any file opens"; goto done;
  }
  utf8 = (const char *)sqlite3_value_text(argv[0]);
  if (!utf8) { failure = "existing readonly scan root required"; goto done; }
  converted = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8, -1, input, 32768);
  if (!converted) { failure = "invalid scope path"; goto done; }
  attributes = GetFileAttributesW(input);
  if (attributes == INVALID_FILE_ATTRIBUTES || !(attributes & FILE_ATTRIBUTE_DIRECTORY)) {
    failure = "readonly scan scope must be an existing directory"; goto done;
  }
  rootLength = directoryPath(input, resolvedRoot);
  if (rootLength < 7 || wcsncmp(resolvedRoot,L"\\\\?\\",4) != 0
      || resolvedRoot[5] != L':' || resolvedRoot[6] != L'\\') {
    failure = "readonly scan scope must resolve to a local drive"; goto done;
  }
  drive[0] = resolvedRoot[4]; drive[1] = L':'; drive[2] = L'\\'; drive[3] = 0;
  if (GetDriveTypeW(drive) != DRIVE_FIXED
      || !GetVolumeInformationW(drive,0,0,0,0,0,filesystem,32)
      || wcscmp(filesystem,L"NTFS") != 0) {
    failure = "readonly direct scans require a fixed NTFS volume"; goto done;
  }
  memcpy(owner->root, resolvedRoot, rootLength * sizeof(WCHAR));
  if (owner->root[rootLength-1u] != L'\\') owner->root[rootLength++] = L'\\';
  owner->root[rootLength] = 0;
  owner->rootLength = rootLength;
done:
  ReleaseSRWLockExclusive(&owner->gate);
  if (failure) sqlite3_result_error(c,failure,-1);
  else sqlite3_result_int(c,1);
}
static void rawReadSql(sqlite3_context *c, int argc, sqlite3_value **argv) {
  Owner *owner = (Owner *)sqlite3_user_data(c);
  const char *path;
  sqlite3_filename filename;
  sqlite3_int64 offset, amount;
  sqlite3_file *file;
  void *buffer;
  int rc, closeRc;
  (void)argc;
  path = (const char *)sqlite3_value_text(argv[0]);
  offset = sqlite3_value_int64(argv[1]);
  amount = sqlite3_value_int64(argv[2]);
  if (!path || sqlite3_value_type(argv[1]) != SQLITE_INTEGER || sqlite3_value_type(argv[2]) != SQLITE_INTEGER
      || offset < 0 || amount < 1 || amount > RAW_MAX_BYTES || offset > INT64_MAX - amount) {
    sqlite3_result_error(c,"invalid bounded raw read range",-1); return;
  }
  filename = sqlite3_create_filename(path, "", "", 0, 0);
  file = sqlite3_malloc64((sqlite3_uint64)owner->vfs.szOsFile);
  buffer = sqlite3_malloc64((sqlite3_uint64)amount);
  if (!filename || !file || !buffer) {
    sqlite3_free_filename(filename); sqlite3_free(file); sqlite3_free(buffer);
    sqlite3_result_error_nomem(c); return;
  }
  memset(file,0,(size_t)owner->vfs.szOsFile);
  rc = vOpen(&owner->vfs,filename,file,SQLITE_OPEN_READONLY | SQLITE_OPEN_MAIN_DB,0);
  if (rc != SQLITE_OK) {
    sqlite3_free_filename(filename); sqlite3_free(file); sqlite3_free(buffer);
    sqlite3_result_error(c,"scoped raw file open failed",-1); return;
  }
  rc = pRead(file,buffer,(int)amount,offset);
  closeRc = pClose(file);
  sqlite3_free_filename(filename); sqlite3_free(file);
  InterlockedExchange64(&owner->lastRawReadCode,rc);
  if ((rc != SQLITE_OK && rc != SQLITE_IOERR_SHORT_READ) || closeRc != SQLITE_OK) {
    sqlite3_free(buffer); sqlite3_result_error(c,"bounded raw file read or close failed",-1); return;
  }
  sqlite3_result_blob(c,buffer,(int)amount,sqlite3_free);
}

/* One fixed buffer visits every original byte, without returning file contents to JS. */
static void sequentialSql(sqlite3_context *c, int argc, sqlite3_value **argv) {
  Owner *owner = (Owner *)sqlite3_user_data(c);
  const char *path = (const char *)sqlite3_value_text(argv[0]);
  sqlite3_filename filename = 0;
  sqlite3_file *file = 0;
  void *buffer = 0;
  FILE_BASIC_INFO beforeBasic, afterBasic;
  FILE_STANDARD_INFO beforeSize, afterSize;
  sqlite3_int64 offset = 0;
  int rc = SQLITE_OK, closeRc = SQLITE_OK, opened = 0;
  (void)argc;
  if (!path) { sqlite3_result_error(c,"readonly scan path required",-1); return; }
  filename = sqlite3_create_filename(path,"","",0,0);
  file = sqlite3_malloc64((sqlite3_uint64)owner->vfs.szOsFile);
  buffer = sqlite3_malloc64(DIRECT_BUFFER_BYTES);
  if (!filename || !file || !buffer) { rc = SQLITE_NOMEM; goto done; }
  memset(file,0,(size_t)owner->vfs.szOsFile);
  rc = vOpen(&owner->vfs,filename,file,SQLITE_OPEN_READONLY | SQLITE_OPEN_MAIN_DB,0);
  if (rc != SQLITE_OK) goto done;
  opened = 1;
  if (!GetFileInformationByHandleEx(pf(file)->direct,FileBasicInfo,&beforeBasic,sizeof(beforeBasic))
      || !GetFileInformationByHandleEx(pf(file)->direct,FileStandardInfo,&beforeSize,sizeof(beforeSize))
      || beforeSize.EndOfFile.QuadPart < 0) { rc = SQLITE_IOERR_FSTAT; goto done; }
  while (offset < beforeSize.EndOfFile.QuadPart) {
    sqlite3_int64 remaining = beforeSize.EndOfFile.QuadPart - offset;
    int amount = remaining > DIRECT_BUFFER_BYTES ? (int)DIRECT_BUFFER_BYTES : (int)remaining;
    rc = pRead(file,buffer,amount,offset);
    if (rc != SQLITE_OK) goto done;
    offset += amount;
  }
  if (!GetFileInformationByHandleEx(pf(file)->direct,FileBasicInfo,&afterBasic,sizeof(afterBasic))
      || !GetFileInformationByHandleEx(pf(file)->direct,FileStandardInfo,&afterSize,sizeof(afterSize))) {
    rc = SQLITE_IOERR_FSTAT; goto done;
  }
  if (beforeSize.EndOfFile.QuadPart != afterSize.EndOfFile.QuadPart
      || beforeBasic.LastWriteTime.QuadPart != afterBasic.LastWriteTime.QuadPart) {
    rc = SQLITE_IOERR_DATA; goto done;
  }
  InterlockedIncrement64(&owner->sequentialReads);
  InterlockedAdd64(&owner->sequentialReadBytes,offset);
done:
  if (opened) closeRc = pClose(file);
  sqlite3_free_filename(filename); sqlite3_free(file); sqlite3_free(buffer);
  if (rc != SQLITE_OK || closeRc != SQLITE_OK) {
    sqlite3_result_error(c,"complete readonly scan or file-stability check failed",-1);
    sqlite3_result_error_code(c,rc != SQLITE_OK ? rc : closeRc);
  } else sqlite3_result_int64(c,offset);
}

static void unregisterSql(sqlite3_context *c, int argc, sqlite3_value **argv) {
  Owner *owner = (Owner *)sqlite3_user_data(c);
  int rc;
  (void)argc; (void)argv;
  rc = ownerUnregister(owner,1);
  if (rc == SQLITE_BUSY) {
    sqlite3_result_error(c,"probe VFS still owns open files",-1);
    sqlite3_result_error_code(c,rc);
  } else if (rc != SQLITE_OK) sqlite3_result_error_code(c,rc);
  else sqlite3_result_int(c,rc);
}
typedef void (*SqlFunction)(sqlite3_context *, int, sqlite3_value **);
__declspec(dllexport) int sqlite3_hbarreadonly_init(sqlite3 *db, char **error, const sqlite3_api_routines *api) {
  static const char *names[] = {"hbar_readonly_stat","hbar_readonly_unregister","hbar_readonly_scope","hbar_readonly_read","hbar_readonly_scan"};
  static const int arguments[] = {1,0,1,3,1};
  static const SqlFunction functions[] = {statSql,unregisterSql,scopeSql,rawReadSql,sequentialSql};
  Owner *owner;
  LONG64 serial;
  int rc = SQLITE_OK, i, installed = 0;
  (void)error;
  AcquireSRWLockExclusive(&apiGate);
  if (sqlite3_api && sqlite3_api != api) {
    ReleaseSRWLockExclusive(&apiGate);
    return SQLITE_MISUSE;
  }
  if (!sqlite3_api) { SQLITE_EXTENSION_INIT2(api); }
  ReleaseSRWLockExclusive(&apiGate);
  if (InterlockedIncrement64(&globalOwners) > OWNER_LIMIT) {
    InterlockedDecrement64(&globalOwners);
    return SQLITE_BUSY;
  }
  owner = (Owner *)HeapAlloc(GetProcessHeap(),HEAP_ZERO_MEMORY,sizeof(Owner));
  if (!owner) { InterlockedDecrement64(&globalOwners); return SQLITE_NOMEM; }
  owner->references = 1;
  InitializeSRWLock(&owner->gate);
  owner->baseVfs = sqlite3_vfs_find(0);
  if (!owner->baseVfs || owner->baseVfs->szOsFile < 1) { ownerRelease(owner); return SQLITE_NOTFOUND; }
  serial = InterlockedIncrement64(&nextOwnerId);
  if (serial <= 0) { ownerRelease(owner); return SQLITE_FULL; }
  sqlite3_snprintf((int)sizeof(owner->name),owner->name,"%s_%lld",PROBE_NAME,(sqlite3_int64)serial);
  owner->vfs.iVersion = owner->baseVfs->iVersion > 3 ? 3 : owner->baseVfs->iVersion;
  owner->vfs.szOsFile = (int)fileOffset() + owner->baseVfs->szOsFile;
  owner->vfs.mxPathname = owner->baseVfs->mxPathname;
  owner->vfs.zName = owner->name;
  owner->vfs.pAppData = owner;
  owner->vfs.xOpen=vOpen; owner->vfs.xDelete=vDelete; owner->vfs.xAccess=vAccess; owner->vfs.xFullPathname=vFull;
  owner->vfs.xDlOpen=vDlOpen; owner->vfs.xDlError=vDlError; owner->vfs.xDlSym=vDlSym; owner->vfs.xDlClose=vDlClose;
  owner->vfs.xRandomness=vRandom; owner->vfs.xSleep=vSleep; owner->vfs.xCurrentTime=vTime; owner->vfs.xGetLastError=vError;
  if (owner->vfs.iVersion>=2) owner->vfs.xCurrentTimeInt64=vTime64;
  if (owner->vfs.iVersion>=3) { owner->vfs.xSetSystemCall=vSetSystem; owner->vfs.xGetSystemCall=vGetSystem; owner->vfs.xNextSystemCall=vNextSystem; }
  rc = sqlite3_vfs_register(&owner->vfs,0);
  if (rc != SQLITE_OK) { ownerRelease(owner); return rc; }
  InterlockedExchange(&owner->registered,1);
  InterlockedIncrement64(&globalRegistered);
  for (i=0; i<5; ++i) {
    InterlockedIncrement(&owner->references);
    InterlockedIncrement(&owner->functionReferences);
    rc = sqlite3_create_function_v2(db,names[i],arguments[i],SQLITE_UTF8|SQLITE_DIRECTONLY,owner,functions[i],0,0,functionDestroyed);
    if (rc != SQLITE_OK) break;
    ++installed;
  }
  if (rc != SQLITE_OK) {
    for (i=0; i<installed; ++i) sqlite3_create_function_v2(db,names[i],arguments[i],SQLITE_UTF8,0,0,0,0,0);
    ownerUnregister(owner,0);
    ownerRelease(owner);
    return rc;
  }
  ownerRelease(owner);
  /* Exactly one process-lifetime code reference. All owner/VFS/file/buffer data is independently released. */
  return InterlockedCompareExchange(&modulePinClaimed,1,0) == 0 ? SQLITE_OK_LOAD_PERMANENTLY : SQLITE_OK;
}
