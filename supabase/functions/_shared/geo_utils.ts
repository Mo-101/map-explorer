// Simplified reverse geocoding for Africa using bounding boxes
// Returns country name for a given lat/lon point

interface CountryBBox {
  name: string;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
}

// Approximate bounding boxes for African countries
const AFRICA_COUNTRIES: CountryBBox[] = [
  { name: "Algeria", lat_min: 19, lat_max: 37, lon_min: -9, lon_max: 12 },
  { name: "Angola", lat_min: -18, lat_max: -4, lon_min: 12, lon_max: 24 },
  { name: "Benin", lat_min: 6, lat_max: 12.5, lon_min: 1, lon_max: 4 },
  { name: "Botswana", lat_min: -27, lat_max: -18, lon_min: 20, lon_max: 29 },
  { name: "Burkina Faso", lat_min: 9, lat_max: 15, lon_min: -5.5, lon_max: 2.5 },
  { name: "Burundi", lat_min: -4.5, lat_max: -2.3, lon_min: 29, lon_max: 30.9 },
  { name: "Cameroon", lat_min: 2, lat_max: 13, lon_min: 8.5, lon_max: 16 },
  { name: "Central African Republic", lat_min: 2, lat_max: 11, lon_min: 14.5, lon_max: 27.5 },
  { name: "Chad", lat_min: 7.5, lat_max: 23.5, lon_min: 14, lon_max: 24 },
  { name: "Comoros", lat_min: -12.5, lat_max: -11.3, lon_min: 43, lon_max: 44.5 },
  { name: "Congo", lat_min: -5, lat_max: 4, lon_min: 11, lon_max: 18.5 },
  { name: "Côte d'Ivoire", lat_min: 4.3, lat_max: 10.7, lon_min: -8.6, lon_max: -2.5 },
  { name: "Democratic Republic of the Congo", lat_min: -13.5, lat_max: 5.4, lon_min: 12.2, lon_max: 31.3 },
  { name: "Djibouti", lat_min: 10.9, lat_max: 12.7, lon_min: 41.7, lon_max: 43.4 },
  { name: "Egypt", lat_min: 22, lat_max: 31.7, lon_min: 25, lon_max: 36 },
  { name: "Equatorial Guinea", lat_min: -1.5, lat_max: 3.8, lon_min: 5.6, lon_max: 11.3 },
  { name: "Eritrea", lat_min: 12.4, lat_max: 18, lon_min: 36.5, lon_max: 43.2 },
  { name: "Eswatini", lat_min: -27.3, lat_max: -25.7, lon_min: 30.8, lon_max: 32.1 },
  { name: "Ethiopia", lat_min: 3.4, lat_max: 15, lon_min: 33, lon_max: 48 },
  { name: "Gabon", lat_min: -4, lat_max: 2.3, lon_min: 8.7, lon_max: 14.5 },
  { name: "Gambia", lat_min: 13.1, lat_max: 13.8, lon_min: -16.8, lon_max: -13.8 },
  { name: "Ghana", lat_min: 4.7, lat_max: 11.2, lon_min: -3.3, lon_max: 1.2 },
  { name: "Guinea", lat_min: 7.2, lat_max: 12.7, lon_min: -15, lon_max: -7.6 },
  { name: "Guinea-Bissau", lat_min: 10.9, lat_max: 12.7, lon_min: -16.7, lon_max: -13.6 },
  { name: "Kenya", lat_min: -4.7, lat_max: 5.5, lon_min: 34, lon_max: 42 },
  { name: "Lesotho", lat_min: -30.7, lat_max: -28.6, lon_min: 27, lon_max: 29.5 },
  { name: "Liberia", lat_min: 4.3, lat_max: 8.5, lon_min: -11.5, lon_max: -7.4 },
  { name: "Libya", lat_min: 19.5, lat_max: 33, lon_min: 9.3, lon_max: 25 },
  { name: "Madagascar", lat_min: -25.6, lat_max: -12, lon_min: 43.2, lon_max: 50.5 },
  { name: "Malawi", lat_min: -17.1, lat_max: -9.4, lon_min: 32.7, lon_max: 35.9 },
  { name: "Mali", lat_min: 10.2, lat_max: 25, lon_min: -12.2, lon_max: 4.3 },
  { name: "Mauritania", lat_min: 14.7, lat_max: 27.3, lon_min: -17.1, lon_max: -4.8 },
  { name: "Mauritius", lat_min: -20.5, lat_max: -19.9, lon_min: 57.3, lon_max: 57.8 },
  { name: "Morocco", lat_min: 27.7, lat_max: 36, lon_min: -13, lon_max: -1 },
  { name: "Mozambique", lat_min: -26.9, lat_max: -10.5, lon_min: 30.2, lon_max: 40.8 },
  { name: "Namibia", lat_min: -29, lat_max: -17, lon_min: 12, lon_max: 25 },
  { name: "Niger", lat_min: 11.7, lat_max: 23.5, lon_min: 0, lon_max: 16 },
  { name: "Nigeria", lat_min: 4.3, lat_max: 14, lon_min: 2.7, lon_max: 14.7 },
  { name: "Rwanda", lat_min: -2.8, lat_max: -1, lon_min: 29, lon_max: 30.9 },
  { name: "Senegal", lat_min: 12.3, lat_max: 16.7, lon_min: -17.5, lon_max: -11.4 },
  { name: "Seychelles", lat_min: -10, lat_max: -3.7, lon_min: 46, lon_max: 56.3 },
  { name: "Sierra Leone", lat_min: 6.9, lat_max: 10, lon_min: -13.3, lon_max: -10.3 },
  { name: "Somalia", lat_min: -1.7, lat_max: 12, lon_min: 41, lon_max: 51.4 },
  { name: "South Africa", lat_min: -35, lat_max: -22, lon_min: 16.5, lon_max: 33 },
  { name: "South Sudan", lat_min: 3.5, lat_max: 12.2, lon_min: 24, lon_max: 36 },
  { name: "Sudan", lat_min: 8.7, lat_max: 22, lon_min: 21.8, lon_max: 38.6 },
  { name: "Tanzania", lat_min: -11.7, lat_max: -1, lon_min: 29, lon_max: 40.5 },
  { name: "Togo", lat_min: 6, lat_max: 11.1, lon_min: -0.2, lon_max: 1.8 },
  { name: "Tunisia", lat_min: 30.2, lat_max: 37.4, lon_min: 7.5, lon_max: 11.6 },
  { name: "Uganda", lat_min: -1.5, lat_max: 4.2, lon_min: 29.6, lon_max: 35 },
  { name: "Zambia", lat_min: -18, lat_max: -8, lon_min: 22, lon_max: 33.7 },
  { name: "Zimbabwe", lat_min: -22.4, lat_max: -15.6, lon_min: 25.2, lon_max: 33 },
];

export function getCountryName(lat: number, lon: number): string | null {
  // Find smallest bounding box that contains the point (handles overlaps)
  let best: CountryBBox | null = null;
  let bestArea = Infinity;

  for (const c of AFRICA_COUNTRIES) {
    if (lat >= c.lat_min && lat <= c.lat_max && lon >= c.lon_min && lon <= c.lon_max) {
      const area = (c.lat_max - c.lat_min) * (c.lon_max - c.lon_min);
      if (area < bestArea) {
        bestArea = area;
        best = c;
      }
    }
  }

  return best?.name ?? null;
}

// Saffir-Simpson category from wind speed in knots
export function getSaffirSimpsonCategory(windKt: number): number {
  if (windKt >= 137) return 5;
  if (windKt >= 113) return 4;
  if (windKt >= 96) return 3;
  if (windKt >= 83) return 2;
  if (windKt >= 64) return 1;
  return 0;
}
