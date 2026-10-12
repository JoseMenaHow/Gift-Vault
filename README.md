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
