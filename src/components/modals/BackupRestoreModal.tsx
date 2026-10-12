import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import type { AppState } from '../../types';
import { readBackupFile } from '../../backup';
import { getLocalBackupRestoreErrorMessage } from '../../localBackupRestore';

interface Props {
  onDownloadBackup: () => Promise<string>;
  onRestoreBackup: (state: AppState) => Promise<string>;
  restoreDisabledMessage?: string;
  onClose: () => void;
}

type RestoreView = 'select' | 'confirm' | 'complete';

export default function BackupRestoreModal({ onDownloadBackup, onRestoreBackup, restoreDisabledMessage, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [restoreView, setRestoreView] = useState<RestoreView>('select');
  const [backupState, setBackupState] = useState<AppState | null>(null);
  const [backupFilename, setBackupFilename] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    setErrorMessage('');

    try {
      const filename = await onDownloadBackup();
      setNotice(`Backup downloaded as ${filename}.`);
    } catch {
      setErrorMessage('We could not create a backup from this device. Your current data is unchanged.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReading(true);
    setErrorMessage('');
    setNotice('');
    setBackupState(null);

    try {
      const nextState = await readBackupFile(file);
      setBackupState(nextState);
      setBackupFilename(file.name);
      setNotice('Backup verified and ready to restore.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'We could not read that backup file.');
      event.target.value = '';
    } finally {
      setIsReading(false);
    }
  };

  const handleRestore = async () => {
    if (!backupState) return;

    setIsRestoring(true);
    setErrorMessage('');

    try {
      const safetyFilename = await onRestoreBackup(backupState);
      setNotice(`Backup restored. Your previous vault was downloaded as ${safetyFilename}.`);
      setRestoreView('complete');
    } catch (error) {
      setErrorMessage(getLocalBackupRestoreErrorMessage(error));
      setRestoreView('select');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        className="modal-content backup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="account-modal-heading">
          <div>
            <p className="page-eyebrow">Local data</p>
            <h2 id="backup-modal-title" className="modal-title">Backup &amp; restore</h2>
          </div>
          <button type="button" className="account-modal-close" onClick={onClose} aria-label="Close backup and restore">
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {restoreView === 'complete' ? (
          <div className="backup-complete" role="status">
            <CheckCircle2 size={22} strokeWidth={2} aria-hidden="true" />
            <div>
              <strong>Backup restored</strong>
              <span>{notice}</span>
            </div>
            <button type="button" className="btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : restoreView === 'confirm' && backupState ? (
          <div className="backup-confirmation">
            <div className="account-status account-status-error">
              <ShieldCheck size={19} strokeWidth={2} aria-hidden="true" />
              <div>
                <strong>Replace this device's local vault?</strong>
                <span>{backupFilename} will replace the people, gifts, and memories currently on this device.</span>
              </div>
            </div>
            <p className="backup-confirmation-note">A safety backup of your current vault will download first. Nothing is uploaded to Gift Vault or Supabase.</p>
            <div className="button-group backup-confirmation-actions">
              <button type="button" className="btn-primary" onClick={() => void handleRestore()} disabled={isRestoring}>
                {isRestoring ? 'Restoring…' : 'Replace local data'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setRestoreView('select')} disabled={isRestoring}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="backup-sections">
            <section className="backup-section">
              <div className="backup-section-icon" aria-hidden="true"><Download size={19} strokeWidth={2} /></div>
              <div>
                <h3>Download backup</h3>
                <p>Save a portable copy of your people, gifts, memories, links, tags, and uploaded images.</p>
              </div>
              <button type="button" className="btn-secondary backup-action" onClick={() => void handleDownload()} disabled={isDownloading}>
                {isDownloading ? <LoaderCircle className="account-spinner" size={17} /> : <Download size={17} strokeWidth={2} />}
                {isDownloading ? 'Preparing…' : 'Download backup'}
              </button>
            </section>

            <section className="backup-section">
              <div className="backup-section-icon" aria-hidden="true"><FileUp size={19} strokeWidth={2} /></div>
              <div>
                <h3>Restore backup</h3>
                <p>Choose a Gift Vault backup file to replace the vault stored on this device.</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                className="backup-file-input"
                onChange={(event) => void handleFileSelection(event)}
                disabled={Boolean(restoreDisabledMessage)}
              />
              <button type="button" className="btn-secondary backup-action" onClick={() => inputRef.current?.click()} disabled={isReading || Boolean(restoreDisabledMessage)}>
                {isReading ? <LoaderCircle className="account-spinner" size={17} /> : <FileUp size={17} strokeWidth={2} />}
                {isReading ? 'Checking…' : 'Choose backup'}
              </button>
            </section>

            {restoreDisabledMessage && <p className="backup-notice" role="status">{restoreDisabledMessage}</p>}

            {notice && <p className="backup-notice" role="status">{notice}</p>}
            {errorMessage && <p className="account-error backup-error" role="alert">{errorMessage}</p>}

            {backupState && !restoreDisabledMessage && (
              <button type="button" className="btn-primary backup-restore-button" onClick={() => setRestoreView('confirm')}>
                Restore {backupFilename}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
