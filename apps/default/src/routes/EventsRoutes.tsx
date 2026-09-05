import { Route } from 'react-router-dom';
import { EventsPage } from '../components/events/EventsPage';
import { Gate, ScrollPage } from './RouteWrappers';

export const EventsRouteElements = (
  <>
    <Route path="/events/*" element={<ScrollPage><Gate level="pro" feature="Live Events"><EventsPage /></Gate></ScrollPage>} />
  </>
);
