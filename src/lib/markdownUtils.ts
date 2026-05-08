
import { ChecklistItem, Todo } from '../types';

/**
 * Generates MD for a list of items (ChecklistItems or Todos)
 */
export function generateMarkdown(items: (ChecklistItem | Todo)[]): string {
  // If they are ChecklistItems, we handle nesting
  if (items.length > 0 && ('parentId' in items[0] || 'text' in items[0])) {
    const checklistItems = items as ChecklistItem[];
    
    // Nest them first if not already nested
    const nest = (parentId: string | null = null, level: number = 0): string => {
      return checklistItems
        .filter(item => item.parentId === parentId)
        .sort((a, b) => a.position - b.position)
        .map(item => {
          const indent = '  '.repeat(level);
          const checkbox = item.isDone ? '[x]' : '[ ]';
          const outcomeIndicator = item.outcome === 'success' ? ' ✅' : item.outcome === 'failure' ? ' ❌' : '';
          const line = `${indent}- ${checkbox} ${item.text}${outcomeIndicator}`;
          const descLine = item.description ? `\n${indent}  ${item.description.split('\n').join(`\n${indent}  `)}` : '';
          const children = nest(item.id, level + 1);
          return `${line}${descLine}${children ? `\n${children}` : ''}`;
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
      const desc = item.description ? `\n  ${item.description.split('\n').join('\n  ')}` : '';
      const outcomeIndicator = item.outcome === 'success' ? ' ✅' : item.outcome === 'failure' ? ' ❌' : '';
      return `- ${checkbox} ${text}${outcomeIndicator}${desc}`;
    })
    .join('\n');
}

export interface ParsedItem {
  text: string;
  description?: string;
  isDone: boolean;
  level: number;
  outcome?: 'success' | 'failure' | 'none';
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
  let lastItem: ParsedItem | null = null;

  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (separatorRegex.test(line)) return;

    // Handle Headers
    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      const hashes = headerMatch[1].length;
      const text = headerMatch[2].trim();
      const level = hashes - 1;
      currentHeaderLevel = level;
      const newItem: ParsedItem = { text, isDone: false, level };
      result.push(newItem);
      lastItem = newItem;
      return;
    }

    // Handle List Items
    let match = line.match(taskRegex);
    if (match) {
      const indent = match[1].length;
      const isDone = match[2].toLowerCase() === 'x';
      let text = match[3].trim();
      let outcome: 'success' | 'failure' | 'none' = 'none';
      
      if (text.includes('✅')) {
        outcome = 'success';
        text = text.replace('✅', '').trim();
      } else if (text.includes('❌')) {
        outcome = 'failure';
        text = text.replace('❌', '').trim();
      }

      const itemLevel = (currentHeaderLevel + 1) + Math.floor(indent / 2);
      const newItem: ParsedItem = { text, isDone, level: itemLevel, outcome };
      result.push(newItem);
      lastItem = newItem;
    } else {
      match = line.match(plainRegex);
      if (match) {
        const indent = match[1].length;
        const text = match[2].trim();
        const itemLevel = (currentHeaderLevel + 1) + Math.floor(indent / 2);
        const newItem: ParsedItem = { text, isDone: false, level: itemLevel };
        result.push(newItem);
        lastItem = newItem;
      } else if (trimmedLine.length > 0) {
        // This might be a description for the last item
        if (lastItem) {
          const descriptionLine = trimmedLine;
          if (lastItem.description) {
            lastItem.description += '\n' + descriptionLine;
          } else {
            lastItem.description = descriptionLine;
          }
        } else {
          // Fallback for lines before any items
          const indent = line.length - line.trimStart().length;
          const itemLevel = (currentHeaderLevel + 1) + Math.floor(indent / 2);
          const newItem: ParsedItem = { 
            text: trimmedLine, 
            isDone: false, 
            level: itemLevel 
          };
          result.push(newItem);
          lastItem = newItem;
        }
      }
    }
  });

  return result;
}
