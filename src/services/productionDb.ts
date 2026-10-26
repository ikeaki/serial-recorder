// src/services/productionDb.ts

const DB_NAME =
  "serial-db";

export const PROD_STORE_NAME =
  "production";

const DB_VERSION = 4;

// Production用IndexedDBを開く
export const openDB =
  (): Promise<IDBDatabase> => {
    return new Promise(
      (resolve, reject) => {
        const request =
          indexedDB.open(
            DB_NAME,
            DB_VERSION
          );

        request.onupgradeneeded =
          () => {
            const db =
              request.result;

            if (
              !db.objectStoreNames
                .contains(
                  PROD_STORE_NAME
                )
            ) {
              db.createObjectStore(
                PROD_STORE_NAME,
                {
                  keyPath: "id",
                  autoIncrement: true,
                }
              );
            }
          };

        request.onsuccess =
          () => {
            resolve(
              request.result
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };
      }
    );
  };

// Productionデータを1件保存
export const saveProductionRecord = async (
  data: unknown
): Promise<void> => {
  const db =
    await openDB();

  try {
    const tx =
      db.transaction(
        PROD_STORE_NAME,
        "readwrite"
      );

    const store =
      tx.objectStore(
        PROD_STORE_NAME
      );

    await new Promise<void>(
      (resolve, reject) => {
        const clearRequest =
          store.clear();

        clearRequest.onsuccess =
          () => {
            const addRequest =
              store.add(data);

            addRequest.onsuccess =
              () => {
                resolve();
              };

            addRequest.onerror =
              () => {
                reject(
                  addRequest.error
                );
              };
          };

        clearRequest.onerror =
          () => {
            reject(
              clearRequest.error
            );
          };
      }
    );
  } finally {
    db.close();
  }
};

// Productionデータをすべて取得
export const loadProductionHistory =
  async (): Promise<any[]> => {
    const db =
      await openDB();

    const tx =
      db.transaction(
        PROD_STORE_NAME,
        "readonly"
      );

    const request =
      tx
        .objectStore(
          PROD_STORE_NAME
        )
        .getAll();

    return await new Promise<any[]>(
      (resolve, reject) => {
        request.onsuccess =
          () => {
            resolve(
              request.result
            );
          };

        request.onerror =
          () => {
            reject(
              request.error
            );
          };
      }
    );
  };

// Production Storeの全データを削除
export const clearProductionStore =
  async (): Promise<void> => {
    const db =
      await openDB();

    try {
      const tx =
        db.transaction(
          PROD_STORE_NAME,
          "readwrite"
        );

      const store =
        tx.objectStore(
          PROD_STORE_NAME
        );

      await new Promise<void>(
        (resolve, reject) => {
          const request =
            store.clear();

          request.onsuccess =
            () => {
              resolve();
            };

          request.onerror =
            () => {
              reject(
                request.error
              );
            };
        }
      );
    } finally {
      db.close();
    }
  };