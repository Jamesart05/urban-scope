export interface BoundingBox {
  south: number;
  north: number;
  west:  number;
  east:  number;
}

export interface AnalysisResult {
  id: string;
  cachedAt: string;
  fromCache: boolean;
  query: string;

  location: {
    displayName: string;
    coordinates: { latitude: number; longitude: number };
    boundingBox: BoundingBox;
    osmId: number | null;
    osmType: string | null;
    placeType: string;
  };

  totalBuildings:       number;
  residentialBuildings: number;
  commercialBuildings:  number;
  industrialBuildings:  number;
  apartments:           number;
  houses:               number;
  otherBuildings:       number;

  distribution: {
    residentialPct: number;
    commercialPct:  number;
    industrialPct:  number;
    otherPct:       number;
  };

  estimatedPopulation: number;
  populationDensity:   number;
  populationSource:    string;
}
