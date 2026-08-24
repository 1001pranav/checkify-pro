import { jsPDF } from 'jspdf';
import { Checklist, ChecklistItem } from '../types';

interface PDFExportOptions {
  checklist: Checklist;
  items: { item: ChecklistItem; level: number }[];
  onProgress?: (progress: number, status: string) => void;
}

/**
 * Efficiently loads an image from a URL and returns a Data URL with dimensions.
 * Handles CORS by trying multiple loading strategies.
 */
async function getImageDataUrl(url: string, maxWidth = 800): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null;
  
  // Quick check for base64
  if (url.startsWith('data:')) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      return processCanvasImage(img, maxWidth);
    } catch (e) {
      console.error("Failed to process base64 image:", e);
      return null;
    }
  }

  // Attempt 1: Load directly with crossOrigin (Usually more resilient in proxied environments)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.referrerPolicy = "no-referrer";
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(e);
      i.src = url;
    });
    return processCanvasImage(img, maxWidth);
  } catch (error) {
    console.warn("Direct image load failed, trying fetch strategy:", url, error);
    
    // Attempt 2: Fetch as blob (Fallback)
    try {
      // Use cache buster only as a last resort if first attempts fail
      const fetchUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
      const response = await fetch(fetchUrl, { mode: 'cors' });
      
      if (!response.ok) {
        throw new Error(`Fetch failed with status: ${response.status}`, { cause: error });
      }
      const blob = await response.blob();
      
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
    const availableWidth = contentWidth - indent - 23;
    const gap = 5;
    
    let i = 0;
    while (i < photos.length) {
      const asset = photos[i];
      const aspectRatio = asset.width / asset.height;
      const isPortrait = aspectRatio < 0.8;
      
      // Look ahead to see if we can pair this portrait image with another one
      let canPair = false;
      if (isPortrait && i + 1 < photos.length) {
        const nextAsset = photos[i + 1];
        const nextAspectRatio = nextAsset.width / nextAsset.height;
        if (nextAspectRatio < 0.8) {
          canPair = true;
        }
      }

      if (canPair) {
        const nextAsset = photos[i + 1];
        const slotWidth = (availableWidth - gap) / 2;
        
        // Calculate heights for both to keep them balanced
        const maxHeight = 100;
        let h1 = (asset.height / asset.width) * slotWidth;
        let h2 = (nextAsset.height / nextAsset.width) * slotWidth;
        
        if (h1 > maxHeight) h1 = maxHeight;
        if (h2 > maxHeight) h2 = maxHeight;
        
        const w1 = (asset.width / asset.height) * h1;
        const w2 = (nextAsset.width / nextAsset.height) * h2;

        const maxH = Math.max(h1, h2);

        if (y + maxH > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }

        // Slot 1
        const x1 = margin + indent + 23 + (slotWidth - w1) / 2;
        doc.setDrawColor(241, 245, 249);
        doc.rect(x1 - 0.5, y - 0.5, w1 + 1, h1 + 1);
        doc.addImage(asset.dataUrl, 'JPEG', x1, y, w1, h1);

        // Slot 2
        const x2 = margin + indent + 23 + slotWidth + gap + (slotWidth - w2) / 2;
        doc.rect(x2 - 0.5, y - 0.5, w2 + 1, h2 + 1);
        doc.addImage(nextAsset.dataUrl, 'JPEG', x2, y, w2, h2);

        y += maxH + 8;
        i += 2;
      } else {
        // Single image
        const maxHeight = 120;
        let w = availableWidth;
        let h = (asset.height / asset.width) * w;
        
        if (h > maxHeight) {
          h = maxHeight;
          w = (asset.width / asset.height) * h;
        }

        if (y + h > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }

        const x = margin + indent + 23 + (availableWidth - w) / 2;
        doc.setDrawColor(241, 245, 249);
        doc.rect(x - 0.5, y - 0.5, w + 1, h + 1);
        doc.addImage(asset.dataUrl, 'JPEG', x, y, w, h);
        y += h + 8;
        i++;
      }
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
