/** The product's own words, defined once. Used by the hover definitions and the methodology page. */
export const GLOSSARY = {
  geist: { term: 'Geist', def: 'The audience of a place, named for its taste.' },
  zone: { term: 'Taste zone', def: 'Places that share a geist, so one campaign can serve them all.' },
  lift: {
    term: 'Lift',
    def: 'How much more a title shows up in a place than across the campaign’s other places. 1.0× is no difference; 2.0× is twice as strong.',
  },
  ledger: { term: 'Ledger', def: 'The titles a zone over-indexes on most. Every line of every concept must cite one of them.' },
  seance: { term: 'Séance', def: 'A synthetic test panel: 8 personas per zone built from Qloo data and voiced by AI. Directional, not a survey.' },
  anchors: { term: 'Anchors', def: 'Real brands, artists or shows the product is "like". A new product has no taste history, so Qloo reads it through these.' },
} as const

export type GlossaryKey = keyof typeof GLOSSARY
