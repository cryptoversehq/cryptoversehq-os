import { useEffect, useState } from 'react';

const RTL_LANGUAGES = ['fa', 'ar', 'he', 'ur', 'ps', 'ckb'];

export function useRTL() {
const [isRTL, setIsRTL] = useState(false);

const [language, setLanguage] = useState('en');

useEffect(() => {
const currentLanguage = localStorage.getItem('cryptoverse_language') || navigator.language?.split('-')[0] || 'en';
setLanguage(currentLanguage);
const rtl = RTL_LANGUAGES.includes(currentLanguage);
setIsRTL(rtl);

// Set dir to html
document.documentElement.dir = rtl ? 'rtl' : 'ltr';
document.documentElement.lang = currentLanguage;

// Add class to body for styling
if (rtl) {
document.body.classList.add('rtl-mode');
document.body.classList.remove('ltr-mode');
} else {
document.body.classList.add('ltr-mode');
document.body.classList.remove('rtl-mode');
}
}, []);

const switchLanguage = (newLanguage: string) => { 
const rtl = RTL_LANGUAGES.includes(newLanguage); 
setIsRTL(rtl); 
setLanguage(newLanguage); 
localStorage.setItem('cryptoverse_language', newLanguage); 
document.documentElement.dir = rtl ? 'rtl' : 'ltr'; 
document.documentElement.lang = newLanguage; 

if (rtl) { 
document.body.classList.add('rtl-mode'); 
document.body.classList.remove('ltr-mode'); 
} else { 
document.body.classList.add('ltr-mode'); 
document.body.classList.remove('rtl-mode'); 
} 
}; 

return { isRTL, language, switchLanguage };
}