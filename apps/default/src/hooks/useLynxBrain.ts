import { lynxBrain } from '@/lib/brainEngine';
import { useState, useEffect } from 'react';

export function useLynxBrain() {
  const [state, setState] = useState({
    sentiment: lynxBrain.getSentiment(),
    patterns: lynxBrain.getPatterns(),
    suggestions: lynxBrain.getSuggestions(),
    highPrioritySuggestions: lynxBrain.getHighPrioritySuggestions(),
  });

  useEffect(() => {
    const id = setInterval(() => {
      setState({
        sentiment: lynxBrain.getSentiment(),
        patterns: lynxBrain.getPatterns(),
        suggestions: lynxBrain.getSuggestions(),
        highPrioritySuggestions: lynxBrain.getHighPrioritySuggestions(),
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return {
    ...state,
    analyze: lynxBrain.analyzeSentiment.bind(lynxBrain),
    getSummary: lynxBrain.getBrainSummary.bind(lynxBrain),
  };
}
