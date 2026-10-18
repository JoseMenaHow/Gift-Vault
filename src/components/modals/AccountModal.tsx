import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Cloud, CloudUpload, Download, LoaderCircle, LogOut, Mail, RefreshCw, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../supabase';

interface Props {
  email?: string;
  isSessionLoading: boolean;
  callbackError?: string;
  onDismissCallbackError: () => void;
  onClose: () => void;
  onOpenBackup: () => void;
  onOpenCloudMigration: () => void;
  syncStatus: 'local' | 'loading' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';
  syncMessage: string;
  canImportLocalVault: boolean;
  onRefreshCloud: () => void;
  onRetryCloudSync: () => void;
}

type RequestState = 'idle' | 'sending' | 'sent' | 'error' | 'signing-out';
type AuthMode = 'sign-in' | 'create-account';

const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

function isEmailRateLimitError(error: { message?: string; status?: number; code?: string }) {
  return error.status === 429
    || error.code === 'over_email_send_rate_limit'
    || /rate limit|too many (?:requests|emails)|email.*(?:limit|request)/i.test(error.message || '');
}

function getCooldownSeconds(message?: string) {
  const secondsMatch = message?.match(/(\d+)\s*(?:second|sec)/i);
  return secondsMatch ? Math.max(Number(secondsMatch[1]), DEFAULT_RESEND_COOLDOWN_SECONDS) : DEFAULT_RESEND_COOLDOWN_SECONDS;
}

function formatCooldown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = String(seconds % 60).padStart(2, '0');
  return minutes > 0 ? `${minutes}:${remainingSeconds}` : `${seconds}s`;
}

function getRequestErrorMessage(error: { message?: string; status?: number; code?: string }, authMode: AuthMode) {
  if (isEmailRateLimitError(error)) {
    return 'Too many sign-in emails requested. Please wait a little while before trying again.';
  }

  if (authMode === 'sign-in' && /signups not allowed|user not found|no user|not found/i.test(error.message || '')) {
    return 'We couldn’t find an account with that email. Try creating an account instead.';
  }

  return 'We couldn’t send a sign-in link. Please check your email address and try again.';
}

export default function AccountModal({
  email,
  isSessionLoading,
  callbackError,
  onDismissCallbackError,
  onClose,
  onOpenBackup,
  onOpenCloudMigration,
  syncStatus,
  syncMessage,
  canImportLocalVault,
  onRefreshCloud,
  onRetryCloudSync,
}: Props) {
  const [emailInput, setEmailInput] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isDataSyncOpen, setIsDataSyncOpen] = useState(false);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (cooldownSeconds === 0) return;

    const timer = window.setInterval(() => {
      setCooldownSeconds((remainingSeconds) => Math.max(remainingSeconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!callbackError) return;

    setAuthMode('sign-in');
    setErrorMessage(callbackError);
    setRequestState('error');
  }, [callbackError]);

  const selectAuthMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode);
    setErrorMessage('');
    setRequestState('idle');
    onDismissCallbackError();
  };

  const requestMagicLink = async () => {
    const normalizedEmail = emailInput.trim();
    if (!supabase || !normalizedEmail || requestInFlight.current || cooldownSeconds > 0) return;

    requestInFlight.current = true;
    setRequestState('sending');
    setErrorMessage('');
    onDismissCallbackError();

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: authMode === 'create-account',
        },
      });

      if (error) {
        if (isEmailRateLimitError(error)) {
          setCooldownSeconds(getCooldownSeconds(error.message));
        }
        setErrorMessage(getRequestErrorMessage(error, authMode));
        setRequestState('error');
        return;
      }

      setCooldownSeconds(DEFAULT_RESEND_COOLDOWN_SECONDS);
      setRequestState('sent');
    } finally {
      requestInFlight.current = false;
    }
  };

  const signOut = async () => {
    if (!supabase) return;

    setRequestState('signing-out');
    setErrorMessage('');
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
      setRequestState('error');
      return;
    }

    setRequestState('idle');
  };

  const isBusy = requestState === 'sending' || requestState === 'signing-out';
  const isRequestBlocked = isBusy || cooldownSeconds > 0;
  const isCreatingAccount = authMode === 'create-account';
  const isSyncBusy = syncStatus === 'loading' || syncStatus === 'saving';
  const syncNeedsAction = syncStatus === 'pending' || syncStatus === 'conflict' || syncStatus === 'error';
  const syncHasAlert = syncStatus === 'conflict' || syncStatus === 'error';
  const syncLabel = syncStatus === 'synced'
    ? 'Up to date across your devices'
    : syncStatus === 'saving'
      ? 'Saving your latest changes…'
      : syncStatus === 'pending'
        ? 'Changes are saved on this device and waiting to sync'
        : syncStatus === 'conflict'
          ? 'Your vault changed on another device'
          : syncStatus === 'error'
            ? 'Cloud sync needs attention'
            : 'Loading your cloud vault…';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal-content account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-modal-heading">
          <div>
            {!email && <p className="page-eyebrow">Gift Vault account</p>}
            <h2 id="account-modal-title" className="modal-title">
              {email ? 'Your account' : isCreatingAccount ? 'Create account' : 'Sign in'}
            </h2>
          </div>
          <button type="button" className="account-modal-close" onClick={onClose} aria-label="Close account">
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {isSessionLoading ? (
          <div className="account-status" role="status">
            <LoaderCircle className="account-spinner" size={19} strokeWidth={2} aria-hidden="true" />
            Checking your account…
          </div>
        ) : !isSupabaseConfigured ? (
          <div className="account-status account-status-error" role="alert">
            <CircleAlert size={19} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>Account sign-in is not configured.</strong>
              <span>Add the Supabase variables to `.env.local`, then restart Gift Vault.</span>
            </div>
          </div>
        ) : email ? (
          <div className="account-signed-in">
            <div className="account-identity">
              <span className="account-identity-icon" aria-hidden="true">
                <Mail size={18} strokeWidth={1.9} />
              </span>
              <div className="account-identity-copy">
                <strong>{email}</strong>
                <span
                  className={`account-sync-summary account-sync-summary-${syncStatus}`}
                  role={syncHasAlert ? 'alert' : 'status'}
                >
                  {isSyncBusy ? (
                    <LoaderCircle className="account-spinner" size={13} strokeWidth={2} aria-hidden="true" />
                  ) : syncHasAlert ? (
                    <CircleAlert size={13} strokeWidth={2} aria-hidden="true" />
                  ) : syncStatus === 'synced' ? (
                    <CheckCircle2 size={13} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Cloud size={13} strokeWidth={2} aria-hidden="true" />
                  )}
                  {syncMessage || syncLabel}
                </span>
              </div>
            </div>

            <div className={`account-data-sync${syncHasAlert ? ' has-alert' : ''}`}>
              <button
                type="button"
                className="account-data-sync-toggle"
                onClick={() => setIsDataSyncOpen((isOpen) => !isOpen)}
                aria-expanded={isDataSyncOpen}
                aria-controls="account-data-sync-panel"
              >
                <span>
                  <strong>Data &amp; sync</strong>
                  <small>Cloud refresh, backups, and local data.</small>
                </span>
                <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
              </button>
              <div
                id="account-data-sync-panel"
                className={`account-data-sync-panel${isDataSyncOpen ? ' is-open' : ''}`}
                aria-hidden={!isDataSyncOpen}
                inert={!isDataSyncOpen}
              >
                <div className="account-data-sync-panel-inner">
                  <div className="account-data-action">
                    <span className="account-data-action-icon" aria-hidden="true">
                      <RefreshCw className={isSyncBusy ? 'account-spinner' : undefined} size={17} strokeWidth={2} />
                    </span>
                    <span className="account-data-action-copy">
                      <strong>Sync now</strong>
                      <small>{syncMessage || syncLabel}</small>
                    </span>
                    <span className="account-data-action-buttons">
                      {syncNeedsAction && (
                        <button type="button" onClick={onRetryCloudSync} disabled={isSyncBusy}>
                          Retry
                        </button>
                      )}
                      <button type="button" onClick={onRefreshCloud} disabled={isSyncBusy}>
                        {syncNeedsAction ? 'Refresh' : 'Sync now'}
                      </button>
                    </span>
                  </div>

                  <div className="account-data-action">
                    <span className="account-data-action-icon" aria-hidden="true">
                      <Download size={17} strokeWidth={2} />
                    </span>
                    <span className="account-data-action-copy">
                      <strong>Backup &amp; restore</strong>
                      <small>Download a copy or replace this cloud vault.</small>
                    </span>
                    <button type="button" className="account-data-action-button" onClick={onOpenBackup}>
                      Open
                    </button>
                  </div>

                  {canImportLocalVault && (
                    <div className="account-data-action">
                      <span className="account-data-action-icon" aria-hidden="true">
                        <CloudUpload size={17} strokeWidth={2} />
                      </span>
                      <span className="account-data-action-copy">
                        <strong>Import local vault</strong>
                        <small>Bring this device’s local gifts into your account.</small>
                      </span>
                      <button type="button" className="account-data-action-button" onClick={onOpenCloudMigration}>
                        Import
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {requestState === 'error' && <p className="account-error" role="alert">{errorMessage}</p>}
            <button type="button" className="account-sign-out account-sign-out-footer" onClick={() => void signOut()} disabled={isBusy}>
              {requestState === 'signing-out' ? <LoaderCircle className="account-spinner" size={17} /> : <LogOut size={17} strokeWidth={2} />}
              {requestState === 'signing-out' ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <>
            <div className="auth-mode-tabs" role="tablist" aria-label="Account action">
              <button
                type="button"
                role="tab"
                aria-selected={!isCreatingAccount}
                className={`auth-mode-tab${!isCreatingAccount ? ' is-selected' : ''}`}
                onClick={() => selectAuthMode('sign-in')}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isCreatingAccount}
                className={`auth-mode-tab${isCreatingAccount ? ' is-selected' : ''}`}
                onClick={() => selectAuthMode('create-account')}
              >
                Create account
              </button>
            </div>

            {requestState === 'sent' ? (
              <div className="account-sent">
                <div className="account-status account-status-success" role="status">
                  <CheckCircle2 size={19} strokeWidth={2} aria-hidden="true" />
                  <div>
                    <strong>Check your email.</strong>
                    <span>
                      {isCreatingAccount
                        ? `We sent an account confirmation link to ${emailInput.trim()}.`
                        : `We sent a sign-in link to ${emailInput.trim()}.`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="account-resend"
                  onClick={() => void requestMagicLink()}
                  disabled={isRequestBlocked}
                >
                  {cooldownSeconds > 0 ? `Resend available in ${formatCooldown(cooldownSeconds)}` : 'Resend link'}
                </button>
              </div>
            ) : (
              <>
                <p className="account-intro">
                  {isCreatingAccount
                    ? 'Create an account with an email link. Your Gift Vault data stays on this device until cloud sync is added.'
                    : 'Enter the email for your existing account. Signing in does not create a new account.'}
                </p>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  void requestMagicLink();
                }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="account-email">Email address</label>
                    <div className="account-email-input">
                      <Mail size={18} strokeWidth={2} aria-hidden="true" />
                      <input
                        id="account-email"
                        type="email"
                        className="form-input"
                        value={emailInput}
                        onChange={(event) => setEmailInput(event.target.value)}
                        autoComplete="email"
                        placeholder="you@example.com"
                        autoFocus
                        required
                      />
                    </div>
                  </div>
                  {requestState === 'error' && <p className="account-error" role="alert">{errorMessage}</p>}
                  <div className="button-group account-actions">
                    <button type="submit" className="btn-primary" disabled={isRequestBlocked || !emailInput.trim()}>
                      {requestState === 'sending'
                        ? 'Sending link…'
                        : cooldownSeconds > 0
                          ? `Try again in ${formatCooldown(cooldownSeconds)}`
                          : isCreatingAccount
                            ? 'Create account'
                            : 'Send sign-in link'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={onClose} disabled={isBusy}>Continue locally</button>
                  </div>
                </form>
              </>
            )}
          </>
        )}

        {!email && (
          <div className="account-backup-section">
            <div>
              <strong>Local backup</strong>
              <span>Download or restore this device’s Gift Vault data.</span>
            </div>
            <button type="button" className="account-backup-button" onClick={onOpenBackup}>
              <Download size={17} strokeWidth={2} aria-hidden="true" />
              Backup &amp; restore
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
