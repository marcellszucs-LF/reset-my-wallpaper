# Reset my Wallpaper

A macOS menu bar app that resets the system wallpaper to `/Library/Desktop/Wallpaper.jpg` with one click.

## Usage

1. Drop a file named `wallpaper.jpg` or `wallpaper.jpeg` into your Downloads folder
2. Click the monitor icon in the menu bar

On first click, you'll be prompted for your sudo password — it's stored securely in your macOS Keychain and never asked again.

## Setup

**Requirements:** Node.js

```bash
npm install
npm run build
open "dist/mac-arm64/Reset my Wallpaper.app"
```

To launch automatically at login, right-click the menu bar icon and enable **Launch at Login**.
