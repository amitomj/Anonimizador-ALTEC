import nlp from 'compromise';

export type PIIType = string; // More flexible type system

export interface PIIEntity {
  id: string;
  original: string;
  type: PIIType;
  pseudonym: string;
  enabled: boolean;
  selected?: boolean;
  ignored?: boolean;
  treated?: boolean;
  groupId?: string;
  fileIds?: string[]; // IDs of files where this entity was found
  context?: string; // Word immediately preceding the entity
}

export const PII_COLORS: Record<string, { bg: [number, number, number], text: [number, number, number], hex: string }> = {
  NOME: { bg: [1, 1, 0], text: [0, 0, 0], hex: '#FFFF00' },      // Amarelo
  LOCAL: { bg: [0.8, 1, 0.8], text: [0, 0, 0], hex: '#CCFFCC' }, // Verde Alface
  PHONE: { bg: [0.8, 0.9, 1], text: [0, 0, 0], hex: '#CCE6FF' }, // Azul Bebé
  NIF: { bg: [1, 0.9, 0.7], text: [0, 0, 0], hex: '#FFE6B3' },   // Laranja Claro
  CC: { bg: [1, 0.8, 0.9], text: [0, 0, 0], hex: '#FFCCE6' },    // Rosa
  PASSPORT: { bg: [0.9, 0.8, 1], text: [0, 0, 0], hex: '#E6CCFF' }, // Roxo Claro
  EMAIL: { bg: [0.9, 0.9, 0.9], text: [0, 0, 0], hex: '#E6E6E6' }, // Cinza
  IBAN: { bg: [1, 1, 0.9], text: [0, 0, 0], hex: '#FFFFE6' },    // Creme
  AUTOR: { bg: [1, 1, 1], text: [0, 0, 0], hex: '#FFFFFF' },    // Branco (Não anonimizado)
  JUIZ: { bg: [1, 1, 1], text: [0, 0, 0], hex: '#FFFFFF' },     // Branco (Não anonimizado)
  DEFAULT: { bg: [0.9, 0.9, 0.9], text: [0, 0, 0], hex: '#E2E8F0' }, // Default for custom types
};

// Lista de exceções globais padrão
const DEFAULT_GLOBAL_EXCEPTIONS = [
  'Tribunal da Relação',
  'Supremo Tribunal',
  'Ministério Público',
  'Tribunal Judicial',
  'Comarca de',
  'Juízo de',
  'Instância Central',
  'Instância Local',
  'Justiça',
  'Direito',
  'Lei',
  'Artigo',
  'Decreto',
  'Portaria',
  'Despacho',
  'Sentença',
  'Acórdão',
  'Relatório',
  'Fundamentação',
  'Decisão',
  'Dispositivo',
  'Custas',
  'Processo',
  'Número',
  'Data',
  'Hora',
  'Local',
  'Sede',
  'Empresa',
  'Sociedade',
  'Limitada',
  'Anónima',
  'Unipessoal',
  'Herança',
  'Jacente',
  'Massa',
  'Insolvente',
  'Falida',
  'Estado Português',
  'República Portuguesa',
  'Governo',
  'Assembleia',
  'Câmara Municipal',
  'Junta de Freguesia',
  'Região Autónoma',
  'Lisboa',
  'Porto',
  'Coimbra',
  'Braga',
  'Aveiro',
  'Faro',
  'Viseu',
  'Évora',
  'Guarda',
  'Castelo Branco',
  'Santarém',
  'Setúbal',
  'Beja',
  'Portalegre',
  'Bragança',
  'Vila Real',
  'Viana do Castelo',
  'Funchal',
  'Ponta Delgada',
  'Angra do Heroísmo',
  'Horta',
];

const PII_PATTERNS = {
  NIF: /\b[12356789]\d{8}\b/g,
  CC: /\b\d{8}\s*[0-9A-Z]{4}\b/gi,
  PASSPORT: /\b[A-Z]{2}\d{6}\b/gi,
  PHONE: /\b(?:9[1236]\d{7}|2\d{8}|3\d{8})\b/g,
  // We keep these but the user specifically asked for the ones above + names/addresses
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  IBAN: /\bPT50\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{1}\b/gi,
};

export function generatePseudonym(type: string, index: number): string {
  if (type === 'AUTOR' || type === 'JUIZ') return ''; // No pseudonym for these
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const first = letters[Math.floor(index / 26) % 26];
  const second = letters[index % 26];
  return `${type}.${first}${second}`;
}

export function getNextPseudonym(type: string, entities: PIIEntity[]): string {
  const typeEntities = entities.filter(e => e.type === type);
  if (typeEntities.length === 0) return generatePseudonym(type, 0);

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const indices = typeEntities.map(e => {
    const parts = e.pseudonym.split('.');
    if (parts.length < 2) return -1;
    const code = parts[1];
    if (code.length !== 2) return -1;
    const first = letters.indexOf(code[0]);
    const second = letters.indexOf(code[1]);
    return (first * 26) + second;
  }).filter(idx => idx >= 0);

  const maxIndex = indices.length > 0 ? Math.max(...indices) : -1;
  return generatePseudonym(type, maxIndex + 1);
}

export function scanText(text: string, existingEntities: PIIEntity[] = [], globalExceptions: string[] = [], fileId?: string): PIIEntity[] {
  const entities: PIIEntity[] = [...existingEntities];
  const foundTexts = new Map<string, PIIEntity>(entities.map(e => [e.original.toLowerCase(), e]));
  const ignoredTexts = new Set([...DEFAULT_GLOBAL_EXCEPTIONS, ...globalExceptions].map(t => t.toLowerCase()));

  const addEntity = (original: string, type: string, context?: string) => {
    // Trim trailing punctuation (comma, semicolon, period)
    const trimmed = original.replace(/[.,;]+$/, '').trim();
    
    // Check for specific prefixes to ignore numbers (Tel, Fax, Ref, etc.)
    if (['NIF', 'CC', 'PASSPORT'].includes(type) && context) {
      const lowerContext = context.toLowerCase();
      if (lowerContext.includes('tel') || 
          lowerContext.includes('fax') || 
          lowerContext.includes('refª') || 
          lowerContext.includes('referência') ||
          lowerContext.includes('referencia')) {
        return;
      }
    }

    // Minimum length check: 
    // - Names/Places/Orgs: at least 3 characters (to allow Ana, Rui, etc.)
    // - Others: at least 2 characters
    const minLen = (type === 'NOME' || type === 'LOCAL') ? 3 : 2;
    if (!trimmed || trimmed.length < minLen) return;

    const lower = trimmed.toLowerCase();
    
    // Check if it's a global exception (exact match or partial match for common terms)
    const isGlobalException = ignoredTexts.has(lower) || 
                             DEFAULT_GLOBAL_EXCEPTIONS.some(ex => {
                               const exLower = ex.toLowerCase();
                               return lower === exLower || (exLower.length > 5 && lower.includes(exLower));
                             });
    
    if (isGlobalException) return;

    // Avoid redacting common Portuguese words that might be mistaken for names
    const commonWords = ['para', 'pelo', 'pela', 'como', 'mais', 'este', 'esta', 'esse', 'essa', 'aquele', 'aquela', 'onde', 'quando', 'quem', 'qual', 'quais', 'tudo', 'nada', 'algo', 'algum', 'alguma'];
    if (type === 'NOME' && commonWords.includes(lower)) return;

    let finalType = type;
    if (type === 'NOME' && trimmed.toLowerCase().startsWith('relator')) {
      finalType = 'JUIZ';
    }

    const existing = foundTexts.get(lower);
    if (existing) {
      if (fileId && !existing.fileIds?.includes(fileId)) {
        existing.fileIds = [...(existing.fileIds || []), fileId];
      }
    } else {
      const pseudonym = getNextPseudonym(finalType, entities);
      const newEntity: PIIEntity = {
        id: Math.random().toString(36).substring(7),
        original: trimmed,
        type: finalType,
        pseudonym,
        enabled: true,
        selected: false,
        ignored: finalType === 'AUTOR' || finalType === 'JUIZ',
        fileIds: fileId ? [fileId] : [],
        context: context
      };
      entities.push(newEntity);
      foundTexts.set(lower, newEntity);
    }
  };

  // 1. Regex based PII
  Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
    let match;
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const matchIndex = match.index;
      const matchText = match[0];
      
      // Find context (word before)
      const textBefore = text.substring(Math.max(0, matchIndex - 30), matchIndex);
      const wordsBefore = textBefore.trim().split(/\s+/);
      const context = wordsBefore.length > 0 ? wordsBefore[wordsBefore.length - 1] : undefined;
      
      addEntity(matchText, type as PIIEntity['type'], context);
    }
  });

  // 2. NLP based (Names, Places, Organizations)
  const doc = nlp(text);
  
  const people = doc.people().out('array');
  people.forEach((person: string) => addEntity(person, 'NOME'));

  const places = doc.places().out('array');
  places.forEach((place: string) => addEntity(place, 'LOCAL'));

  const orgs = doc.organizations().out('array');
  orgs.forEach((org: string) => addEntity(org, 'NOME')); // Treat orgs as names for now

  // 3. Portuguese Legal Patterns (Parties)
  const legalPatterns = [
    /(?:Recorrente|Recorrido|Requerente|Requerido|Réu|Participante|Denunciado|Arguido|Assistente|Testemunha|Beneficiário|Executado|Exequente|Oponente|Reclamante|Reclamado|Interveniente|Contrainteressado|Apelante|Apelado|Agravante|Agravado|Embargante|Embargado|Demandante|Demandado):\s*([^,.;\n]+)/gi,
    /(?:Nome|Apelido|Filiação|Naturalidade|Residência|Sede):\s*([^,.;\n]+)/gi,
    /(?:Sr\.|Sra\.|Dr\.|Dra\.|Eng\.|Prof\.|Juiz|Desembargador)\s+([A-Z][a-zÀ-ÿ]+\s+(?:[A-Z][a-zÀ-ÿ]+\s*){1,5})/g,
    // Pattern for names in all caps (common in legal docs)
    /\b([A-ZÀ-Ÿ]{3,}(?:\s+[A-ZÀ-Ÿ]{2,}){1,5})\b/g
  ];

  legalPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        addEntity(match[1].trim(), 'NOME');
      }
    }
  });

  return groupSimilarEntities(entities);
}

export function groupSimilarEntities(entities: PIIEntity[]): PIIEntity[] {
  const names = entities.filter(e => e.type === 'NOME' && !e.ignored);
  const groups: PIIEntity[][] = [];

  const getWords = (str: string) => {
    return str.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !['dos', 'das', 'com', 'pelo', 'pela'].includes(w));
  };

  names.forEach(entity => {
    const entityWords = getWords(entity.original);
    let foundGroup = false;

    for (const group of groups) {
      if (group.some(member => {
        const memberWords = getWords(member.original);
        const commonWords = entityWords.filter(w => memberWords.includes(w));
        return commonWords.length >= 2;
      })) {
        group.push(entity);
        foundGroup = true;
        break;
      }
    }

    if (!foundGroup) {
      groups.push([entity]);
    }
  });

  // Assign group IDs and unify pseudonyms for groups with more than 1 member
  groups.forEach((group, index) => {
    if (group.length > 1) {
      const groupId = `group-${index}`;
      const basePseudonym = group[0].pseudonym;
      group.forEach(entity => {
        entity.groupId = groupId;
        entity.pseudonym = basePseudonym;
      });
    }
  });

  return entities;
}

export function applyAnonymization(text: string, entities: PIIEntity[], isIndexPage: boolean = false): string {
  let result = text;
  
  // Sort by length descending
  const sortedEntities = [...entities]
    .filter(e => e.enabled && !e.ignored && e.type !== 'AUTOR' && e.type !== 'JUIZ')
    .sort((a, b) => b.original.length - a.original.length);

  sortedEntities.forEach(entity => {
    // If it's an index page and the entity is a number (NIF, CC, Phone, etc.), skip it
    if (isIndexPage && entity.type !== 'NOME' && entity.type !== 'LOCAL') {
      return;
    }

    const escaped = entity.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    result = result.replace(regex, entity.pseudonym);
  });

  return result;
}
