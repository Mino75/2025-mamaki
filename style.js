(function(){
  // Prevent reloading if already loaded.
  if (window.__STYLE_JS_LOADED__) return;
  window.__STYLE_JS_LOADED__ = true;

  const globalCSS = `
    /* Universal box-sizing */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    :root {
      --primary-blue: #007bff;
      --primary-blue-dark: #0056b3;
      --primary-blue-hover: #3700b3;
      --sidebar-width: 300px;
    }

    /* Global CSS */
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      transition: background-color 0.3s ease, color 0.3s ease;
      overflow-x: hidden; /* Prevent horizontal scrolling */
    }
    body.dark {
      background-color: #121212;
      color: #e0e0e0;
    }
    body.light {
      background-color: #f0f0f0;
      color: #121212;
    }
    
    /* Header styling with wrapping */
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background-color: #1e1e1e;
      color: #fff;
      width: 100%;
    }
    body.light header {
      background-color: #fff;
      color: #121212;
    }
    /* If using a pseudo-element to append site name, ensure h1 has a data-site attribute */
    header h1::after {
      content: attr(data-site);
      font-size: 0.8em;
      margin-left: 10px;
      color: var(--primary-blue);
    }
    /* Ensure header controls align and wrap if needed */
    header > div {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }

    .container {
      display: flex;
      flex-wrap: wrap;
    }

    nav#menu {
      flex: 0 0 var(--sidebar-width);
      max-width: var(--sidebar-width);
      padding: 1rem;
      border-right: 1px solid #444;
      overflow-y: auto;
      background-color: inherit;
      color: var(--primary-blue);
    }
    body.light nav#menu {
      border-right: 1px solid #ccc;
    }
    nav#menu ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    nav#menu li {
      margin-bottom: 0.5rem;
      padding: 0.25rem 0;
    }
    
    /* Filter input style */
    #menuFilter {
      font-size: 1rem;
      padding: 0.5rem 0.75rem;
      width: 90%;
      margin: 0.5rem auto;
      display: block;
      border: 1px solid #ccc;
      border-radius: 4px;
    }
    
    /* Update Version Button style */
    #updateVersion {
      font-size: 1rem;
      padding: 0.5rem 1rem;
      background-color: var(--primary-blue);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.3s ease, transform 0.1s ease;
      margin-left: 1rem;
    }
    #updateVersion:hover {
      background-color: var(--primary-blue-dark);
    }
    #updateVersion:active {
      transform: scale(0.98);
    }
    
    /* Site items (bullet point) */
    .site-item::before {
      content: "•";
      color: var(--primary-blue);
      margin-right: 5px;
    }
    
    /* Folder items (triangle icon) */
    .folder-item::before {
      content: "";
      display: inline-block;
      margin-right: 5px;
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 8px solid var(--primary-blue);
      transition: transform 0.3s ease;
    }
    .folder-item.open::before {
      transform: rotate(90deg);
    }
    
    nav#menu a {
      text-decoration: none;
      color: inherit;
      display: block;
      padding: 0.5rem;
      border-radius: 4px;
      transition: background-color 0.3s ease;
    }
    nav#menu a:hover {
      background-color: rgba(0, 0, 0, 0.1);
    }
    body.light nav#menu a:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    main#content {
      flex: 1;
      padding: 1rem;
    }
    
    /* Hide pagination controls (removed) */
    #pagination {
      display: none;
    }
    
    /* Cache/update info indicator */
    #cacheInfo {
      font-size: 0.8em;
      color: var(--primary-blue);
      margin-top: 0.5rem;
    }
    
    /* Responsive adjustments for mobile devices */
    @media (max-width: 600px) {
      body {
        font-size: 14px;
      }
      header h1 {
        font-size: 1.4em;
        padding: 0.5rem;
      }
      nav#menu {
        flex: 0 0 100%;
        max-width: 100%;
        padding: 0.5rem;
        border-right: none;
        border-bottom: 1px solid #444;
      }
      body.light nav#menu {
        border-bottom: 1px solid #ccc;
      }
      nav#menu a {
        padding: 0.5rem 0.5rem;
        font-size: 0.9em;
      }
      #menuFilter {
        width: 95%;
        font-size: 0.9em;
        padding: 0.4rem 0.5rem;
      }
      main#content {
        padding: 0.5rem;
        font-size: 0.95em;
      }
      header > div {
        flex-direction: row;
        align-items: center;
      }
      #toggleMode, #updateVersion {
        font-size: 1.5rem;
        padding: 0.4rem 0.8rem;
      }
    }
    
    /* Always display the burger menu on all devices */
    #burger-menu,
    #burgerButton {
      display: block !important;
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
    }
  `;

  const styleEl = document.createElement("style");
  styleEl.type = "text/css";
  styleEl.textContent = globalCSS;
  document.head.appendChild(styleEl);

  // --- Helper Function for Applying Styles ---
  window.applyStyles = function(element, styles) {
    Object.assign(element.style, styles);
  };

  // --- Style Objects for Burger Menu & Popup ---
  window.burgerButtonStyles = {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    fontSize: "24px",
    cursor: "pointer",
    zIndex: "1000",
    backgroundColor: "transparent",
    color: "var(--primary-blue)",
    width: "50px",
    height: "50px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px solid var(--primary-blue)",
    borderRadius: "50%",
    transition: "transform 0.2s ease"
  };

  window.burgerPopupStyles = {
    position: "fixed",
    bottom: "70px",
    right: "20px",
    backgroundColor: "transparent",
    border: "none",
    padding: "0",
    display: "none",
    zIndex: "1000"
  };

  window.popupButtonStyles = {
    display: "block",
    marginBottom: "10px",
    backgroundColor: "var(--primary-blue)",
    color: "#fff",
    border: "2px solid var(--primary-blue)",
    borderRadius: "5px",
    padding: "5px 10px",
    cursor: "pointer",
    transition: "background-color 0.3s ease, transform 0.1s ease"
  };

  window.siteSwitcherPopupStyles = {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    backgroundColor: "#fff",
    border: "1px solid #ccc",
    padding: "1rem",
    zIndex: "2000",
    display: "none"
  };

})();
