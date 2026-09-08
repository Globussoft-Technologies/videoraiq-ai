import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Cookies from 'js-cookie';
import getAccessToken from '@/utils/getAccessToken';
import { useAuth } from '@/context/AuthContext';
import { logout } from '@/hooks/logout';
import { setSessionId, sessionHeaders } from '@/utils/sessionIdentity';

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

// Codes sessions.service.js's enforceRequestSession() can return (see
// server/core/v2/sessions/sessions.service.js) when the session this tab is
// using has been blocked/logged-out/invalidated from Session Management —
// most importantly by a superadmin or admin blocking it remotely. Any of
// these means this browser must be signed out immediately, not just refused
// the next API call.
const SESSION_REVOKED_CODES = new Set([
  'SESSION_BLOCKED',
  'SESSION_LOGGED_OUT', 
  'SESSION_INVALID',
  'DEVICE_BLOCKED',
]);
// Must stay comfortably below the session-list's own auto-refresh cadence
// (SessionManagement.jsx's AUTO_REFRESH_MS) so a block issued there reaches
// the blocked browser quickly rather than after a long-lived page sits idle.
const SESSION_CHECK_INTERVAL_MS = 15000;

/**
 * Route guard for the V2 app. It validates the access token against the backend
 * (or exchanges a short-lived aMember credential handoff for one), persists the
 * sessionId every login/reload path hands back (so Session Management's "Online"
 * presence and Last Active work for admins the same way they already do for
 * users), and polls the session's live status so a block/logout issued from
 * Session Management reaches this browser within SESSION_CHECK_INTERVAL_MS
 * instead of only on the next full page load.
 */
export default function IsAuth({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState(null);
  const exchangeStarted = useRef(false);
  const cancelledRef = useRef(false);
  const cancelTimerRef = useRef(null);

  const toLogin = () => {
    const target = loginRedirectUrl();

    if (isLocalSetup() || target === '/admin-login') {
      navigate('/admin-login', { replace: true, state: { from: location } });
      return;
    }
    window.location.replace(target);
  };

  useEffect(() => {
    // React 18 StrictMode (see main.jsx) double-invokes this effect in dev:
    // mount -> cleanup -> mount again, with the SAME component instance (refs
    // survive). exchangeStarted correctly stops the second invocation from
    // firing a second fetch/exchange — but that means the *first* invocation's
    // in-flight checkAccess() is the only one that will ever run, and its own
    // cleanup fires synchronously as part of that same double-invoke, before
    // the fetch has any chance to resolve. cancelledRef/cancelTimerRef below
    // exist to stop that phantom cleanup from cancelling this real, in-flight
    // request (see the cleanup function further down for how).
    // Every invocation (including the one about to bail out below) must
    // disarm the previous invocation's pending cancel timer first — the
    // *second* StrictMode invocation is the one whose cleanup must not be
    // allowed to cancel the first invocation's still-in-flight checkAccess(),
    // and it's also the one that hits the early return right after this. Doing
    // the clear after the return would never run on this path.
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    cancelledRef.current = false;

    if (exchangeStarted.current) return;
    exchangeStarted.current = true;

    const amemberLogin = Cookies.get('amember_login')  
    const amemberPass = Cookies.get('amember_pass') 
    const token = getAccessToken();
    const searchParams = new URLSearchParams(window.location.search);
    const impersonationToken = searchParams.get('amember_impersonation') || '';
    const amemberSsoToken = searchParams.get('amember_sso') || '';
    let sessionCheckTimer;
    const isCancelled = () => cancelledRef.current;

    if (impersonationToken || amemberSsoToken) {
      searchParams.delete('amember_impersonation');
      searchParams.delete('amember_sso');
      const cleanQuery = searchParams.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`);
    }

    // A block/logout pushed from Session Management only needs to clear this
    // browser locally — the server row was already updated by whoever did the
    // blocking, so re-notifying it (syncServer) would be redundant. The device
    // fingerprint (vq_client_id) still needs to survive so re-login recognizes
    // the same browser, hence keepSessionId isn't about that — it's just naming
    // symmetry with logout()'s own options; sessionId itself is always cleared
    // since a revoked session must never be reused as-is.
    const endLocalSession = () => {
      logout({ clearSession: true, syncServer: false });
      setIsLoading(false);
      toLogin();
    };

    if (!token && !(amemberLogin && amemberPass) && !impersonationToken && !amemberSsoToken) {
      setIsLoading(false);
      toLogin();
      return undefined;
    }

    async function checkAccess({ initial = false } = {}) {
      try {
        // impersonationToken/amemberSsoToken/amemberLogin+amemberPass are all
        // one-time exchanges (the SSO/impersonation tokens are server-side
        // single-use nonces; the aMember cookie handoff is deleted after use).
        // They must only ever run on the initial page-load check — the
        // interval below re-invokes checkAccess() with no `initial` flag
        // purely to recheck this tab's *already-issued* session, and without
        // this guard it would resubmit the same consumed SSO/impersonation
        // token every SESSION_CHECK_INTERVAL_MS, which the server correctly
        // rejects as "already been used" and logs the just-logged-in user
        // straight back out.
        if (initial && impersonationToken) {
          const response = await fetch(`${HOST}/auth/by-impersonation-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: impersonationToken }),
          });
          const result = await response.json();
          if (!response.ok || !result?.ok || !result?.token) {
            logout();
            setIsLoading(false);
            toLogin();
            return false;
          }
          Cookies.set(accessCookieName(), result.token, {
            expires: 1,
            secure: window.location.protocol === 'https:',
            path: '/',
          });
          setSessionId(result.sessionId);
          setUser(result.user);
          setIsLoading(false);
          return true;
        }

        if (initial && amemberSsoToken) {
          const response = await fetch(`${HOST}/auth/by-amember-sso-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: amemberSsoToken }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result?.ok || !result?.token) {
            logout();
            setUser(null);

            const hasInactiveAccess =
              (result?.authenticated === true && result?.access === false) ||
              result?.expired === true ||
              result?.reason === 'subscription_inactive' ||
              result?.reason === 'subscription_expired';
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
          setSessionId(result.sessionId);
          setUser(result.user);
          setIsLoading(false);
          return true;
        }

        if (initial && amemberLogin && amemberPass) {
          const response = await fetch(`${HOST}/auth/by-login-pass`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ login: amemberLogin, pass: amemberPass }),
          });
          const result = await response.json().catch(() => ({}));

          if (!result?.ok || !result?.token) {
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
          setSessionId(result.sessionId);
          deleteCookie('amember_login');
          deleteCookie('amember_pass');
          setUser(result.user);
          setIsLoading(false);
          return true;
        }

        // Re-read rather than close over the `token` captured at effect-start:
        // on the initial call after a fresh SSO/impersonation/login-pass
        // exchange above, that captured value predates the exchange (it was
        // read before any cookie existed) and would send a stale/empty token
        // here instead of the one the exchange just set.
        const currentToken = getAccessToken();
        const response = await fetch(`${HOST}/auth/by-login-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await sessionHeaders()) },
          body: JSON.stringify({ token: currentToken }),
        });
        const result = await response.json();
        const revokedCode = result?.code || result?.body?.code;

        if (isCancelled()) return false;

        if (SESSION_REVOKED_CODES.has(revokedCode)) {
          endLocalSession();
          return false;
        }

        if (!result?.success) {
          logout();
          setIsLoading(false);
          toLogin();
          return false;
        }

        // decodeToken echoes back whatever sessionId this tab already sent
        // (validated) — re-persist it so a long-lived tab's cookie never
        // silently expires out from under the socket/presence tracking.
        if (result.sessionId) setSessionId(result.sessionId);
        setUser(result.data);
        if (initial) setIsLoading(false);
        return true;
      } catch {
        if (isCancelled()) return false;
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
      if (!isCancelled() && allowed) {
        // Re-check only the token-restore path on an interval — the aMember
        // handoff branches above run once per page load (they consume a
        // one-time code/cookie), so re-running them here would be wrong; this
        // interval exists specifically to catch a block/logout that happens
        // while the tab is already open and authenticated.
        sessionCheckTimer = window.setInterval(() => {
          checkAccess();
        }, SESSION_CHECK_INTERVAL_MS);
      }
    });

    return () => {
      // React 18 StrictMode (dev only) invokes this effect twice: mount,
      // cleanup, mount again — synchronously, on the SAME component instance.
      // exchangeStarted correctly stops the second invocation from starting a
      // second fetch, which means only the *first* invocation's checkAccess()
      // call ever runs — but its cleanup (this function) fires immediately as
      // part of that same synchronous double-invoke, before the fetch has any
      // chance to resolve. Setting cancelledRef synchronously here would make
      // the eventual response always hit the isCancelled() guard above and
      // skip setIsLoading(false)/setUser(), leaving the app stuck on the
      // loading screen (renders blank) forever. Deferring the flag by a tick
      // lets StrictMode's immediate remount clear it back out (see below)
      // before it can ever affect a real in-flight request; a genuine unmount
      // (navigating away) has no second mount to do that, so the flag sticks
      // as intended.
      cancelTimerRef.current = setTimeout(() => {
        cancelledRef.current = true;
      }, 0);
      if (sessionCheckTimer) window.clearInterval(sessionCheckTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <div />;
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
