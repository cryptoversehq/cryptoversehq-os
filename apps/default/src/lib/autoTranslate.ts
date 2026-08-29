import { translationCache } from './translationCache';
import { deepSeekChat } from './deepSeekClient';

let isTranslating = false;
let pendingNodes: Set<HTMLElement> = new Set();

export function setupAutoTranslate() {
const observer = new MutationObserver((mutations) => {
mutations.forEach((mutation) => {
mutation.addedNodes.forEach((node) => {
if (node.nodeType === Node.ELEMENT_NODE) {
const element = node as HTMLElement;
if (element.dataset?.translate !== 'false') {
pendingNodes.add(element);
}
}
});
});

if (pendingNodes.size > 0 && !isTranslating) {
processPendingNodes();
}
});

observer.observe(document.body, {
childList: true,
subtree: true,
});
}

async function processPendingNodes() {
isTranslating = true;
const nodes = Array.from(pendingNodes);
pendingNodes.clear();

const language = localStorage.getItem('cryptoverse_language') || 'en';
if (language === 'en') {
isTranslating = false;
return;
}

for (const node of nodes) {
if (!document.contains(node)) continue;
await translateNode(node, language);
}

isTranslating = false;
}

async function translateNode(element: HTMLElement, language: string) {

const textNodes: string[] = [];
const walker = document.createTreeWalker(
element,
NodeFilter.SHOW_TEXT,
{
acceptNode: (node) => {
const parent = node.parentElement;
if (!parent) return NodeFilter.FILTER_REJECT;
if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
return NodeFilter.FILTER_REJECT;
}
const text = node.textContent?.trim();
if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
const originalText = parent.dataset.originalText || text;
const cached = translationCache.get(originalText, language);
if (cached) {
node.textContent = cached;
return NodeFilter.FILTER_REJECT;
}
textNodes.push(originalText);
return NodeFilter.FILTER_ACCEPT;
}
},
false
);

const nodesToTranslate: { node: Text; originalText: string }[] = [];
let node: Text | null;
while ((node = walker.nextNode() as Text | null)) {
const parent = node.parentElement;
if (!parent) continue;
const originalText = parent.dataset.originalText || node.textContent?.trim() || '';
if (originalText.length > 2) {
nodesToTranslate.push({ node, originalText });
}
}

if (nodesToTranslate.length === 0) return;

const texts = nodesToTranslate.map(n => n.originalText);
const translations = await translateBatch(texts, language);

nodesToTranslate.forEach(({ node, originalText }, index) => {
const translation = translations[index] || originalText;
node.textContent = translation;
if (node.parentElement) {
node.parentElement.dataset.originalText = originalText;
node.parentElement.dataset.translated = 'true';
}
});
}

async function translateBatch(texts: string[], language: string): Promise<string[]> {
const results: string[] = [];
const toTranslate: string[] = [];
const indices: number[] = [];

texts.forEach((text, index) => {
const cached = translationCache.get(text, language);
if (cached) {
results[index] = cached;
} else {
toTranslate.push(text);
indices.push(index);
}
});

if (toTranslate.length === 0) return results;

try {
const response = await deepSeekChat([
{
role: 'system',
content: `Translate the following texts to ${language}. Return ONLY a JSON array of translations in the same order.`
},
{ role: 'user', content: JSON.stringify(toTranslate) }
]);

const translations = JSON.parse(response.content);
translations.forEach((translation: string, i: number) => {
const originalText = toTranslate[i];
const index = indices[i];
results[index] = translation;
translationCache.set(originalText, language, translation);
});

return results;
} catch (error) {
console.error('Batch translation failed:', error);
return texts;
}
}
