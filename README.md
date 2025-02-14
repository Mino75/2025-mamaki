# Mamaki Content Manager

Mamaki Content Manager is an offline-first web application built with Node.js and modern browser APIs. It fetches and caches website sitemaps and document content into IndexedDB, allowing users to browse and search content even when offline. The app features an accordion sidebar for navigation, a dark/light theme toggle, and an update mechanism for re‑caching content when needed.

## Features

- **Offline-first Design:**  
  Caches site sitemaps and documents using IndexedDB so that content is available without an Internet connection.

- **Accordion Sidebar Navigation:**  
  Displays posts, pages, authors, and other site sections in an accordion menu with real-time filtering.

- **Instant Filter:**  
  Allows you to filter through the displayed list of items without re‑rendering the entire sidebar.

- **Dark/Light Mode Toggle:**  
  Switch between dark and light themes seamlessly.

- **Update Version Button:**  
  A dedicated "Update Version" button checks for a new version (if the network is available) and forces an update of cached content.

- **Responsive Design:**  
  The UI adjusts for various screen sizes, ensuring a good experience on mobile devices and desktops.

- **Service Worker:**  
  Uses a service worker to cache static assets for offline use and faster load times.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- A modern browser that supports IndexedDB and Service Workers (Chrome, Firefox, Edge, etc.)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/mamaki-content-manager.git
   cd mamaki-content-manager
