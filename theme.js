// theme.js
document.addEventListener("DOMContentLoaded", () => {
    const body = document.body;
    const toggleElem = document.getElementById("toggleMode");
    if (!toggleElem) {
      console.error("Toggle element not found");
      return;
    }
    
    // Set theme from localStorage
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme) {
      body.classList.remove("dark", "light");
      body.classList.add(storedTheme);
      toggleElem.textContent = storedTheme === "dark" ? "🌕" : "🌑";
    } else {
      body.classList.add("dark");
      toggleElem.textContent = "🌕";
      localStorage.setItem("theme", "dark");
    }
    
    // Attach click listener
    toggleElem.addEventListener("click", () => {
      if (body.classList.contains("dark")) {
        body.classList.remove("dark");
        body.classList.add("light");
        toggleElem.textContent = "🌑";
        localStorage.setItem("theme", "light");
      } else {
        body.classList.remove("light");
        body.classList.add("dark");
        toggleElem.textContent = "🌕";
        localStorage.setItem("theme", "dark");
      }
    });
  });
  