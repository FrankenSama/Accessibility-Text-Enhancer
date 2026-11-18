# Security Policy

## Supported versions

Only the latest release published on the Chrome Web Store receives security
fixes. At the time of writing that is **1.4.x**.

Unpacked developer builds from `main` are useful for testing, but they are not
supported releases. If you are testing one, confirm the issue still reproduces
in the published version before reporting it.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private reporting:

1. Open the [Security tab](https://github.com/FrankenSama/accessibility-text-enhancer/security).
2. Choose **Report a vulnerability**. This starts a private security advisory
   that only you and the maintainer can read.

If private reporting is unavailable to you, contact the maintainer through the
contact details on [Octavio Silva's GitHub profile](https://github.com/FrankenSama)
and ask for a private channel before sharing details.

Please include:

- The extension version (the popup footer shows it) and the browser version.
- Operating system and, where relevant, the assistive technology in use.
- Steps to reproduce, with a minimal page or a URL if the page is public.
- What an attacker could do, and what access or interaction they need.
- Any proof of concept, kept as small as possible.

Reports are handled on a best-effort basis. This is a personal project without
a bug bounty, a response-time guarantee, or dedicated security staff. You will
get an acknowledgement when the report is read, an assessment of whether it is
in scope, and a note when a fix ships. Credit is given in the release notes if
you want it.

## What is in scope

The extension's own code and the boundary between the page and the extension:

- Escaping the content script's isolated world, or getting page script to run
  with extension privileges.
- Cross-site scripting in the toolbar, settings dialog, options page, or popup,
  including through page text, page attributes, or imported settings files.
- Reading or changing data the extension stores beyond what the feature needs,
  including unintended `chrome.storage.sync` exposure.
- Bypassing the site rules or the on/off switch so the extension runs where a
  user disabled it.
- Permission or host-permission abuse beyond what the manifest declares.
- Leaking page content, selections, or reading preferences to the developer or
  a third party. The extension makes no network requests of its own.
- Weaknesses in the settings import path, such as a crafted JSON file causing
  code execution or persistent corruption.

## What is out of scope

- Vulnerabilities in Chrome, Chromium, the operating system, or a website you
  visit. Report those to the relevant vendor.
- Other extensions, or interactions that require another extension to be
  malicious.
- Denial of service from deliberately enormous pages, huge selections, or
  resource exhaustion that only affects the tab you are already viewing.
- Reports that require physical access, a compromised device, a compromised
  Chrome profile, or an attacker who can already read the user's files.
- Social engineering, phishing, and missing hardening headers on GitHub Pages.
- Feature requests, accessibility barriers, and general bugs. Use the issue
  templates for those.

## Safe harbour

Good-faith research is welcome. When testing:

- Use your own accounts and data. Do not access, modify, or exfiltrate anyone
  else's information.
- Do not degrade the service for other people.
- Give the maintainer a reasonable chance to fix the issue before publishing
  details. Thirty days is a useful default; a fix may take longer for a
  low-severity issue.
- Do not test against the Chrome Web Store listing or Google's infrastructure.

## Data the extension handles

The extension stores preferences and per-site rules with `chrome.storage.sync`
and the global on/off switch with `chrome.storage.local`. Page content and
selections are processed locally and are not transmitted. See the
[privacy policy](privacy-policy.md) for the full description.
