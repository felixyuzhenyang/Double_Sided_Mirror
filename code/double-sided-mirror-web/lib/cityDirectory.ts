import { Citation } from "./types";

interface CityDirectoryEntry {
  city: string;
  aliases: string[];
  domains: string[];
  sources: Citation[];
}

const CITY_DIRECTORY: CityDirectoryEntry[] = [
  {
    city: "Philadelphia",
    aliases: ["philly"],
    domains: ["phila.gov"],
    sources: [
      {
        title: "City of Philadelphia Services",
        url: "https://www.phila.gov/services/",
        agency: "City of Philadelphia",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city services, permits, licenses, and resident support entry points."
      },
      {
        title: "Philadelphia Business Services",
        url: "https://www.phila.gov/services/business-self-employment/",
        agency: "City of Philadelphia",
        publishedOrUpdated: "Official city portal",
        snippet: "Business licensing, taxes, and operating guidance for Philadelphia."
      }
    ]
  },
  {
    city: "Pittsburgh",
    aliases: [],
    domains: ["pittsburghpa.gov"],
    sources: [
      {
        title: "City of Pittsburgh Services",
        url: "https://pittsburghpa.gov/",
        agency: "City of Pittsburgh",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city information and department-level service pathways."
      },
      {
        title: "Pittsburgh Permits, Licenses, and Inspections",
        url: "https://pittsburghpa.gov/pli",
        agency: "City of Pittsburgh Department of Permits, Licenses, and Inspections",
        publishedOrUpdated: "Official city page",
        snippet: "Permitting, licensing, inspections, and code requirements."
      }
    ]
  },
  {
    city: "Harrisburg",
    aliases: [],
    domains: ["harrisburgpa.gov"],
    sources: [
      {
        title: "City of Harrisburg",
        url: "https://harrisburgpa.gov/",
        agency: "City of Harrisburg",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city notices, departments, and resident/business services."
      }
    ]
  },
  {
    city: "Erie",
    aliases: [],
    domains: ["cityof.erie.pa.us"],
    sources: [
      {
        title: "City of Erie",
        url: "https://cityof.erie.pa.us/",
        agency: "City of Erie",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city services, departments, and community resources."
      }
    ]
  },
  {
    city: "Allentown",
    aliases: [],
    domains: ["allentownpa.gov"],
    sources: [
      {
        title: "City of Allentown",
        url: "https://allentownpa.gov/",
        agency: "City of Allentown",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city services, permits, and local agency contacts."
      }
    ]
  },
  {
    city: "Scranton",
    aliases: [],
    domains: ["scrantonpa.gov"],
    sources: [
      {
        title: "City of Scranton",
        url: "https://scrantonpa.gov/",
        agency: "City of Scranton",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city departments, services, and policy notices."
      }
    ]
  },
  {
    city: "Lancaster",
    aliases: [],
    domains: ["cityoflancasterpa.gov"],
    sources: [
      {
        title: "City of Lancaster",
        url: "https://www.cityoflancasterpa.gov/",
        agency: "City of Lancaster",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city services, permits, and local regulations."
      }
    ]
  },
  {
    city: "Reading",
    aliases: [],
    domains: ["readingpa.gov"],
    sources: [
      {
        title: "City of Reading",
        url: "https://www.readingpa.gov/",
        agency: "City of Reading",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city services, permits, and resident support pathways."
      }
    ]
  },
  {
    city: "Bethlehem",
    aliases: [],
    domains: ["bethlehem-pa.gov"],
    sources: [
      {
        title: "City of Bethlehem",
        url: "https://www.bethlehem-pa.gov/",
        agency: "City of Bethlehem",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city services, public notices, and department contacts."
      }
    ]
  },
  {
    city: "York",
    aliases: [],
    domains: ["yorkcity.org"],
    sources: [
      {
        title: "City of York",
        url: "https://www.yorkcity.org/",
        agency: "City of York",
        publishedOrUpdated: "Official city portal",
        snippet: "Official city offices, permits, and service navigation."
      }
    ]
  }
];

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findCityEntry(cityInput: string): CityDirectoryEntry | null {
  const target = normalize(cityInput);
  if (!target) {
    return null;
  }

  for (const entry of CITY_DIRECTORY) {
    const names = [entry.city, ...entry.aliases].map(normalize);
    if (names.some((name) => target.includes(name) || name.includes(target))) {
      return entry;
    }
  }

  return null;
}

export function extractCityFromText(text: string): string | null {
  const normalized = normalize(text);
  for (const entry of CITY_DIRECTORY) {
    const names = [entry.city, ...entry.aliases].map(normalize);
    if (names.some((name) => normalized.includes(name))) {
      return entry.city;
    }
  }
  return null;
}

export function cityOfficialCitations(cityInput: string): Citation[] {
  const entry = findCityEntry(cityInput);
  if (!entry) {
    return [];
  }
  return entry.sources;
}

export function knownCityDomains(cityInput?: string): string[] {
  if (cityInput) {
    const entry = findCityEntry(cityInput);
    return entry ? entry.domains : [];
  }

  const domains = new Set<string>();
  for (const entry of CITY_DIRECTORY) {
    for (const domain of entry.domains) {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

