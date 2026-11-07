// Add catch screen: a spot, what we caught, the weight, notes and a photo.
// A web copy of AddCatchActivity.java. The camera comes from <input type=file capture>,
// the photo is made smaller and kept as a data URL (text) inside IndexedDB.

import { getAllSpots, addCatch } from "./db.js";
import { openScreen, closeScreen, toast, escapeHtml } from "./ui.js";

const MAX_PHOTO_SIDE = 1280; // like shrinkPhoto() in the Android app (1600 px there, a bit less here to keep IndexedDB small)

let photoDataUrl = null; // the chosen photo, already resized, null = no photo
let onSaved = null; // called after a successful save, so the caller can refresh itself

export function initCatchForm() { // wires the screen once; openCatchForm() only fills it in
  document.getElementById("catchForm").addEventListener("submit", onSubmit);
  document.getElementById("btnTakePhoto").addEventListener("click", () => document.getElementById("catchPhotoInput").click());
  document.getElementById("catchPhotoInput").addEventListener("change", onPhotoChosen);
}

export async function openCatchForm(presetSpotId, afterSave) {
  onSaved = afterSave || null;
  const spots = await getAllSpots();
  if (spots.length === 0) { toast("Add a spot first"); return; }

  document.getElementById("catchForm").reset(); // clear the text boxes first
  const select = document.getElementById("cSpot");
  select.innerHTML = spots.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  if (presetSpotId) select.value = String(presetSpotId); // the spot the details screen sent, if any

  photoDataUrl = null;
  const preview = document.getElementById("catchPhotoPreview");
  preview.src = "";
  preview.style.visibility = "hidden";
  openScreen("screenCatchForm");
}

async function onPhotoChosen(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    photoDataUrl = await resizeToDataUrl(file, MAX_PHOTO_SIDE);
    const preview = document.getElementById("catchPhotoPreview");
    preview.src = photoDataUrl;
    preview.style.visibility = "visible";
  } catch (err) {
    toast("Could not open the photo");
  }
}

// reads an image file, draws it smaller on a canvas and returns a JPEG data URL
function resizeToDataUrl(file, maxSide) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) { // only shrink, never enlarge
          const scale = maxSide / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85)); // good quality, a few hundred KB
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function onSubmit(e) {
  e.preventDefault();
  const fish = document.getElementById("cFish").value.trim();
  if (!fish) { toast("Please write what you caught"); return; }
  const spotId = Number(document.getElementById("cSpot").value);
  const kgText = document.getElementById("cKg").value.trim().replace(",", ".");
  const kg = kgText === "" ? 0 : parseFloat(kgText) || 0;
  const notes = document.getElementById("cNotes").value.trim();

  await addCatch({ spotId, fish, kg, notes, photo: photoDataUrl, date: Date.now() });
  toast("Catch saved");
  closeScreen("screenCatchForm");
  if (onSaved) onSaved();
}
