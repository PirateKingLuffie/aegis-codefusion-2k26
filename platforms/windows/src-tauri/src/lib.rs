use tauri::Manager;

fn requested_server() -> Option<tauri::Url> {
    let from_argument = std::env::args().skip(1).find_map(|argument| {
        argument
            .strip_prefix("--server=")
            .map(std::string::ToString::to_string)
    });
    let raw = from_argument.or_else(|| std::env::var("AEGIS_SERVER_URL").ok())?;
    let mut url = tauri::Url::parse(raw.trim()).ok()?;

    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return None;
    }

    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Some(url)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server = requested_server();
    tauri::Builder::default()
        .setup(move |app| {
            if let (Some(url), Some(window)) = (server.clone(), app.get_webview_window("main")) {
                window.navigate(url)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run the AEGIS desktop shell");
}
