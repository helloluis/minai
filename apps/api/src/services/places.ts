/**
 * Google Places API (New) — search for nearby businesses/venues.
 * Uses the Places API v1 (new) textSearch endpoint.
 */

const API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? '';
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

// Cost per Places API Text Search Essentials request
// Google charges $5.00/1000 = $0.005 per request (first 10K/month free)
// We charge 2x markup = $0.01 per search
export const PLACES_COST_USD = 0.01;

export interface PlaceResult {
  name: string;
  address: string;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  types: string[];
  googleMapsUrl: string;
  openNow: boolean | null;
  websiteUrl: string | null;
  phoneNumber: string | null;
}

export async function searchPlaces(query: string, maxResults = 5): Promise<PlaceResult[]> {
  if (!API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.types,places.googleMapsUri,places.currentOpeningHours,places.websiteUri,places.nationalPhoneNumber',
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: maxResults,
      languageCode: 'en',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Places] API error:', res.status, err);
    throw new Error(`Places API error: ${res.status}`);
  }

  const data = await res.json() as {
    places?: Array<{
      displayName?: { text: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      priceLevel?: string;
      types?: string[];
      googleMapsUri?: string;
      currentOpeningHours?: { openNow?: boolean };
      websiteUri?: string;
      nationalPhoneNumber?: string;
    }>;
  };

  return (data.places ?? []).map((p) => ({
    name: p.displayName?.text ?? 'Unknown',
    address: p.formattedAddress ?? '',
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    priceLevel: p.priceLevel ?? null,
    types: p.types ?? [],
    googleMapsUrl: p.googleMapsUri ?? '',
    openNow: p.currentOpeningHours?.openNow ?? null,
    websiteUrl: p.websiteUri ?? null,
    phoneNumber: p.nationalPhoneNumber ?? null,
  }));
}
