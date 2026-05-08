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
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    
    // Create an image element to get dimensions and resize if needed
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      const objectUrl = URL.createObjectURL(blob);
      i.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(i);
      };
      i.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image load failed"));
      };
      i.src = objectUrl;
    });

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
  } catch (error) {
    console.error("Failed to load image for PDF:", url, error);
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
  let y = margin;

  // 1. Prepare Data - Pre-fetch all images in parallel
  onProgress?.(10, "Fetching audit visuals...");
  
  const allImagesToFetch: { itemId: string; url: string }[] = [];
  items.forEach(({ item }) => {
    const photos = Array.from(new Set([
      ...(item.photoUrls || []),
      ...(item.photoUrl ? [item.photoUrl] : [])
    ]));
    photos.forEach(url => allImagesToFetch.push({ itemId: item.id, url }));
  });

  // Fetch all images concurrently and store in a map
  const imageMap = new Map<string, ImageAsset[]>();
  
  // Initialize map first to avoid race conditions
  items.forEach(({ item }) => imageMap.set(item.id, []));

  const fetchPromises = allImagesToFetch.map(async ({ itemId, url }) => {
    const result = await getImageDataUrl(url);
    if (result) {
      const list = imageMap.get(itemId);
      if (list) list.push(result);
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

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-400
  doc.text(checklist.description || "Verification Audit Report", margin, y);
  y += 10;

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

    // Ensure enough space for item header
    if (y > pageHeight - 30) {
      doc.addPage();
      y = margin;
    }

    const indent = level * 8;
    const statusColor = item.isDone ? [16, 185, 129] : [245, 158, 11]; // emerald-500 : amber-500
    
    // Status box
    doc.setDrawColor(15, 23, 42);
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.rect(margin + indent, y - 4, 15, 5, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.text(item.isDone ? "PASS" : "PEND", margin + indent + 2, y - 0.5);

    // Item text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(item.text, margin + indent + 18, y);
    y += 8;

    // Photos for this item
    const photos = imageMap.get(item.id) || [];
    for (const asset of photos) {
      const targetWidth = 80;
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
      doc.rect(margin + indent + 18 - 1, y - 1, w + 2, h + 2); // Thin border
      doc.addImage(asset.dataUrl, 'JPEG', margin + indent + 18, y, w, h);
      y += h + 10;
    }

    if (photos.length === 0) {
      y += 2;
    }
  }

  // Footer / Page numbers
  const pages = doc.internal.pages.length - 1;
  for (let j = 1; j <= pages; j++) {
    doc.setPage(j);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Page ${j} of ${pages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  onProgress?.(100, "Finalizing report...");
  doc.save(`${checklist.title.replace(/\s+/g, '_')}_Audit_Report.pdf`);
}
