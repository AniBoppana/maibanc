use tauri::{WebviewUrl, WebviewWindowBuilder};

const APP_ORIGIN_HOSTS: [&str; 2] = ["www.maibanc.app", "maibanc.app"];
// Clerk's hosted auth widget runs same-origin inside the app already
// (see the web app's embedded <SignIn> component), but Clerk's JS SDK
// itself is served from this subdomain and some auth-related navigations
// (password reset, email verification links) land here directly.
const AUTH_HOST: &str = "clerk.maibanc.app";

fn is_in_app_host(host: &str) -> bool {
    APP_ORIGIN_HOSTS.contains(&host) || host == AUTH_HOST
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("https://www.maibanc.app".parse().unwrap()),
            )
            .title("Maibanc")
            .inner_size(1360.0, 900.0)
            .min_inner_size(960.0, 640.0)
            .resizable(true)
            // Anything that isn't the app's own domain (a bank's OAuth login
            // page, a support link, Terms of Service, etc.) opens in the
            // user's regular browser instead of navigating this window away
            // from the app — this window only ever shows Maibanc itself.
            //
            // Note: OAuth-style bank connections (e.g. Fidelity) are not
            // fully wired up here, matching the current web app — that flow
            // needs a custom URL-scheme deep link back into the app, which
            // hasn't been built (this was explicitly deferred on the web
            // version too). Non-OAuth banks are unaffected since their Link
            // flow never navigates away from maibanc.app.
            .on_navigation(move |url| {
                log::info!("navigation requested: {}", url);
                match url.host_str() {
                    Some(host) if is_in_app_host(host) => true,
                    _ => {
                        log::info!("redirecting external host to system browser: {:?}", url.host_str());
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                        false
                    }
                }
            })
            .on_page_load(|_webview, payload| {
                log::info!("page load event: {:?} url={}", payload.event(), payload.url());
            })
            .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::is_in_app_host;

    #[test]
    fn allows_the_apps_own_domains() {
        assert!(is_in_app_host("maibanc.app"));
        assert!(is_in_app_host("www.maibanc.app"));
        assert!(is_in_app_host("clerk.maibanc.app"));
    }

    #[test]
    fn rejects_everything_else() {
        // A bank's OAuth login page, Plaid's own domain, an unrelated site,
        // and a lookalike host that merely contains "maibanc.app" as a
        // substring (e.g. a phishing domain) must NOT be treated as in-app.
        assert!(!is_in_app_host("chase.com"));
        assert!(!is_in_app_host("cdn.plaid.com"));
        assert!(!is_in_app_host("example.com"));
        assert!(!is_in_app_host("maibanc.app.evil.com"));
        assert!(!is_in_app_host("notmaibanc.app"));
    }
}
