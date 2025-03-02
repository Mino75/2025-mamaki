// db.js

const DB_NAME = "OfflineDocumentsDB";
const DB_VERSION = 2;
const SITE_STORE = "sites";
const DOC_STORE = "documents";

/**
 * Opens (or creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SITE_STORE)) {
        const siteStore = db.createObjectStore(SITE_STORE, { keyPath: "uuid" });
        siteStore.createIndex("baseUrl", "baseUrl", { unique: false });
      }
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        const docStore = db.createObjectStore(DOC_STORE, { keyPath: "uuid" });
        docStore.createIndex("originalUrl", "originalUrl", { unique: false });
      }
    };
    request.onsuccess = function(event) {
      resolve(event.target.result);
    };
    request.onerror = function(event) {
      reject(event.target.error);
    };
  });
}

/**
 * Stores a site object in the IndexedDB.
 * @param {Object} site - The site object (should include a unique uuid, baseUrl, etc.)
 * @returns {Promise<void>}
 */
function storeSite(site) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SITE_STORE], "readwrite");
      const store = tx.objectStore(SITE_STORE);
      const request = store.put(site);
      request.onsuccess = () => resolve();
      request.onerror = event => reject(event.target.error);
    });
  });
}

/**
 * Stores a document object in the IndexedDB.
 * @param {Object} documentData - The document object (should include a uuid, originalUrl, content, title, path, etc.)
 * @returns {Promise<void>}
 */
function storeDocument(documentData) {
  if (!documentData.uuid) {
    documentData.uuid = generateUUID();
  }
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOC_STORE], "readwrite");
      const store = tx.objectStore(DOC_STORE);
      const request = store.put(documentData);
      request.onsuccess = () => resolve();
      request.onerror = event => reject(event.target.error);
    });
  });
}

/**
 * Retrieves a site from the IndexedDB by its uuid.
 * @param {string} id - The site's uuid.
 * @returns {Promise<Object|null>}
 */
function getSite(id) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SITE_STORE], "readonly");
      const store = tx.objectStore(SITE_STORE);
      const request = store.get(id);
      request.onsuccess = event => resolve(event.target.result);
      request.onerror = event => reject(event.target.error);
    });
  });
}

/**
 * Retrieves a document from the IndexedDB by its uuid.
 * @param {string} id - The document's uuid.
 * @returns {Promise<Object|null>}
 */
function getDocument(id) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOC_STORE], "readonly");
      const store = tx.objectStore(DOC_STORE);
      const request = store.get(id);
      request.onsuccess = event => resolve(event.target.result);
      request.onerror = event => reject("Error retrieving document: " + event.target.error);
    });
  });
}

/**
 * Retrieves a document from the IndexedDB by its originalUrl.
 * @param {string} url - The document's originalUrl.
 * @returns {Promise<Object|null>}
 */
function getDocumentByUrl(url) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOC_STORE], "readonly");
      const store = tx.objectStore(DOC_STORE);
      const index = store.index("originalUrl");
      const request = index.get(url);
      request.onsuccess = event => resolve(event.target.result);
      request.onerror = event => reject("Error retrieving document: " + event.target.error);
    });
  });
}

/**
 * Queries all documents whose "path" property starts with "/" + folderName.
 * @param {string} folderName - The folder name (e.g. "posts")
 * @returns {Promise<Array>} - An array of document objects.
 */
function getDocumentsForFolder(folderName) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOC_STORE], "readonly");
      const store = tx.objectStore(DOC_STORE);
      const docs = [];
      const request = store.openCursor();
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          const doc = cursor.value;
          if (doc.path && doc.path.startsWith("/" + folderName)) {
            docs.push(doc);
          }
          cursor.continue();
        } else {
          resolve(docs);
        }
      };
      request.onerror = event => reject("Error querying documents: " + event.target.error);
    });
  });
}

/**
 * Generates a UUID.
 * @returns {string} - A UUID.
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0,
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


function clearDatabase(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => {
      console.log(`Database "${dbName}" deleted successfully.`);
      resolve();
    };
    request.onerror = event => {
      console.error(`Error deleting database "${dbName}":`, event.target.error);
      reject(event.target.error);
    };
    request.onblocked = () => {
      console.warn(`Deletion of database "${dbName}" is blocked. Please close other tabs.`);
    };
  });
}

function clearCaches() {
  return caches.keys().then(cacheNames => {
    return Promise.all(cacheNames.map(name => caches.delete(name)));
  });
}
