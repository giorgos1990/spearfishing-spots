// Small helpers used by every screen: toasts, full screen pages and
// bottom sheets / dialog boxes (the web version of Android's Toast and AlertDialog).

export function toast(message) { // a small pop-up message, like Toast.makeText
  const host = document.getElementById("toastHost");
  const div = document.createElement("div");
  div.className = "toast";
  div.textContent = message;
  host.appendChild(div);
  setTimeout(() => div.remove(), 2600); // disappears by itself
}

export function openScreen(id) { // shows a full screen page (Add spot, Navigate, ...)
  document.getElementById(id).classList.add("active");
}

export function closeScreen(id) { // hides it again (the back arrow of the screen)
  document.getElementById(id).classList.remove("active");
}

export function openSheet(id) { // shows a bottom sheet / centered dialog
  document.getElementById(id).classList.add("active");
}

export function closeSheet(id) {
  document.getElementById(id).classList.remove("active");
}

// every backdrop closes itself when you tap outside the card, and every
// [data-close] / [data-close-sheet] button closes its screen / sheet
export function wireGenericClosers() {
  document.querySelectorAll(".sheet-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.classList.remove("active"); // only the dark area, not the card itself
    });
  });
  document.addEventListener("click", (e) => {
    const closeScreenBtn = e.target.closest("[data-close]");
    if (closeScreenBtn) closeScreen(closeScreenBtn.dataset.close);
    const closeSheetBtn = e.target.closest("[data-close-sheet]");
    if (closeSheetBtn) closeSheet(closeSheetBtn.dataset.closeSheet);
  });
}

// a question with buttons, like new AlertDialog.Builder(...).show()
// buttons: [{label, value, cls}], cls is "primary" / "outline" / "danger"
// returns a Promise with the value of the tapped button, or null if the user tapped outside
export function dialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const sheet = document.getElementById("dialogSheet");
    const backdrop = document.getElementById("dialogBackdrop");
    sheet.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<div style="font-size:14px;color:var(--text);line-height:1.5;">${escapeHtml(message)}</div>` : ""}
      <div class="btn-row" id="dialogButtons"></div>
    `;
    const row = sheet.querySelector("#dialogButtons");
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      backdrop.classList.remove("active");
      resolve(value);
    };
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "btn " + (b.cls || "outline");
      btn.textContent = b.label;
      btn.onclick = () => finish(b.value);
      row.appendChild(btn);
    });
    backdrop.onclick = (e) => { if (e.target === backdrop) finish(null); };
    backdrop.classList.add("active");
  });
}

export function alertDialog(title, message) { // a simple message with only OK, like a Toast you cannot miss
  return dialog({ title, message, buttons: [{ label: "OK", value: true, cls: "primary" }] });
}

export function escapeHtml(text) { // user text goes into innerHTML, so we escape it first
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}
