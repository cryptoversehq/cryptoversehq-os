import { Route } from 'react-router-dom';
import { SentimentPage } from '../components/sentiment/SentimentPage';
import { Gate, ScrollPage } from './RouteWrappers';

export const SentimentRouteElements = (
  <>
    <Route path="/sentiment" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/fear-greed" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/social" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/news" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/alerts" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/signals" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/checklist" element={<ScrollPage><Gate level="pro" feature="Sentiment Analysis"><SentimentPage /></Gate></ScrollPage>} />
    <Route path="/sentiment/report" element={<ScrollPage><SentimentPage /></ScrollPage>} />
  </>
);
