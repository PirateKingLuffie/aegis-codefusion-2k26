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

1. a provider-returned HTTPS direct video whose metadata matches the selected incident;
2. a privacy-enhanced `youtube-nocookie.com` embed whose metadata matches the selected incident;
3. a matching Wikimedia Commons API result;
4. no in-site video, with safe publisher/search links and an explicit unavailable state when no
   incident-specific playable result is returned.

The fourth path is deliberate: a generic disaster clip is not evidence for the selected incident. The
viewer states that no verified live camera is available and offers source-linked search/report pages for
independent verification. Any matching open media is still labelled contextual, not live footage and not
proof of damage at the selected location; publisher page, publication time, contributor and licence
remain visible for verification.

Only HTTPS video resources and allow-listed YouTube URL forms can reach the player. Search and publisher links remain secondary, explicit actions; opening the primary viewer never leaves AEGIS.

## Demo check

1. Leave **Global map** idle and confirm the Earth rotates.
2. Choose **Scenario** and load a scenario card; verify hazard, X/Y/Z and time change together.
3. Open **Incident updates** and select **View source media**.
4. Confirm the AEGIS URL does not change and the media dialog shows a matching clip or a truthful unavailable state; no unrelated example footage should appear.
5. Read the green observed/simulated label and amber footage-verification warning before using the media as context.

The public acceptance release for this workflow is commit `638e063`, Worker
`97819d30-6091-41ec-9b57-6320eca81edf`. The deployed viewer and marker-separation checks are recorded in
`docs/GLOBE_AND_UI_ACCEPTANCE.md`.
