# Scenario and incident-media workflow

## Scenario workspace

The Scenario workspace is the compact operator surface for configuring one deterministic hazard run. It contains:

- a named hazard selector for flood, earthquake, wildfire, cyclone/surge and chemical release;
- the hazard-specific intensity control and supporting driver values;
- the active operating-area name, region, X longitude, Y latitude, terrain-derived Z classification and selected timeline minute;
- four ready-to-run demonstrations: EIT campus flood, Tokyo earthquake access, Miami cyclone/surge and a clearly labelled Sendai coastal-inundation proxy;
- a branch action for comparing a changed driver against the current deterministic baseline.

The panel is deliberately narrow and scrollable so the map remains the primary surface. At the 1366 × 768 acceptance viewport it is 326 px wide, remains fully inside the viewport and keeps all controls keyboard reachable.

## Incident Source Viewer

Open **Incident updates**, then choose **View source media**. The action opens a modal inside AEGIS and does not navigate to YouTube or another site.

When the dialog opens, AEGIS queries `/api/live/media` using the selected incident title, location and hazard category. Playback priority is:

1. a provider-returned HTTPS direct video;
2. a privacy-enhanced `youtube-nocookie.com` embed when YouTube Data API metadata is configured;
3. a live Wikimedia Commons API result;
4. a small source-linked Wikimedia Commons context set when the free live search cannot return a playable result.

The fourth path exists so the zero-key demo remains visual. It is always labelled as cached hazard context—not live footage, not incident-specific evidence and not proof of damage at the selected location. Publisher page, capture time, contributor and licence remain visible for verification.

Only HTTPS video resources and allow-listed YouTube URL forms can reach the player. Search and publisher links remain secondary, explicit actions; opening the primary viewer never leaves AEGIS.

## Demo check

1. Leave **Global map** idle and confirm the Earth rotates.
2. Choose **Scenario** and load a scenario card; verify hazard, X/Y/Z and time change together.
3. Open **Incident updates** and select **View source media**.
4. Confirm the AEGIS URL does not change and the media dialog shows a clip or a truthful unavailable state.
5. Read the green observed/simulated label and amber footage-verification warning before using the media as context.

The public acceptance release for this workflow is Worker `1e12ba63-1fe8-4112-bda9-b6ebd3b460b0`.
