/**
 * EMSR867 – Tropical Cyclone GEZANI-26 in Madagascar
 * Source: Copernicus EMS Rapid Mapping API (real data)
 * Event: 2026-02-10  |  Activation: 2026-02-11
 * GDACS ID: TC1001256
 */

export interface EMSRDamageStats {
  residentialTotal: number;
  residentialAffected: number;
  otherBuildingsAffected: number;
  floodedAreaHa: number;
  floodTraceHa: number;
  estimatedPopulation: number;
  populationAffected: number;
  roadsAffectedKm: number;
  agricultureAffectedHa: number;
  sensorName: string;
  acquisitionTime: string;
  maxExtentHa: number;
}

export interface EMSRAoiMeta {
  name: string;
  number: number;
  activationCode: string;
  gdacsId: string;
  category: string;
  eventTime: string;
  reportLink: string;
  feasible: boolean;
  damage: EMSRDamageStats;
}

export const EMSR867_META = {
  code: "EMSR867",
  name: "Tropical Cyclone GEZANI-26 in Madagascar",
  category: "Storm",
  subCategory: "Tropical cyclone, hurricane, typhoon",
  eventTime: "2026-02-10T15:00:00",
  activationTime: "2026-02-11T11:51:00",
  activator: "EC Services | DG ECHO",
  gdacsId: "TC1001256",
  country: "Madagascar",
  reportLink: "https://storymaps.arcgis.com/stories/be469b1416b3460cb992f8ab0cf921b9",
};

const BASE = { activationCode: "EMSR867", gdacsId: "TC1001256", category: "Storm", eventTime: "2026-02-10T15:00:00", reportLink: EMSR867_META.reportLink };

export const EMSR867_AOI_STATS: EMSRAoiMeta[] = [
  {
    ...BASE, name: "Toamasina", number: 1, feasible: true,
    damage: {
      residentialTotal: 100274, residentialAffected: 24687,
      otherBuildingsAffected: 1589 + 569 + 27 + 8 + 9,
      floodedAreaHa: 300.7, floodTraceHa: 1.1, maxExtentHa: 301.9,
      estimatedPopulation: 110000, populationAffected: 1100,
      roadsAffectedKm: 1.9 + 2.5 + 0.2, agricultureAffectedHa: 71.4,
      sensorName: "Legion", acquisitionTime: "2026-02-15T04:15:00",
    },
  },
  {
    ...BASE, name: "Mahavelona", number: 2, feasible: true,
    damage: {
      residentialTotal: 5841, residentialAffected: 33,
      otherBuildingsAffected: 0,
      floodedAreaHa: 0, floodTraceHa: 0, maxExtentHa: 0,
      estimatedPopulation: 13000, populationAffected: 0,
      roadsAffectedKm: 0, agricultureAffectedHa: 0,
      sensorName: "Legion", acquisitionTime: "2026-02-15T04:17:00",
    },
  },
  {
    ...BASE, name: "Ambatondrazaka", number: 3, feasible: true,
    damage: {
      residentialTotal: 31890, residentialAffected: 130,
      otherBuildingsAffected: 1 + 2,
      floodedAreaHa: 478, floodTraceHa: 163.2, maxExtentHa: 641.1,
      estimatedPopulation: 29000, populationAffected: 200,
      roadsAffectedKm: 1.1 + 1.7 + 0.7 + 0.4, agricultureAffectedHa: 535,
      sensorName: "Pleiades", acquisitionTime: "2026-02-16T07:25:00",
    },
  },
  {
    ...BASE, name: "Antananarivo", number: 4, feasible: true,
    damage: {
      residentialTotal: 54348, residentialAffected: 220,
      otherBuildingsAffected: 239,
      floodedAreaHa: 617.4, floodTraceHa: 0.7, maxExtentHa: 618.2,
      estimatedPopulation: 540000, populationAffected: 5200,
      roadsAffectedKm: 0.3, agricultureAffectedHa: 478.7,
      sensorName: "Pleiades", acquisitionTime: "2026-02-18T07:10:00",
    },
  },
  {
    ...BASE, name: "Brickaville", number: 5, feasible: false,
    damage: {
      residentialTotal: 0, residentialAffected: 0, otherBuildingsAffected: 0,
      floodedAreaHa: 0, floodTraceHa: 0, maxExtentHa: 0,
      estimatedPopulation: 0, populationAffected: 0,
      roadsAffectedKm: 0, agricultureAffectedHa: 0,
      sensorName: "Pleiades", acquisitionTime: "2026-02-17T03:45:00",
    },
  },
  {
    ...BASE, name: "Moramanga", number: 6, feasible: false,
    damage: {
      residentialTotal: 0, residentialAffected: 0, otherBuildingsAffected: 0,
      floodedAreaHa: 0, floodTraceHa: 0, maxExtentHa: 0,
      estimatedPopulation: 0, populationAffected: 0,
      roadsAffectedKm: 0, agricultureAffectedHa: 0,
      sensorName: "WorldView-3", acquisitionTime: "2026-02-13T06:42:00",
    },
  },
];

export function getEMSR867Totals() {
  const feasible = EMSR867_AOI_STATS.filter((a) => a.feasible);
  return {
    totalResidentialAffected: feasible.reduce((s, a) => s + a.damage.residentialAffected, 0),
    totalPopulationAffected: feasible.reduce((s, a) => s + a.damage.populationAffected, 0),
    totalFloodedHa: feasible.reduce((s, a) => s + a.damage.floodedAreaHa, 0),
    totalMaxExtentHa: feasible.reduce((s, a) => s + a.damage.maxExtentHa, 0),
    aoiCount: EMSR867_AOI_STATS.length,
    feasibleCount: feasible.length,
  };
}
