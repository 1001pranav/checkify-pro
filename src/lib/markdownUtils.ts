
import { ChecklistItem, Todo } from '../types';

/**
 * Generates MD for a list of items (ChecklistItems or Todos)
 */
export function generateMarkdown(items: (ChecklistItem | Todo)[]): string {
  // If they are ChecklistItems, we handle nesting
  if (items.length > 0 && 'parentId' in items[0]) {
    const checklistItems = items as ChecklistItem[];
    
    // Nest them first if not already nested
    const nest = (parentId: string | null = null, level: number = 0): string => {
      return checklistItems
        .filter(item => item.parentId === parentId)
        .sort((a, b) => a.position - b.position)
        .map(item => {
          const indent = '  '.repeat(level);
          const checkbox = item.isDone ? '[x]' : '[ ]';
          const line = `${indent}- ${checkbox} ${item.text}`;
          const children = nest(item.id, level + 1);
          return children ? `${line}\n${children}` : line;
        })
        .join('\n');
    };
    
    return nest(null, 0);
  }

  // Otherwise treat as flat todos
  return items
    .map(item => {
      const checkbox = item.isDone ? '[x]' : '[ ]';
      const text = 'text' in item ? item.text : (item as Todo).title;
      return `- ${checkbox} ${text}`;
    })
    .join('\n');
}

export interface ParsedItem {
  text: string;
  isDone: boolean;
  level: number;
}

/**
 * Parses Markdown into a flat list of items with their indentation levels
 */
export function parseMarkdown(md: string): ParsedItem[] {
  const lines = md.split('\n');
  const result: ParsedItem[] = [];

  const headerRegex = /^(#{1,6})\s+(.*)$/;
  const taskRegex = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/;
  const plainRegex = /^(\s*)[-*]\s+(.*)$/;
  const separatorRegex = /^\s*---+\s*$/;

  let currentHeaderLevel = -1;

  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    if (separatorRegex.test(line)) return;

    // Handle Headers
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      const hashes = headerMatch[1].length;
      const text = headerMatch[2].trim();
      const level = hashes - 1;
      currentHeaderLevel = level;
      result.push({ text, isDone: false, level });
      return;
    }

    // Handle List Items
    let match = line.match(taskRegex);
    if (match) {
      const indent = match[1].length;
      const isDone = match[2].toLowerCase() === 'x';
      const text = match[3].trim();
      // Level is calculated relative to the last header if one exists
      const itemLevel = (currentHeaderLevel + 1) + Math.floor(indent / 2);
      result.push({ text, isDone, level: itemLevel });
    } else {
      match = line.match(plainRegex);
      if (match) {
        const indent = match[1].length;
        const text = match[2].trim();
        const itemLevel = (currentHeaderLevel + 1) + Math.floor(indent / 2);
        result.push({ text, isDone: false, level: itemLevel });
      } else if (trimmedLine.length > 0) {
        // Fallback for lines that are just text
        const indent = line.length - line.trimStart().length;
        const itemLevel = (currentHeaderLevel + 1) + Math.floor(indent / 2);
        result.push({ 
          text: trimmedLine, 
          isDone: false, 
          level: itemLevel 
        });
      }
    }
  });

  return result;
}
