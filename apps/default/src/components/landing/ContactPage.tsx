import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Shield, Users, Lock, Send, CheckCircle, AlertCircle, Loader2, HelpCircle, BookOpen, FileText, GraduationCap } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { LandingCTA } from './LandingCTA';
import { cn } from '@/lib/utils';

// ── Contact information cards ──

const CONTACT_CARDS = [
  {
    icon: Mail,
    title: 'General Support',
    email: 'support@cryptoversehq.com',
    desc: 'Questions about your account, learning, or using the platform.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Users,
    title: 'Partnerships',
    email: 'partnerships@cryptoversehq.com',
    desc: 'Business partnerships and collaboration opportunities.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Shield,
    title: 'Privacy',
    email: 'privacy@cryptoversehq.com',
    desc: 'Questions about personal data and privacy.',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: Lock,
    title: 'Security',
    email: 'security@cryptoversehq.com',
    desc: 'Report vulnerabilities or security concerns responsibly.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

// ── Resource navigation cards ──

const RESOURCES = [
  { icon: HelpCircle, title: 'Help Center', desc: 'Browse articles and FAQs.', href: '/help' },
  { icon: Shield, title: 'Privacy Policy', desc: 'How we handle your data.', href: '/privacy' },
  { icon: FileText, title: 'Terms of Service', desc: 'Platform rules and guidelines.', href: '/terms' },
  { icon: GraduationCap, title: 'Academy', desc: 'Start learning today.', href: '/academy' },
];

// ── Form categories ──

const CATEGORIES = ['General', 'Technical Issue', 'Billing', 'Privacy', 'Partnership', 'Other'] as const;

// ── Form state ──

type FormStatus = 'idle' | 'loading' | 'success' | 'error';

interface FormData {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  email: '',
  subject: '',
  category: 'General',
  message: '',
};

// ── Contact Form Section ──

function ContactForm() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const validate = useCallback((): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!form.email.trim()) {
      e.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Please enter a valid email address.';
    }
    if (!form.subject.trim()) e.subject = 'Subject is required.';
    if (!form.message.trim()) {
      e.message = 'Message is required.';
    } else if (form.message.trim().length < 10) {
      e.message = 'Message must be at least 10 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus('loading');

    // Simulate API call — backend email delivery not implemented yet
    try {
      await new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          // Simulate success 90% of the time for UI testing
          if (Math.random() > 0.1) {
            resolve();
          } else {
            reject(new Error('Network error. Please try again.'));
          }
        }, 1500);
      });
      setStatus('success');
      setForm(INITIAL_FORM);
    } catch {
      setStatus('error');
    }
  };

  const handleReset = () => {
    setStatus('idle');
  };

  const inputClass = cn(
    'w-full px-4 py-3 text-sm rounded-xl border border-border bg-background',
    'text-foreground placeholder:text-muted-foreground/60',
    'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30',
    'transition-colors',
  );

  const errorClass = 'text-xs text-red-500 mt-1';

  return (
    <LandingSection id="contact-form">
      <div className="text-center mb-10">
        <SectionLabel>Get in Touch</SectionLabel>
        <SectionHeading>Send us a message.</SectionHeading>
        <SectionSubtitle>
          Fill out the form below and we will get back to you as soon as possible.
        </SectionSubtitle>
      </div>

      {/* Info notice */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-sm text-muted-foreground">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <span>
            Please don't include passwords, private keys, or wallet recovery phrases in your message.
          </span>
        </div>
      </div>

      {/* Success state */}
      {status === 'success' && (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center text-center p-10 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Message Sent!</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Thank you for reaching out. We typically respond within 1–2 business days.
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
            >
              Send Another Message
            </button>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center text-center p-10 rounded-2xl border border-red-500/20 bg-red-500/5">
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Something went wrong.</h3>
            <p className="text-sm text-muted-foreground mb-6">
              We couldn't send your message. Please try again or email us directly at support@cryptoversehq.com.
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      {(status === 'idle' || status === 'loading') && (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Name */}
            <div>
              <label htmlFor="contact-name" className="block text-sm font-medium text-foreground mb-1.5">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-name"
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={cn(inputClass, errors.name && 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/30')}
                placeholder="Your name"
                disabled={status === 'loading'}
                autoComplete="name"
              />
              {errors.name && <p className={errorClass}>{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="contact-email" className="block text-sm font-medium text-foreground mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className={cn(inputClass, errors.email && 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/30')}
                placeholder="you@example.com"
                disabled={status === 'loading'}
                autoComplete="email"
              />
              {errors.email && <p className={errorClass}>{errors.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Subject */}
            <div>
              <label htmlFor="contact-subject" className="block text-sm font-medium text-foreground mb-1.5">
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-subject"
                type="text"
                value={form.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                className={cn(inputClass, errors.subject && 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/30')}
                placeholder="What is this about?"
                disabled={status === 'loading'}
              />
              {errors.subject && <p className={errorClass}>{errors.subject}</p>}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="contact-category" className="block text-sm font-medium text-foreground mb-1.5">
                Category
              </label>
              <select
                id="contact-category"
                value={form.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className={cn(inputClass, 'appearance-none cursor-pointer')}
                disabled={status === 'loading'}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="contact-message" className="block text-sm font-medium text-foreground mb-1.5">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              id="contact-message"
              rows={6}
              value={form.message}
              onChange={(e) => handleChange('message', e.target.value)}
              className={cn(inputClass, 'resize-y min-h-[120px]', errors.message && 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/30')}
              placeholder="Tell us how we can help..."
              disabled={status === 'loading'}
            />
            {errors.message && <p className={errorClass}>{errors.message}</p>}
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={status === 'loading'}
              className={cn(
                'inline-flex items-center gap-2 px-8 py-3.5 text-sm font-bold rounded-xl transition-all shadow-lg',
                status === 'loading'
                  ? 'bg-primary/60 text-primary-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20',
              )}
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Message
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </LandingSection>
  );
}

// ── Contact Cards Section ──

function ContactCards() {
  return (
    <LandingSection id="contact-cards" alt>
      <div className="text-center mb-14">
        <SectionLabel>Ways to Reach Us</SectionLabel>
        <SectionHeading>We're here for you.</SectionHeading>
        <SectionSubtitle>
          Choose the channel that best fits your needs. Every message goes to the right team.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {CONTACT_CARDS.map(({ icon: Icon, title, email, desc, iconBg, iconColor }) => (
          <div
            key={title}
            className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300"
          >
            <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className={`h-6 w-6 ${iconColor}`} />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
            <a
              href={`mailto:${email}`}
              className="text-sm font-medium text-primary hover:underline mb-3"
            >
              {email}
            </a>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

// ── Helpful Resources Section ──

function HelpfulResources() {
  return (
    <LandingSection id="contact-resources">
      <div className="text-center mb-14">
        <SectionLabel>Helpful Resources</SectionLabel>
        <SectionHeading>Find answers faster.</SectionHeading>
        <SectionSubtitle>
          Before reaching out, you might find what you're looking for in one of these resources.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {RESOURCES.map(({ icon: Icon, title, desc, href }) => (
          <Link
            key={title}
            to={href}
            className="flex flex-col items-center text-center p-6 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300 group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>
    </LandingSection>
  );
}

// ── Response Expectations Section ──

function ResponseExpectations() {
  return (
    <LandingSection id="contact-response" alt>
      <div className="max-w-2xl mx-auto">
        <div className="p-8 rounded-2xl border bg-card">
          <h3 className="text-xl font-bold text-foreground mb-4">What happens next?</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We typically respond within <span className="font-semibold text-foreground">1–2 business days</span>.
            {' '}For security-related reports, please include as much relevant information as possible to help us
            investigate and respond effectively.
          </p>
        </div>
      </div>
    </LandingSection>
  );
}

// ── Contact Page ──

const ContactPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        {/* Hero */}
        <LandingSection id="contact-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Contact</SectionLabel>
            <SectionHeading>We're Here to Help.</SectionHeading>
            <SectionSubtitle>
              Whether you have questions about learning, your account, subscriptions, or
              CryptoVerse HQ, we'd love to hear from you.
            </SectionSubtitle>
            <p className="mt-4 text-sm text-muted-foreground/70">
              We aim to respond as quickly as possible.
            </p>
          </div>
        </LandingSection>

        <ContactCards />
        <ContactForm />
        <HelpfulResources />
        <ResponseExpectations />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default ContactPage;
