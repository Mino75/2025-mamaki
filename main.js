(function() {
  // ---------------------- Service Worker Registration ----------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').then(registration => {
      console.log('Service Worker Registered');
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data.action === 'reload') {
          console.log('New version available. Reloading page.');
          window.location.reload();
        }
      });
    });
  }

  // ---------------------- Global Variables ----------------------
  let sites = []; // Array of site objects loaded from default-sites.json.
  let selectedSiteIndex = 0;
  let lastUpdateTimestamp = null;
  let accordionState = {}; // e.g. { pages: true, posts: false, ... }
  let cachingInProgress = false;

  // ---------------------- Utility Functions ----------------------
  function debounce(func, wait) {
    let timeout;
    return function() {
      clearTimeout(timeout);
      timeout = setTimeout(func, wait);
    };
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function removeHyperlinks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    // Find all anchor tags
    const anchors = doc.querySelectorAll("a");
    anchors.forEach(anchor => {
      // Replace the <a> element with a text node containing its text content.
      const text = document.createTextNode(anchor.textContent);
      anchor.parentNode.replaceChild(text, anchor);
    });
    return doc.documentElement.outerHTML;
  }
  

  // ---------------------- UI Update Functions ----------------------
  function updateHeaderTitle() {
    const header = document.getElementById("headerTitle");
    if (header && sites[selectedSiteIndex]) {
      let baseUrl = sites[selectedSiteIndex].baseUrl;
      baseUrl = baseUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.[^.]+$/, "");
      header.textContent = "Mamaki Content Manager - " + baseUrl;
    }
  }

  // ---------------------- HTML Processing ----------------------
  function processHTML(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("img").forEach(img => {
      if (img.hasAttribute("src")) {
        try {
          const urlObj = new URL(img.getAttribute("src"), baseUrl);
          img.setAttribute("data-src", urlObj.pathname);
        } catch (e) { }
        img.removeAttribute("src");
      }
    });
    return doc.documentElement.outerHTML;
  }

  function sanitizeContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("img").forEach(el => {
      const altText = el.alt || "Image";
      const placeholder = document.createElement("span");
      placeholder.textContent = `[${altText}]`;
      el.parentNode.replaceChild(placeholder, el);
    });
    return doc.body.innerHTML;
  }

  // ---------------------- IndexedDB Helper Functions ----------------------
  // (Assuming openDatabase, storeSite, storeDocument, getSite are defined in db.js.)
  // Here we define getDocumentByUrl and getDocumentsForFolder if not provided.
  function getDocumentByUrl(url) {
    return openDatabase().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["documents"], "readonly");
        const store = tx.objectStore("documents");
        const index = store.index("originalUrl");
        const request = index.get(url);
        request.onsuccess = event => resolve(event.target.result);
        request.onerror = event => reject("Error retrieving document: " + event.target.error);
      });
    });
  }

  function getDocumentsForFolder(category) {
    return openDatabase().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["documents"], "readonly");
        const store = tx.objectStore("documents");
        const docs = [];
        const request = store.openCursor();
        request.onsuccess = event => {
          const cursor = event.target.result;
          if (cursor) {
            const doc = cursor.value;
            // Filter by category and site id/baseUrl
            if (doc.category === category && doc.siteId === sites[selectedSiteIndex].id) {
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
  
  


  // ---------------------- Sitemap Helpers ----------------------
  // processSitemap fetches a sitemap URL and returns an array of objects with url and category.
// Helper function to fetch via proxy.
function fetchViaProxy(url) {
  return fetch("https://mpantsaka.kahiether.com/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url })
  }).then(response => {
    if (!response.ok) {
      throw new Error("Proxy error fetching URL: " + url);
    }
    return response.text();
  });
}



function processSitemap(sitemapUrl, category) {
  return fetchViaProxy(sitemapUrl, "GET")
    .then(text => {
      const parser = new DOMParser();
      let urls = [];
      // Try parsing as XML first.
      let xmlDoc = parser.parseFromString(text, "application/xml");
      let locElements = xmlDoc.getElementsByTagName("loc");

      if (locElements && locElements.length > 0 && locElements[0].textContent) {
        // Standard XML sitemap found.
        for (let i = 0; i < locElements.length; i++) {
          const urlStr = locElements[i].textContent.trim();
          urls.push({ url: urlStr, category: category });
        }
      } else {
        // Fallback: parse as HTML (for WordPress sitemaps rendered as a table).
        let htmlDoc = parser.parseFromString(text, "text/html");
        const table = htmlDoc.getElementById("sitemap__table");
        if (table) {
          const rows = table.querySelectorAll("tbody tr");
          rows.forEach(row => {
            const anchor = row.querySelector("td.loc a");
            if (anchor) {
              const urlStr = anchor.href.trim();
              urls.push({ url: urlStr, category: category });
            }
          });
        }
      }
      return urls;
    })
    .catch(error => {
      console.error("Error processing sitemap for", sitemapUrl, error);
      // Return an empty array so that one failed sitemap doesn't break the overall process.
      return [];
    });
}

  
  

  // buildSiteSitemap: For a given site, fetch and process each sitemap file and group results by category.
  function buildSiteSitemap(site) {
    const cleanBaseUrl = site.baseUrl.replace(/\/+$/, "");
    let sitemaps;
    if (site.type === "wordpress") {
      // Use WordPress-specific sitemap endpoints
      sitemaps = [
        { url: cleanBaseUrl + "/wp-sitemap-posts-post-1.xml", category: "posts" },
        { url: cleanBaseUrl + "/wp-sitemap-posts-page-1.xml", category: "pages" },
        { url: cleanBaseUrl + "/wp-sitemap-taxonomies-category-1.xml", category: "categories" },
        { url: cleanBaseUrl + "/wp-sitemap-taxonomies-post_tag-1.xml", category: "post_tags" },
        { url: cleanBaseUrl + "/wp-sitemap-users-1.xml", category: "authors" }
      ];
    } else {
      // Use default sitemap endpoints (e.g., for Ghost sites)
      sitemaps = [
        { url: cleanBaseUrl + "/sitemap-pages.xml", category: "pages" },
        { url: cleanBaseUrl + "/sitemap-posts.xml", category: "posts" },
        { url: cleanBaseUrl + "/sitemap-authors.xml", category: "authors" },
        { url: cleanBaseUrl + "/sitemap-tags.xml", category: "tags" }
      ];
    }
    return Promise.all(sitemaps.map(item => processSitemap(item.url, item.category)))
      .then(results => {
        // Flatten the array of arrays into a single array.
        const flat = results.flat();
        // Group by category.
        const sitemapTree = {};
        flat.forEach(entry => {
          if (!sitemapTree[entry.category]) {
            sitemapTree[entry.category] = [];
          }
          sitemapTree[entry.category].push(entry);
        });
        return sitemapTree;
      });
  }
  
  // ---------------------- Sidebar Functions ----------------------
  function renderCacheTrigger() {
    const menu = document.getElementById("menu");
    if (!menu) return;
    const existing = document.getElementById("cacheTriggerContainer");
    if (existing) existing.remove();
    if (cachingInProgress) return;
    const container = document.createElement("div");
    container.id = "cacheTriggerContainer";
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.gap = "0.5rem";
    const trigger = document.createElement("span");
    trigger.textContent = "▶️";
    trigger.style.fontSize = "2rem";
    trigger.style.cursor = "pointer";
    trigger.title = "Click to update (re-cache) documents for this site";
    trigger.addEventListener("click", () => {
      if (!cachingInProgress) updateDataViaProxy();
    });
    container.appendChild(trigger);
    if (lastUpdateTimestamp) {
      const ts = document.createElement("span");
      ts.textContent = `Last update: ${lastUpdateTimestamp}`;
      ts.style.fontSize = "0.9rem";
      container.appendChild(ts);
    }
    menu.insertBefore(container, menu.firstChild);
  }

  function updateSidebarFromSitemap() {
    const menu = document.getElementById("menu");
    if (!menu) return;
    menu.innerHTML = "";
    renderCacheTrigger();
    const currentSite = sites[selectedSiteIndex];
    if (!currentSite) return;
    
    // Hardcoded categories based on site type.
    let folders = [];
    if (currentSite.type === "ghost") {
      folders = ["posts", "pages", "authors", "tags"];
    } else if (currentSite.type === "wordpress") {
      folders = ["posts", "pages", "categories", "post_tags"];
    }
    
    folders.forEach(category => {
      const sectionHeader = document.createElement("div");
      sectionHeader.classList.add("folder-item");
      sectionHeader.textContent = category.toUpperCase();
      sectionHeader.style.cursor = "pointer";
      sectionHeader.style.fontWeight = "bold";
      sectionHeader.style.padding = "4px 0";
      
      const itemContainer = document.createElement("div");
      // Always create the container, defaulting to hidden.
      itemContainer.style.display = "none";
      
      sectionHeader.addEventListener("click", function() {
        if (itemContainer.style.display === "none") {
          itemContainer.style.display = "block";
          accordionState[category] = true;
          sectionHeader.classList.add("open");
          console.log(`Folder "${category}" opened.`);
          
          // Always retrieve documents from IndexedDB.
          getDocumentsForFolder(category)
            .then(docs => {
              console.log(`Folder "${category}" retrieved ${docs.length} documents.`);
              renderFolderDocuments(itemContainer, docs);
            })
            .catch(err => {
              console.error(`Error retrieving documents for folder "${category}":`, err);
              itemContainer.textContent = "Error retrieving documents.";
            });
        } else {
          itemContainer.style.display = "none";
          accordionState[category] = false;
          sectionHeader.classList.remove("open");
          console.log(`Folder "${category}" closed.`);
        }
      });
      
      
      menu.appendChild(sectionHeader);
      menu.appendChild(itemContainer);
    });
  }
  

  function renderFolderDocuments(container, docs) {
    container.innerHTML = "";
    if (docs.length === 0) {
      container.textContent = "No cached documents in this folder.";
      return;
    }
    const ul = document.createElement("ul");
    docs.forEach(doc => {
      const li = document.createElement("li");
      li.style.cursor = "pointer";
      li.textContent = doc.title || doc.originalUrl;
      const checkMark = document.createElement("span");
      checkMark.textContent = " ✅";
      li.appendChild(checkMark);
      li.addEventListener("click", () => {
        loadPostContent(doc.originalUrl);
      });
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  // ---------------------- Document Functions ----------------------
  function loadPostContent(url, forceFetch = false) {
    const contentArea = document.getElementById("content");
    if (!contentArea) return;
    contentArea.innerHTML = "<p>Loading content...</p>";
    if (!forceFetch) {
      getDocumentByUrl(url)
        .then(doc => {
          if (doc && doc.content) {
            console.log("Loaded document from IndexedDB:", url);
            contentArea.innerHTML = `<h2>${doc.title}</h2>${doc.content}`;
          } else {
            cacheDocument(url, null);
          }
        })
        .catch(err => {
          console.error("Error retrieving document from cache:", err);
          cacheDocument(url, null);
        });
    } else {
      cacheDocument(url, null);
    }
  }

  // Modified to accept category.
  function cacheDocument(url, category) {
    console.log("Caching document:", url);
    return fetch("https://mpantsaka.kahiether.com/proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url, action: "FETCH_DOCUMENT" })
    })
      .then(response => {
        if (!response.ok) throw new Error("Proxy error fetching document: " + url);
        return response.text();
      })
      .then(html => {
        console.log("Received HTML for", url, html.substring(0, 100) + "...");
        const baseUrl = sites[selectedSiteIndex].baseUrl;
        // Process images etc.
        let processedHTML = processHTML(html, baseUrl);
        // Remove hyperlinks from the processed HTML.
        processedHTML = removeHyperlinks(processedHTML);
        const sanitizedHTML = sanitizeContent(processedHTML);
        const titleMatch = processedHTML.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : url;
        let path = "", depth = 0;
        try {
          const urlObj = new URL(url);
          path = urlObj.pathname;
          depth = path.split('/').filter(Boolean).length;
        } catch (e) {
          console.error("Error parsing URL for document", url, e);
        }
        const docObj = {
          uuid: generateUUID(),
          siteId: sites[selectedSiteIndex].id, // or store sites[selectedSiteIndex].baseUrl
          originalUrl: url,
          content: sanitizedHTML,
          title: title,
          path: path,
          depth: depth,
          category: category || "unknown",
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString()
        };
        console.log("Storing document:", docObj);
        return storeDocument(docObj);
      })
      .then(() => {
        console.log("Document cached successfully:", url);
      })
      .catch(err => {
        console.error("Error caching document:", url, err);
      });
  }
  
  function cacheAllDocuments() {
    cachingInProgress = true;
    renderCacheTrigger();
    const currentSite = sites[selectedSiteIndex];
    if (!currentSite || !currentSite.sitemapTree) {
      cachingInProgress = false;
      renderCacheTrigger();
      return;
    }
    const sitemapTree = currentSite.sitemapTree;
    const promises = [];
    Object.keys(sitemapTree).forEach(category => {
      sitemapTree[category].forEach(item => {
        promises.push(
          getDocumentByUrl(item.url).then(doc => {
            if (!(doc && doc.content)) {
              return cacheDocument(item.url, category);
            }
          })
        );
      });
    });
    Promise.all(promises).then(() => {
      cachingInProgress = false;
      renderCacheTrigger();
      updateSidebarFromSitemap();
    });
  }

  // ---------------------- Proxy & Update Functions ----------------------
  function forceUpdateVersion() {
    fetch("version.txt", { cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("Network error while fetching version info.");
        return response.text();
      })
      .then(serverVersion => { location.reload(); })
      .catch(error => { alert("Unable to update version: no network available."); });
  }

  function updateDataViaProxy() {
    if (!navigator.onLine) {
      console.log("Offline: Skipping updateDataViaProxy");
      return Promise.resolve();
    }
    cachingInProgress = true;
    renderCacheTrigger();
    const currentSite = sites[selectedSiteIndex];
    buildSiteSitemap(currentSite)
      .then(sitemapTree => {
        console.log("Proxy update complete via buildSiteSitemap:", sitemapTree);
        currentSite.sitemapTree = sitemapTree;
        lastUpdateTimestamp = new Date().toLocaleString();
        storeSite({
          uuid: currentSite.id,
          baseUrl: currentSite.baseUrl,
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString(),
          sitemapTree: sitemapTree,
          isDefault: currentSite.isDefault || false
        });
        cacheAllDocuments();
      })
      .catch(error => { console.error("Proxy update error:", error); })
      .finally(() => {
        cachingInProgress = false;
        renderCacheTrigger();
      });
  }

  function fetchSiteDataViaProxy(site) {
    if (!navigator.onLine) {
      console.log("Offline: Using cached site data for", site.baseUrl);
      return Promise.resolve(site);
    }
    cachingInProgress = true;
    renderCacheTrigger();
    return buildSiteSitemap(site)
      .then(sitemapTree => {
        site.sitemapTree = sitemapTree;
        storeSite({
          uuid: site.id,
          baseUrl: site.baseUrl,
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString(),
          sitemapTree: sitemapTree,
          isDefault: site.isDefault || false
        });
        return site;
      })
      .catch(err => {
        console.error("Error fetching site data via proxy:", err);
        throw err;
      })
      .finally(() => {
        cachingInProgress = false;
        renderCacheTrigger();
      });
  }

  // ---------------------- Site Switcher & Burger Menu ----------------------
  function updateSiteSwitcherPopup() {
    let popup = document.getElementById("siteSwitcherPopup");
    if (!popup) {
      popup = document.createElement("div");
      popup.id = "siteSwitcherPopup";
      applyStyles(popup, siteSwitcherPopupStyles); // Assume defined in style.js
      document.body.appendChild(popup);
    }
    popup.innerHTML = "<h3>Select a Site</h3>";
    const ul = document.createElement("ul");
    sites.forEach((site, index) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      const displayName = site.name ? site.name : site.baseUrl;
      btn.textContent = displayName + " (" + site.baseUrl + ")";
      btn.style.margin = "5px";
      btn.addEventListener("click", () => {
        selectedSiteIndex = index;
        updateHeaderTitle();
        updateSidebarFromSitemap();
        popup.style.display = "none";
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    popup.appendChild(ul);
  }


  function showSiteSwitcherPopup() {
    const popup = document.getElementById("siteSwitcherPopup");
    if (popup) {
      // In this example, we simply ensure it’s visible.
      popup.style.display = "block";
      popup.style.opacity = "1";
    } else {
      console.error("Site switcher popup element not found.");
    }
  }
  
  


function setupBurgerMenu() {
  // Create the burger button element.
  const burger = document.createElement("div");
  burger.id = "burgerButton"; // Ensure this ID matches your style.js selector.
  burger.textContent = "☰";
  
  // Apply burger button styles from your style.js
  if (window.applyStyles && window.burgerButtonStyles) {
    applyStyles(burger, window.burgerButtonStyles);
  }
  // Ensure centering (in case it's not fully applied)
  burger.style.display = "flex";
  burger.style.alignItems = "center";
  burger.style.justifyContent = "center";
  
  // Create the popup container for the site switcher.
  const popup = document.createElement("div");
  popup.id = "siteSwitcherPopup"; // This should match the selector in your style.js.
  if (window.applyStyles && window.siteSwitcherPopupStyles) {
    applyStyles(popup, window.siteSwitcherPopupStyles);
  }
  // Initialize the popup as hidden and with zero opacity for fade transition.
  popup.style.display = "none";
  popup.style.opacity = "0";
  popup.style.transition = "opacity 0.3s ease";
  
  // Create the "Switch Site" button inside the popup.
  const switchSiteBtn = document.createElement("button");
  switchSiteBtn.textContent = "Switch Site";
  if (window.applyStyles && window.popupButtonStyles) {
    applyStyles(switchSiteBtn, window.popupButtonStyles);
  }
  // When clicked, call showSiteSwitcherPopup (which could open a more complex UI)
  switchSiteBtn.addEventListener("click", () => {
    showSiteSwitcherPopup();
  });
  popup.appendChild(switchSiteBtn);
  
  // When the burger button is clicked, toggle the popup with a fade animation.
  burger.addEventListener("click", () => {
    if (popup.style.display === "none" || popup.style.opacity === "0") {
      // Show the popup.
      popup.style.display = "block";
      // Force a reflow so the transition applies.
      void popup.offsetWidth;
      popup.style.opacity = "1";
    } else {
      // Hide the popup with fade-out.
      popup.style.opacity = "0";
      setTimeout(() => {
        popup.style.display = "none";
      }, 300);
    }
  });
  
  // Append the burger button and popup to the document body.
  document.body.appendChild(burger);
  document.body.appendChild(popup);
}
  
  

  // ---------------------- Load Default Sites ----------------------
  function loadDefaultSitesFromJSON() {
    fetch('default-sites.json')
      .then(response => {
        if (!response.ok) throw new Error('Failed to load default sites.');
        return response.json();
      })
      .then(data => {
        console.log("Loaded JSON:", data);
        sites = data.defaultSites.map(site => {
          site.isDefault = true;
          return site;
        });
        console.log("Sites array:", sites);
        selectedSiteIndex = 0;
        updateHeaderTitle();
        updateSidebarFromSitemap();
        updateSiteSwitcherPopup();
      })
      .catch(err => {
        console.error("Error loading default sites:", err);
      });
  }

  // ---------------------- Initialization ----------------------
  document.addEventListener("DOMContentLoaded", () => {
    loadDefaultSitesFromJSON();
    setupBurgerMenu();
  });

  // Expose some functions if needed.
  window.updateHeaderTitle = updateHeaderTitle;
  window.updateSidebarFromSitemap = updateSidebarFromSitemap;
  window.loadPostContent = loadPostContent;
  window.forceUpdateVersion = forceUpdateVersion;
})();
