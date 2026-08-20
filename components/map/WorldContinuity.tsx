"use client";

import { Globe2, WifiOff } from "lucide-react";

import styles from "./AegisMap.module.css";

/**
 * Last-resort world overview. This is deliberately labelled as a schematic:
 * it preserves geographic orientation without pretending to be a live basemap.
 */
export function WorldContinuity() {
  return (
    <div className={styles.worldContinuity} role="img" aria-label="Schematic world continuity view; live basemap unavailable">
      <svg viewBox="0 0 960 560" aria-hidden="true">
        <defs>
          <radialGradient id="aegis-world-ocean" cx="36%" cy="28%" r="78%">
            <stop offset="0" stopColor="#143846" />
            <stop offset="0.62" stopColor="#071d28" />
            <stop offset="1" stopColor="#02080d" />
          </radialGradient>
          <linearGradient id="aegis-world-land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a8b2a1" />
            <stop offset="0.48" stopColor="#596b59" />
            <stop offset="1" stopColor="#263c32" />
          </linearGradient>
          <radialGradient id="aegis-world-shade" cx="34%" cy="30%" r="68%">
            <stop offset="0.46" stopColor="transparent" />
            <stop offset="1" stopColor="#000" stopOpacity="0.82" />
          </radialGradient>
          <clipPath id="aegis-world-clip">
            <circle cx="480" cy="280" r="220" />
          </clipPath>
          <filter id="aegis-world-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <circle className={styles.worldContinuityAtmosphere} cx="480" cy="280" r="226" />
        <circle cx="480" cy="280" r="220" fill="url(#aegis-world-ocean)" />
        <g clipPath="url(#aegis-world-clip)">
          <g className={styles.worldContinuityGrid}>
            <path d="M260 210H700M260 280H700M260 350H700" />
            <path d="M335 83C380 190 380 370 335 477M420 61C445 185 445 375 420 499M540 61C515 185 515 375 540 499M625 83C580 190 580 370 625 477" />
          </g>
          <g className={styles.worldContinuityLand} fill="url(#aegis-world-land)">
            <path d="M284 139l35-31 58-18 41 8 27 25-9 24-42 11-18 27-34 8-24 31-31-7-21-30 8-24z" />
            <path d="M356 213l31 5 22 22 5 31-18 31-9 38-20 51-21 20-12-38 7-34-19-38 7-45z" />
            <path d="M447 126l32-15 52 5 34-16 74 11 58 28 11 34-35 18-31-7-22 27-35-3-27 24-43-7-20-25-37-2-32-26 14-21z" />
            <path d="M484 207l44 9 32 34-5 50-22 58-28 34-33-23-10-48-21-48 18-44z" />
            <path d="M637 333l34-16 30 11 18 31-22 24-38 6-26-27z" />
            <path d="M265 405l60 19 88 16 108 8 109-9 70-24-41 39-94 24-112 6-107-13-62-28z" />
            <path d="M430 80l31-24 48 4 18 27-23 21-51 4z" />
          </g>
          <g className={styles.worldContinuityLights} filter="url(#aegis-world-glow)">
            <circle cx="377" cy="176" r="7" /><circle cx="404" cy="226" r="5" />
            <circle cx="496" cy="158" r="8" /><circle cx="545" cy="178" r="6" />
            <circle cx="601" cy="183" r="9" /><circle cx="659" cy="166" r="6" />
            <circle cx="515" cy="247" r="5" /><circle cx="670" cy="348" r="4" />
          </g>
          <circle cx="480" cy="280" r="220" fill="url(#aegis-world-shade)" />
        </g>
        <circle cx="480" cy="280" r="220" fill="none" stroke="rgba(183,221,235,.28)" strokeWidth="1.5" />
      </svg>
      <div className={styles.worldContinuityMessage}>
        <span><WifiOff size={13} /> LIVE BASEMAP UNAVAILABLE</span>
        <strong><Globe2 size={17} /> WORLD CONTINUITY</strong>
        <small>Schematic orientation only · retry for satellite, borders, labels and street detail</small>
      </div>
    </div>
  );
}
