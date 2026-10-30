(() => {
  const toggle = document.getElementById("themeToggle");
  let choice;
  try {
    choice = localStorage.getItem("seruchat-theme");
  } catch {}
  const media = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.documentElement.dataset.theme = choice || "light";
    toggle.setAttribute(
      "aria-pressed",
      String(document.documentElement.dataset.theme === "dark"),
    );
  };
  apply();
  media.addEventListener("change", apply);
  toggle.addEventListener("click", () => {
    choice =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("seruchat-theme", choice);
    } catch {}
    apply();
  });
})();
