// Copernicus EMS EMSR867 – Tropical Cyclone GEZANI-26 in Madagascar
// Parsed from the Copernicus Rapid Mapping API response
// Event: TC Gezani landfall near Toamasina, 10 Feb 2026

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
  damage: EMSRDamageStats;
}

export const EMSR867_META = {
  code: "EMSR867",
  name: "Tropical Cyclone GEZANI-26 in Madagascar",
  category: "Storm",
  subCategory: "Tropical cyclone, hurricane, typhoon",
  gdacsId: "TC1001256",
  eventTime: "2026-02-10T15:00:00",
  activationTime: "2026-02-11T11:51:00",
  activator: "EC Services|DG ECHO",
  reportLink: "https://storymaps.arcgis.com/stories/be469b1416b3460cb992f8ab0cf921b9",
  reason:
    "On 10 February 2026 at 16:00, TC Gezani was reported to have made landfall near Toamasina, Madagascar. The event had been ongoing and was heavily impacting the east coast, with 19 deaths identified in Toamasina.",
};

// Best-available product stats per AOI (latest grading product)
export const EMSR867_AOI_STATS: EMSRAoiMeta[] = [
  {
    name: "Toamasina",
    number: 1,
    activationCode: "EMSR867",
    gdacsId: "TC1001256",
    category: "Storm",
    eventTime: "2026-02-10T15:00:00",
    reportLink: EMSR867_META.reportLink,
    damage: {
      residentialTotal: 100274,
      residentialAffected: 24687,
      otherBuildingsAffected: 1589 + 569 + 62 + 42 + 27 + 24 + 9 + 8 + 6 + 2,
      floodedAreaHa: 300.7,
      floodTraceHa: 1.1,
      estimatedPopulation: 110000,
      populationAffected: 1100,
      roadsAffectedKm: 2.5 + 1.9 + 0.2,
      agricultureAffectedHa: 0, // not separately reported
      sensorName: "Legion",
      acquisitionTime: "2026-02-15T04:15:00",
      maxExtentHa: 301.9,
    },
  },
  {
    name: "Mahavelona",
    number: 2,
    activationCode: "EMSR867",
    gdacsId: "TC1001256",
    category: "Storm",
    eventTime: "2026-02-10T15:00:00",
    reportLink: EMSR867_META.reportLink,
    damage: {
      residentialTotal: 5841,
      residentialAffected: 33,
      otherBuildingsAffected: 0,
      floodedAreaHa: 0,
      floodTraceHa: 0,
      estimatedPopulation: 13000,
      populationAffected: 0,
      roadsAffectedKm: 0,
      agricultureAffectedHa: 0,
      sensorName: "Legion",
      acquisitionTime: "2026-02-15T04:17:00",
      maxExtentHa: 0,
    },
  },
  {
    name: "Ambatondrazaka",
    number: 3,
    activationCode: "EMSR867",
    gdacsId: "TC1001256",
    category: "Storm",
    eventTime: "2026-02-10T15:00:00",
    reportLink: EMSR867_META.reportLink,
    damage: {
      residentialTotal: 31890,
      residentialAffected: 130,
      otherBuildingsAffected: 1 + 2,
      floodedAreaHa: 478.0,
      floodTraceHa: 163.2,
      estimatedPopulation: 29000,
      populationAffected: 200,
      roadsAffectedKm: 1.1 + 1.7 + 0.7 + 0.4,
      agricultureAffectedHa: 535.0,
      sensorName: "Pleiades",
      acquisitionTime: "2026-02-16T07:25:00",
      maxExtentHa: 641.1,
    },
  },
  {
    name: "Antananarivo",
    number: 4,
    activationCode: "EMSR867",
    gdacsId: "TC1001256",
    category: "Storm",
    eventTime: "2026-02-10T15:00:00",
    reportLink: EMSR867_META.reportLink,
    damage: {
      residentialTotal: 54348,
      residentialAffected: 220,
      otherBuildingsAffected: 239,
      floodedAreaHa: 617.4,
      floodTraceHa: 0.7,
      estimatedPopulation: 540000,
      populationAffected: 5200,
      roadsAffectedKm: 0.3,
      agricultureAffectedHa: 478.7,
      sensorName: "Pleiades",
      acquisitionTime: "2026-02-18T07:10:00",
      maxExtentHa: 618.2,
    },
  },
  {
    name: "Brickaville",
    number: 5,
    activationCode: "EMSR867",
    gdacsId: "TC1001256",
    category: "Storm",
    eventTime: "2026-02-10T15:00:00",
    reportLink: EMSR867_META.reportLink,
    damage: {
      residentialTotal: 0,
      residentialAffected: 0,
      otherBuildingsAffected: 0,
      floodedAreaHa: 0,
      floodTraceHa: 0,
      estimatedPopulation: 0,
      populationAffected: 0,
      roadsAffectedKm: 0,
      agricultureAffectedHa: 0,
      sensorName: "Pleiades",
      acquisitionTime: "2026-02-17T03:45:00",
      maxExtentHa: 0,
    },
  },
  {
    name: "Moramanga",
    number: 6,
    activationCode: "EMSR867",
    gdacsId: "TC1001256",
    category: "Storm",
    eventTime: "2026-02-10T15:00:00",
    reportLink: EMSR867_META.reportLink,
    damage: {
      residentialTotal: 0,
      residentialAffected: 0,
      otherBuildingsAffected: 0,
      floodedAreaHa: 0,
      floodTraceHa: 0,
      estimatedPopulation: 0,
      populationAffected: 0,
      roadsAffectedKm: 0,
      agricultureAffectedHa: 0,
      sensorName: "WorldView-3",
      acquisitionTime: "2026-02-13T06:42:00",
      maxExtentHa: 0,
    },
  },
];

// Aggregate totals
export function getEMSR867Totals() {
  const aois = EMSR867_AOI_STATS;
  return {
    totalAois: aois.length,
    totalResidentialAffected: aois.reduce((s, a) => s + a.damage.residentialAffected, 0),
    totalPopulationAffected: aois.reduce((s, a) => s + a.damage.populationAffected, 0),
    totalFloodedHa: aois.reduce((s, a) => s + a.damage.floodedAreaHa, 0),
    totalMaxExtentHa: aois.reduce((s, a) => s + a.damage.maxExtentHa, 0),
    totalEstimatedPopulation: aois.reduce((s, a) => s + a.damage.estimatedPopulation, 0),
  };
}
