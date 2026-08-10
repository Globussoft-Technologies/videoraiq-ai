import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import logo from '@/assets/videoraiq-logo-color.png';
import { verifyRecipientOtp } from '@/helpers/recipients';

function contactType(value) {
  return String(value || '').includes('@') ? 'email' : 'phone';
}

function stateCopy(state, type) {
  if (state === 'loading') {
    return {
      title: 'Verifying...',
      subtitle: `Checking your ${type} verification link.`,
      color: 'var(--blue)',
      Icon: Loader2,
    };
  }
  if (state === 'success') {
    return {
      title: 'Verified Successfully',
      subtitle: "You're all set to continue.",
      color: 'var(--ok)',
      Icon: CheckCircle2,
    };
  }
  if (state === 'invalid') {
    return {
      title: 'Invalid Verification Link',
      subtitle: 'The link is missing a token or contact value.',
      color: 'var(--warn)',
      Icon: AlertTriangle,
    };
  }
  return {
    title: 'Verification Failed',
    subtitle: 'The link may be expired or already used.',
    color: 'var(--crit)',
    Icon: AlertTriangle,
  };
}

export default function VerifyRecipient() {
  const [searchParams] = useSearchParams();
  const tokenData = searchParams.get('token') || '';
  const value = searchParams.get('value') || '';
  const type = useMemo(() => contactType(value), [value]);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState('');
  const hasCalled = useRef(false);

  useEffect(() => {
    if (hasCalled.current) return;
    hasCalled.current = true;

    if (!tokenData || !value) {
      setState('invalid');
      setMessage('Missing token or contact value.');
      toast.error('Invalid verification link.');
      return;
    }

    async function verify() {
      try {
        const response = await verifyRecipientOtp({ type, value, tokenData });
        const body = response?.body;
        if (response?.statusCode === 200 || body?.status === 'success') {
          setState('success');
          setMessage(body?.message || `Your ${type} has been verified.`);
          toast.success(body?.message || 'Verified successfully.');
          return;
        }

        setState('error');
        setMessage(body?.message || 'Verification failed. Please try again.');
        toast.error(body?.message || 'Verification failed.');
      } catch (error) {
        setState('error');
        setMessage(error?.response?.data?.body?.message || 'A server error occurred during verification.');
        toast.error(error?.response?.data?.body?.message || 'A server error occurred during verification.');
      }
    }

    verify();
  }, [tokenData, type, value]);

  const copy = stateCopy(state, type);
  const Icon = copy.Icon;
  const ContactIcon = type === 'email' ? Mail : Smartphone;
  const spinning = state === 'loading';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background:
          'radial-gradient(circle at 20% 15%, rgba(59,130,246,.18), transparent 30%), radial-gradient(circle at 82% 78%, rgba(168,85,247,.16), transparent 32%), linear-gradient(135deg, #eef4ff 0%, #f8fafc 48%, #f4f7fb 100%)',
      }}
    >
      <section
        style={{
          width: 'min(100%, 410px)',
          borderRadius: 18,
          border: '1px solid rgba(148,163,184,.28)',
          background: 'rgba(255,255,255,.88)',
          boxShadow: '0 28px 80px rgba(15,23,42,.18)',
          backdropFilter: 'blur(18px)',
          padding: '30px 28px',
          textAlign: 'center',
        }}
      >
        <img src={logo} alt="VideorAIQ" style={{ width: 145, height: 'auto', margin: '0 auto 26px', display: 'block' }} />

        <span
          style={{
            width: 58,
            height: 58,
            margin: '0 auto 16px',
            borderRadius: 18,
            display: 'grid',
            placeItems: 'center',
            color: copy.color,
            background: `${copy.color}14`,
            border: `1px solid ${copy.color}30`,
          }}
        >
          <Icon size={30} strokeWidth={2.2} className={spinning ? 'animate-spin' : ''} />
        </span>

        <h1 style={{ margin: 0, fontFamily: 'var(--disp)', fontSize: 24, fontWeight: 800, color: copy.color }}>
          {copy.title}
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 700, color: '#172033' }}>
          {state === 'success' ? 'Thank you!' : message || copy.subtitle}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
          {state === 'success' ? copy.subtitle : copy.subtitle}
        </p>

        {value && (
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: 12,
              overflowWrap: 'anywhere',
            }}
          >
            <ContactIcon size={14} />
            <span>{value}</span>
          </div>
        )}
      </section>
    </main>
  );
}
