/*************** MAIN.JS ******************/

// Service Worker registration & update messaging
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(registration => {
    console.log('Service Worker Registered');
    
    // Listen for messages from the service worker to trigger reload (if needed)
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data.action === 'reload') {
        console.log('New version available. Reloading page.');
        window.location.reload();
      }
    });
  });
}

// Global variables
let sites = []; // Each site: { id, identifier, baseUrl, sitemapPath, type, name, sitemapTree }
let selectedSiteIndex = 0;
let lastUpdateTimestamp = null;

// Global object to preserve the open/closed state of each accordion section
let accordionState = {};

// Global flag to track if caching is in progress.
let cachingInProgress = false;

// Global object to track caching status for each URL.
// Possible statuses: "loading", "success", "failed"
let documentCacheStatus = {};

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0,
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Render the offline caching trigger button (▶️) at the top of the sidebar.
 * It is shown only when caching is not in progress.
 */
function renderCacheTrigger() {
  const menu = document.getElementById("menu");
  if (!menu) return;
  // Remove any existing trigger container
  const existingContainer = document.getElementById("cacheTriggerContainer");
  if (existingContainer) {
    existingContainer.remove();
  }
  if (cachingInProgress) return;
  
  // Create a container for the button and timestamp
  const container = document.createElement("div");
  container.id = "cacheTriggerContainer";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.gap = "0.5rem";
  
  // Create the trigger element (▶️)
  const trigger = document.createElement("span");
  trigger.id = "cacheTrigger";
  trigger.textContent = "▶️";
  trigger.style.fontSize = "2rem";
  trigger.style.cursor = "pointer";
  trigger.title = "Click to cache all documents offline";
  trigger.addEventListener("click", () => {
    if (!cachingInProgress) {
      updateDataViaProxy();
    }
  });
  
  container.appendChild(trigger);
  
  // If a last update timestamp exists, show it
  if (lastUpdateTimestamp) {
    const timestampSpan = document.createElement("span");
    timestampSpan.id = "lastUpdateTimestamp";
    timestampSpan.textContent = `Last update: ${lastUpdateTimestamp}`;
    timestampSpan.style.fontSize = "0.9rem";
    container.appendChild(timestampSpan);
  }
  
  // Insert the container at the top of the sidebar.
  menu.insertBefore(container, menu.firstChild);
}

// When DOM is ready, load default sites and initialize UI
document.addEventListener("DOMContentLoaded", () => {
  // 1. Apply saved theme preference from localStorage.
  const storedTheme = localStorage.getItem("theme");
  const body = document.body;
  const toggleElem = document.getElementById("toggleMode");
  
  if (storedTheme) {
    body.classList.remove("dark", "light");
    body.classList.add(storedTheme);
    toggleElem.textContent = storedTheme === "dark" ? "⚪" : "🌑";
  } else {
    body.classList.add("dark");
    toggleElem.textContent = "⚪";
    localStorage.setItem("theme", "dark");
  }

  // 2. Load default sites. (This will use cached IndexedDB data if available.)
  loadDefaultSitesFromJSON();

  // 3. Set up dark/light mode toggle event listener.
  if (toggleElem) {
    toggleElem.addEventListener("click", toggleMode);
  }

  // 4. Set up filter input for sidebar (if present).
  const filterInput = document.getElementById("menuFilter");
  if (filterInput) {
    filterInput.addEventListener("input", debounce(filterSidebarItems, 200));
  }

  // 5. Set up the burger menu for site management.
  setupBurgerMenu();
});

// 6. Attach an Event Listener for the Update Button (if present).
const updateVersionButton = document.getElementById("updateVersion");
if (updateVersionButton) {
  updateVersionButton.addEventListener("click", forceUpdateVersion);
}

/* ------------------- Basic UI Functions ------------------- */

function getCurrentSitePosts() {
  if (sites[selectedSiteIndex] && sites[selectedSiteIndex].sitemapTree) {
    return sites[selectedSiteIndex].sitemapTree.posts || [];
  }
  return [];
}

// Debounce utility to limit function calls.
function debounce(func, wait) {
  let timeout;
  return function () {
    clearTimeout(timeout);
    timeout = setTimeout(func, wait);
  };
}

// Update header title with the current site name.
function updateHeaderTitle() {
  const header = document.getElementById("headerTitle");
  if (header && sites[selectedSiteIndex]) {
    let baseUrl = sites[selectedSiteIndex].baseUrl;
    baseUrl = baseUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\.[^.]+$/, "");
    header.textContent = "Mamaki Content Manager - " + baseUrl;
  }
}

/**
 * Process HTML: remove absolute URLs, replace src with data-src, etc.
 */
function processHTML(html, baseUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Process <img> elements.
  doc.querySelectorAll("img").forEach(img => {
    if (img.hasAttribute("src")) {
      try {
        const urlObj = new URL(img.getAttribute("src"), baseUrl);
        img.setAttribute("data-src", urlObj.pathname);
      } catch (e) {}
      img.removeAttribute("src");
    }
  });

  // Process elements with "srcset".
  doc.querySelectorAll("[srcset]").forEach(elem => {
    const srcsetVal = elem.getAttribute("srcset");
    if (srcsetVal) {
      const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escapedBase, 'g');
      const newSrcset = srcsetVal.replace(re, "");
      elem.setAttribute("data-srcset", newSrcset);
      elem.removeAttribute("srcset");
    }
  });

  // Process <video> and <audio> elements and their <source> children.
  ["video", "audio"].forEach(tag => {
    doc.querySelectorAll(tag).forEach(media => {
      if (media.hasAttribute("src")) {
        try {
          const urlObj = new URL(media.getAttribute("src"), baseUrl);
          media.setAttribute("data-src", urlObj.pathname);
        } catch (e) {}
        media.removeAttribute("src");
      }
      media.querySelectorAll("source").forEach(source => {
        if (source.hasAttribute("src")) {
          try {
            const urlObj = new URL(source.getAttribute("src"), baseUrl);
            source.setAttribute("data-src", urlObj.pathname);
          } catch (e) {}
          source.removeAttribute("src");
        }
      });
    });
  });

  // Process inline styles with background-image URLs.
  doc.querySelectorAll("[style]").forEach(elem => {
    const style = elem.getAttribute("style");
    const bgMatch = style.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
    if (bgMatch) {
      try {
        const urlObj = new URL(bgMatch[2], baseUrl);
        elem.setAttribute("data-bg", urlObj.pathname);
      } catch (e) {}
      const newStyle = style.replace(/background-image\s*:\s*url\((['"]?)(.*?)\1\);?/i, "");
      elem.setAttribute("style", newStyle);
    }
  });

  // Process <a> elements to convert absolute URLs to relative.
  doc.querySelectorAll("a").forEach(link => {
    if (link.hasAttribute("href")) {
      try {
        const urlObj = new URL(link.getAttribute("href"), baseUrl);
        if (urlObj.origin === new URL(baseUrl).origin) {
          link.setAttribute("href", urlObj.pathname);
        }
      } catch (e) {}
    }
  });

  return doc.documentElement.outerHTML;
}

/* ------------------- Default Sites and Sitemap Building ------------------- */

// Load default sites from JSON. This function does NOT clear IndexedDB.
// It uses cached site data (if available) via loadSiteData.
function loadDefaultSitesFromJSON() {
  fetch('default-sites.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to load default sites.');
      return response.json();
    })
    .then(data => {
      // Mark each site as default.
      const sitesArray = data.defaultSites.map(site => {
        site.isDefault = true;
        return site;
      });
      const promises = sitesArray.map(site => loadSiteData(site));
      return Promise.all(promises);
    })
    .then(results => {
      sites = results;
      selectedSiteIndex = 0;
      updateSiteSwitcherPopup();
      updateHeaderTitle();
      updateSidebarFromSitemap();
  // Delay a bit to ensure IndexedDB is ready, then recheck the document statuses.
  setTimeout(() => {
    recheckCachedDocuments();
  }, 500);
    })
    .catch(err => {
      console.error("Error loading default sites:", err);
    });
}

/**
 * Load site data by checking IndexedDB first.
 * If cached data exists (and includes a sitemapTree), use it;
 * otherwise, fetch fresh data via the proxy.
 */
function loadSiteData(site) {
  return getSite(site.id).then(cachedSite => {
    if (cachedSite && cachedSite.sitemapTree) {
      console.log("Loaded site from cache:", site.id);
      site.sitemapTree = cachedSite.sitemapTree;
      return site;
    } else {
      return navigator.onLine ? fetchSiteDataViaProxy(site) : site;
    }
  }).catch(err => {
    console.error("Error loading site data for", site.id, err);
    return buildSiteSitemap(site).then(sitemapTree => {
      site.sitemapTree = sitemapTree;
      const now = new Date().toISOString();
      const siteObj = {
        uuid: site.id,
        baseUrl: site.baseUrl,
        createDate: now,
        updateDate: now,
        sitemapTree: sitemapTree,
        isDefault: site.isDefault || false
      };
      storeSite(siteObj);
      storeFoldersFromSitemap(site);
      return site;
    });
  });
}

/**
 * Build a JSON sitemap tree for a given site.
 */
function buildSiteSitemap(site) {
  const cleanBaseUrl = site.baseUrl.replace(/\/+$/, "");
  let sitemapUrls = [];
  let typesMapping = {};
  switch (site.type) {
    case "ghost":
      sitemapUrls = [
        cleanBaseUrl + "/sitemap-pages.xml",
        cleanBaseUrl + "/sitemap-posts.xml",
        cleanBaseUrl + "/sitemap-authors.xml",
        cleanBaseUrl + "/sitemap-tags.xml"
      ];
      typesMapping[cleanBaseUrl + "/sitemap-pages.xml"] = "pages";
      typesMapping[cleanBaseUrl + "/sitemap-posts.xml"] = "posts";
      typesMapping[cleanBaseUrl + "/sitemap-authors.xml"] = "authors";
      typesMapping[cleanBaseUrl + "/sitemap-tags.xml"] = "tags";
      break;
    case "wordpress":
      sitemapUrls = [
        cleanBaseUrl + "/wp-sitemap-posts-post-1.xml",
        cleanBaseUrl + "/wp-sitemap-posts-page-1.xml",
        cleanBaseUrl + "/wp-sitemap-taxonomies-category-1.xml",
        cleanBaseUrl + "/wp-sitemap-taxonomies-post_tag-1.xml"
      ];
      typesMapping[cleanBaseUrl + "/wp-sitemap-posts-post-1.xml"] = "posts";
      typesMapping[cleanBaseUrl + "/wp-sitemap-posts-page-1.xml"] = "pages";
      typesMapping[cleanBaseUrl + "/wp-sitemap-taxonomies-category-1.xml"] = "categories";
      typesMapping[cleanBaseUrl + "/wp-sitemap-taxonomies-post_tag-1.xml"] = "post_tags";
      break; 
    default:
      return Promise.reject(new Error("Unknown site type: " + site.type));
  }
  const sitemapPromises = sitemapUrls.map(url => {
    return parseSitemap(url, cleanBaseUrl).then(urlsArray => {
      return { type: typesMapping[url], urls: urlsArray };
    });
  });
  return Promise.all(sitemapPromises).then(results => {
    const sitemapTree = {};
    results.forEach(item => {
      sitemapTree[item.type] = item.urls;
    });
    return sitemapTree;
  });
}

/**
 * Fetch and parse a sitemap XML via proxy.
 */
function parseSitemap(sitemapUrl, baseUrl) {
  return fetch("https://mpantsaka.kahiether.com/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sitemapUrl, action: "FETCH_SITEMAP" })
  })
    .then(response => {
      if (!response.ok) throw new Error("Proxy error fetching sitemap: " + sitemapUrl);
      return response.text();
    })
    .then(xmlString => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "application/xml");
      if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Error parsing XML from " + sitemapUrl);
      }
      const urlElements = xmlDoc.getElementsByTagName("url");
      const urlsArray = [];
      for (let i = 0; i < urlElements.length; i++) {
        const locEl = urlElements[i].getElementsByTagName("loc")[0];
        const lastmodEl = urlElements[i].getElementsByTagName("lastmod")[0];
        const loc = locEl ? locEl.textContent.trim() : null;
        const lastmod = lastmodEl ? lastmodEl.textContent.trim() : null;
        if (loc && loc.startsWith(baseUrl)) {
          urlsArray.push({ url: loc, creationDate: lastmod });
        }
      }
      return urlsArray;
    })
    .catch(error => {
      console.error("Error in parseSitemap for " + sitemapUrl, error);
      return [];
    });
}

/* ------------------- Accordion Sidebar Functions ------------------- */

function buildTree(posts) {
  const tree = {};
  posts.forEach(post => {
    try {
      const urlObj = new URL(post.url);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      let current = tree;
      parts.forEach((part, i) => {
        if (!current[part]) {
          current[part] = { name: part, children: {} };
        }
        if (i === parts.length - 1) {
          current[part].post = post;
        }
        current = current[part].children;
      });
    } catch (e) {
      console.error("Error building tree for URL:", post.url, e);
    }
  });
  return tree;
}

function renderTree(tree, container) {
  const ul = document.createElement("ul");
  for (const key in tree) {
    const node = tree[key];
    const li = document.createElement("li");
    const header = document.createElement("div");
    header.textContent = node.name;
    header.style.cursor = "pointer";
    header.style.fontWeight = "bold";
    header.style.padding = "4px 0";
    li.appendChild(header);
    if (Object.keys(node.children).length > 0) {
      const childContainer = document.createElement("div");
      childContainer.style.display = "none";
      header.addEventListener("click", () => {
        childContainer.style.display = (childContainer.style.display === "none") ? "block" : "none";
      });
      renderTree(node.children, childContainer);
      li.appendChild(childContainer);
    } else if (node.post) {
      header.addEventListener("click", () => {
        loadPostContent(node.post.url);
      });
    }
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

function updateSidebarFromSitemap() {
  const menu = document.getElementById("menu");
  if (!menu) return;
  const filterInput = document.getElementById("menuFilter");
  menu.innerHTML = "";
  if (filterInput) {
    menu.appendChild(filterInput);
  }
  
  // Render the cache trigger button.
  renderCacheTrigger();
  
  const currentSite = sites[selectedSiteIndex];
  if (!currentSite || !currentSite.sitemapTree) return;
  
  const sections = currentSite.sitemapTree;
  for (let section in sections) {
    let items = sections[section]; // Array of { url, creationDate }
    
    // Apply filter if filter input exists.
    if (filterInput && filterInput.value) {
      const filterText = filterInput.value.toLowerCase();
      items = items.filter(item =>
        item.url.toLowerCase().includes(filterText) ||
        (item.creationDate && item.creationDate.toLowerCase().includes(filterText))
      );
    }
    
    const sectionHeader = document.createElement("div");
    sectionHeader.textContent = section.toUpperCase() + " (" + items.length + ")";
    sectionHeader.style.cursor = "pointer";
    sectionHeader.style.fontWeight = "bold";
    sectionHeader.style.padding = "4px 0";
    sectionHeader.classList.add("folder-item");
    
    const itemContainer = document.createElement("div");
    itemContainer.style.display = accordionState[section] ? "block" : "none";
    
    // When user clicks the folder header, toggle display and recheck the folder's documents.
    sectionHeader.addEventListener("click", function() {
      if (itemContainer.style.display === "none") {
        itemContainer.style.display = "block";
        accordionState[section] = true;
        sectionHeader.classList.add("open");
        // Recheck only the documents in this folder.
        recheckFolderDocuments(items);
      } else {
        itemContainer.style.display = "none";
        accordionState[section] = false;
        sectionHeader.classList.remove("open");
      }
    });
    
    const ul = document.createElement("ul");
    items.forEach(item => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      try {
        const urlObj = new URL(item.url);
        a.textContent = (urlObj.pathname && urlObj.pathname !== "/") ? urlObj.pathname : urlObj.hostname;
      } catch (e) {
        a.textContent = item.url;
      }
      a.href = "#";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        loadPostContent(item.url);
      });
      li.appendChild(a);
      
      const statusSpan = document.createElement("span");
      const status = documentCacheStatus[item.url];
      if (status === "success") {
        statusSpan.textContent = " ✅";
      } else if (status === "loading") {
        statusSpan.textContent = " ⚙️";
      } else if (status === "failed") {
        statusSpan.textContent = " ⭕";
      } else {
        statusSpan.textContent = "";
      }
      li.appendChild(statusSpan);
      
      if (item.creationDate) {
        const dateSpan = document.createElement("span");
        dateSpan.textContent = " (" + item.creationDate + ")";
        li.appendChild(dateSpan);
      }
      ul.appendChild(li);
    });
    itemContainer.appendChild(ul);
    menu.appendChild(sectionHeader);
    menu.appendChild(itemContainer);
  }
}

/**
 * Load post content: try loading from IndexedDB first.
 * Data is fetched from the network only if not cached or if forceFetch is true.
 */
function loadPostContent(url, forceFetch = false) {
  const contentArea = document.getElementById("content");
  if (!contentArea) return;
  
  contentArea.innerHTML = "<p>Loading content...</p>";
  
  if (!forceFetch) {
    getDocumentByUrl(url)
      .then(doc => {
        if (doc && doc.content) {
          console.log("Loaded document from IndexedDB:", url);
          documentCacheStatus[url] = "success";
          updateSidebarFromSitemap();
          contentArea.innerHTML = `<h2>${doc.title}</h2>${doc.content}`;
        } else {
          cacheDocument(url);
        }
      })
      .catch(err => {
        console.error("Error retrieving document from cache:", err);
        cacheDocument(url);
      });
  } else {
    cacheDocument(url);
  }
}

/* ------------------- Site Switcher Popup Functions ------------------- */

function updateSiteSwitcherPopup() {
  let popup = document.getElementById("siteSwitcherPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "siteSwitcherPopup";
    applyStyles(popup, siteSwitcherPopupStyles);
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
        // Recheck cached documents for the newly selected site.
        setTimeout(() => {
          recheckCachedDocuments();
        }, 500);
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
    popup.style.display = "block";
  }
}

/* ------------------- Burger Menu Setup ------------------- */

function setupBurgerMenu() {
  const burger = document.createElement("div");
  burger.textContent = "☰";
  applyStyles(burger, burgerButtonStyles);
  const menu = document.createElement("div");
  applyStyles(menu, burgerPopupStyles);
  
  function createButton(text, clickHandler) {
    const button = document.createElement("button");
    button.textContent = text;
    applyStyles(button, popupButtonStyles);
    button.addEventListener('mouseenter', () => {
      button.style.backgroundColor = "#0056b3";
    });
    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = "#007bff";
    });
    button.addEventListener('mousedown', () => {
      button.style.transform = "scale(0.95)";
    });
    button.addEventListener('mouseup', () => {
      button.style.transform = "scale(1)";
    });
    button.addEventListener('click', clickHandler);
    return button;
  }
  
  const switchSiteBtn = createButton("Switch Site", () => {
    showSiteSwitcherPopup();
  });
  const addSiteBtn = createButton("Add Site", () => {
    const sitemapUrl = prompt("Enter the sitemap URL for the new site:");
    if (sitemapUrl) {
      fetchSitemap(sitemapUrl)
        .then(urls => {
          const a = document.createElement("a");
          a.href = sitemapUrl;
          const siteName = a.hostname;
          const newSite = {
            url: sitemapUrl,
            posts: urls.map(url => ({ url: url, title: cleanTitle(url) })),
            isDefault: false,
            name: siteName
          };
          sites.push(newSite);
          selectedSiteIndex = sites.length - 1;
          updateSidebarFromSitemap();
          alert(`Added new site: ${siteName}`);
        })
        .catch(err => {
          console.error("Error adding new site:", err);
          alert("Failed to add site. Please check the URL.");
        });
    }
  });
  const deleteSiteBtn = createButton("Delete Site", () => {
    if (sites[selectedSiteIndex] && sites[selectedSiteIndex].isDefault) {
      alert("Default sites cannot be deleted.");
      return;
    }
    if (confirm(`Are you sure you want to delete site: ${sites[selectedSiteIndex].name || sites[selectedSiteIndex].baseUrl}?`)) {
      sites.splice(selectedSiteIndex, 1);
      if (selectedSiteIndex >= sites.length) selectedSiteIndex = 0;
      updateSidebarFromSitemap();
      alert("Site deleted.");
    }
  });
  
  menu.appendChild(switchSiteBtn);
  menu.appendChild(addSiteBtn);
  menu.appendChild(deleteSiteBtn);
  
  burger.addEventListener("click", () => {
    menu.style.display = (menu.style.display === "none") ? "block" : "none";
  });
  
  document.body.appendChild(burger);
  document.body.appendChild(menu);
}

/**
 * Toggle dark/light mode.
 */
function toggleMode() {
  const body = document.body;
  const toggleElem = document.getElementById("toggleMode");
  if (body.classList.contains("dark")) {
    body.classList.remove("dark");
    body.classList.add("light");
    toggleElem.textContent = "🌑"; 
  } else {
    body.classList.remove("light");
    body.classList.add("dark");
    toggleElem.textContent = "⚪"; 
  }
}

/**
 * Cache a single document offline.
 */
function cacheDocument(url) {
  documentCacheStatus[url] = "loading";
  updateSidebarFromSitemap();
  return fetch("https://mpantsaka.kahiether.com/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: url, action: "FETCH_DOCUMENT" })
  })
    .then(response => {
      if (!response.ok) {
        throw new Error("Proxy error fetching document: " + url);
      }
      return response.text();
    })
    .then(html => {
      const baseUrl = sites[selectedSiteIndex].baseUrl;
      const processedHTML = processHTML(html, baseUrl);
      const sanitizedHTML = sanitizeContent(processedHTML);
      
      const titleMatch = processedHTML.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : url;
      
      let path = "";
      let depth = 0;
      try {
        const urlObj = new URL(url);
        path = urlObj.pathname;
        depth = path.split('/').filter(Boolean).length;
      } catch (e) {
        console.error("Error parsing URL for document", url, e);
      }
      
      const docObj = {
        uuid: generateUUID(),
        originalUrl: url,
        content: sanitizedHTML,
        title: title,
        path: path,
        depth: depth,
        createDate: new Date().toISOString(),
        updateDate: new Date().toISOString()
      };
      
      return storeDocument(docObj);
    })
    .then(() => {
      documentCacheStatus[url] = "success";
      updateSidebarFromSitemap();
    })
    .catch(err => {
      console.error("Error caching document:", url, err);
      documentCacheStatus[url] = "failed";
      updateSidebarFromSitemap();
    });
}

/**
 * Cache all documents from the current site's sitemap tree.
 */
function cacheAllDocuments() {
  cachingInProgress = true;
  renderCacheTrigger();
  const currentSite = sites[selectedSiteIndex];
  if (!currentSite || !currentSite.sitemapTree) {
    cachingInProgress = false;
    renderCacheTrigger();
    return;
  }
  const sections = currentSite.sitemapTree;
  const promises = [];
  for (let section in sections) {
    const items = sections[section];
    items.forEach(item => {
      if (!documentCacheStatus[item.url] || documentCacheStatus[item.url] !== "success") {
        promises.push(cacheDocument(item.url));
      }
    });
  }
  Promise.all(promises).then(() => {
    cachingInProgress = false;
    renderCacheTrigger();
    updateSidebarFromSitemap();
  });
}

/**
 * Sanitize HTML content.
 */
function sanitizeContent(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("img").forEach(el => {
    const altText = el.alt || "Image";
    const placeholder = document.createElement("span");
    placeholder.textContent = `[${altText}]`;
    el.parentNode.replaceChild(placeholder, el);
  });
  doc.querySelectorAll("video").forEach(el => {
    const placeholder = document.createElement("span");
    placeholder.textContent = `[Video]`;
    el.parentNode.replaceChild(placeholder, el);
  });
  doc.querySelectorAll("audio").forEach(el => {
    const placeholder = document.createElement("span");
    placeholder.textContent = `[Audio]`;
    el.parentNode.replaceChild(placeholder, el);
  });
  doc.querySelectorAll("svg").forEach(el => {
    const placeholder = document.createElement("span");
    placeholder.textContent = `[SVG]`;
    el.parentNode.replaceChild(placeholder, el);
  });
  doc.querySelectorAll("a").forEach(el => {
    const href = el.getAttribute("href");
    if (href && (href.endsWith('.pdf') || href.endsWith('.doc') || href.endsWith('.docx') ||
                 href.endsWith('.xls') || href.endsWith('.xlsx'))) {
      const replacement = document.createElement("span");
      replacement.textContent = `[File: ${href}]`;
      el.parentNode.replaceChild(replacement, el);
    } else {
      el.removeAttribute("href");
    }
  });
  return doc.body.innerHTML;
}

/**
 * Load Site Data: Use cached data if available; otherwise, fetch fresh data.
 */
function loadSiteData(site) {
  return getSite(site.id).then(cachedSite => {
    if (cachedSite && cachedSite.sitemapTree) {
      console.log("Loaded site from cache:", site.id);
      site.sitemapTree = cachedSite.sitemapTree;
      return site;
    } else {
      return navigator.onLine ? fetchSiteDataViaProxy(site) : site;
    }
  }).catch(err => {
    console.error("Error loading site data for", site.id, err);
    return buildSiteSitemap(site).then(sitemapTree => {
      site.sitemapTree = sitemapTree;
      const now = new Date().toISOString();
      const siteObj = {
        uuid: site.id,
        baseUrl: site.baseUrl,
        createDate: now,
        updateDate: now,
        sitemapTree: sitemapTree,
        isDefault: site.isDefault || false
      };
      storeSite(siteObj);
      storeFoldersFromSitemap(site);
      return site;
    });
  });
}

/**
 * Extract folder information from the site's sitemap tree and store in IndexedDB.
 */
function storeFoldersFromSitemap(site) {
  if (!site.sitemapTree) return;
  Object.keys(site.sitemapTree).forEach(section => {
    site.sitemapTree[section].forEach(item => {
      try {
        const urlObj = new URL(item.url);
        const path = urlObj.pathname;
        const pathParts = path.split('/').filter(Boolean);
        const folder = {
          uuid: generateUUID(),
          siteId: site.id,
          url: item.url,
          path: path,
          depth: pathParts.length,
          createDate: new Date().toISOString(),
          updateDate: new Date().toISOString()
        };
        storeFolder(folder);
      } catch (error) {
        console.error("Error creating folder for", item.url, error);
      }
    });
  });
}

/**
 * Retrieve all folder records for a given site.
 */
function getFoldersBySite(siteId) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([FOLDER_STORE], "readonly");
      const store = transaction.objectStore(FOLDER_STORE);
      const index = store.index("siteId");
      const request = index.getAll(siteId);
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  });
}

// Filter sidebar items.
function filterSidebarItems() {
  const filterInput = document.getElementById("menuFilter");
  const filterText = filterInput ? filterInput.value : "";
  const items = document.querySelectorAll("#menu ul li");
  let regex;
  try {
    regex = new RegExp(filterText, "i");
  } catch (e) {
    regex = null;
  }
  items.forEach(function(li) {
    const text = li.textContent;
    li.style.display = regex ? (regex.test(text) ? "" : "none") : (text.toLowerCase().includes(filterText.toLowerCase()) ? "" : "none");
  });
}

// Force an update from the server.
function forceUpdateVersion() {
  fetch("version.txt", { cache: "no-store" })
    .then(function(response) {
      if (!response.ok) throw new Error("Network error while fetching version info.");
      return response.text();
    })
    .then(function(serverVersion) {
      location.reload();
    })
    .catch(function(error) {
      alert("Unable to update version: no network available.");
    });
}

// Proxy function to update data via proxy. (Triggered by the ▶️ button)
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
      storeFoldersFromSitemap(currentSite);
      cacheAllDocuments();
    })
    .catch(error => {
      console.error("Proxy update error:", error);
    })
    .finally(() => {
      cachingInProgress = false;
      renderCacheTrigger();
    });
}

// Proxy function to fetch site data via proxy.
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
      storeFoldersFromSitemap(site);
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


function recheckCachedDocuments() {
  const currentSite = sites[selectedSiteIndex];
  if (!currentSite || !currentSite.sitemapTree) {
    console.log("No current site or sitemapTree available for recheck.");
    return;
  }
  
  // Collect all URLs from the current site's sitemap tree.
  const urls = [];
  const sections = currentSite.sitemapTree;
  for (let section in sections) {
    sections[section].forEach(item => {
      urls.push(item.url);
    });
  }
  console.log("Rechecking cached documents for URLs:", urls);
  
  // Recheck each document
  const promises = urls.map(url => {
    return getDocumentByUrl(url)
      .then(doc => {
        if (doc && doc.content) {
          documentCacheStatus[url] = "success";
        } else {
          documentCacheStatus[url] = "notFound";
        }
      })
      .catch(err => {
        console.error("Error rechecking document:", url, err);
        documentCacheStatus[url] = "failed";
      });
  });
  
  Promise.all(promises).then(() => {
    console.log("Recheck complete. documentCacheStatus:", documentCacheStatus);
    updateSidebarFromSitemap();
  });
}

function recheckFolderDocuments(items) {
  const promises = items.map(item => {
    return getDocumentByUrl(item.url)
      .then(doc => {
        if (doc && doc.content) {
          documentCacheStatus[item.url] = "success";
        } else {
          documentCacheStatus[item.url] = "notFound";
        }
      })
      .catch(err => {
        console.error("Error rechecking document:", item.url, err);
        documentCacheStatus[item.url] = "failed";
      });
  });
  Promise.all(promises).then(() => {
    // After checking, re-render the sidebar (or update only the folder's DOM if you prefer)
    updateSidebarFromSitemap();
  });
}

