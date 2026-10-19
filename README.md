# Gift Vault

## Supabase Connection Setup

Gift Vault uses Supabase for email authentication. Local data remains on the device unless a signed-in user explicitly starts the one-time cloud import.

1. Copy `.env.example` to `.env.local`.
2. In Supabase, open **Project Settings > API** and add your Project URL and publishable key:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

3. Restart the local development server after saving the file.

`.env.local` stays on your machine and is ignored by Git. Never put a Supabase service-role key in a Vite environment variable.

## Cloud Import Setup

The first cloud-persistence phase imports one device's existing Gift Vault data into an otherwise empty signed-in account. It is not continuous synchronization yet.

1. In the Supabase dashboard, open **SQL Editor** for the Gift Vault project.
2. Create a new query, paste the complete contents of [20261011000100_create_gift_vault_import.sql](./supabase/migrations/20261011000100_create_gift_vault_import.sql), and run it once.
3. Confirm the query succeeds. It creates the private `gift_vault_people`, `gift_vault_gifts`, `gift_vault_memories`, and `gift_vault_imports` tables, plus the private `gift-vault-media` storage bucket and account-only RLS policies.
4. Restart the local app, sign in, open **Account**, and choose **Import local vault**. The app creates a downloadable migration-safety backup before it uploads anything.

### Disposable-data test

Use a separate test account and a small local vault first: one person with a birthday and tags, one gift with multiple links and an uploaded image, and one memory. Start the import, then confirm its success state. In Supabase's Table Editor, the three records should belong to that test user's UUID. The uploaded image should appear in the private `gift-vault-media` bucket under that UUID. Sign out and back in to confirm the account session persists; this phase does not load cloud data back into the app yet.

If the import is interrupted, open the importer again with unchanged local data and choose **Resume import**. It uses the same import identifier and ignores already-created rows. If the signed-in account already has a different cloud dataset, Gift Vault stops rather than merging or replacing either dataset. Download a local backup and wait for a dedicated merge flow.

## Cloud Sync Setup

Cloud synchronization requires one additional migration after the import schema is installed. In the Supabase SQL Editor, run the complete contents of [20261011000200_add_cloud_sync_metadata.sql](./supabase/migrations/20261011000200_add_cloud_sync_metadata.sql).

It adds server-managed revision timestamps and soft-delete markers to the existing Gift Vault tables. It preserves existing people, gifts, memories, and media. Once applied, signed-in accounts load their cloud vault on startup, save new changes to Supabase, and can use **Account → Refresh** to retrieve changes from another device.

For safe testing, use a second browser profile with the same test account: create and edit a gift in the first profile, then use **Refresh** in the second. Delete it in the first, refresh the second, and confirm it disappears. For simultaneous edits to the same item, Gift Vault retains the local change, reports a conflict, and offers a backup-first refresh instead of overwriting either version automatically.

## Cloud Backup Restore Setup

Cloud backup restore requires the import schema and cloud-sync migration above, plus [20261012000100_add_cloud_backup_restore.sql](./supabase/migrations/20261012000100_add_cloud_backup_restore.sql) and [20261012000200_add_revision_guarded_cloud_sync.sql](./supabase/migrations/20261012000200_add_revision_guarded_cloud_sync.sql).

Run the migrations in this exact order:

1. `20261011000100_create_gift_vault_import.sql`
2. `20261011000200_add_cloud_sync_metadata.sql`
3. `20261012000100_add_cloud_backup_restore.sql`
4. `20261012000200_add_revision_guarded_cloud_sync.sql`

Before running step 4, publish the Gift Vault client that uses the guarded sync RPC. Until that migration exists, this client keeps changes local and shows that cloud setup is required; it does not fall back to direct vault writes. Step 4 then revokes direct browser writes to vault-content tables, so older clients can retain local edits but cannot recreate cloud records after a restore.

When signed in, **Backup & restore** validates the selected file, previews its record counts, downloads a portable safety copy of the current cloud vault (including private uploaded images), then stages the incoming images and records. Only after staging succeeds does an authenticated database function replace the account’s people, gifts, and memories in one transaction. An account revision check rejects a replacement when another device changes the vault during preparation. The old media files are deliberately retained rather than deleted during a restore, so a failure cannot remove them.

### Disposable-data test

Use a test account with two people, gifts with links and uploaded images, a delivered gift, birthday, tags, and a memory. Download a backup, change or remove several cloud records, then restore that backup while signed in. Confirm that a `gift-vault-cloud-safety-*.json` file downloads before the replacement, the restored account shows the original data after completion, and a second browser profile shows the same result after **Account → Refresh**. Test an unreadable image backup separately: the app should stop during staging with the existing cloud vault unchanged.

## Birthday Gift Status Setup

Birthday gift purchase status requires [20261019000100_add_birthday_gift_bought.sql](./supabase/migrations/20261019000100_add_birthday_gift_bought.sql) after the four migrations listed above. Run the complete file in Supabase SQL Editor before testing or publishing the client that uses this field. The migration adds one nullable date column and wraps the existing guarded sync and restore functions; it does not rewrite existing vault records.

Test with a disposable account first. Give a person a birthday within two calendar months, mark the birthday gift as bought, and refresh from a second browser profile. Confirm the status appears there and the birthday disappears from the global 30-day reminder. Undo from the second profile and refresh the first to confirm it returns.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
