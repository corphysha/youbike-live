try {
  const preference = localStorage.getItem("youbike-theme");
  if (preference === "light" || preference === "dark") {
    document.documentElement.dataset.theme = preference;
  }

  const isDark =
    preference === "dark" ||
    (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#131612" : "#f7f6f2");
} catch {
  // The CSS media query still follows the device when storage is unavailable.
}
