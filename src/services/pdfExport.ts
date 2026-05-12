import { jsPDF } from 'jspdf';
import { Checklist, ChecklistItem } from '../types';

interface PDFExportOptions {
  checklist: Checklist;
  items: { item: ChecklistItem; level: number }[];
  onProgress?: (progress: number, status: string) => void;
}

/**
 * Efficiently loads an image from a URL and returns a Data URL with dimensions.
 * Handles CORS by using fetch + blob + reader.
 */
async function getImageDataUrl(url: string, maxWidth = 800): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null;
  
  try {
    // Attempt 1: Fetch as blob (Best for CORS if server allows)
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Fetch failed with status: ${response.status}`);
    }
    const blob = await response.blob();
    
    // Create an image element to get dimensions and resize if needed
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      const objectUrl = URL.createObjectURL(blob);
      i.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(i);
      };
      i.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      };
      i.src = objectUrl;
    });

    return processCanvasImage(img, maxWidth);
  } catch (error) {
    console.warn("Primary image fetch failed, trying alternate method:", url, error);
    
    // Attempt 2: Load directly with crossOrigin="anonymous" (Fallback)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = (e) => reject(e);
        i.src = url;
      });
      return processCanvasImage(img, maxWidth);
    } catch (err2) {
      console.error("All image load methods failed for:", url, err2);
      return null;
    }
  }
}

/**
 * Resizes and converts image to data URL via canvas
 */
function processCanvasImage(img: HTMLImageElement, maxWidth: number): { dataUrl: string; width: number; height: number } | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Maintain aspect ratio while respecting the limit
    let width = img.width;
    let height = img.height;
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Reduced quality for smaller size
    return { dataUrl, width, height };
  } catch (e) {
    console.error("Canvas processing failed (possibly tainted):", e);
    return null;
  }
}

interface ImageAsset {
  dataUrl: string;
  width: number;
  height: number;
}

export async function exportChecklistToPDF({ checklist, items, onProgress }: PDFExportOptions) {
  const doc = new jsPDF();
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - (margin * 2);
  let y = margin;

  // 1. Prepare Data - Pre-fetch all images in parallel
  onProgress?.(10, "Fetching audit visuals...");
  
  const allImagesToFetch: { itemId: string; url: string }[] = [];

  items.forEach(({ item }) => {
    const photos = new Set<string>();
    
    if (item.photoUrls && Array.isArray(item.photoUrls)) {
      item.photoUrls.forEach(u => {
        if (u && typeof u === 'string') photos.add(u);
      });
    }
    
    if (item.photoUrl && typeof item.photoUrl === 'string') {
      photos.add(item.photoUrl);
    }

    // Extract images from description if it exists
    if (item.description) {
      let match;
      const mdImageRegex = /!\[.*?\]\((.*?)\)/g; // Local re-init to reset index
      while ((match = mdImageRegex.exec(item.description)) !== null) {
        if (match[1]) photos.add(match[1]);
      }
    }

    Array.from(photos).forEach(url => allImagesToFetch.push({ itemId: item.id, url }));
  });

  // Fetch all images concurrently and store in a map
  const imageMap = new Map<string, ImageAsset[]>();
  
  // Initialize map first to avoid race conditions
  items.forEach(({ item }) => {
    if (!imageMap.has(item.id)) {
      imageMap.set(item.id, []);
    }
  });

  const fetchPromises = allImagesToFetch.map(async ({ itemId, url }) => {
    try {
      const result = await getImageDataUrl(url);
      if (result) {
        const list = imageMap.get(itemId);
        if (list) list.push(result);
      } else {
        console.warn(`[PDF Export] Failed to fetch image for item ${itemId}: ${url}`);
      }
    } catch (err) {
      console.error(`[PDF Export] Error fetching image for item ${itemId}:`, err);
    }
  });

  await Promise.all(fetchPromises);
  onProgress?.(40, "Structuring audit data...");

  // 2. Headings
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(checklist.title.toUpperCase(), margin, y);
  y += 12;

  if (checklist.description) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-400
    const descLines = doc.splitTextToSize(checklist.description, contentWidth);
    doc.text(descLines, margin, y);
    y += descLines.length * 5 + 5;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-400
    doc.text("Verification Audit Report", margin, y);
    y += 10;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, y);
  y += 5;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 15;

  // 3. Items loop
  let itemCounter = 0;
  for (const { item, level } of items) {
    itemCounter++;
    onProgress?.(40 + (50 * (itemCounter / items.length)), `Processing item ${itemCounter}...`);

    const indent = level * 8;
    const statusColor = item.isDone ? [16, 185, 129] : [245, 158, 11]; // emerald-500 : amber-500
    
    // Check if we need a new page before starting the item
    if (y > pageHeight - 30) {
      doc.addPage();
      y = margin;
    }

    // Status Indicator (Square for checkbox)
    doc.setDrawColor(15, 23, 42);
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.rect(margin + indent, y - 4, 15, 5, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text(item.isDone ? "PASS" : "PEND", margin + indent + 2, y - 0.5);

    // Item Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    
    let titleText = item.text;
    if (item.outcome === 'success') titleText += ' [PASS]';
    if (item.outcome === 'failure') titleText += ' [FAIL]';
    
    const maxTitleWidth = contentWidth - indent - 20;
    const titleLines = doc.splitTextToSize(titleText, maxTitleWidth);
    doc.text(titleLines, margin + indent + 18, y);
    y += titleLines.length * 5 + 3;

    // Item Description (Markdown support)
    if (item.description) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105); // slate-600
      
      const maxDescWidth = contentWidth - indent - 25;
      const descLines = doc.splitTextToSize(item.description, maxDescWidth);
      
      // Check for page break
      if (y + (descLines.length * 4.5) > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      
      doc.text(descLines, margin + indent + 23, y);
      y += descLines.length * 4.5 + 5;
    }

    // Photos for this item
    const photos = imageMap.get(item.id) || [];
    for (const asset of photos) {
      const targetWidth = Math.min(80, contentWidth - indent - 20);
      const maxHeight = 60;
      let w = targetWidth;
      let h = (asset.height / asset.width) * w;
      
      if (h > maxHeight) {
        h = maxHeight;
        w = (asset.width / asset.height) * h;
      }

      if (y + h > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }

      doc.setDrawColor(226, 232, 240); // slate-200
      doc.rect(margin + indent + 23 - 1, y - 1, w + 2, h + 2); // Thin border
      doc.addImage(asset.dataUrl, 'JPEG', margin + indent + 23, y, w, h);
      y += h + 8;
    }

    if (photos.length === 0 && !item.description) {
      y += 2;
    } else {
      y += 5;
    }
  }

  // Footer / Page numbers
  const pages = doc.internal.pages.length - 1;
  for (let j = 1; j <= pages; j++) {
    doc.setPage(j);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Page ${j} of ${pages} | ${checklist.title}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  onProgress?.(100, "Finalizing report...");
  doc.save(`${checklist.title.replace(/\s+/g, '_')}_Audit_Report.pdf`);
}
