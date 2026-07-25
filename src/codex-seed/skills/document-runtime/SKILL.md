---
name: document-runtime
description: "Preinstalled Python interpreter for PDF, Word, PowerPoint and Excel work. Read this before any task that creates, reads or renders .pdf/.docx/.pptx/.xlsx files: reportlab, pypdfium2, pdfplumber, pypdf, pillow, python-docx, python-pptx and openpyxl are already installed and must not be installed again."
---

# Document Runtime

iCodex provisions a private Python environment for document work. The packages
below are already installed. Never `pip install` them, never create a virtualenv
for them, and never check whether they are importable first — they are.

## Interpreter

Run document code with this interpreter, by path:

```bash
~/.cache/icodex-runtimes/venv/bin/python script.py
```

Do not use `python3` for document work. It resolves to a different interpreter
that does not have these packages: the tool shell derives `PATH` from the user's
login profile, which puts the system directories first, so the runtime can never
claim the name `python3`. The path above always works.

## Installed packages

| Package | Use |
| --- | --- |
| `reportlab` | create PDFs |
| `pypdfium2` | render PDF pages to images |
| `pdfplumber`, `pypdf` | extract text, inspect and edit PDFs, fill AcroForms |
| `pillow` | image handling |
| `python-docx`, `python-pptx`, `openpyxl` | Word, PowerPoint, Excel |

`pandas` and `numpy` are deliberately absent. If a task genuinely needs them,
say so rather than installing them into this environment.

## Rendering pages

`pdftoppm` is on `PATH` and renders PDF pages to images:

```bash
pdftoppm -png -r 150 report.pdf page
```

It is backed by `pypdfium2`, not poppler, and accepts `-png`, `-jpeg`, `-r`,
`-f`, `-l` and `-scale-to`. It exits with an error on any other poppler flag —
use the interpreter directly for anything it does not cover.

## If the interpreter is missing

Provisioning runs in the background on first launch and takes a few minutes on a
cold machine. If the path does not exist yet, say so and let the user retry
rather than installing packages by hand.
