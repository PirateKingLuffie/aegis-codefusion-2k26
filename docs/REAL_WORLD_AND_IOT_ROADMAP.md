# Real-world reliability and IoT roadmap

AEGIS should be positioned as the decision-support and orchestration layer between official hazard feeds, local field sensors, deterministic models, operators and authorised warning channels. It does not replace NDMA, IMD, CWC, INCOIS, NCS or local emergency authorities.

## Reference architecture

```text
Field sensors
  -> LoRaWAN IN865 / wired industrial I/O
  -> resilient edge gateway and local store-and-forward
  -> MQTT 5 over TLS
  -> OGC SensorThings observation records
  -> validation, calibration, provenance and confidence checks
  -> AEGIS live fusion, simulation and deterministic alert policy
  -> CAP 1.2 Exercise/Draft
  -> authorised human review
  -> browser, siren, public-address or approved government channel
```

Recommended open standards and software:

- [LoRaWAN specifications](https://resources.lora-alliance.org/technical-specifications) for battery-oriented, low-bandwidth field telemetry. India deployments must use the applicable IN865 regional parameters. Cameras do not belong on LoRaWAN.
- [ChirpStack](https://www.chirpstack.io/docs/) as a self-hosted private LoRaWAN network server.
- [OASIS MQTT 5.0](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html) between gateways and AEGIS. QoS 1 requires idempotent ingestion because duplicates are possible.
- [Eclipse Sparkplug 3.0](https://sparkplug.eclipse.org/specification/version/3.0/) when connecting pumps, PLCs, electrical panels or building-management systems.
- [OGC SensorThings API 1.1](https://docs.ogc.org/is/18-088/18-088.html) for interoperable Thing, Location, Sensor, Datastream, Observation and Feature of Interest records.
- [OASIS CAP 1.2](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html) for geographically targeted exercise/test alerts, updates, cancellations and expiry. AEGIS must never emit `Actual` without an authorised authority workflow.

## Highest-value EIT campus pilot

### Flood and drainage sensing

- Two non-contact radar or ultrasonic water-level sensors mounted above different drains or channels.
- One submersible pressure sensor as an independent depth measurement.
- A visible staff gauge for manual validation.
- Two separated tipping-bucket rain gauges.
- Drain/manhole ingress and obstruction sensors.
- Pump current, vibration and running-state telemetry.
- Optional water velocity, turbidity, conductivity and temperature sensing.

AEGIS should evaluate depth, rate of rise, rainfall accumulation, drainage state and pump availability together. A single low-cost reading must never directly trigger a public warning. [USGS streamgaging guidance](https://www.usgs.gov/mission-areas/water-resources/science/streamgaging-basics) explains why stage/discharge relationships are site-specific and require continued field measurements.

### Local weather station

Measure rainfall, temperature, relative humidity, pressure, wind speed and direction. Soil moisture and surface temperature are useful optional inputs. Calibration, uncertainty, siting class and maintenance history must remain attached to every series, following the [WMO Guide to Instruments and Methods of Observation](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/instruments-and-methods-of-observation-programme-imop/guide-instruments-and-methods-observation-wmo-no-8).

### Fire, smoke and air context

Use separated PM2.5/PM10, CO, temperature and humidity nodes. Thermal or flame detection can corroborate them. Low-cost air sensors are supplementary rather than regulatory instruments; follow the [US EPA air-sensor performance and testing guidance](https://www.epa.gov/air-sensor-toolbox/air-sensor-performance-targets-and-testing-protocols).

### Earthquake and structural context

Tri-axis accelerometers can record local shaking. Tilt, vibration and crack-displacement sensors can prioritise inspection; gas, water and electrical isolation state can also be observed. These devices cannot predict an earthquake or certify structural safety. The [National Center for Seismology](https://seismo.gov.in/) remains the official Indian monitoring authority, and [USGS earthquake early-warning guidance](https://www.usgs.gov/programs/earthquake-hazards/science/earthquake-early-warning-overview) distinguishes detection after rupture begins from prediction.

### Evacuation and critical services

- Anonymous doorway beam counters for approximate movement and occupancy flow.
- Gate open/closed, obstruction and emergency-light status.
- Shelter capacity, accessibility, power and water availability.
- Consented GPS for ambulances, buses and rescue equipment.
- Exercise-mode digital signs, strobes, sirens and public-address integration.
- No facial recognition or unnecessary personal tracking.

## Edge gateway

An EIT pilot gateway should provide:

- Linux SBC or industrial controller with a LoRaWAN concentrator;
- Ethernet or Wi-Fi primary backhaul and 4G secondary backhaul;
- local MQTT broker, rules engine and time-series buffer;
- secure time synchronisation and sequence numbering;
- map and procedure cache for loss of internet;
- watchdog, UPS state, enclosure tamper and environmental monitoring;
- automatic retransmission after connectivity returns;
- an isolated, pre-approved local alarm rule in `Exercise` mode.

Remote nodes should use solar plus LiFePO4 where mains power is unavailable. The gateway should use mains plus UPS and a monitored secondary source. ITU emergency-network guidance emphasises alternate routes, graceful degradation, offline storage and backup power: [ITU-T network resilience](https://www.itu.int/itu-t/recommendations/rec.aspx?id=13344&lang=en) and [emergency-rescue system requirements](https://www.itu.int/epublications/en/publication/itu-t-f-760-1-2022-12-requirements-and-reference-framework-for-emergency-rescue-systems/en).

## Observation contract

Every reading should carry at least:

```text
station_id, sensor_id, observed_property, unit, value, uncertainty,
phenomenon_time, result_time, latitude, longitude, elevation,
sequence_number, quality_flags, calibration_due, battery_voltage,
firmware_version, RSSI, SNR, source and provenance
```

AEGIS should identify missing, delayed, duplicated and out-of-order messages; impossible values; unit errors; stuck sensors; excessive rate changes; calibration expiry; clock drift; low battery; weak radio links; gateway loss; and disagreement with collocated sensors, rainfall or official sources. Use hysteresis, debounce and two-source corroboration for alert proposals.

## Security baseline

- Unique device identity; no fleet-wide password.
- LoRaWAN OTAA with per-device keys.
- MQTT TLS and least-privilege per-device ACLs.
- Secure boot, signed firmware and rollback protection.
- Staged firmware updates with recovery.
- Disabled unused interfaces and no public broker exposure.
- Device revocation, quarantine, tamper detection and audit records.
- Documented support and end-of-life dates.

These controls align with [NIST IR 8259A](https://csrc.nist.gov/pubs/ir/8259/a/final) and [NIST IR 8259 Rev. 1](https://csrc.nist.gov/pubs/ir/8259/r1/final).

## India-specific authoritative integration

AEGIS should obtain documented feeds or written access rather than scrape pages:

- [NDMA SACHET](https://sachet.ndma.gov.in/) and the [C-DOT CAP integrated alert system](https://cdot.in/cdotweb/web/product_page.php?catId=9&lang=en&pId=49) for authorised warnings and delivery channels.
- [IMD cyclone information](https://mausam.imd.gov.in/responsive/cycloneinformation.php?lang=en) for meteorological and cyclone products.
- CWC telemetry and flood forecasts; the [CWC Flood Management in India report](https://cwc.gov.in/sites/default/files/flood-management-india-statistical-report-2023.pdf) documents automatic rainfall/water-level stations and satellite telemetry.
- [NCS latest earthquakes](https://riseq.seismo.gov.in/) for official earthquake records.
- [INCOIS Indian Tsunami Early Warning System](https://tsunami.incois.gov.in/TEWS/searlywarnings.jsp) for tsunami and ocean-hazard advisories.

## Product surfaces to add next

1. **Field Network** — station map, current readings, confidence, battery, signal and last-seen state.
2. **Device Health** — gateways, firmware, calibration, faults, maintenance tickets and spares.
3. **Alert Desk** — CAP draft/exercise queue, approval, update/cancel and delivery receipts.
4. **System Health** — provider freshness, ingestion lag, queues, failover and uptime.
5. **Exercises** — physically separated test environment that cannot address actual public channels.
6. **Recovery** — inspections, re-entry conditions, restoration dependencies and after-action evidence.

## Delivery roadmap

1. Define the observation schema, data classifications, roles, approvals and CAP exercise workflow.
2. Build a lab pilot with two level sensors, one rain gauge, local MQTT, stale-data handling and replay.
3. Survey EIT drains/elevations, install separated sensors, collect manual reference readings and calibrate thresholds.
4. Add LoRaWAN, store-and-forward, UPS/solar, secondary backhaul, signed updates and exercise-mode local alarms.
5. Obtain authorised machine-feed access from CWC, IMD, NCS, INCOIS and SACHET.
6. Measure availability, detection latency, false alarms, delivery receipts, battery autonomy, calibration compliance and mean time to repair.
7. Conduct sensor-failure, gateway-loss, internet-loss, bad-data and evacuation exercises.
8. Consider actual public dissemination only after authority agreements, security assessment, CAP conformance and written operating procedures.

## Non-negotiable operating rules

- AI may summarise evidence and propose actions; it is not the sole authority for public alerts or hazardous actuator commands.
- Demonstrations use CAP `Exercise` or `Test`, never `Actual`.
- Modelled casualties or damage remain simulated until confirmed by authoritative observations.
- Web footage is not described as live without verified capture time, publisher and location.
- Low-cost sensors supplement rather than replace official instruments.
- Hardware, calibration, cellular service and maintenance have real costs even when the software stack is open source.
- A complete warning system covers risk knowledge, observation/forecasting, dissemination and preparedness, consistent with [WMO Early Warnings for All](https://wmo.int/sites/default/files/2024-06/Early-Warnings-for-All_Factsheet_EN.pdf).
