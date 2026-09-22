# Maibanc Desktop

A native macOS and Windows app for Maibanc, built with [Tauri](https://tauri.app).

This isn't a separate copy of the frontend — the app window simply loads
`https://www.maibanc.app` directly in the OS's native webview (WebKit on
macOS, WebView2 on Windows). That means:

- It's always exactly in sync with the live website — no separate frontend
  build to keep updated, no version skew.
- Sign-in, data, and every feature work identically to the website, because
  it *is* the website, just in a native window instead of a browser tab.
- The install is tiny (~3MB) compared to an Electron-based equivalent
  (100MB+), since it reuses the OS's built-in browser engine instead of
  bundling Chromium.
- It requires an internet connection to launch, same as the website.

## Running it locally

```sh
cd maibanc-desktop
cargo tauri dev    # launches a debug window pointed at maibanc.app
cargo tauri build  # produces a release .app/.dmg (macOS) or .msi/.exe (Windows)
```

Requires the Rust toolchain (`rustup.rs`) and the Tauri CLI
(`cargo install tauri-cli --version "^2.0"`). On macOS you also need Xcode's
command line tools (`xcode-select --install`); on Windows you need the
Visual Studio Build Tools (the standard Windows dev toolchain).

## How external links are handled

Any link that navigates to a domain other than `maibanc.app` / `www.maibanc.app`
/ `clerk.maibanc.app` opens in the system's default browser instead of
inside the app window (see `src-tauri/src/lib.rs`'s `on_navigation` handler,
covered by unit tests in the same file). This keeps the app window scoped
to Maibanc itself while still letting things like support links or a
password-reset email work normally.

**Known limitation, matching the website:** OAuth-based bank connections
(e.g. Fidelity) aren't fully wired up — that flow needs a custom URL-scheme
deep link back into the app, which hasn't been built. Non-OAuth banks
(Chase, most institutions) are unaffected, since linking them never
navigates away from maibanc.app in the first place.

## Building releases for both platforms

`.github/workflows/desktop-build.yml` builds both macOS and Windows on
every push to `main` that touches `maibanc-desktop/`, since a Windows
`.msi`/`.exe` can only be produced on a Windows machine (or CI). Check the
Actions tab on GitHub for build artifacts.

**Neither build is code-signed yet.** Until that's set up:

- **macOS**: Gatekeeper will flag the app as being from an "unidentified
  developer." Users need to right-click → Open the first time (or you can
  set up notarization with an Apple Developer account, $99/year).
- **Windows**: SmartScreen will show a "Windows protected your PC" warning.
  Users can click "More info" → "Run anyway," or you can code-sign the
  installer with a certificate to remove the warning.

Neither is a functional bug — both are the OS protecting users from
unrecognized software, which is expected for an app that isn't yet signed
and distributed through an app store.
