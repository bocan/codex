# Performance Optimizations

This document tracks performance improvements made to Disnotion.

## Caching Layer (Implemented)

### What Was Added

A comprehensive in-memory caching system with TTL (Time To Live) support:

- **Cache Service** (`server/src/services/cache.ts`)
  - 30-second TTL by default
  - Pattern-based invalidation
  - Automatic expiry checking

### What Gets Cached

1. **Folder Tree** (`getFolderTree`)
   - Most frequently called operation
   - Rarely changes
   - Massive performance win for initial load

2. **Page Lists** (`getPages`)
   - Cached per folder
   - Invalidated when pages are created/deleted/moved

3. **Page Content** (`getPageContent`)
   - Cached by file path
   - Invalidated on save

### Cache Invalidation Strategy

Cache is automatically invalidated when:

- **Creating a page**: Invalidates folder's page list
- **Updating a page**: Invalidates that page's content
- **Deleting a page**: Invalidates folder's page list + page content
- **Renaming a page**: Invalidates both old and new folder lists
- **Moving a page**: Invalidates both source and destination folders
- **Creating a folder**: Invalidates entire folder tree
- **Deleting a folder**: Invalidates folder tree + all pages in folder
- **Renaming a folder**: Invalidates folder tree + page lists

### Performance Improvements

**Parallelized Directory Scanning**:
- Changed `getFolderTree` from sequential `await` in loop to `Promise.all()`
- Subdirectories are now scanned in parallel

**Reduced Polling**:
- Preview component polling reduced from 3s to 10s
- Reduces server load significantly

### Expected Impact

- **Initial Load**: 50-70% faster (folder tree cached)
- **Page Navigation**: 40-60% faster (content cached)
- **Folder Browsing**: 30-50% faster (page lists cached)
- **Server Load**: Reduced by ~60% (fewer filesystem calls)

## Git Optimizations (Already Implemented)

- Non-blocking commits in production mode
- Synchronous commits only in test mode
- Commit queue prevents lock conflicts
- Lazy initialization (doesn't block server startup)

## Future Optimizations (Not Yet Implemented)

### HTTP-Level Caching
- Add ETags to responses
- Enable browser-side caching
- 304 Not Modified responses

### Background Indexing
- Pre-build folder tree on startup
- Watch filesystem for changes
- Invalidate cache based on file events

### Database Layer
- SQLite for metadata (faster than filesystem scans)
- Keep markdown on filesystem, metadata in DB
- Instant folder tree/page list responses

### Streaming Responses
- Stream large page content instead of loading entirely
- Pagination for folders with many pages

## Monitoring

To check cache effectiveness, use the `getStats()` method in production logs:

```typescript
console.log('Cache stats:', fileSystemService.cache.getStats());
```

This shows cache size and active keys.
