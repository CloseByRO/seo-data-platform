import { stripDiacritics } from '@/lib/romania/counties'

export const CITY_NEIGHBORHOODS_MAPPING = {
  'București': {
    'Sector 1': {
      neighborhoods: [
        { name: 'Aviatorilor', anchors: ['Piata Victoriei', 'Bulevardul Aviatorilor', 'Iancu de Hunedoara', 'Paris', 'Lascar Catargiu'], metro: ['Victoriei', 'Aviatorilor'] },
        { name: 'Aviației', anchors: ['Nicolae Caramfil', 'Alexandru Serbanescu', 'Soseaua Pipera'], metro: ['Aurel Vlaicu'] },
        { name: 'Băneasa', anchors: ['Aerogarii', 'Bucuresti-Ploiesti', 'Gratioasa', 'Biharia', 'Jandarmeriei'], metro: [] },
        { name: 'Bucureștii Noi', anchors: ['Bucurestii Noi', 'Jiului', 'Gloriei', 'Parc Bazilescu'], metro: ['Jiului', 'Parc Bazilescu', 'Laminorului'] },
        { name: 'Chitila', anchors: ['Soseaua Chitilei', 'Banatului'], metro: [] },
        { name: 'Dămăroaia', anchors: ['Coralilor', 'Piatra Morii'], metro: [] },
        { name: 'Pajura', anchors: ['Pajurei', 'Baicului'], metro: [] },
        { name: 'Dorobanți', anchors: ['Calea Dorobanti', 'Radu Beller', 'Mario Plaza'], metro: [] },
        { name: 'Floreasca', anchors: ['Calea Floreasca', 'Ceasornicului', 'Mircea Eliade'], metro: [] },
        { name: 'Primăverii', anchors: ['Bulevardul Primaverii', 'Jean Monnet', 'Nikolai Tolstoi'], metro: [] },
        { name: 'Grivița', anchors: ['Calea Grivitei', 'Dinicu Golescu', 'Buzesti', 'Ion Mihalache'], metro: ['Gara de Nord', 'Basarab'] },
        { name: 'Piața Romană', anchors: ['Magheru', 'Lascar Catargiu', 'Mendeleev', 'Calea Victoriei'], metro: ['Piata Romana'] },
      ]
    },
    'Sector 2': {
      neighborhoods: [
        { name: 'Colentina', anchors: ['Soseaua Colentina', 'Doamna Ghica', 'Maior Bacila', 'Fundeni', 'Andronache'], metro: [] },
        { name: 'Iancului', anchors: ['Soseaua Iancului', 'Pache Protopopescu', 'Matasari'], metro: ['Iancului'] },
        { name: 'Vatra Luminoasă', anchors: ['Vatra Luminoasa', 'Maior Coravu'], metro: [] },
        { name: 'Moșilor', anchors: ['Calea Mosilor', 'Foisorul de Foc'], metro: ['Obor'] },
        { name: 'Pantelimon', anchors: ['Soseaua Pantelimon', 'Vergului', 'Chisinau', 'Lucretiu Patrascanu'], metro: ['Costin Georgian', 'Pantelimon'] },
        { name: 'Ștefan cel Mare', anchors: ['Soseaua Stefan cel Mare', 'Tunari', 'Polona', 'Lizeanu', 'Circului'], metro: ['Stefan cel Mare'] },
        { name: 'Tei', anchors: ['Lacul Tei', 'Maica Domnului', 'Grigore Gafencu'], metro: [] },
      ]
    },
    'Sector 3': {
      neighborhoods: [
        { name: 'Centrul Civic', anchors: ['Bulevardul Unirii', 'Libertatii', 'Corneliu Coposu', 'Brătianu', 'Alba Iulia'], metro: ['Unirii'] },
        { name: 'Dristor', anchors: ['Camil Ressu', 'Mihai Bravu', 'Dristorului'], metro: ['Dristor'] },
        { name: 'Dudești', anchors: ['Calea Dudesti', 'Octavian Goga'], metro: [] },
        { name: 'Muncii', anchors: ['Basarabia', 'Decebal', 'Piata Hurmuzachi'], metro: ['Piata Muncii'] },
        { name: 'Titan', anchors: ['Nicolae Grigorescu', '1 Decembrie 1918', 'Liviu Rebreanu', 'Postavarului', 'Balta Alba', 'Ozana'], metro: ['Titan', 'Nicolae Grigorescu', '1 Decembrie 1918'] },
        { name: 'Vitan', anchors: ['Calea Vitan', 'Energeticienilor', 'Mall Vitan'], metro: [] },
      ]
    },
    'Sector 4': {
      neighborhoods: [
        { name: 'Berceni', anchors: ['Soseaua Berceni', 'Alexandru Obregia', 'Constantin Brancoveanu', 'Turnu Magurele', 'Metalurgiei'], metro: ['Piata Sudului', 'Aparatorii Patriei', 'Constantin Brancoveanu'] },
        { name: 'Olteniței', anchors: ['Soseaua Oltenitei', 'Nitu Vasile'], metro: [] },
        { name: 'Giurgiului', anchors: ['Soseaua Giurgiului', 'Resita', 'Toporasi', 'Drumul Gazarului', 'Progresul'], metro: [] },
        { name: 'Tineretului', anchors: ['Bulevardul Tineretului', 'Calea Vacaresti', 'Gheorghe Sincai'], metro: ['Tineretului', 'Văcărești'] },
        { name: 'Timpuri Noi', anchors: ['Abatorului', 'Nerva Traian'], metro: ['Timpuri Noi'] },
      ]
    },
    'Sector 5': {
      neighborhoods: [
        { name: '13 Septembrie', anchors: ['Calea 13 Septembrie', 'Tudor Vladimirescu', 'Novaci', 'Marriott'], metro: [] },
        { name: 'Panduri', anchors: ['Soseaua Panduri', 'Rainer'], metro: [] },
        { name: 'Cotroceni', anchors: ['Bulevardul Eroilor', 'Gheorghe Marinescu', 'Carol Davila', 'Romulus', 'Dealul Spirii'], metro: ['Eroilor', 'Academia Militara'] },
        { name: 'Rahova', anchors: ['Calea Rahovei', 'Alexandriei', 'George Cosbuc', 'Sebastian', 'Petre Ispirescu'], metro: [] },
        { name: 'Ferentari', anchors: ['Calea Ferentari', 'Prelungirea Ferentari'], metro: [] },
      ]
    },
    'Sector 6': {
      neighborhoods: [
        { name: 'Crângași', anchors: ['Virtutii', 'Calea Crangasi', 'Giulesti'], metro: ['Crangasi'] },
        { name: 'Drumul Taberei', anchors: ['Favorit', 'Drumul Taberei', 'Timisoara', 'Ghencea', 'Brasov', 'Sibiu', 'Valea Oltului'], metro: ['Tudor Vladimirescu', 'Parc Drumul Taberei', 'Romancierilor'] },
        { name: 'Militari', anchors: ['Iuliu Maniu', 'Lujerului', 'Dezrobirii', 'Apusului', 'Uverturii', 'Gorjului'], metro: ['Lujerului', 'Gorjului', 'Pacii'] },
      ]
    }
  },
  'Cluj-Napoca': {
    'Zonă': {
      neighborhoods: [
        { name: 'Mănăștur', anchors: ['Calea Manastur', 'Primaverii'], metro: [] },
        { name: 'Gheorgheni', anchors: ['Titan', 'Constantin Brancusi'], metro: [] },
        { name: 'Mărăști', anchors: ['21 Decembrie', 'Aurel Vlaicu'], metro: [] },
        { name: 'Zorilor', anchors: ['Observatorului', 'Pasteur'], metro: [] },
      ]
    }
  },
  'Timișoara': {
    'Zonă': {
      neighborhoods: [
        { name: 'Iosefin', anchors: ['Calea Sagului', 'Regele Carol', 'Piata Mocioni'], metro: [] },
        { name: 'Elisabetin', anchors: ['Nicolae Balcescu', 'Independentei', 'Calea Girocului'], metro: [] },
        { name: 'Fabric', anchors: ['Piata Traian', 'Calea Lugojului', 'Stefan cel Mare'], metro: [] },
        { name: 'Mehala', anchors: ['Calea Torontalului', 'Calea Aradului', 'Avram Iancu'], metro: [] },
        { name: 'Aradului', anchors: ['Calea Aradului', 'Lipovei', 'Dedeman'], metro: [] },
        { name: 'Girocului', anchors: ['Calea Girocului', 'Martirilor', 'Mures'], metro: [] }
      ]
    }
  },
  'Iași': {
    'Zonă': {
      neighborhoods: [
        { name: 'Copou', anchors: ['Carol I', 'Parcul Copou', 'Universitate'], metro: [] },
        { name: 'Tătărași', anchors: ['Vasile Lupu', 'Doi Baieti', 'Atena'], metro: [] },
        { name: 'Nicolina', anchors: ['Soseaua Nicolina', 'Belvedere', 'CUG'], metro: [] },
        { name: 'Păcurari', anchors: ['Soseaua Pacurari', 'Moara de Foc', 'Alpha Bank'], metro: [] },
        { name: 'Alexandru cel Bun', anchors: ['Bulevardul Alexandru cel Bun', 'Piata Voievozilor', 'Zimbru'], metro: [] }
      ]
    }
  },
  'Brașov': {
    'Zonă': {
      neighborhoods: [
        { name: 'Astra', anchors: ['Calea Bucuresti', 'Saturn', 'Zizinului'], metro: [] },
        { name: 'Tractorul', anchors: ['13 Decembrie', 'Coresi', 'Zaharia Stancu'], metro: [] },
        { name: 'Bartolomeu', anchors: ['Calea Fagarasului', 'Garii', 'Stadionului'], metro: [] },
        { name: 'Răcădău', anchors: ['Valea Cetatii', 'Muncii', 'Tampei'], metro: [] },
        { name: 'Schei', anchors: ['Piata Unirii', 'Prundului', 'Poarta Schei'], metro: [] }
      ]
    }
  }
} as const

export type SupportedCity = keyof typeof CITY_NEIGHBORHOODS_MAPPING

export function normalizeLocationName(raw: string) {
  return stripDiacritics(raw)
    .toLowerCase()
    .trim()
    .replace(/[(),.]/g, ' ')
    .replace(/\s+/g, ' ')
}

export function matchSupportedCity(cityRaw: string): SupportedCity | null {
  const normalizedCity = normalizeLocationName(cityRaw)
  const keys = Object.keys(CITY_NEIGHBORHOODS_MAPPING) as SupportedCity[]
  for (const key of keys) {
    const nk = normalizeLocationName(key)
    if (normalizedCity === nk) return key
    if (normalizedCity.includes(nk) || nk.includes(normalizedCity)) return key
  }
  return null
}

export type LocalSeoMatch = {
  city: SupportedCity
  subdivision: string | null
  neighborhood: string | null
  metroStation: string | null
  method: 'google_component' | 'street_anchor' | 'none'
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function includesToken(haystackNorm: string, needleRaw: string) {
  const n = normalizeLocationName(needleRaw)
  if (!n) return false
  // Avoid substring false positives: e.g. "oltenitei" contains "tei".
  // We match whole-token sequences in the normalized string.
  const re = new RegExp(`(^|\\s)${escapeRegExp(n)}(\\s|$)`, 'i')
  return re.test(haystackNorm)
}

export function matchNeighborhoodGeneral(cityRaw: string, addressRaw: string): LocalSeoMatch | null {
  const cityKey = matchSupportedCity(cityRaw)
  if (!cityKey) return null

  const normalizedAddress = normalizeLocationName(addressRaw)
  const sectorsOrZones = CITY_NEIGHBORHOODS_MAPPING[cityKey]

  for (const [subdiv, block] of Object.entries(sectorsOrZones)) {
    const neighborhoods = (block as { neighborhoods: Array<{ name: string; anchors: string[]; metro: string[] }> }).neighborhoods
    for (const hood of neighborhoods) {
      if (includesToken(normalizedAddress, hood.name)) {
        // try metro hint too
        const metroMatch = hood.metro.find((m) => includesToken(normalizedAddress, m)) ?? null
        return { city: cityKey, subdivision: subdiv, neighborhood: hood.name, metroStation: metroMatch, method: 'street_anchor' }
      }

      // Anchors: if address contains a known street/landmark, infer the neighborhood
      const anchorHit = hood.anchors.find((a) => includesToken(normalizedAddress, a)) ?? null
      if (anchorHit) {
        const metroMatch = hood.metro.find((m) => includesToken(normalizedAddress, m)) ?? null
        return { city: cityKey, subdivision: subdiv, neighborhood: hood.name, metroStation: metroMatch, method: 'street_anchor' }
      }

      // Metro: if address contains station name, infer neighborhood
      const metroHit = hood.metro.find((m) => includesToken(normalizedAddress, m)) ?? null
      if (metroHit) {
        return { city: cityKey, subdivision: subdiv, neighborhood: hood.name, metroStation: metroHit, method: 'street_anchor' }
      }
    }
  }

  return { city: cityKey, subdivision: null, neighborhood: null, metroStation: null, method: 'none' }
}

export function listNeighborhoodsForCity(city: SupportedCity, subdivision?: string | null) {
  const sectorsOrZones = CITY_NEIGHBORHOODS_MAPPING[city]
  function listFromBlock(block: unknown) {
    const b = block as { neighborhoods?: Array<{ name: string }> }
    return (b.neighborhoods ?? []).map((x) => x.name)
  }

  if (!subdivision || !(subdivision in sectorsOrZones)) {
    const out: string[] = []
    for (const block of Object.values(sectorsOrZones)) out.push(...listFromBlock(block))
    return out
  }

  return listFromBlock((sectorsOrZones as Record<string, unknown>)[subdivision])
}

export function matchLocalSEOData(args: {
  localityRaw: string | null | undefined
  formattedAddress: string | null | undefined
  googleNeighborhood?: string | null | undefined
}) {
  const cityRaw = (args.localityRaw ?? '').trim()
  const addr = (args.formattedAddress ?? '').trim()
  if (!cityRaw) return null

  const city = matchSupportedCity(cityRaw)
  if (!city) return null

  // If Google gave neighborhood, try to map it to our canonical neighborhood first.
  if (args.googleNeighborhood?.trim()) {
    const g = matchNeighborhoodGeneral(city, args.googleNeighborhood.trim())
    if (g?.neighborhood) return { ...g, method: 'google_component' as const }
  }

  // Otherwise, fall back to address anchors
  return matchNeighborhoodGeneral(city, addr)
}

