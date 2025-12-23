# Kinso Extensions v0.8

Paperback v0.8 compatible manga reading extensions.

## Available Extensions

- **AsuraScans** - Fast manga updates from Asura Scans
- **BatoTo** - Multiple language support from bato.to
- **ComixGallery** - Vast collection of comics and manga
- **MangaBat** - Latest chapters from mangabat.com
- **MangaDemon** - Quality manga from demonic scans
- **MangaKatana** - Advanced genre and filter options
- **MangaPark** - Multi-source aggregator with powerful search
- **ThunderScans** - Daily updated manga from thunder scans
- **WeebCentral** - Central hub for weeb content

## Installation

Add this repository to Paperback:
```
https://xdkinso.github.io/kinso-extensions-v0.8/
```

Or copy this URL to your Paperback app's extension settings.

## About v0.8 Compatibility

These extensions have been converted from Paperback v0.9 to v0.8 by:
- Removing `CloudflareBypassRequestProviding` interface
- Removing `CookieStorageInterceptor` usage
- Removing `saveCloudflareBypassCookies()` method
- Maintaining `getCloudflareBypassRequest()` for v0.8 compatibility

## Developer

Developed by Kinso - https://github.com/xdKinso

## Deployment

This repository automatically deploys to GitHub Pages when you push to the `master` branch.

### GitHub Pages Settings
Make sure GitHub Pages is configured in your repository settings:
1. Go to Settings → Pages
2. Source: GitHub Actions
3. The site will be published at: https://xdkinso.github.io/kinso-extensions-v0.8/
