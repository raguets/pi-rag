# pi-rag

`pi-rag` est une extension RAG en lecture seule pour [Pi](https://pi.dev). Elle
vectorise une question, interroge une base de connaissances Qdrant et renvoie
des passages bornés avec leurs sources. Un CLI Python séparé assure l'ingestion
des documents avec Docling.

## Prérequis

- Node.js 20+
- Python 3.11+
- Qdrant
- un endpoint d'embeddings compatible OpenAI (`/v1/embeddings`) ou Ollama

## Installation

```powershell
npm install
npm run build
pi.cmd install .

python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r scripts/requirements-ingest.txt
```

Sous PowerShell, utilisez `pi.cmd` si la politique d'exécution Windows bloque
le script `pi.ps1`.

L'installation locale enregistre le chemin du projet dans Pi. Après une
modification du code source, exécutez `npm run build`, puis redémarrez Pi ; il
n'est pas nécessaire de relancer `pi install .`.

## Configuration

Copiez `examples/rag.json` vers l'un des emplacements suivants :

- `.pi/rag.json` dans le projet depuis lequel Pi sera lancé ;
- `~/.pi/agent/rag.json` pour une configuration globale.

Vous pouvez également sélectionner explicitement un fichier avec la variable
d'environnement `PI_RAG_CONFIG`. Ajustez les endpoints, collections et modèles,
puis définissez les variables indiquées par les propriétés `apiKeyEnv` :

```powershell
$env:QDRANT_API_KEY = "votre-cle"
```

Si une instance locale n'exige aucune authentification, supprimez la propriété
`apiKeyEnv` correspondante. Les secrets littéraux dans `rag.json` ne sont pas
acceptés.

## Ingestion

`--knowledge-base` attend le nom logique déclaré dans `knowledgeBases`, et non
le chemin des documents. Utilisez `--input` pour remplacer le répertoire
`ingestion.inputDirectory` configuré :

```powershell
./.venv/Scripts/python.exe scripts/ingest_qdrant.py `
  --config "$HOME/.pi/rag.json" `
  --knowledge-base contract-library `
  --input ./test-docs `
  --verbose
```

Pour utiliser le répertoire configuré et simuler l'ingestion sans écrire dans
Qdrant :

```powershell
./.venv/Scripts/python.exe scripts/ingest_qdrant.py `
  --config .pi/rag.json `
  --knowledge-base contract-library `
  --dry-run
```

Le CLI accepte aussi `--include`/`--exclude` (répétables), `--batch-size`,
`--force`, `--sync`, `--recreate`, `--fail-fast`, `--include-hidden`, `--verbose`
et `--yes`. `--recreate` détruit puis recrée la collection et demande une
confirmation, sauf avec `--yes`. Les rapports sont écrits dans `.ingestion/`.

Un fichier facultatif `metadata.csv` ou `metadata.json`, placé à côté du corpus,
peut ajouter des métadonnées métier. Le CSV doit contenir une colonne
`source_path`.

## Utilisation dans Pi

Redémarrez Pi après l'installation ou une reconstruction :

```powershell
pi.cmd
```

La commande suivante affiche les bases configurées :

```text
/rag
```

Pour interroger la base :

```text
/rag Quelles sont les obligations du fournisseur ?
```

La commande demande à l'agent d'utiliser `rag_search` et de conserver les
citations des sources. L'extension n'ajoute pas de panneau spécifique à
l'interface.

### Outils de l'agent

- `rag_list` : liste les noms logiques et les descriptions ;
- `rag_search` : recherche avec `query`, `knowledge_base`, `top_k` et des filtres facultatifs ;
- `rag_status` : vérifie le provider, la collection, la distance et les dimensions sans exposer de secret.

Exemple de filtre :

```json
{"and":[{"field":"contract_type","op":"eq","value":"customer"},{"field":"year","op":"gte","value":2022}]}
```

## Tests

```powershell
npm run check
npm test
./.venv/Scripts/python.exe -m unittest discover -s test/python
```

## Publishing to the Pi package catalog

Pi packages are distributed through npm or a Git repository. For catalog
discoverability, the package must expose a valid `pi` manifest and include the
`pi-package` keyword. Both are already present in this project's
`package.json`; there is no separate catalog submission form documented by Pi.

Before publishing, complete the package metadata in `package.json`:

```json
{
  "name": "pi-rag",
  "author": "Your name or organization",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-account/pi-rag.git"
  },
  "homepage": "https://github.com/your-account/pi-rag#readme",
  "bugs": {
    "url": "https://github.com/your-account/pi-rag/issues"
  }
}
```

The unscoped npm name `pi-rag` must be available and your npm account must be
allowed to publish it. Otherwise, use a scope you control, for example
`@your-organization/pi-rag`. Keep the `pi-package` keyword and the `pi` manifest
unchanged when renaming the package.

### 1. Validate the release candidate

Run the complete test suite against a real Qdrant instance and embedding
provider, then verify the package contents:

```bash
# First setup: npm install, then commit the generated package-lock.json.
# Reproducible release validation after that:
npm ci
npm run check
npm test
npm run build
npm pack --dry-run
```

The dry run should contain `dist/`, `scripts/`, `examples/`, and `README.md`, and
must not contain `.pi/rag.json`, `.env`, credentials, local documents, ingestion
reports, test corpora, or `node_modules/`.

Test exactly what users will install by creating the tarball and loading it in
Pi from a temporary project:

```bash
npm pack
pi install ./pi-rag-0.1.0.tgz
pi list
```

Configure `.pi/rag.json` in that temporary project and exercise `rag_list`,
`rag_status`, and `rag_search`. Remove the generated `.tgz` afterwards.

### 2. Publish a Git pre-release

Before making the package public on npm, it can be tested directly from a tagged
GitHub repository:

```bash
git tag v0.1.0
git push origin main v0.1.0
pi install git:github.com/your-account/pi-rag@v0.1.0
```

A Git reference pins the installed version. Testers must install a newer tag to
move to a later release.

### 3. Publish to npm

Authenticate, confirm the account being used, and publish:

```bash
npm login
npm whoami
npm publish
```

For a scoped package, the first public release normally requires:

```bash
npm publish --access public
```

After publication, verify installation through Pi rather than only through npm:

```bash
pi install npm:pi-rag@0.1.0
# or, for a scoped name:
pi install npm:@your-organization/pi-rag@0.1.0
```

Users who install an unpinned package can later run `pi update`; explicitly
versioned installations remain pinned.

### 4. Publish subsequent versions

Never overwrite an existing npm release. Update the changelog/release notes,
bump the version according to semantic versioning, validate again, then publish:

```bash
npm version patch   # or minor / major
git push origin main --follow-tags
npm publish         # add --access public for a scoped public package
```

See the official [Pi package documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)
for package sources, installation scopes, filtering, and update behavior.
