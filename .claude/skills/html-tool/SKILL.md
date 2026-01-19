# HTML Tool Builder

Build single-file HTML tools following Simon Willison's proven patterns for creating practical, self-contained web applications.

## When to Use This Skill

Use this skill when asked to create:
- Single-file HTML applications
- Browser-based utilities and tools
- Quick prototypes that need no build step
- Tools that process files, clipboard data, or API responses locally

## Core Principles

1. **Single-file structure**: All HTML, CSS, and JavaScript in one file
2. **Own subdirectory**: Each tool gets its own subdirectory (e.g., `tools/json-formatter/index.html`)
3. **No build steps**: Avoid React and frameworks requiring compilation
4. **CDN dependencies**: Load external libraries from jsDelivr or cdnjs
5. **Compact scope**: Keep it simple - a few hundred lines max
6. **No server required**: Everything runs in the browser

## Standard Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tool Name</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 2rem auto;
            padding: 0 1rem;
            line-height: 1.6;
        }
        /* Add tool-specific styles here */
    </style>
</head>
<body>
    <h1>Tool Name</h1>
    <p>Brief description of what this tool does.</p>

    <!-- Tool UI goes here -->

    <script>
        // Tool logic goes here
    </script>
</body>
</html>
```

## Input/Output Patterns

### File Input
```html
<input type="file" id="fileInput" accept=".txt,.json,.csv">
<script>
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    // Process file contents
});
</script>
```

### Clipboard Operations
```javascript
// Read from clipboard
document.getElementById('pasteBtn').addEventListener('click', async () => {
    const text = await navigator.clipboard.readText();
    // Process pasted content
});

// Write to clipboard
document.getElementById('copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(outputText);
});
```

### File Download
```javascript
function downloadFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
```

### Drag and Drop
```html
<div id="dropZone" style="border: 2px dashed #ccc; padding: 2rem; text-align: center;">
    Drop files here or click to select
</div>
<script>
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#007bff';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#ccc';
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#ccc';
    const files = e.dataTransfer.files;
    // Process dropped files
});
</script>
```

## State Persistence

### URL Hash (for bookmarkable state)
```javascript
// Save state to URL
function saveState(state) {
    window.location.hash = encodeURIComponent(JSON.stringify(state));
}

// Load state from URL
function loadState() {
    if (window.location.hash) {
        return JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
    }
    return null;
}
```

### localStorage (for API keys and preferences)
```javascript
// Save API key securely in browser
function saveApiKey(key) {
    localStorage.setItem('apiKey', key);
}

function getApiKey() {
    return localStorage.getItem('apiKey') || '';
}
```

## External Libraries via CDN

### Common Libraries
```html
<!-- Marked (Markdown parser) -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<!-- Prism (Syntax highlighting) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs/themes/prism.css">
<script src="https://cdn.jsdelivr.net/npm/prismjs/prism.js"></script>

<!-- Papa Parse (CSV parser) -->
<script src="https://cdn.jsdelivr.net/npm/papaparse@5/papaparse.min.js"></script>

<!-- JSZip (ZIP file creation) -->
<script src="https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js"></script>

<!-- html2canvas (Screenshot capture) -->
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1/dist/html2canvas.min.js"></script>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

## CORS-Friendly APIs

These APIs work directly from browser JavaScript:
- **PyPI**: `https://pypi.org/pypi/{package}/json`
- **GitHub Raw**: `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`
- **Bluesky**: Public API endpoints
- **Mastodon**: Instance APIs
- **iNaturalist**: Observations API
- **OpenAI/Anthropic/Gemini**: LLM APIs (store keys in localStorage)

## Advanced: Pyodide (Python in Browser)

```html
<script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>
<script>
async function initPython() {
    const pyodide = await loadPyodide();
    await pyodide.loadPackage(['pandas', 'matplotlib']);

    const result = await pyodide.runPython(`
        import pandas as pd
        # Your Python code here
    `);
    return result;
}
</script>
```

## Implementation Checklist

When building an HTML tool:

- [ ] Single HTML file with inline CSS and JS
- [ ] Responsive design (works on mobile)
- [ ] Clear UI with instructions
- [ ] Error handling with user-friendly messages
- [ ] Loading states for async operations
- [ ] No external dependencies except CDN libraries
- [ ] Test in multiple browsers if possible

## Example Prompt for New Tools

When the user describes what they want, build a complete HTML tool that:

1. Follows the single-file pattern
2. Uses semantic HTML and clean CSS
3. Handles errors gracefully
4. Provides clear feedback during operations
5. Works without any server

Output the complete HTML file ready to save and use.
