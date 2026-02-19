# Accessibility Text Enhancer

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow.svg)
![Accessibility](https://img.shields.io/badge/WCAG-2.2-purple.svg)

**A real-time, user-driven browser extension for web accessibility enhancement**

![Demo Screenshot](docs/images/demo-screenshot.png)

</div>

---

## 🌟 Overview

Accessibility Text Enhancer is a browser extension that empowers users to take control of web accessibility in real-time. Unlike traditional tools that only identify problems, this extension provides immediate, client-side remediation of common accessibility barriers—putting solutions directly in users' hands.

Developed as part of an MSc Computer Engineering dissertation at Solent University, this tool bridges the critical gap between **identifying** accessibility issues and **fixing** them.

### The Problem

Despite established WCAG guidelines, **96% of websites fail basic accessibility compliance** (WebAIM, 2023). Existing tools like Lighthouse and axe-core excel at diagnostics but leave users waiting for developers to implement fixes—a process that can take weeks, months, or may never happen.

### Our Solution

A user-centric, real-time accessibility enhancement tool that:
- ✅ Provides **instant fixes** without requiring developer intervention
- ✅ Works **universally** across all websites
- ✅ Operates **client-side** with zero latency and full privacy
- ✅ Empowers users with **immediate agency** over their browsing experience

---

## ✨ Features

### 🎨 Text Enhancement Suite

| Feature | Description |
|---------|-------------|
| **Bold Toggle** | Increase text weight for better readability |
| **Highlight** | Add yellow background or outline to text |
| **Font Size** | Increase/decrease text size (8-50px) |
| **Font Style** | Toggle between sans-serif and serif fonts |
| **Text Spacing** | Adjust letter and word spacing |
| **Contrast Fix** | Force high-contrast black/white text |
| **Read Aloud** | Text-to-speech for selected content |

### 🚀 Advanced Capabilities

- **Undo/Redo System**: Full history tracking with `Ctrl+Z` / `Ctrl+Y`
- **Persistent Settings**: Auto-save preferences per website
- **Dark/Light Mode**: Toggle toolbar theme to match your preference
- **Export/Import**: Backup and restore your settings
- **Keyboard Shortcuts**: Full keyboard navigation support
- **Real-time Performance**: < 5ms enhancement execution time

### 💾 Smart Personalization

- Site-specific settings that remember your preferences
- Auto-apply saved enhancements when revisiting websites
- Export settings as JSON for backup or sharing
- Import settings across devices

---

## 📦 Installation

### Chrome Web Store (Recommended)
*Coming Soon*

### Manual Installation (Developer Mode)

1. **Clone the repository**
   ```bash
   git clone https://github.com/FrankenSama/accessibility-text-enhancer.git
   cd accessibility-text-enhancer
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the project directory

3. **Verify Installation**
   - The extension icon should appear in your toolbar
   - Click it to see the popup interface

---

## 🎯 Usage

### Basic Usage

1. **Select Text**: Highlight any text on any webpage
2. **Toolbar Appears**: The accessibility toolbar will appear at the top of your screen
3. **Apply Enhancements**: Click any button to enhance the selected text
4. **Undo if Needed**: Use the undo button or `Ctrl+Z` to revert changes

### Keyboard Shortcuts

The extension supports full keyboard navigation:

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Open Extension | `Ctrl+Shift+A` | `Cmd+Shift+A` |
| Toggle Extension | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| Bold Text | `Ctrl+Shift+B` | `Cmd+Shift+B` |
| Increase Size | `Ctrl+Shift++` | `Cmd+Shift++` |
| Decrease Size | `Ctrl+Shift+-` | `Cmd+Shift+-` |
| Undo | `Ctrl+Z` | `Cmd+Z` |
| Redo | `Ctrl+Y` | `Cmd+Y` |

### Settings Panel

Access advanced settings by clicking the ⚙️ button in the toolbar:

- **Auto-save Settings**: Automatically save preferences for each website
- **Show Tooltips**: Toggle button descriptions
- **Enable Shortcuts**: Turn keyboard shortcuts on/off
- **Export/Import**: Backup or restore your configuration

---

## 🔬 Research Background

This extension was developed as part of a Master's dissertation titled:

> **"A User-Driven Browser Extension for Real-Time Web Accessibility Enhancement"**  
> *Octavio Silva, MSc Computer Engineering*  
> *Solent University, 2024-2025*

### Key Research Findings

**Performance Metrics** (tested on 20 diverse websites):
- ✅ **100% success rate** for toolbar injection across all sites
- ✅ **95%+ success rate** for core enhancement features
- ✅ **< 2.5MB memory** overhead per tab
- ✅ **< 3% CPU** increase during enhancement
- ✅ **< 5ms execution** time for all enhancements

**Tested Environments**:
- News websites (BBC, The Guardian)
- E-commerce (Amazon, eBay)
- Social media (Twitter/X, Reddit)
- SPAs (Google Docs, YouTube)
- Government sites (GOV.UK)

### Research Questions Addressed

**RQ1**: *Can a browser extension provide effective, real-time remediation for perceptual accessibility issues?*

✅ **Answer**: Yes. The extension successfully applies CSS overrides with `!important` flags, achieving universal compatibility across diverse DOM structures with minimal performance impact.

**RQ2**: *What is the performance impact of real-time, client-side accessibility enhancement?*

✅ **Answer**: Negligible. Memory overhead averages 2.5MB per tab with CPU spikes < 3% during enhancement execution and no sustained load.

### Academic Citations

If you use this tool in research, please cite:

```bibtex
@mastersthesis{silva2025accessibility,
  author = {Silva, Octavio},
  title = {A User-Driven Browser Extension for Real-Time Web Accessibility Enhancement},
  school = {Solent University},
  year = {2025},
  type = {MSc Dissertation},
  note = {COM726 - Computer Engineering}
}
```

---

## 🏗️ Technical Architecture

### Technology Stack

- **Manifest V3**: Modern Chrome Extension API
- **Vanilla JavaScript (ES6+)**: Zero dependencies for maximum compatibility
- **CSS3**: Advanced styling with Flexbox
- **Chrome Storage API**: Persistent settings management
- **Web Speech API**: Text-to-speech functionality

### Project Structure

```
accessibility-text-enhancer/
├── manifest.json              # Extension configuration
├── background.js              # Service worker for shortcuts & stats
├── popup/
│   ├── popup.html            # Extension popup interface
│   └── popup.js              # Popup logic
├── content-scripts/
│   ├── content.js            # Main enhancement engine
│   └── content.css           # Toolbar styling
├── icons/                    # Extension icons (16, 48, 128px)
├── docs/                     # Documentation & research papers
└── README.md                 # This file
```

### Architecture Diagram

```
┌─────────────────┐
│   User Action   │
│ (Text Selection)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Content Script (content.js)   │
│  ┌──────────────────────────┐  │
│  │  Selection Event Handler  │  │
│  └────────┬─────────────────┘  │
│           │                     │
│           ▼                     │
│  ┌──────────────────────────┐  │
│  │   Toolbar Creation        │  │
│  │   & Positioning           │  │
│  └────────┬─────────────────┘  │
│           │                     │
│           ▼                     │
│  ┌──────────────────────────┐  │
│  │  Command Execution        │  │
│  │  - Bold / Highlight       │  │
│  │  - Size / Spacing         │  │
│  │  - Contrast / TTS         │  │
│  └────────┬─────────────────┘  │
│           │                     │
│           ▼                     │
│  ┌──────────────────────────┐  │
│  │   DOM Manipulation        │  │
│  │   (CSS Injection)         │  │
│  └────────┬─────────────────┘  │
│           │                     │
│           ▼                     │
│  ┌──────────────────────────┐  │
│  │   History Management      │  │
│  │   (Undo/Redo Stack)       │  │
│  └──────────────────────────┘  │
└─────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Chrome Storage │
│  (Persistence)  │
└─────────────────┘
```

### Key Design Decisions

1. **Parent Element Modification**: Modifies parent containers rather than wrapping selected text, trading surgical precision for robustness across diverse sites

2. **`!important` CSS Flags**: Ensures accessibility enhancements override existing styles regardless of specificity

3. **Client-Side Processing**: All operations occur in-browser—no server calls, ensuring privacy and zero latency

4. **Fixed Toolbar Position**: Positioned at viewport top to prevent interference with text selection

---

## 🎓 Development

### Prerequisites

- Chrome/Chromium browser (v88+)
- Basic understanding of Chrome Extension APIs
- Text editor (VS Code recommended)

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/FrankenSama/accessibility-text-enhancer.git

# Navigate to directory
cd accessibility-text-enhancer

# Load in Chrome (chrome://extensions/)
# Enable Developer Mode → Load Unpacked → Select directory
```

### Debugging

1. **Content Script**: Right-click page → Inspect → Console tab
2. **Popup**: Right-click extension icon → Inspect popup
3. **Background Script**: chrome://extensions/ → Details → Inspect views

---

## 🤝 Contributing

Contributions are welcome! This project aims to make the web more accessible for everyone.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

### Contribution Guidelines

- Follow existing code style and conventions
- Add comments for complex logic
- Update README.md if adding new features
- Test on multiple websites before submitting
- Ensure accessibility of any new UI elements

### Areas Needing Help

- 🎨 **UI/UX Design**: Improve toolbar aesthetics
- 🧪 **Testing**: Cross-browser compatibility testing
- 📝 **Documentation**: Improve guides and examples
- 🌍 **Localization**: Translations for international users
- ♿ **Accessibility**: User testing with screen readers

---

### Compatibility
Tested and verified on:
- ✅ Chrome 88+
- ✅ Edge 88+
- ✅ Brave 1.20+
- ✅ Opera 74+

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

```
Copyright (c) 2025 Octavio Silva

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

---

## 🙏 Acknowledgments

- **Solent University** - Academic support and research facilities
- **Bacha Rehman** - Module leader and dissertation supervisor
- **WebAIM** - Accessibility research and testing resources
- **W3C** - WCAG guidelines and standards
- **Chrome Extensions Team** - Excellent documentation and APIs

### Research References

This project builds upon:

1. **WebAIM** (2023). *The WebAIM Million*. https://webaim.org/projects/million/
2. **W3C** (2023). *WCAG 2.2 Guidelines*. https://www.w3.org/TR/WCAG22/
3. **Deque Systems** (2023). *axe-core Documentation*. https://github.com/dequelabs/axe-core
4. **Google** (2023). *Lighthouse Accessibility Auditing*. https://developer.chrome.com/docs/lighthouse/

---

## 📞 Contact & Support

### Author
**Octavio Silva**  
MSc Computer Engineering Candidate  
Solent University

### Links
- 🐙 **GitHub**: [@FrankenSama](https://github.com/FrankenSama)
- 🌐 **LinkedIn**: https://www.linkedin.com/in/octavio-silva-designer/
- 🌐 **Project Page**: https://frankensama.github.io/accessibility-text-enhancer/

### Reporting Issues

Found a bug or have a feature request?

1. Check existing [issues](https://github.com/FrankenSama/accessibility-text-enhancer/issues)
2. Create a new issue with:
   - Clear description
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Browser version and OS

---

<div align="center">

**Making the web accessible, one selection at a time** ♿

[⬆ Back to Top](#accessibility-text-enhancer)


</div>
