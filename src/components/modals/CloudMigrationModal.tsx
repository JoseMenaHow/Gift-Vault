import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, CloudUpload, Download, LoaderCircle, X } from 'lucide-react';
import type { AppState } from '../../types';
import { downloadBackup, getLatestLocalState } from '../../backup';
import {
  getCloudMigrationErrorMessage,
  getLocalImportSourceId,
  getLocalVaultCounts,
  importLocalVault,
  inspectCloudImport,
  isSchemaMissingError,
  type ImportProgress,
  type ImportReadiness,
  type LocalVaultCounts,
} from '../../cloudMigration';

interface Props {
  accountId: string;
  accountEmail?: string;
  fallbackState: AppState;
  onClose: () => void;
}

type ViewState = 'loading' | 'ready' | 'resume' | 'complete' | 'cloud-data-conflict' | 'no-data' | 'setup-required' | 'error' | 'importing';

function describeVault(counts: LocalVaultCounts) {
  const details = [
    `${counts.people} ${counts.people === 1 ? 'person' : 'people'}`,
    `${counts.gifts} ${counts.gifts === 1 ? 'gift' : 'gifts'}`,
  ];
  if (counts.memories > 0) details.push(`${counts.memories} ${counts.memories === 1 ? 'memory' : 'memories'}`);
  return details.join(' and ').replace(/, ([^,]*)$/, ', and $1');
}

function getProgressText(progress: ImportProgress | null) {
  if (!progress) return 'Preparing your import…';
  if (progress.step === 'uploading-media') {
    return `Uploading image ${progress.current} of ${progress.total}…`;
  }
  if (progress.step === 'importing-records') return 'Importing people, gifts, and memories…';
  if (progress.step === 'verifying') return 'Verifying your cloud copy…';
  return 'Preparing your import…';
}

export default function CloudMigrationModal({ accountId, accountEmail, fallbackState, onClose }: Props) {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [snapshot, setSnapshot] = useState<AppState | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<ImportReadiness | null>(null);
  const [counts, setCounts] = useState<LocalVaultCounts | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [safetyBackupName, setSafetyBackupName] = useState<string | null>(null);

  const prepare = async () => {
    setViewState('loading');
    setErrorMessage('');

    try {
      const latestState = await getLatestLocalState(fallbackState);
      const latestCounts = getLocalVaultCounts(latestState);
      setSnapshot(latestState);
      setCounts(latestCounts);

      if (latestCounts.people === 0 && latestCounts.gifts === 0 && latestCounts.memories === 0) {
        setViewState('no-data');
        return;
      }

      const nextSourceId = await getLocalImportSourceId(latestState);
      const nextReadiness = await inspectCloudImport(accountId, nextSourceId);
      setSourceId(nextSourceId);
      setReadiness(nextReadiness);
      setViewState(nextReadiness.kind);
    } catch (error) {
      if (isSchemaMissingError(error as { code?: string; message?: string })) {
        setViewState('setup-required');
      } else {
        setErrorMessage(getCloudMigrationErrorMessage(error));
        setViewState('error');
      }
    }
  };

  useEffect(() => {
    void prepare();
    // The modal intentionally works from one durable snapshot, not live edits made while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const downloadSafetyBackup = () => {
    if (!snapshot) return;
    const filename = downloadBackup(snapshot, 'migration-safety');
    setSafetyBackupName(filename);
  };

  const beginImport = async () => {
    if (!snapshot || !sourceId || !readiness || (readiness.kind !== 'ready' && readiness.kind !== 'resume')) return;

    try {
      const filename = downloadBackup(snapshot, 'migration-safety');
      setSafetyBackupName(filename);
      setViewState('importing');
      await importLocalVault({
        ownerId: accountId,
        state: snapshot,
        sourceId,
        readiness,
        onProgress: setProgress,
      });
      setViewState('complete');
    } catch (error) {
      setErrorMessage(getCloudMigrationErrorMessage(error));
      setViewState('error');
    }
  };

  return (
    <div className="modal-overlay" onClick={viewState === 'importing' ? undefined : onClose}>
      <section
        className="modal-content cloud-migration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-migration-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-modal-heading">
          <div>
            <p className="page-eyebrow">Gift Vault account</p>
            <h2 id="cloud-migration-title" className="modal-title">Bring your gifts with you</h2>
          </div>
          {viewState !== 'importing' && (
            <button type="button" className="account-modal-close" onClick={onClose} aria-label="Close cloud import">
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>

        {viewState === 'loading' && (
          <div className="account-status" role="status">
            <LoaderCircle className="account-spinner" size={19} strokeWidth={2} aria-hidden="true" />
            Checking this device’s local vault…
          </div>
        )}

        {(viewState === 'ready' || viewState === 'resume') && counts && (
          <>
            <div className="cloud-migration-intro">
              <CloudUpload size={21} strokeWidth={2} aria-hidden="true" />
              <div>
                <strong>{viewState === 'resume' ? 'Continue your protected import' : 'Keep this vault available across devices'}</strong>
                <span>We found {describeVault(counts)} saved on this device.</span>
              </div>
            </div>
            <p className="account-intro">
              Import into <strong>{accountEmail || 'your signed-in account'}</strong>. Gift Vault downloads a safety backup first, leaves this device’s data in place, and only completes after verifying the cloud copy.
            </p>
            {counts.media > 0 && <p className="cloud-migration-note">{counts.media} uploaded {counts.media === 1 ? 'image is' : 'images are'} included and will stay private to your account.</p>}
            <div className="button-group account-actions">
              <button type="button" className="btn-primary" onClick={() => void beginImport()}>
                {viewState === 'resume' ? 'Resume import' : 'Import to my account'}
              </button>
              <button type="button" className="btn-secondary" onClick={onClose}>Not now</button>
            </div>
          </>
        )}

        {viewState === 'importing' && (
          <div className="cloud-migration-progress" role="status" aria-live="polite">
            <LoaderCircle className="account-spinner" size={21} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>Importing your local vault</strong>
              <span>{getProgressText(progress)}</span>
            </div>
          </div>
        )}

        {viewState === 'complete' && (
          <>
            <div className="account-status account-status-success" role="status">
              <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
              <div>
                <strong>Your local vault is safely in your account.</strong>
                <span>This device’s data remains available here. Continuous sync comes in a later phase.</span>
              </div>
            </div>
            <button type="button" className="btn-primary cloud-migration-done" onClick={onClose}>Done</button>
          </>
        )}

        {viewState === 'no-data' && (
          <div className="account-status">
            <CloudUpload size={20} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>There is no local vault to import.</strong>
              <span>Add people or gifts on this device first, then return here to bring them into your account.</span>
            </div>
          </div>
        )}

        {viewState === 'setup-required' && (
          <div className="account-status account-status-error" role="alert">
            <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>Cloud import needs one setup step.</strong>
              <span>Apply the Gift Vault Supabase migration, then reopen this window. No local data has been sent.</span>
            </div>
          </div>
        )}

        {viewState === 'cloud-data-conflict' && (
          <>
            <div className="account-status account-status-error" role="alert">
              <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
              <div>
                <strong>This account already has cloud data.</strong>
                <span>To protect both vaults, Gift Vault will not merge or replace either one automatically.</span>
              </div>
            </div>
            <p className="account-intro">Keep this device’s vault intact and download a backup. A future merge flow can resolve two independent vaults explicitly.</p>
          </>
        )}

        {viewState === 'error' && (
          <>
            <p className="account-error" role="alert">{errorMessage}</p>
            <div className="button-group account-actions">
              <button type="button" className="btn-primary" onClick={() => void prepare()}>Try again</button>
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {(viewState === 'cloud-data-conflict' || viewState === 'no-data' || viewState === 'setup-required') && (
          <button type="button" className="btn-secondary cloud-migration-done" onClick={onClose}>Close</button>
        )}

        {snapshot && viewState !== 'importing' && viewState !== 'complete' && (
          <div className="cloud-migration-backup">
            <div>
              <strong>Keep a copy first</strong>
              <span>{safetyBackupName ? `Downloaded ${safetyBackupName}` : 'Download a portable copy of this device’s local vault.'}</span>
            </div>
            <button type="button" className="account-backup-button" onClick={downloadSafetyBackup}>
              <Download size={17} strokeWidth={2} aria-hidden="true" />
              Download backup
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
