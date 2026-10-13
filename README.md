# 🚀 build123d-sandbox

> **Interactive CAD Design in the Browser** - Una sandbox web completa per creare e visualizzare modelli 3D parametrici con Python e build123d, eseguita interamente in **WebAssembly (Pyodide)** direttamente nel browser.

[![Python](https://img.shields.io/badge/Python-Pyodide_WASM-blue?style=for-the-badge&logo=python)](https://pyodide.org)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge)](LICENSE)

---

## ✨ Caratteristiche Principali

- **100% Client-Side (Zero Server / Zero PC Host)**: Il codice Python viene eseguito direttamente nel browser dell'utente finale tramite Pyodide e WebAssembly (`build123d` e `ocp_vscode`). Una volta pubblicato su GitHub Pages, non serve che il tuo PC rimanga acceso né che sia attivo alcun server backend.
- **Interfaccia Mobile Avanzata**:
  - Layout responsive ottimizzato per smartphone e tablet (iOS / Android).
  - Bottom sheet trascinabile per l'editor di codice.
  - Barra azioni touch rapida: pulsante Run Code con spinner, toggle dark/light theme, notifiche toast.
- **Visualizzatore 3D con Gesture Multi-Touch**:
  - Rotazione orbitale con 1 dito.
  - Pan, zoom e rotazione twist fluida a due dita (`two-finger controls`).
  - Ottimizzazione selezione testo per schermi touch / iOS Safari.
- **Esportazione Multi-Formato**:
  - Download diretto dei modelli in formato `STEP`, `STL`, `3MF`, `DXF`, `SVG` e `BREP` generati istantaneamente via WebAssembly.
- **Condivisione URL**:
  - Compressione e salvataggio del codice nello stato dell'URL per una facile condivisione di snippet CAD.

---

## 💻 Come avviare in locale per sviluppo

Se vuoi testare o modificare l'applicazione sul tuo PC:

### Metodo 1: Doppio Clic (Windows)
Fai doppio clic su:
- **`avvia_locale.bat`**

Questo avvierà il server di sviluppo Vite e aprirà automaticamente l'interfaccia nel browser a `http://localhost:5173`.

### Metodo 2: Tramite Terminale
```bash
cd frontend
npm install
npm run dev
```

---

## 🌐 Pubblicazione su GitHub Pages

Il progetto è già preconfigurato con il workflow GitHub Actions in `.github/workflows/deploy.yml`.

1. Pubblica il repository sul tuo account GitHub (branch `main`).
2. Vai su **Settings > Pages** del tuo repository su GitHub.
3. In **Source**, seleziona **GitHub Actions**.
4. A ogni `push`, GitHub Actions compilerà automaticamente il frontend e lo pubblicherà sul tuo URL GitHub Pages (`https://<tuo-utente>.github.io/<tuo-repo>/`).
5. Chiunque si colleghi al sito potrà creare ed esportare modelli 3D senza alcun bisogno del tuo computer!
