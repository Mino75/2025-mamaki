const DB_NAME = "OfflineDocumentsDB";
// Bump the version to trigger a schema upgrade.
const DB_VERSION = 2;

// Define our three stores.
const SITE_STORE = "sites";
const FOLDER_STORE = "folders";
const DOC_STORE = "documents";

/**
 * Generates a random UUID.
 * Example: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0,
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
// Create a store for Sites if it doesn't exist.
if (!db.objectStoreNames.contains(SITE_STORE)) {
  const siteStore = db.createObjectStore(SITE_STORE, { keyPath: "uuid" });
  // Create an index on baseUrl if you want to query by it.
  siteStore.createIndex("baseUrl", "baseUrl", { unique: false });
}

// Create a store for Folders if it doesn't exist.
if (!db.objectStoreNames.contains(FOLDER_STORE)) {
  const folderStore = db.createObjectStore(FOLDER_STORE, { keyPath: "uuid" });
  // Create an index on siteId for efficient querying.
  folderStore.createIndex("siteId", "siteId", { unique: false });
}

// Create a store for Documents if it doesn't exist.
// Also create an index on originalUrl for faster lookups.
if (!db.objectStoreNames.contains(DOC_STORE)) {
  const docStore = db.createObjectStore(DOC_STORE, { keyPath: "uuid" });
  docStore.createIndex("originalUrl", "originalUrl", { unique: false });
}

    };
    
    request.onsuccess = function (event) {
      resolve(event.target.result);
    };
    
    request.onerror = function (event) {
      reject("Error opening database: " + event.target.error);
    };
  });
}

/**
 * Store a Site object.
 * @param {Object} site - Object with { uuid, baseUrl, createDate, updateDate }.
 * @returns {Promise<void>}
 */
function storeSite(site) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SITE_STORE], "readwrite");
      const store = tx.objectStore(SITE_STORE);
      const req = store.put(site);
      req.onsuccess = () => {
        console.log("Site stored:", site.uuid);
        resolve();
      };
      req.onerror = (event) => {
        reject("Error storing site: " + event.target.error);
      };
    });
  });
}

/**
 * Store a Folder object.
 * @param {Object} folder - Object with { uuid, url, path, depth, createDate, updateDate }.
 * @returns {Promise<void>}
 */
function storeFolder(folder) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([FOLDER_STORE], "readwrite");
      const store = tx.objectStore(FOLDER_STORE);
      const req = store.put(folder);
      req.onsuccess = () => {
        console.log("Folder stored:", folder.uuid);
        resolve();
      };
      req.onerror = (event) => {
        reject("Error storing folder: " + event.target.error);
      };
    });
  });
}

/**
 * Store a Document object.
 * @param {Object} doc - Object with { uuid, originalUrl, content, title, path, depth, createDate, updateDate }.
 * @returns {Promise<void>}
 */
function storeDocument(documentData) {
  // Ensure that documentData has a uuid. If not, generate one.
  if (!documentData.uuid) {
    documentData.uuid = generateUUID();
  }
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DOC_STORE], "readwrite");
      const store = transaction.objectStore(DOC_STORE);
      console.log("Storing document record:", documentData);
      const request = store.put(documentData);
      request.onsuccess = () => {
        console.log(`Document ${documentData.uuid} stored.`);
        resolve();
      };
      request.onerror = (event) => {
        reject("Error storing document: " + event.target.error);
      };
    });
  });
}

/**
 * Retrieve a stored Document by its id.
 * @param {string} id - The document id (uuid).
 * @returns {Promise<Object>}
 */
function getDocument(id) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([DOC_STORE], "readonly");
      const store = tx.objectStore(DOC_STORE);
      const req = store.get(id);
      req.onsuccess = (event) => resolve(event.target.result);
      req.onerror = (event) =>
        reject("Error retrieving document: " + event.target.error);
    });
  });
}

/**
 * Retrieves a Site object from IndexedDB using its unique identifier (uuid).
 *
 * This function opens the database, starts a read-only transaction on the
 * SITE_STORE object store, and retrieves the object whose key matches the provided id.
 *
 * @param {string} id - The unique identifier (uuid) of the site to retrieve.
 * @returns {Promise<Object|null>} - A promise that resolves with the site object if found, or null otherwise.
 */
function getSite(id) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([SITE_STORE], "readonly");
      const store = tx.objectStore(SITE_STORE);
      const request = store.get(id);
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject("Error retrieving site: " + event.target.error);
    });
  });
}

// Expose the function so that main.js can use it.
window.getSite = getSite;



// Expose the functions so that main.js can use them.
window.storeSite = storeSite;
window.storeFolder = storeFolder;
window.storeDocument = storeDocument;
window.getDocument = getDocument;


