import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';
import { useAuth } from '@/context/AuthContext';
import { logout } from '@/hooks/logout';
import { sessionHeaders } from '@/utils/sessionIdentity';
import PageLoader from '@/components/PageLoader';

const HOST = import.meta.env.VITE_BACKEND;
const envValue = (key) => String(import.meta.env[key] || '').trim();
const isLocalSetup = () => envValue('VITE_LOCAL_SETUP').toLowerCase() === 'true';

const accessCookieName = () => {
  const env = envValue('VITE_ENV');
  if (env === 'dev') return 'dev-access-token';
  if (env === 'prod') return 'prod-access-token';
  return 'access-token';
};

const loginRedirectUrl = () => {
  const frontendUrl = envValue('VITE_FRONTEND').replace(/\/+$/, '');

  if (frontendUrl === 'https://pridehonda.videoraiq.com') {
    return '/admin-login';
  }

  const loginUrl = envValue('VITE_AMEMBER_LOGIN_URL');
  if (loginUrl) return loginUrl;

  const configuredMemberUrl = envValue('VITE_AMEMBER_MEMBER_URL');
  if (configuredMemberUrl) return configuredMemberUrl.replace(/\/member\/?$/, '/login');

  return '/admin-login';
};

const memberUrl = () => envValue('VITE_AMEMBER_MEMBER_URL') || loginRedirectUrl();

const logoutToLoginUrl = () => {
  const loginUrl = loginRedirectUrl();
  try {
    const logoutUrl = new URL(
      memberUrl().replace(/\/(?:member|login)\/?$/, '/logout'),
      window.location.href
    );
    logoutUrl.searchParams.set('amember_redirect_url', loginUrl);
    return logoutUrl.toString();
  } catch {
    return loginUrl;
  }
};

function deleteCookie(name, path = '/') {
  document.cookie = `${name}=; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
  const parts = window.location.hostname.split('.');
  if (parts.length > 1) {
    const domain = `.${parts.slice(-2).join('.')}`;
    document.cookie = `${name}=; domain=${domain}; path=${path}; expires=Thu, 01 Jan 1970 00:00:00 UTC;`;
  }
}

const authFailure = (result, response) => {
  if (result?.expired || result?.reason === 'subscription_expired') {
    const expiry = result?.latestExpiry
      ? new Date(result.latestExpiry).toLocaleDateString()
      : null;
    return {
      title: 'Your subscription has expired',
      message: expiry
        ? `Your last subscription expired on ${expiry}. Renew it to continue to VideoraIQ.`
        : 'Renew your subscription to continue to VideoraIQ.',
    };
  }

  if (result?.authenticated || result?.reason === 'subscription_inactive') {
    return {
      title: 'No active subscription',
      message:
        'Your account is valid, but access is not active. Check for a pending, cancelled, expired, or failed recurring payment.',
    };
  }

  if (response?.status === 401 || response?.status === 403) {
    return {
      title: 'Sign-in failed',
      message: result?.msg || result?.message || 'The username or password is incorrect.',
    };
  }

  return {
    title: 'Unable to complete sign-in',
    message: result?.msg || result?.message || 'Please try again in a few minutes.',
  };
};

const SESSION_REVOKED_CODES = new Set([
  'SESSION_BLOCKED',
  'SESSION_LOGGED_OUT',
  'SESSION_INVALID',
  'DEVICE_BLOCKED',
]);
const SESSION_CHECK_INTERVAL_MS = 15000;

// The aMember credential handoff (amember_login/amember_pass -> access token)
// must run at most once for a given page load: it deletes the handoff cookies
// and a second attempt would fail and loop. These live at module scope (not
// refs) so React StrictMode's double effect invocation in development — mount,
// cleanup, mount again — still only exchanges once, and so the second pass can
// tell an exchange is mid-flight and wait for it rather than redirecting to
// login on the not-yet-written token. Plain token validation is idempotent and
// deliberately NOT guarded by these, so it re-runs on the second invocation and
// always resolves the loading state.
let amemberExchangeStarted = false;
let amemberExchangeInFlight = false;

/**
 * Route guard for the V2 app. It validates the access token against the backend
 * (or exchanges a short-lived aMember credential handoff for one) and keeps
 * checking the active session so blocked devices/sessions are removed from the
 * logged-in browser automatically.
 */
export default function IsAuth({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState(null);

  const toLogin = () => {
    const target = loginRedirectUrl();

    if (isLocalSetup() || target === '/admin-login') {
      navigate('/admin-login', { replace: true, state: { from: location } });
      return;
    }
    window.location.replace(target);
  };

  useEffect(() => {
    // A pending aMember handoff we haven't already consumed on this page load.
    const hasAmemberHandoff =
      !amemberExchangeStarted &&
      Boolean(Cookies.get('amember_login') && Cookies.get('amember_pass'));
    const amemberLogin = hasAmemberHandoff ? Cookies.get('amember_login') : undefined;
    const amemberPass = hasAmemberHandoff ? Cookies.get('amember_pass') : undefined;
    const token = getAccessToken();
    let cancelled = false;
    let sessionCheckTimer;

    // StrictMode's second pass (or a remount) landing while the one-shot aMember
    // exchange is still running: the token isn't written yet, so don't treat it
    // as "no session" — hold the loader and let the in-flight exchange finish.
    if (!hasAmemberHandoff && !token && amemberExchangeInFlight) {
      return undefined;
    }

    const endLocalSession = ({ keepSessionId = false } = {}) => {
      logout({ clearSession: !keepSessionId, syncServer: false });
      setIsLoading(false);
      toLogin();
    };

    if (!token && !(amemberLogin && amemberPass)) {
      setIsLoading(false);
      toLogin();
      return undefined;
    }

    async function checkAccess({ initial = false } = {}) {
      try {
        if (amemberLogin && amemberPass) {
          // Consume the handoff once per page load — StrictMode's second effect
          // pass (and the background poll) must fall through to token validation.
          amemberExchangeStarted = true;
          amemberExchangeInFlight = true;
          const response = await fetch(`${HOST}/auth/by-login-pass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ login: amemberLogin, pass: amemberPass }),
          });
          const result = await response.json().catch(() => ({}));

          if (!result?.ok || !result?.token) {
            amemberExchangeInFlight = false;
            logout();
            // The plugin creates parent-domain cookies. Removing only a host
            // cookie leaves them intact and causes an endless exchange loop.
            deleteCookie('amember_login');
            deleteCookie('amember_pass');
            setUser(null);

            // aMember accepted the credentials, but the account has no active
            // VideoraIQ access. Send the authenticated member to aMember's
            // membership page to renew or manage the subscription.
            const inactiveReasons = new Set([
              'subscription_inactive',
              'subscription_expired',
              'no_subscription',
              'subscription_pending',
              'subscription_cancelled',
              'recurring_payment_failed',
            ]);
            const hasInactiveAccess =
              (result?.authenticated === true && result?.access === false) ||
              result?.expired === true ||
              inactiveReasons.has(result?.reason);

            if (hasInactiveAccess) {
              window.location.replace(memberUrl());
              return false;
            }

            setFailure(authFailure(result, response));
            setIsLoading(false);
            return false;
          }

          Cookies.set(accessCookieName(), result.token, {
            expires: 1,
            secure: window.location.protocol === 'https:',
            path: '/',
          });
          deleteCookie('amember_login');
          deleteCookie('amember_pass');
          amemberExchangeInFlight = false;
          setUser(result.user);
          setIsLoading(false);
          return true;
        }

        const response = await fetch(`${HOST}/auth/by-login-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await sessionHeaders()) },
          body: JSON.stringify({ token }),
        });
        const result = await response.json();
        const revokedCode = result?.code || result?.body?.code;

        if (cancelled) return false;

        if (SESSION_REVOKED_CODES.has(revokedCode)) {
          endLocalSession({ keepSessionId: true });
          return false;
        }

        if (!result?.success) {
          endLocalSession();
          return false;
        }

        setUser(result.data);
        if (initial) setIsLoading(false);
        return true;
      } catch {
        amemberExchangeInFlight = false;
        if (cancelled) return false;
        if (!initial) return false;

        // Only the initial check surfaces a hard failure UI — a transient
        // network error on a background poll shouldn't kick the user out.
        logout();
        deleteCookie('amember_login');
        deleteCookie('amember_pass');
        setUser(null);
        setFailure({
          title: 'Unable to complete sign-in',
          message: 'VideoraIQ could not verify your account. Please try again in a few minutes.',
        });
        setIsLoading(false);
        return false;
      }
    }

    checkAccess({ initial: true }).then((allowed) => {
      if (!cancelled && allowed) {
        sessionCheckTimer = window.setInterval(() => {
          checkAccess();
        }, SESSION_CHECK_INTERVAL_MS);
      }
    });

    return () => {
      cancelled = true;
      if (sessionCheckTimer) window.clearInterval(sessionCheckTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <PageLoader />;
  if (failure) {
    return (
      <main
        style={{
          minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px',
          background: '#f5f7fb', color: '#172033',
        }}
      >
        <section
          role="alert"
          style={{
            width: 'min(480px, 100%)', padding: '32px', border: '1px solid #dfe5ef',
            borderRadius: '16px', background: '#fff',
            boxShadow: '0 18px 50px rgba(20, 38, 70, 0.10)',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: '24px' }}>{failure.title}</h1>
          <p style={{ margin: '0 0 24px', lineHeight: 1.6, color: '#556176' }}>
            {failure.message}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <a
              href={memberUrl()}
              style={{
                padding: '10px 16px', borderRadius: '8px', background: '#2563eb',
                color: '#fff', textDecoration: 'none', fontWeight: 600,
              }}
            >
              Manage subscription
            </a>
            <a
              href={logoutToLoginUrl()}
              style={{
                padding: '10px 16px', border: '1px solid #cbd5e1', borderRadius: '8px',
                color: '#25324a', textDecoration: 'none', fontWeight: 600,
              }}
            >
              Sign in with another account
            </a>
          </div>
        </section>
      </main>
    );
  }
  if (getAccessToken()) return <>{children}</>;
  return null;
}
