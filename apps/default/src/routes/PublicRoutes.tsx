import { Route, Routes } from 'react-router-dom';
import LandingPage from '../components/landing/LandingPage';
import AboutPage from '../components/landing/AboutPage';
import PrivacyPage from '../components/landing/PrivacyPage';
import TermsPage from '../components/landing/TermsPage';
import ContactPage from '../components/landing/ContactPage';
import HelpPage from '../components/landing/HelpPage';
import CommunityPage from '../components/landing/CommunityPage';
import DeveloperPlatformPage from '../components/landing/DeveloperPlatformPage';
import BlogPage from '../components/landing/BlogPage';
import CareersPage from '../components/landing/CareersPage';
import StatusPage from '../components/landing/StatusPage';
import SecurityPage from '../components/landing/SecurityPage';
import CookiePolicyPage from '../components/landing/CookiePolicyPage';

export const PUBLIC_PATHS = ['/', '/about', '/privacy', '/terms', '/contact', '/help', '/community', '/api-docs', '/blog', '/careers', '/status', '/security', '/cookie-policy'];

export function PublicRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/api-docs" element={<DeveloperPlatformPage />} />
      <Route path="/blog" element={<BlogPage />} />
      <Route path="/careers" element={<CareersPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/security" element={<SecurityPage />} />
      <Route path="/cookie-policy" element={<CookiePolicyPage />} />
    </Routes>
  );
}
