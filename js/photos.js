// Shows the photos of some catches in a row, and the big photo dialog with Delete.
// Used by the map's spot card, the spot details screen and the trip log.

import { deleteCatch } from "./db.js";
import { openSheet, closeSheet, dialog, toast, escapeHtml } from "./ui.js";

// row: the element to fill. catches: the Catch objects. className: "photo-row" or "photo-grid".
// afterDelete: called after a photo is deleted, so the caller can show itself again.
// returns how many photos it drew (catches with no photo are skipped).
export function renderPhotos(row, catches, className, afterDelete) {
  row.className = className;
  row.innerHTML = "";
  let count = 0;
  for (const item of catches) {
    if (!item.photo) continue; // no photo: skip it
    const img = document.createElement("img");
    img.src = item.photo; // a data: URL (our own photos) or a photos/....jpg file (the demo)
    img.loading = "lazy";
    img.alt = item.fish;
    img.onclick = () => showBigPhoto(item, afterDelete);
    row.appendChild(img);
    count++;
  }
  return count;
}

export function showBigPhoto(item, afterDelete) { // the photo full screen, with Delete (Stitch design "Catch Photo")
  const date = new Date(item.date).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const sheet = document.getElementById("photoSheet");
  sheet.innerHTML = `
    <img src="${item.photo}" style="width:100%;border-radius:12px;max-height:50vh;object-fit:contain;background:#000;">
    <h3 style="margin-top:12px;">${escapeHtml(item.fish)}</h3>
    <div style="color:var(--muted);font-size:13px;">${escapeHtml(item.spotName || "")} &middot; ${date}</div>
    ${item.notes ? `<div style="margin-top:8px;font-size:14px;">${escapeHtml(item.notes)}</div>` : ""}
    <div class="btn-row">
      <button class="btn outline" id="bigPhotoClose">Close</button>
      <button class="btn danger" id="bigPhotoDelete">Delete</button>
    </div>
  `;
  sheet.querySelector("#bigPhotoClose").onclick = () => closeSheet("photoBackdrop");
  sheet.querySelector("#bigPhotoDelete").onclick = async () => {
    closeSheet("photoBackdrop");
    const sure = await dialog({
      title: "Delete this catch?",
      message: `The catch "${item.fish}" and its photo will be deleted.`,
      buttons: [{ label: "Cancel", value: false, cls: "outline" }, { label: "Delete", value: true, cls: "danger" }],
    });
    if (!sure) return;
    await deleteCatch(item.id);
    toast("Catch deleted");
    if (afterDelete) afterDelete();
  };
  openSheet("photoBackdrop");
}
