---
title: Build123d Sandbox
emoji: 🧊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# 🚀 build123d-sandbox (Cloud CAD Engine)

> **Interactive CAD Design in the Browser** - Una sandbox web completa per creare e visualizzare modelli 3D parametrici con Python e build123d, ospitabile gratuitamente nel Cloud (Hugging Face Spaces, Render, ecc.).

[![Python](https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)](https://reactjs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker)](https://docker.com)

---

## ✨ Perché il Cloud Backend?

- **Piena compatibilità con iPhone / iOS Safari**: L'elaborazione del kernel OpenCASCADE avviene interamente sul server cloud (16 GB di RAM gratuiti su Hugging Face Spaces), evitando i crash di memoria di WebAssembly su Safari mobile.
- **Accessibile 24/7 ovunque**: Nessuna necessità di tenere il proprio computer di casa acceso. Chiunque si colleghi al link web ottiene calcoli istantanei a 60 FPS.
- **Interfaccia Mobile Avanzata**: Bottom sheet per il codice, controlli touch fluidi a due dita (pan, zoom, rotazione), esportazione multi-formato (`STEP`, `STL`, `3MF`, `DXF`, `SVG`, `BREP`).
