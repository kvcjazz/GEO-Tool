"use client";

// Client-side text extraction from PDF / Word / text files — ports the
// prototype's approach of loading pdf.js + mammoth from a CDN on demand, so the
// heavy parsers stay out of the app bundle and never touch SSR.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    pdfjsLib?: any;
    mammoth?: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

async function ensurePdf() {
  if (window.pdfjsLib) return;
  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  );
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  } catch {
    /* ignore */
  }
}

async function ensureMammoth() {
  if (window.mammoth) return;
  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  );
}

export async function extractFileText(f: File): Promise<string> {
  const name = (f.name || "").toLowerCase();
  if (name.endsWith(".pdf") || f.type === "application/pdf") {
    await ensurePdf();
    if (!window.pdfjsLib)
      throw new Error("PDF reader didn't load — check your connection and retry");
    const buf = await f.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const tc = await pg.getTextContent();
      out += tc.items.map((it: any) => it.str).join(" ") + "\n\n";
    }
    return out;
  }
  if (
    name.endsWith(".docx") ||
    f.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    await ensureMammoth();
    if (!window.mammoth)
      throw new Error("Word reader didn't load — check your connection and retry");
    const buf = await f.arrayBuffer();
    const r = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return r.value || "";
  }
  if (name.endsWith(".doc"))
    throw new Error(
      "Legacy .doc isn't supported — save as .docx or PDF, or paste the text",
    );
  return await f.text();
}
