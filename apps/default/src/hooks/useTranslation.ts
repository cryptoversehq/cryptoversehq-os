import { translationCache } from '../lib/translationCache';
import { deepSeekChat } from '../lib/deepSeekClient';

export function useTranslation() {
const translateText = async (text: string, targetLanguage: string): Promise<string> => {
if (targetLanguage === 'en') return text;

const cached = translationCache.get(text, targetLanguage);
if (cached) {
console.log('✅ Cache hit:', text.substring(0, 30));
return cached;
}

try {
console.log('🔄 Translating:', text.substring(0, 30));
const response = await deepSeekChat([
{
role: 'system',
content: `Translate the following text to ${targetLanguage}. Only return the translation, no extra text or explanation.`
},
{ role: 'user', content: text }
]);

const translation = response.content || text;
translationCache.set(text, targetLanguage, translation);
return translation;
} catch (error) {
console.error('Translation failed:', error);
return text;
}
};

const translateBatch = async (texts: string[], targetLanguage: string): Promise<string[]> => {
const results: string[] = [];
const toTranslate: string[] = [];
const indices: number[] = [];

texts.forEach((text, index) => {
const cached = translationCache.get(text, targetLanguage);
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
content: `Translate the following texts to ${targetLanguage}. Return a JSON array of translations in the same order.`
},
{ role: 'user', content: JSON.stringify(toTranslate) }
]);

const translations = JSON.parse(response.content);
translations.forEach((translation: string, i: number) => {
const originalText = toTranslate[i];
const index = indices[i];
results[index] = translation;
translationCache.set(originalText, targetLanguage, translation);
});

return results;
} catch (error) {
console.error('Batch translation failed:', error);
return texts;
}
};

return { translateText, translateBatch };
}
