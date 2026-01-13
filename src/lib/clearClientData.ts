export async function clearClientData() {
  // 1) Storage
  try {
    localStorage.clear()
  } catch {
    // ignore
  }
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }

  // 2) Cache Storage (PWA/ServiceWorker가 없어도 안전)
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // ignore
  }

  // 3) IndexedDB (브라우저 지원 시)
  try {
    const dbs: Array<{ name?: string }> | undefined = await (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> })
      .databases?.()
    if (dbs && dbs.length) {
      await Promise.all(
        dbs
          .map((d) => d.name)
          .filter(Boolean)
          .map(
            (name) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(name!)
                req.onsuccess = () => resolve()
                req.onerror = () => resolve()
                req.onblocked = () => resolve()
              }),
          ),
      )
    }
  } catch {
    // ignore
  }
}


