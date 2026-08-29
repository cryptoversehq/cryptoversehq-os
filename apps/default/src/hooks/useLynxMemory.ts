import { lynxMemory } from '@/lib/memoryEngine';
import { useState, useEffect } from 'react';

export function useLynxMemory() {
  const [memory, setMemory] = useState({
    shortTerm: lynxMemory.getShortTermMemory(),
    longTerm: lynxMemory.getLongTermMemory(),
  });

  useEffect(() => {
    const id = setInterval(() => {
      setMemory({
        shortTerm: lynxMemory.getShortTermMemory(),
        longTerm: lynxMemory.getLongTermMemory(),
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return {
    memory,
    getUserSummary: lynxMemory.getUserSummary.bind(lynxMemory),
    analyzeAndUpdate: lynxMemory.analyzeAndUpdate.bind(lynxMemory),
  };
}
