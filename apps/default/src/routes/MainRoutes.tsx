import { Routes } from 'react-router-dom';
import {
  DashboardRouteElements,
  EventsRouteElements,
  ExchangeRouteElements,
  NFTRouteElements,
  ProfileRouteElements,
  SentimentRouteElements,
} from './index';

export function MainRoutes() {
  return (
    <Routes>
      {DashboardRouteElements}
      {ExchangeRouteElements}
      {NFTRouteElements}
      {SentimentRouteElements}
      {EventsRouteElements}
      {ProfileRouteElements}
    </Routes>
  );
}
