import { extension } from "./preview.js";

export async function getSmartDefaults(entry, services) {
  const kind = getFileKind(entry.file);
  const imageKinds = new Set(["jpg", "jpeg", "png", "webp"]);
  let paper = "short";
  let color = "color";

  if (kind === "pdf") {
    try {
      if (window.pdfjsLib) {
        const pdf = await window.pdfjsLib.getDocument({ data: await entry.file.arrayBuffer() }).promise;
        entry.pdf = pdf;
        entry.pdfOrder = Array.from({ length: pdf.numPages }, (_, index) => index);
        entry.pdfDeleted = new Set();
        entry.pdfRotations = new Map();
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const width = viewport.width;
        const height = viewport.height;
        if (within(width, 595, 12) && within(height, 842, 15)) paper = "a4";
        else if (within(width, 612, 12) && within(height, 792, 15)) paper = "short";
        else if (within(width, 612, 12) && within(height, 1008, 15)) paper = "long";
        color = await detectPdfColor(pdf);
      }
    } catch (error) {
      console.warn("Could not detect PDF defaults.", error);
    }
  } else if (imageKinds.has(kind)) {
    paper = "short";
    color = await detectImageColor(entry.file);
  }

  const service = suggestService(entry.file, kind, services);
  return { paper, color: color === "bw" ? "bw" : "color", service };
}

function within(value, target, tolerance) {
  return Math.abs(value - target) <= tolerance;
}

function getFileKind(file) {
  return extension(file.name);
}

export function suggestService(file, kind, services) {
  const imageKinds = new Set(["jpg", "jpeg", "png", "webp"]);
  const name = file.name.toLowerCase();
  if (imageKinds.has(kind)) {
    if (name.includes("id")) {
      return findService(services, ["id", "picture"]) || findService(services, ["photo"]);
    }
    return findService(services, ["photo", "print"]) || findService(services, ["image"]);
  }
  return findService(services, ["document", "printing", "photocopy"])
    || findService(services, ["digital"]);
}

function findService(services, words) {
  return services.find((service) => (service.file_kinds || []).some((kind) =>
    words.includes(String(kind).toLowerCase())
  )) || services.find((service) => {
    const text = `${service.category || ""} ${service.name || ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }) || services.find((service) => {
    const text = `${service.category || ""} ${service.name || ""}`.toLower();
    return words.some((word) => text.includes(word));
  });
}

async function detectPdfColor(pdf) {
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.25 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return sampleCanvas(canvas);
  } catch (error) {
    return "color";
  }
}

async function detectImageColor(file) {
  try {
    const url = URL.createObjectURL(file);
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    URL.revokeObjectURL(url);
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = Math.max(1, Math.round(image.naturalHeight / (image.naturalWidth / 100)));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return sampleCanvas(canvas);
  } catch (error) {
    return "color";
  }
}

function sampleCanvas(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let saturated = 0;
  let sampled = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max - min >= 18) saturated++;
    sampled++;
  }
  return sampled && saturated / sampled >= 0.12 ? "color" : "bw";
}
