CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS geospatial_assets (
  id text PRIMARY KEY,
  asset_type text NOT NULL,
  name text NOT NULL,
  evidence_class text NOT NULL CHECK (evidence_class IN ('OBSERVED','IMPORTED','ESTIMATED','SIMULATED')),
  geom geometry(Geometry, 4326) NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  observed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geospatial_assets_id_format CHECK (id ~ '^[A-Za-z0-9._:-]{3,120}$'),
  CONSTRAINT geospatial_assets_type_format CHECK (asset_type ~ '^[a-z0-9-]{2,64}$'),
  CONSTRAINT geospatial_assets_properties_object CHECK (jsonb_typeof(properties) = 'object'),
  CONSTRAINT geospatial_assets_valid_geom CHECK (ST_IsValid(geom))
);

DO $$
BEGIN
  ALTER TABLE geospatial_assets ADD CONSTRAINT geospatial_assets_id_format
    CHECK (id ~ '^[A-Za-z0-9._:-]{3,120}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE geospatial_assets ADD CONSTRAINT geospatial_assets_type_format
    CHECK (asset_type ~ '^[a-z0-9-]{2,64}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE geospatial_assets ADD CONSTRAINT geospatial_assets_properties_object
    CHECK (jsonb_typeof(properties) = 'object');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE geospatial_assets ADD CONSTRAINT geospatial_assets_valid_geom
    CHECK (ST_IsValid(geom));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS geospatial_assets_geom_gix ON geospatial_assets USING gist (geom);
CREATE INDEX IF NOT EXISTS geospatial_assets_type_idx ON geospatial_assets (asset_type);
CREATE INDEX IF NOT EXISTS geospatial_assets_name_trgm_idx ON geospatial_assets USING gin (name gin_trgm_ops);
