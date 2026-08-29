import React, { useState } from 'react';
import { useUserLanguage } from '@/hooks/useUserLanguage';

export function LanguageSelector() {
  const { userLanguage, setManualLanguage, resetToAutoDetect, supportedLanguages } = useUserLanguage();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="language-selector relative">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm">
        <span>🌐</span>
        <span>{userLanguage?.native || 'English'}</span>
        <span className="text-xs opacity-50">▼</span>
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-2 z-50 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1">
            {supportedLanguages.map((lang) => (
              <button key={lang.code} onClick={() => { setManualLanguage(lang.code); setIsOpen(false); }} className={`px-3 py-2 rounded-lg text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 ${userLanguage?.code === lang.code ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 font-medium' : ''}`}>
                <span className="mr-1">{lang.native}</span>
                <span className="text-xs opacity-50">{lang.name}</span>
              </button>
            ))}
          </div>
          <hr className="my-2 border-gray-200 dark:border-gray-700" />
          <button onClick={() => { resetToAutoDetect(); setIsOpen(false); }} className="w-full px-3 py-2 text-sm text-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-blue-600">
            🔄 Auto-detect
          </button>
        </div>
      )}
    </div>
  );
}