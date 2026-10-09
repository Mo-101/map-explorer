// ISO 3166-1 alpha-3 codes for the 54 African UN member states plus African
// territories (Western Sahara, Réunion, Mayotte, Saint Helena). Used to scope
// feeds by affected country rather than by a bounding box, which would also
// catch southern Europe and the Middle East.
export const AFRICA_ISO3 = new Set([
  "DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CPV", "CMR", "CAF", "TCD", "COM", "COD", "COG", "CIV",
  "DJI", "EGY", "GNQ", "ERI", "SWZ", "ETH", "GAB", "GMB", "GHA", "GIN", "GNB", "KEN", "LSO", "LBR",
  "LBY", "MDG", "MWI", "MLI", "MRT", "MUS", "MAR", "MOZ", "NAM", "NER", "NGA", "RWA", "STP", "SEN",
  "SYC", "SLE", "SOM", "ZAF", "SSD", "SDN", "TZA", "TGO", "TUN", "UGA", "ZMB", "ZWE",
  "ESH", "REU", "MYT", "SHN",
]);
