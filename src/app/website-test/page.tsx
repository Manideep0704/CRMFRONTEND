'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Globe, ShieldCheck, Sparkles, Building2, User, Phone, Mail, Stethoscope, Search, ExternalLink } from 'lucide-react';

export default function WebsiteTestPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastLead, setLastLead] = useState<any>(null);

  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    phone: '',
    email: '',
    business_type: '',
    inquiry_type: '',
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      ...form,
      utm_source: 'live_website_demo',
      external_submission_id: crypto.randomUUID()
    };

    try {
      const res = await fetch('/api/v1/public/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'tly_9Cy-8gtWI2FMMh_GpxLTwfFr5Iav7gY7-cR-1JxnSinXwaFwhc9enQ',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server returned ${res.status}`);
      }

      const data = await res.json();
      if (data.accepted) {
        setSubmitted(true);
        setLastLead(payload);
        setForm({
          full_name: '',
          company_name: '',
          phone: '',
          email: '',
          business_type: '',
          inquiry_type: '',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a192f 0%, #0d2847 45%, #064e3b 100%)',
      color: '#f0f9ff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '40px 20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Top Banner Navigation */}
      <div style={{
        maxWidth: 620,
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(37, 99, 235, 0.15)',
          border: '1px solid rgba(37, 99, 235, 0.35)',
          color: '#60a5fa',
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 600
        }}>
          <span style={{
            width: 8,
            height: 8,
            background: '#10b981',
            borderRadius: '50%',
            boxShadow: '0 0 10px #10b981'
          }} />
          <span>Interactive Website Lead Simulator</span>
        </div>

        <Link
          href="/"
          target="_blank"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#93c5fd',
            fontSize: 13,
            textDecoration: 'none',
            background: 'rgba(255,255,255,0.06)',
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            transition: 'all 0.2s'
          }}
        >
          <span>Open CRM Tab</span>
          <ExternalLink size={13} />
        </Link>
      </div>

      {/* Main Form Card */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e3a8a',
        borderRadius: 18,
        maxWidth: 620,
        width: '100%',
        boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 0 40px rgba(37, 99, 235, 0.12)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '28px 32px 20px',
          borderBottom: '1px solid #1e293b',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', marginBottom: 6 }}>
            Get a Free Strategy Consultation
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            This simulated website page sends leads directly into your CRM workspace via the live website integration API.
          </p>
        </div>

        {submitted && lastLead && (
          <div style={{
            margin: '20px 32px 0',
            padding: '16px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: 10,
            color: '#6ee7b7',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}>
            <CheckCircle2 size={24} style={{ flexShrink: 0, marginTop: 2, color: '#10b981' }} />
            <div>
              <strong style={{ fontSize: 15, display: 'block', marginBottom: 4, color: '#ffffff' }}>
                Lead Ingested into CRM in Real Time!
              </strong>
              <div style={{ fontSize: 13, color: '#a7f3d0', lineHeight: 1.5 }}>
                Lead <strong>&quot;{lastLead.full_name}&quot;</strong> from <strong>&quot;{lastLead.company_name}&quot;</strong> was received with source <code>website</code>.
                Check your <Link href="/" target="_blank" style={{ color: '#ffffff', textDecoration: 'underline', fontWeight: 600 }}>CRM Leads tab</Link> to see it appear!
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{
            margin: '20px 32px 0',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            borderRadius: 8,
            color: '#fca5a5',
            fontSize: 13
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '26px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Name <span style={{ color: '#f87171' }}>*</span></span>
              <input
                required
                type="text"
                placeholder="Dr. Rajesh Gupta"
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: '#0b1329',
                  border: '1.5px solid #1e3a8a',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Business Name <span style={{ color: '#f87171' }}>*</span></span>
              <input
                required
                type="text"
                placeholder="Apex Multispecialty Hospital"
                value={form.company_name}
                onChange={e => setForm({ ...form, company_name: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: '#0b1329',
                  border: '1.5px solid #1e3a8a',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Phone <span style={{ color: '#f87171' }}>*</span></span>
              <input
                required
                type="tel"
                placeholder="+91 9876543210"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: '#0b1329',
                  border: '1.5px solid #1e3a8a',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Email <span style={{ color: '#f87171' }}>*</span></span>
              <input
                required
                type="email"
                placeholder="rajesh@apexmultispecialty.in"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: '#0b1329',
                  border: '1.5px solid #1e3a8a',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Business Type <span style={{ color: '#f87171' }}>*</span></span>
              <select
                required
                value={form.business_type}
                onChange={e => setForm({ ...form, business_type: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: '#0b1329',
                  border: '1.5px solid #1e3a8a',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              >
                <option value="" disabled>Select business type...</option>
                <option value="Clinic / Hospital">Clinic / Hospital</option>
                <option value="Pharmacy / Chemist">Pharmacy / Chemist</option>
                <option value="Diagnostic / Pathology Lab">Diagnostic / Pathology Lab</option>
                <option value="Dental Practice">Dental Practice</option>
                <option value="Ayurveda / Wellness">Ayurveda / Wellness</option>
                <option value="Healthcare Provider">Healthcare Provider</option>
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>What are you looking for? <span style={{ color: '#f87171' }}>*</span></span>
              <select
                required
                value={form.inquiry_type}
                onChange={e => setForm({ ...form, inquiry_type: e.target.value })}
                style={{
                  padding: '12px 14px',
                  background: '#0b1329',
                  border: '1.5px solid #1e3a8a',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none'
                }}
              >
                <option value="" disabled>Select service needed...</option>
                <option value="Website Design & Development">Website Design & Development</option>
                <option value="Google & Meta Ads (PPC)">Google & Meta Ads (PPC)</option>
                <option value="Local SEO & Google Maps Ranking">Local SEO & Google Maps Ranking</option>
                <option value="Social Media Marketing">Social Media Marketing</option>
                <option value="Patient Lead Generation">Patient Lead Generation</option>
                <option value="Complete Digital Growth Package">Complete Digital Growth Package</option>
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 10,
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #2563eb 0%, #10b981 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
              opacity: submitting ? 0.7 : 1,
              transition: 'transform 0.15s, box-shadow 0.15s'
            }}
          >
            <span>{submitting ? 'Submitting to CRM...' : 'Get My Free Consultation'}</span>
            <ArrowRight size={18} />
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 12,
            color: '#94a3b8',
            textAlign: 'center'
          }}>
            <ShieldCheck size={14} color="#10b981" />
            <span>Real-time webhook integration active &bull; Auto-synced with CRM</span>
          </div>
        </form>
      </div>
    </div>
  );
}
