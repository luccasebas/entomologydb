document.addEventListener("DOMContentLoaded", () => {
  const PANEL_STATE_KEY = "bruchindb-panel-open";

  const pageShell = document.querySelector(".page-shell");
  const filterPanel = document.getElementById("filterPanel");
  const filtersBtn = document.getElementById("filtersBtn");
  const panelHandle = document.getElementById("panelHandle");
  const panelHandleIcon = document.getElementById("panelHandleIcon");

  function setPanelState(open) {
    if (!pageShell || !filterPanel) return;

    pageShell.classList.toggle("panel-open", open);
    pageShell.classList.toggle("panel-closed", !open);

    filterPanel.classList.toggle("is-open", open);
    filterPanel.classList.toggle("is-closed", !open);

    if (panelHandleIcon) {
      panelHandleIcon.innerHTML = open ? "&#10094;" : "&#10095;";
    }

    localStorage.setItem(PANEL_STATE_KEY, open ? "open" : "closed");
  }

  function togglePanel() {
    if (!pageShell) return;
    const isClosed = pageShell.classList.contains("panel-closed");
    setPanelState(isClosed);
  }

  function toggleSection(element) {
    const content = element.nextElementSibling;
    const arrow = element.querySelector(".arrow");
    if (!content || !arrow) return;

    content.classList.toggle("open");
    arrow.classList.toggle("rotate");
  }

  if (filtersBtn) {
    filtersBtn.addEventListener("click", togglePanel);
  }

  if (panelHandle) {
    panelHandle.addEventListener("click", togglePanel);
  }

  window.toggleSection = toggleSection;

  const savedState = localStorage.getItem(PANEL_STATE_KEY);
  setPanelState(savedState !== "closed");
});