/*************** MAIN.JS ******************/

// Global variables
let sites = []; // Each site: { id, identifier, baseUrl, sitemapPath, type, name, sitemapTree }
let selectedSiteIndex = 0;
let lastUpdateTimestamp = null;

// *** ADDED: Global object to preserve the open/closed state of each accordion section
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
 * If caching is in progress, the trigger is not displayed.
 */
function renderCacheTrigger() {
  const menu = document.getElementById("menu");
  if (!menu) return;
  // Remove any existing trigger container (button + timestamp)
  const existingContainer = document.getElementById("cacheTriggerContainer");
  if (existingContainer) {
    existingContainer.remove();
  }
  if (cachingInProgress) return;
  
  // Create a container for the button and the timestamp
  const container = document.createElement("div");
  container.id = "cacheTriggerContainer";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.gap = "0.5rem";
  
  // Create the trigger element.
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
  // 1. Check for a saved theme preference in localStorage and apply it.
  const storedTheme = localStorage.getItem("theme");
  const body = document.body;
  const toggleElem = document.getElementById("toggleMode");
  
  if (storedTheme) {
    // Remove any existing theme classes and add the stored theme.
    body.classList.remove("dark", "light");
    body.classList.add(storedTheme);
    // Set the toggle emoji based on the theme:
    // When in dark mode, we want to show the sun emoji (⚪) so that the user can switch to light.
    // When in light mode, we want to show the moon emoji (🌑) so that the user can switch to dark.
    toggleElem.textContent = storedTheme === "dark" ? "⚪" : "🌑";
  } else {
    // If no preference is stored, set a default (e.g., dark mode).
    body.classList.add("dark");
    toggleElem.textContent = "⚪";
    localStorage.setItem("theme", "dark");
  }

  // 2. Now load the default sites.
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

//6 Attach an Event Listener for the Update Button
const updateVersionButton = document.getElementById("updateVersion");
if (updateVersionButton) {
  updateVersionButton.addEventListener("click", forceUpdateVersion);
}

/* ------------------- Basic UI Functions ------------------- */



/**
 * Get the posts array from the currently selected site's sitemap tree.
 * (Assumes the "posts" key holds the main URLs to display.)
 */
function getCurrentSitePosts() {
  if (sites[selectedSiteIndex] && sites[selectedSiteIndex].sitemapTree) {
    return sites[selectedSiteIndex].sitemapTree.posts || [];
  }
  return [];
}

// *** ADDED: Debounce utility to limit how frequently a function is called.
function debounce(func, wait) {
  let timeout;
  return function () {
    clearTimeout(timeout);
    timeout = setTimeout(func, wait);
  };
}

// *** ADDED: Update header title with current site name.
function updateHeaderTitle() {
  const header = document.getElementById("headerTitle");
  if (header && sites[selectedSiteIndex]) {
    let baseUrl = sites[selectedSiteIndex].baseUrl;
    // Remove protocol and "www." then remove the last extension (e.g., ".com")
    baseUrl = baseUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");
    baseUrl = baseUrl.replace(/\.[^.]+$/, "");
    header.textContent = "Mamaki Content Manager - " + baseUrl;
  }
}




/**
 * Process the retrieved HTML so that:
 * - For <img>, <video>, <audio> and their <source> elements, remove the src attribute and
 *   store the relative URL (derived from the given baseUrl) in a data attribute.
 * - For elements with a "srcset" attribute, remove all occurrences of baseUrl from the value,
 *   store the result in a data-srcset attribute, and remove the original srcset.
 * - For inline styles containing background-image URLs, remove the URL and store the relative path in a data-bg attribute.
 * - For <a> elements, if the href begins with baseUrl, convert it to a relative URL.
 *
 * @param {string} html - The raw HTML string.
 * @param {string} baseUrl - The base URL of the site.
 * @returns {string} - The processed HTML string.
 */
function processHTML(html, baseUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Process <img> elements
  doc.querySelectorAll("img").forEach(img => {
    if (img.hasAttribute("src")) {
      try {
        const urlObj = new URL(img.getAttribute("src"), baseUrl);
        img.setAttribute("data-src", urlObj.pathname);
      } catch (e) { }
      img.removeAttribute("src");
    }
  });

  // Process elements with a "srcset" attribute
  doc.querySelectorAll("[srcset]").forEach(elem => {
    const srcsetVal = elem.getAttribute("srcset");
    if (srcsetVal) {
      // Escape the baseUrl to safely use it in a RegExp
      const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escapedBase, 'g');
      // Replace occurrences of baseUrl with an empty string (i.e. keep only the relative portion)
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

  // Process inline styles for background-image URLs.
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

  // Process <a> elements: if href starts with baseUrl, convert it to a relative URL.
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
function loadDefaultSitesFromJSON() {
  fetch('default-sites.json')
    .then(response => {
      if (!response.ok) throw new Error('Failed to load default sites.');
      return response.json();
    })
    .then(data => {
      // Mark each site as default
      const sitesArray = data.defaultSites.map(site => {
        site.isDefault = true;
        return site;
      });
      const now = new Date().toISOString();
      const promises = sitesArray.map(site => loadSiteData(site));
      return Promise.all(promises);
    })
    .then(results => {
      sites = results;
      selectedSiteIndex = 0;
      updateSiteSwitcherPopup();
      updateHeaderTitle();
      updateSidebarFromSitemap();
      // any additional logic you want to run after loading sites
    })
    .catch(err => {
      console.error("Error loading default sites:", err);
    });
}


/**
 * Build a JSON sitemap tree for a given site.
 * Uses a switch-case based on site.type ("ghost" or "wordpress") to determine which sitemap URLs to fetch.
 * Returns a Promise that resolves to an object keyed by sitemap type.
 * @param {Object} site - A site object from default-sites.json.
 * @returns {Promise<Object>}
 */
function buildSiteSitemap(site) {
  // Remove trailing slashes from the base URL
  const cleanBaseUrl = site.baseUrl.replace(/\/+$/, "");
  
  let sitemapUrls = [];
  let typesMapping = {}; // Map each sitemap URL to its type
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
        cleanBaseUrl + "/wp-sitemap-taxonomies-post_tag-1.xml",
       // cleanBaseUrl + "/wp-sitemap-users-1.xml" // not safe
      ];
      typesMapping[cleanBaseUrl + "/wp-sitemap-posts-post-1.xml"] = "posts";
      typesMapping[cleanBaseUrl + "/wp-sitemap-posts-page-1.xml"] = "pages";
      typesMapping[cleanBaseUrl + "/wp-sitemap-taxonomies-category-1.xml"] = "categories";
      typesMapping[cleanBaseUrl + "/wp-sitemap-taxonomies-post_tag-1.xml"] = "post_tags";
//      typesMapping[cleanBaseUrl + "/wp-sitemap-users-1.xml"] = "users"; // not safe
      break; 
    default:
      return Promise.reject(new Error("Unknown site type: " + site.type));
  }
  // For each sitemap URL, fetch and parse it via the proxy.
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
 * Fetch and parse a sitemap XML from a given URL.
 * Returns an array of objects: { url, creationDate }.
 * @param {string} sitemapUrl - The full URL to the sitemap.
 * @param {string} baseUrl - The base URL for filtering.
 * @returns {Promise<Array>}
 */
function parseSitemap(sitemapUrl, baseUrl) {
 // Send the request to the proxy instead of directly to the sitemap URL.
 return fetch("https://mpantsaka.kahiether.com/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: sitemapUrl,
    action: "FETCH_SITEMAP" // You can adjust this if your proxy expects a different action.
  })
})
  .then(response => {
    if (!response.ok) {
      throw new Error("Proxy error fetching sitemap: " + sitemapUrl);
    }
    // Assuming the proxy returns the raw XML as text.
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
    // Optionally, return an empty array if there was an error.
    return [];
  });
}
/* ------------------- Accordion Sidebar Functions ------------------- */

/**
 * Build a tree from a flat list of posts.
 * Each post's URL is split by '/' (ignoring empty parts) to create nested nodes.
 * @param {Array} posts - Array of post objects { url, title, creationDate }.
 * @returns {Object} - A tree object.
 */
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
          // Leaf node: store the post
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

/**
 * Render the tree as an accordion inside the container.
 * Parent nodes toggle the display of their children.
 * @param {Object} tree - The tree object.
 * @param {HTMLElement} container - The container element.
 */
function renderTree(tree, container) {
  const ul = document.createElement("ul");
  for (const key in tree) {
    const node = tree[key];
    const li = document.createElement("li");
    // Create header for this node.
    const header = document.createElement("div");
    header.textContent = node.name;
    header.style.cursor = "pointer";
    header.style.fontWeight = "bold";
    header.style.padding = "4px 0";
    li.appendChild(header);
    // If node has children, create a container for them.
    if (Object.keys(node.children).length > 0) {
      const childContainer = document.createElement("div");
      childContainer.style.display = "none";
      header.addEventListener("click", () => {
        childContainer.style.display = (childContainer.style.display === "none") ? "block" : "none";
      });
      renderTree(node.children, childContainer);
      li.appendChild(childContainer);
    } else if (node.post) {
      // If leaf node with a post, clicking header loads the post.
      header.addEventListener("click", () => {
        loadPostContent(node.post.url);
      });
    }
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

/**
 * Update the sidebar by building an accordion menu from the current site's sitemap tree.
 * This function iterates over all sections in the sitemap tree and for each item,
 * it adds a status indicator: ✅ (success), ⚙️ (loading), or ⭕ (failed).
 */
function updateSidebarFromSitemap() {
  const menu = document.getElementById("menu");
  if (!menu) return;
  // Preserve the filter input element if present.
  const filterInput = document.getElementById("menuFilter");
  menu.innerHTML = "";
  if (filterInput) {
    menu.appendChild(filterInput);
  }
  
  // Render the cache trigger button (it will not be added if cachingInProgress is true)
  renderCacheTrigger();
  
  const currentSite = sites[selectedSiteIndex];
  if (!currentSite || !currentSite.sitemapTree) return;
  
  // For each section in the sitemap tree (e.g., posts, pages, authors, etc.)
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
    
    // Create a section header with the section name and count.
    const sectionHeader = document.createElement("div");
    sectionHeader.textContent = section.toUpperCase() + " (" + items.length + ")";
    sectionHeader.style.cursor = "pointer";
    sectionHeader.style.fontWeight = "bold";
    sectionHeader.style.padding = "4px 0";
    sectionHeader.classList.add("folder-item");

    // Create a container for the items; initially hidden.
    const itemContainer = document.createElement("div");
    // *** MODIFIED: Set display based on saved state (default closed)
    itemContainer.style.display = accordionState[section] ? "block" : "none";
    sectionHeader.addEventListener("click", function() {
      if (itemContainer.style.display === "none") {
        itemContainer.style.display = "block";
        accordionState[section] = true;
        sectionHeader.classList.add("open"); // Add open class when opened
      } else {
        itemContainer.style.display = "none";
        accordionState[section] = false;
        sectionHeader.classList.remove("open"); // Remove open class when closed
      }
    });
    
    // Create a list for items.
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
      // Create a status span based on documentCacheStatus.
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
      // Append creation date if available.
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
 * Load post content.
 * By default, try loading from IndexedDB first.
 * If not found or if forceFetch is true, fetch from the network.
 * @param {string} url - The URL of the document.
 * @param {boolean} [forceFetch=false] - If true, bypass cache and fetch fresh data.
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
          // Mark this document as successfully loaded
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
    // Force a network fetch.
    cacheDocument(url);
  }
}



/* ------------------- Site Switcher Popup Functions ------------------- */

/**
 * Update the site switcher popup with a list of available sites.
 * Each button shows the site name (or base URL if name undefined) and its base URL.
 */
/**
 * Update the site switcher popup with a list of available sites.
 * Each site button displays the site name (or baseUrl if name is undefined) along with its base URL.
 */
function updateSiteSwitcherPopup() {
  let popup = document.getElementById("siteSwitcherPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "siteSwitcherPopup";
    // Use the style object from style.js
    applyStyles(popup, siteSwitcherPopupStyles);
    document.body.appendChild(popup);
  }
  popup.innerHTML = "<h3>Select a Site</h3>";
  const ul = document.createElement("ul");
  sites.forEach((site, index) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    // Use site.name if defined; otherwise, use site.baseUrl
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

/**
 * Show the site switcher popup.
 */
function showSiteSwitcherPopup() {
  const popup = document.getElementById("siteSwitcherPopup");
  if (popup) {
    popup.style.display = "block";
  }
}

/* ------------------- Burger Menu Setup ------------------- */

/**
 * Set up the burger menu for site management.
 */
function setupBurgerMenu() {
  // Create the burger button.
  const burger = document.createElement("div");
  burger.textContent = "☰";
  applyStyles(burger, burgerButtonStyles);
  // Create the popup container.
  const menu = document.createElement("div");
  applyStyles(menu, burgerPopupStyles);
  
  // Helper to create a styled button.
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
  
  // "Switch Site" button – shows the site switcher popup.
  const switchSiteBtn = createButton("Switch Site", () => {
    showSiteSwitcherPopup();
  });
  // "Add Site" button.
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
  // "Delete Site" button.
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
  
  // Append the buttons to the burger popup.
  menu.appendChild(switchSiteBtn);
  menu.appendChild(addSiteBtn);
  menu.appendChild(deleteSiteBtn);
  
  // Toggle popup display when the burger button is clicked.
  burger.addEventListener("click", () => {
    menu.style.display = (menu.style.display === "none") ? "block" : "none";
  });
  
  // Append the burger button and popup container to the document body.
  document.body.appendChild(burger);
  document.body.appendChild(menu);
}




/**
 * Toggle dark/light mode using a clickable emoji.
 * If the page is currently in dark mode, switch to light mode and update the emoji accordingly.
 */
function toggleMode() {
  const body = document.body;
  const toggleElem = document.getElementById("toggleMode");
  if (body.classList.contains("dark")) {
    body.classList.remove("dark");
    body.classList.add("light");
    // When switching to light mode, display the moon emoji so the user can switch back.
    toggleElem.textContent = "🌑"; 
  } else {
    body.classList.remove("light");
    body.classList.add("dark");
    // When switching to dark mode, display the sun emoji so the user can switch to light.
    toggleElem.textContent = "⚪"; 
  }
}

/**
 * Cache a single document offline.
 * Updates documentCacheStatus for the URL and then calls storeDocument from db.js.
 * @param {string} url - The URL of the document.
 * @returns {Promise} - Resolves when caching is complete.
 */
function cacheDocument(url) {
  documentCacheStatus[url] = "loading";
  updateSidebarFromSitemap(); // update status in sidebar

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
      
      // Create a document object with a UUID.
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
 * Sets a global flag to disable the caching trigger during the process.
 */
function cacheAllDocuments() {
  cachingInProgress = true;
  renderCacheTrigger(); // This will hide the trigger
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
 * Sanitize HTML content so that non-text elements (media, file links, etc.)
 * are replaced with a textual placeholder while preserving the rest of the HTML structure.
 * This returned string is valid HTML and can be rendered with innerHTML.
 */
function sanitizeContent(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Replace images with a placeholder.
  doc.querySelectorAll("img").forEach(el => {
    const altText = el.alt || "Image";
    const placeholder = document.createElement("span");
    placeholder.textContent = `[${altText}]`;
    el.parentNode.replaceChild(placeholder, el);
  });

  // Replace video elements.
  doc.querySelectorAll("video").forEach(el => {
    const placeholder = document.createElement("span");
    placeholder.textContent = `[Video]`;
    el.parentNode.replaceChild(placeholder, el);
  });

  // Replace audio elements.
  doc.querySelectorAll("audio").forEach(el => {
    const placeholder = document.createElement("span");
    placeholder.textContent = `[Audio]`;
    el.parentNode.replaceChild(placeholder, el);
  });

  // Replace SVG elements.
  doc.querySelectorAll("svg").forEach(el => {
    const placeholder = document.createElement("span");
    placeholder.textContent = `[SVG]`;
    el.parentNode.replaceChild(placeholder, el);
  });

  // Replace file or PDF links – if the href ends with a known file extension.
  doc.querySelectorAll("a").forEach(el => {
    const href = el.getAttribute("href");
    if (href && (href.endsWith('.pdf') || href.endsWith('.doc') || href.endsWith('.docx') ||
                 href.endsWith('.xls') || href.endsWith('.xlsx'))) {
      const replacement = document.createElement("span");
      replacement.textContent = `[File: ${href}]`;
      el.parentNode.replaceChild(replacement, el);
    } else {
      // For normal hyperlinks, you might simply remove the href attribute,
      // or if you want to keep the link text, leave the element as is.
      el.removeAttribute("href");
    }
  });

  // Return the resulting HTML (preserving the HTML structure).
  return doc.body.innerHTML;
}

/**
 * Load Site Data
 */

function loadSiteData(site) {
  return getSite(site.id).then(cachedSite => {
    if (cachedSite && cachedSite.sitemapTree) {
      console.log("Loaded site from cache:", site.id);
      site.sitemapTree = cachedSite.sitemapTree;
      // Instead of pre-caching everything, just return the cached site.
      return site;
    } else {
      // If there's no cached sitemap, update only if online.
      return navigator.onLine ? fetchSiteDataViaProxy(site) : site;
    }
  }).catch(err => {
    console.error("Error loading site data for", site.id, err);
    // Fallback using local logic
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
 * Retrieves a document from the "documents" IndexedDB store by matching its originalUrl.
 * This function uses the index on "originalUrl" (if created) to efficiently find the document
 * corresponding to the provided URL.
 *
 * @param {string} url - The URL of the document to retrieve.
 * @returns {Promise<Object|null>} - A promise that resolves to the document object if found, or null otherwise.
 */
function getDocumentByUrl(url) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["documents"], "readonly");
      const store = transaction.objectStore("documents");
      // Use the index on "originalUrl" if you've created it,
      // otherwise, you can scan the store with a cursor.
      // Here’s an example using the index:
      const index = store.index("originalUrl");
      const request = index.get(url);
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  });
}

/**
 * Extracts folder information from a site's sitemap tree and stores each folder in IndexedDB.
 * Each folder represents a navigational unit (e.g., a section or a specific URL path) derived from the sitemap.
 *
 * The function iterates over each section (such as "posts", "pages", etc.) in the site's sitemapTree.
 * For every URL in the sitemap, it creates a folder object with properties such as:
 * - uuid: A unique identifier generated via generateUUID()
 * - siteId: The ID of the site this folder belongs to
 * - url: The full URL of the page/section
 * - path: The relative URL (pathname)
 * - depth: The number of subdirectories (calculated from the pathname)
 * - createDate & updateDate: Timestamps for record creation and update
 *
 * After creating each folder object, it calls storeFolder() to save it in IndexedDB.
 *
 * @param {Object} site - The site object containing at least the properties `id`, `sitemapTree`, and `baseUrl`.
 */

function storeFoldersFromSitemap(site) {
  if (!site.sitemapTree) return;
  
  // Example: assume site.sitemapTree has keys like "posts", "pages", etc.
  Object.keys(site.sitemapTree).forEach(section => {
    site.sitemapTree[section].forEach(item => {
      try {
        const urlObj = new URL(item.url);
        const path = urlObj.pathname;
        const pathParts = path.split('/').filter(Boolean);
        const folder = {
          uuid: generateUUID(),
          siteId: site.id,            // Associate this folder with the site
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
 * Retrieves all folder records associated with a given site from IndexedDB.
 *
 * This function assumes that you have created an index on the 'siteId' property in your folder store.
 * It opens a read-only transaction on the "folders" object store and queries the index for all records
 * that match the provided siteId.
 *
 * @param {string} siteId - The unique identifier of the site for which to retrieve folders.
 * @returns {Promise<Array>} - A promise that resolves to an array of folder objects corresponding to the site.
 */

function getFoldersBySite(siteId) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([FOLDER_STORE], "readonly");
      const store = transaction.objectStore(FOLDER_STORE);
      // If you create an index on siteId, you can query it directly.
      const index = store.index("siteId");
      const request = index.getAll(siteId);
      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  });
}


// *** ADDED: Function to filter sidebar items without re-rendering the entire list.
function filterSidebarItems() {
  const filterInput = document.getElementById("menuFilter");
  const filterText = filterInput ? filterInput.value : "";
  // Assume all our sidebar items are inside the #menu element (except the filter input)
  const items = document.querySelectorAll("#menu ul li");
  let regex;
  try {
    // Create a regular expression from the filter text (case-insensitive)
    regex = new RegExp(filterText, "i");
  } catch (e) {
    // If invalid, leave regex undefined and use simple substring matching.
    regex = null;
  }
  items.forEach(function(li) {
    const text = li.textContent;
    let show = false;
    if (regex) {
      show = regex.test(text);
    } else {
      show = text.toLowerCase().includes(filterText.toLowerCase());
    }
    li.style.display = show ? "" : "none";
  });
}



// *** ADDED: Function to force an update from the server.
function forceUpdateVersion() {
  // Try fetching a version file from the server.
  fetch("version.txt", { cache: "no-store" })
    .then(function(response) {
      if (!response.ok) {
        throw new Error("Network error while fetching version info.");
      }
      return response.text();
    })
    .then(function(serverVersion) {
      // Optionally, compare serverVersion with a locally stored version.
      // For simplicity, if the fetch succeeds, reload the page.
      location.reload();
    })
    .catch(function(error) {
      alert("Unable to update version: no network available.");
    });
}


//** Proxy function

function updateDataViaProxy() {
  if (!navigator.onLine) {
    console.log("Offline: Skipping updateDataViaProxy");
    return Promise.resolve(); // or simply return if you don't need a promise
  }

  cachingInProgress = true;
  renderCacheTrigger(); // Hide the trigger while updating.

  const currentSite = sites[selectedSiteIndex];
  
  // Use the buildSiteSitemap function to update the sitemapTree.
  buildSiteSitemap(currentSite)
    .then(sitemapTree => {
      console.log("Proxy update complete via buildSiteSitemap:", sitemapTree);
      currentSite.sitemapTree = sitemapTree;
      // Update last update timestamp
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



//** Proxy function
function fetchSiteDataViaProxy(site) {
  if (!navigator.onLine) {
    console.log("Offline: Using cached site data for", site.baseUrl);
    return Promise.resolve(site);
  }
  
  cachingInProgress = true;
  renderCacheTrigger(); // Hides the ▶️ button

  // Instead of calling the proxy directly expecting JSON,
  // use the sitemap builder that calls parseSitemap() via the proxy.
  return buildSiteSitemap(site)
    .then(sitemapTree => {
      site.sitemapTree = sitemapTree;
      // Store the site along with the isDefault flag.
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
