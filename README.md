# PDF Outline Editor

A static web app that shows a PDF's outline (bookmarks / table of contents) and lets you edit it as JSON, then download the PDF with the new outline. Everything runs in the browser, so files are never uploaded.

- Reads outlines with [PDF.js](https://mozilla.github.io/pdf.js/), including named destinations.
- Writes outlines with [pdf-lib](https://pdf-lib.js.org/).
- Checks the JSON as you type and shows a tree preview.

## JSON format

```json
[
  { "title": "Chapter 1", "page": 1, "open": true, "children": [
    { "title": "Section 1.1", "page": 2 },
    { "title": "Section 1.2", "page": 5 }
  ]},
  { "title": "Project website", "url": "https://example.com" }
]
```

| Field      | Required | Meaning                                         |
|------------|----------|-------------------------------------------------|
| `title`    | yes      | Bookmark text (Unicode is fine)                 |
| `page`     | yes\*    | 1-based target page                             |
| `url`      | yes\*    | External link, used instead of `page`           |
| `children` | no       | Nested entries                                  |
| `open`     | no       | `true` to show the entry expanded by default    |

\* Each entry needs either `page` or `url`. An empty array `[]` removes the outline.

## Publish on GitHub Pages

1. Create a GitHub repository and push these files to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "PDF outline editor"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. On GitHub, go to **Settings → Pages**, set **Source** to *Deploy from a branch*, then pick `main` and `/ (root)`.
3. After a minute the app is live at `https://<user>.github.io/<repo>/`.

## Run locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## Limitations

- Bookmarks point to the top of the target page; the original scroll position and zoom are not kept.
- Bold/italic/color styling on existing bookmarks is not kept.
- Encrypted PDFs load with encryption ignored, and the saved copy may not open correctly.
