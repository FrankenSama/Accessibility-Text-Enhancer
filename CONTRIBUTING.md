# Contributing to Accessibility Text Enhancer

This is a personal project maintained by Octavio Silva. Forks are welcome under the MIT License, and bug reports or focused pull requests are appreciated. Reviews and merges happen at the maintainer's discretion, so there is no guaranteed response time.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Forking & Attribution](#forking--attribution)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [License](#license)

## Code of Conduct

This project follows the [Contributor Covenant, version 2.1](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it. Report unacceptable behavior privately through the contact details on the maintainer's GitHub profile rather than in a public issue.

## How Can I Contribute?

### Reporting Bugs

Search the existing issues first, then [open a new issue](https://github.com/FrankenSama/accessibility-text-enhancer/issues/new). Include:

- **Describe the bug** - what happened, and what you expected instead.
- **Steps to reproduce** - numbered, starting from a fresh page load.
- **Environment** - extension version (shown in the popup footer), browser version, and operating system.
- **Page** - a public URL, or a minimal test case if the page is private.
- **Evidence** - console errors and a screenshot if they help.

Do not include private page content, account details, or personal information. Security problems go through [SECURITY.md](SECURITY.md), not the public issue tracker.

### Reporting Accessibility Barriers

Use the [accessibility barrier template](https://github.com/FrankenSama/accessibility-text-enhancer/issues/new?template=accessibility_barrier.yml). Read [ACCESSIBILITY.md](ACCESSIBILITY.md) first for supported environments and known limitations. Barriers are treated as bugs, not feature requests.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful** to most users
- **List some examples** of how this enhancement would be used
- **Specify which version** you're using

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Run the automated checks and the manual steps that cover your change
3. Ensure your code follows the existing style
4. Update the docs when behavior, settings, or limitations change
5. Complete the pull request template, including the accessibility impact section
6. The PR will be merged once the maintainer has reviewed it

Do not add permissions, host permissions, or network requests. Do not bump the version unless the PR is a release. Pull requests are optional: if you would rather maintain your own version, fork the repository and follow the attribution guidance below.

## Development Setup

### Prerequisites

- Chrome/Chromium browser (v91+)
- Git
- Text editor (VS Code recommended)
- Basic knowledge of JavaScript and Chrome Extension APIs

### Setting Up Your Development Environment

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/accessibility-text-enhancer.git
   cd accessibility-text-enhancer
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Load Extension**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

4. **Make Changes**
   - Edit files in your preferred editor
   - After changing the content script or manifest, click the reload icon in `chrome://extensions/`
   - Then refresh the page you are testing

5. **Test Thoroughly**
   - Test on multiple websites
   - Verify keyboard shortcuts work
   - Check for console errors
   - Test with different screen sizes

## Coding Standards

### JavaScript Style Guide

We follow modern ES6+ JavaScript conventions:

```javascript
// ✅ Good
const handleClick = (event) => {
    event.preventDefault();
    // Implementation
};

// ❌ Bad
var handleClick = function(event) {
    event.preventDefault();
}
```

### Key Principles

1. **Use Descriptive Names**
   ```javascript
   // ✅ Good
   const calculateContrastRatio = (foreground, background) => { ... }
   
   // ❌ Bad
   const calc = (fg, bg) => { ... }
   ```

2. **Add Comments for Complex Logic**
   ```javascript
   /**
    * Calculates WCAG 2.0 contrast ratio
    * @param {string} color1 - RGB color string
    * @param {string} color2 - RGB color string
    * @returns {number} Contrast ratio (1-21)
    */
   function calculateContrast(color1, color2) {
       // Implementation
   }
   ```

3. **Keep Functions Small and Focused**
   - Each function should do one thing well
   - Aim for < 50 lines per function
   - Extract complex logic into helper functions

4. **Use Modern JavaScript Features**
   - Prefer `const` and `let` over `var`
   - Use arrow functions where appropriate
   - Use template literals for string interpolation
   - Use destructuring for cleaner code

5. **Error Handling**
   ```javascript
   try {
       const result = await riskyOperation();
       handleSuccess(result);
   } catch (error) {
       console.error('Operation failed:', error);
       showToast('An error occurred', { error: true });
   }
   ```

### CSS Style Guide

```css
/* ✅ Good: Clear, organized, commented */
#accessibility-toolbar {
    /* Layout */
    display: flex;
    gap: 8px;
    
    /* Positioning */
    position: fixed;
    z-index: 2147483645;
    
    /* Visual */
    background: linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%);
    border-radius: 12px;
}

/* ❌ Bad: Unorganized, no comments */
#accessibility-toolbar {
    z-index: 2147483645;
    display: flex;
    background: linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%);
    position: fixed;
    border-radius: 12px;
    gap: 8px;
}
```

### File Organization

```
project/
├── manifest.json          # Extension configuration
├── background.js          # Service worker
├── popup/
│   ├── popup.html        # Popup UI
│   ├── popup.css         # Popup styling
│   └── popup.js          # Popup logic
├── content-scripts/
│   ├── content.js        # Classic loader that dynamically imports app.js
│   ├── app.js            # Wiring: preferences, listeners, keyboard shortcuts
│   ├── content.css       # Toolbar styling
│   └── modules/
│       ├── core.js       # STATE, CONFIG, and command constants
│       ├── text.js       # Sentence splitting and speech chunking
│       ├── dom.js        # Selection, range, and DOM helpers
│       ├── toolbar.js    # Toolbar rendering, positioning, and focus
│       ├── reading.js    # Read-aloud session and follow-along highlight
│       ├── settings.js   # Settings dialog plus import and export
│       ├── settings-io.js # Schema 3 settings file build and parse
│       ├── style-defaults.js # Font, spacing, and highlight choices
│       ├── scope.js      # Which elements a command affects
│       ├── commands.js   # Command dispatch and enhancement effects
│       ├── contrast.js   # WCAG colour math and contrast command
│       ├── fonts.js      # FontFace loader for bundled OpenDyslexic
│       ├── history.js    # Undo, redo, and Reset page
│       ├── prefs.js      # Synced preferences and per-site rules
│       ├── toast.js      # Single live-region notification
│       └── feedback.js   # Toast wording shared by commands
├── icons/                # Extension icons
├── fonts/                # OpenDyslexic WOFF2 and its SIL OFL 1.1 licence
├── docs/                 # Documentation and research
├── .github/              # Issue templates and pull request template
├── index.html            # GitHub Pages landing page
├── styles.css            # Landing page styling
├── script.js             # Landing page interactions
├── ACCESSIBILITY.md      # Commitment, supported environments, limitations
├── CODE_OF_CONDUCT.md    # Contributor Covenant 2.1
├── CONTRIBUTING.md       # This file
├── ROADMAP.md            # Planned accessibility work
├── SECURITY.md           # Supported versions and private reporting
├── privacy-policy.md     # Privacy policy
└── LICENSE               # MIT License
```

## Commit Guidelines

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without changing functionality
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(toolbar): add undo/redo functionality

Implement history tracking for all enhancements with keyboard shortcuts.
Users can now undo (Ctrl+Z) and redo (Ctrl+Y) changes.

Closes #123
```

```bash
fix(contrast): improve contrast calculation accuracy

The previous implementation only checked text color brightness.
Now analyzes both foreground and background colors for accurate
WCAG compliance.

Fixes #456
```

```bash
docs(readme): update installation instructions

Add detailed steps for manual installation and troubleshooting.
```

## Pull Request Process

### Before Submitting

- [ ] Code follows the project's style guidelines
- [ ] Comments added for complex logic
- [ ] No `console.log` statements in shipped code (use the existing error and toast paths)
- [ ] Tested on multiple websites
- [ ] No breaking changes, or clearly documented if unavoidable
- [ ] Documentation updated if needed
- [ ] No new permissions or network requests
- [ ] Undo, redo, and Reset page still restore the page

### PR Template

GitHub fills in [the pull request template](.github/pull_request_template.md) automatically. Complete the accessibility impact and testing sections rather than deleting them; write "not applicable" with a reason when a section does not apply.

### Review Process

1. The maintainer will review the PR when time allows
2. Address any requested changes
3. Once approved, the PR will be merged and included in a future release

## Forking & Attribution

Forking is welcome. If you publish a modified version:

- Keep the `LICENSE` file and copyright notice (required by the MIT License).
- Credit Octavio Silva and link back to this repository in your README or about page (requested).
- Make it clear that your fork is not the official extension, and don't use the project name or icon in a way that suggests it is.

GitHub's **Fork** button preserves the license and shows a "forked from" link automatically.

## Recognition

Accepted contributions are credited in release notes. Thank you for helping make the web more accessible! 🎉

## Questions?

Open an issue on GitHub if you have a question about the project.

## License

By contributing, you agree that your contributions will be licensed under the MIT License. You retain copyright to your own contributions.

---

**Thank you for helping make the web accessible for everyone!** ♿