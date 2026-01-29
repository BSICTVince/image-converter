const fileInput = document.getElementById("fileInput");
const dragArea = document.getElementById("dragArea");
const imageList = document.getElementById("imageList");
const convertBtn = document.getElementById("convertBtn");
const downloadZipBtn = document.getElementById("downloadZipBtn");

const lockAspectEl = document.getElementById("lockAspect");
const widthEl = document.getElementById("resizeWidth");
const heightEl = document.getElementById("resizeHeight");

const API_BASE_URL = window.location.origin;

let files = [];
const MAX_FILES = 15;
let originalAspectRatio = 1; // width / height

// --- File selection ---
fileInput.addEventListener("change", (e) => addFiles(e.target.files, true));

// --- Drag-and-drop ---
dragArea.addEventListener("dragover", (e) => e.preventDefault());
dragArea.addEventListener("drop", (e) => {
  e.preventDefault();
  addFiles(e.dataTransfer.files, true);
});

// --- Auto-adjust width/height based on aspect ratio ---
widthEl.addEventListener("input", () => {
  if (lockAspectEl.checked && widthEl.value && originalAspectRatio) {
    heightEl.value = Math.round(widthEl.value / originalAspectRatio);
  }
});
heightEl.addEventListener("input", () => {
  if (lockAspectEl.checked && heightEl.value && originalAspectRatio) {
    widthEl.value = Math.round(heightEl.value * originalAspectRatio);
  }
});

// --- Add files ---
function addFiles(newFiles, replace = false) {
  if (replace) files = [];

  for (const f of newFiles) {
    const exists = files.some(file => file.name === f.name && file.size === f.size);
    if (!exists) files.push(f);
  }

  renderImages();
}


// --- Render image previews ---
function renderImages() {
  imageList.innerHTML = "";

  files.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.style.position = "relative";

    // Image preview
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);

    // File info
    const infoDiv = document.createElement("div");
    infoDiv.style.display = "flex";
    infoDiv.style.flexDirection = "column";
    infoDiv.style.flex = "1";

    const name = document.createElement("p");
    name.className = "file-name";
    name.textContent = file.name;

    const size = document.createElement("p");
    size.className = "file-size";
    size.textContent = `${(file.size / 1024).toFixed(2)} KB`;

    const dimensions = document.createElement("p");
    dimensions.className = "file-dimensions";
    dimensions.textContent = `Loading...`;

    infoDiv.append(name, size, dimensions);

    // Remove button
    const removeBtn = document.createElement("div");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove file";
    removeBtn.style.position = "absolute";
    removeBtn.style.top = "5px";
    removeBtn.style.right = "5px";
    removeBtn.style.cursor = "pointer";
    removeBtn.style.fontSize = "18px";
    removeBtn.style.fontWeight = "bold";
    removeBtn.onclick = () => {
      files.splice(index, 1);
      renderImages();
    };

    // Progress bar
    const progress = document.createElement("div");
    progress.className = "progress-bar";

    const inner = document.createElement("div");
    inner.className = "progress-bar-inner";
    inner.style.width = "0%";

    const progressText = document.createElement("span");
    progressText.className = "progress-text";
    progressText.textContent = "Loading...";

    inner.appendChild(progressText);
    progress.appendChild(inner);

    // Download button
    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Download";
    downloadBtn.disabled = true;

    card.append(img, infoDiv, progress, downloadBtn, removeBtn);
    imageList.appendChild(card);

    // Store references
    file._progressEl = inner;
    file._progressText = progressText;
    file._downloadBtn = downloadBtn;
    file._sizeEl = size;
    file._dimensionsEl = dimensions;
    file._formatEl = name;

    // Check if image loads into RAM
    const tempImg = new Image();
    tempImg.onload = () => {
      dimensions.textContent = `${tempImg.naturalWidth} x ${tempImg.naturalHeight}`;
      progressText.textContent = "Ready";
      if (index === 0) {
        originalAspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
        if (!widthEl.value) widthEl.value = tempImg.naturalWidth;
        if (!heightEl.value) heightEl.value = tempImg.naturalHeight;
      }
    };
    tempImg.onerror = () => {
      progressText.textContent = "Failed to load";
      inner.style.backgroundColor = "#f44336";
    };
    tempImg.src = URL.createObjectURL(file);
  });
}

// --- Convert images ---
convertBtn.addEventListener("click", async () => {
  if (files.length === 0) {
    alert("Please select at least one file.");
    return;
  }

  const formatElInput = document.getElementById("format");
  const targetKBEl = document.getElementById("targetKB");
  const percentEl = document.getElementById("percent");

  const format = formatElInput ? formatElInput.value : "png";

  let targetKB = targetKBEl ? targetKBEl.value : null;
  let percent = percentEl ? percentEl.value : null;
  let width = widthEl && widthEl.value ? parseInt(widthEl.value) : null;
  let height = heightEl && heightEl.value ? parseInt(heightEl.value) : null;

  if (format === "svg") {
    targetKB = percent = width = height = null;
  }

  downloadZipBtn.style.display = "none";
  const zip = new JSZip();

  for (const file of files) {
    if (file._progressEl && file._progressText) {
      file._progressEl.style.width = "0%";
      file._progressText.textContent = "Processing...";
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("format", format);
    if (targetKB) formData.append("targetKB", targetKB);
    if (percent) formData.append("percent", percent);
    if (width) formData.append("width", width);
    if (height) formData.append("height", height);

    try {
      const res = await fetch(`${API_BASE_URL}/convert`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Conversion failed");

      const blob = await res.blob();

      // Update file info
      if (file._sizeEl) file._sizeEl.textContent = `${(blob.size / 1024).toFixed(2)} KB`;
      if (file._formatEl) {
        file._formatEl.textContent = file.name.replace(/\.\w+$/, `.${format.toLowerCase()}`);
      }

      // Update dimensions
      const tempImg = new Image();
      tempImg.onload = () => {
        let w = tempImg.naturalWidth;
        let h = tempImg.naturalHeight;
        if (lockAspectEl.checked && widthEl.value && heightEl.value) {
          const newAspect = widthEl.value / heightEl.value;
          if (Math.abs(newAspect - originalAspectRatio) > 0.01) {
            w = parseInt(widthEl.value);
            h = Math.round(w / originalAspectRatio);
          }
        }
        if (file._dimensionsEl) file._dimensionsEl.textContent = `${w} x ${h}`;
        if (files[0] === file) {
          originalAspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
          widthEl.value = tempImg.naturalWidth;
          heightEl.value = tempImg.naturalHeight;
        }
      };
      tempImg.src = URL.createObjectURL(blob);

      // Enable download button
      if (file._downloadBtn) {
        file._downloadBtn.disabled = false;
        file._downloadBtn.onclick = () => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file._formatEl ? file._formatEl.textContent : file.name;
          a.click();
        };
      }

      // Progress simulation (numbers only)
      if (file._progressText && file._progressEl) {
        let progress = 0;
        const interval = setInterval(() => {
          progress += 5;
          if (progress >= 100) {
            progress = 100;
            file._progressText.textContent = "Complete";
            clearInterval(interval);
          } else {
            file._progressText.textContent = progress + "%";
          }
          file._progressEl.style.width = progress + "%";
        }, 50);
      }

      zip.file(file._formatEl ? file._formatEl.textContent : file.name, blob);

    } catch (err) {
      console.error("Conversion error:", file.name, err);
      if (file._progressText && file._progressEl) {
        file._progressText.textContent = "Error";
        file._progressEl.style.backgroundColor = "#f44336";
      }
      alert(`Failed to convert file: ${file.name}`);
    }
  }

  // ZIP download
  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadZipBtn.style.display = "inline";
  downloadZipBtn.onclick = () => {
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted.zip";
    a.click();
  };
});
