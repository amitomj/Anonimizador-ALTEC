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
  contextBefore?: string; // Snippet before
  contextAfter?: string; // Snippet after
  contextSnippet?: string; // 2 words before + entity + 2 words after
}

export const PII_COLORS: Record<string, { bg: [number, number, number], text: [number, number, number], hex: string, textHex: string }> = {
  NOME: { bg: [1, 0.9, 0], text: [0, 0, 0], hex: '#FFD700', textHex: '#000000' },      // Ouro
  LOCAL: { bg: [0.2, 0.8, 0.2], text: [1, 1, 1], hex: '#32CD32', textHex: '#FFFFFF' }, // Verde Lima
  PHONE: { bg: [0.1, 0.5, 0.9], text: [1, 1, 1], hex: '#1E90FF', textHex: '#FFFFFF' }, // Azul Dodger
  NIF: { bg: [1, 0.5, 0], text: [1, 1, 1], hex: '#FF8C00', textHex: '#FFFFFF' },      // Laranja Escuro
  CC: { bg: [0.9, 0.1, 0.5], text: [1, 1, 1], hex: '#DC143C', textHex: '#FFFFFF' },    // Carmesim
  PASSPORT: { bg: [0.6, 0.2, 0.8], text: [1, 1, 1], hex: '#9932CC', textHex: '#FFFFFF' }, // Orquídea Escura
  EMAIL: { bg: [0.4, 0.4, 0.4], text: [1, 1, 1], hex: '#696969', textHex: '#FFFFFF' }, // Cinza Escuro
  IBAN: { bg: [0.7, 0.6, 0.1], text: [1, 1, 1], hex: '#B8860B', textHex: '#FFFFFF' },  // Ouro Velho
  AUTOR: { bg: [0, 0, 0], text: [1, 1, 1], hex: '#000000', textHex: '#FFFFFF' },      // Preto
  JUIZ: { bg: [0, 0, 0.5], text: [1, 1, 1], hex: '#000080', textHex: '#FFFFFF' },     // Azul Marinho
};

// Lista de exceções globais padrão
const DEFAULT_GLOBAL_EXCEPTIONS = [
  'Tribunal da Relação', 'Supremo Tribunal', 'Ministério Público', 'Tribunal Judicial',
  'Comarca de', 'Juízo de', 'Instância Central', 'Instância Local', 'Justiça', 'Direito',
  'Lei', 'Artigo', 'Decreto', 'Portaria', 'Despacho', 'Sentença', 'Acórdão', 'Relatório',
  'Fundamentação', 'Decisão', 'Dispositivo', 'Custas', 'Processo', 'Número', 'Data',
  'Hora', 'Local', 'Sede', 'Empresa', 'Sociedade', 'Limitada', 'Anónima', 'Unipessoal',
  'Herança', 'Jacente', 'Massa', 'Insolvente', 'Falida', 'Estado Português',
  'República Portuguesa', 'Governo', 'Assembleia', 'Câmara Municipal', 'Junta de Freguesia',
  'Região Autónoma', 'Lisboa', 'Porto', 'Coimbra', 'Braga', 'Aveiro', 'Faro', 'Viseu',
  'Évora', 'Guarda', 'Castelo Branco', 'Santarém', 'Setúbal', 'Beja', 'Portalegre',
  'Bragança', 'Vila Real', 'Viana do Castelo', 'Funchal', 'Ponta Delgada',
  'Angra do Heroísmo', 'Horta', 'Banco', 'Sindicato', 'Seguro', 'Refeições', 'Filhos',
  'Social', 'Conta', 'Iban', 'Nif', 'Identificação', 'Fiscal', 'Civil', 'Criminal',
  'Administrativo', 'Fiscal', 'Trabalho', 'Família', 'Menores', 'Comércio', 'Execução',
  'Instrução', 'Criminal', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo',
  'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira',
  'Norma', 'Comissão', 'Trabalhadores', 'Sucursal', 'Facto', 'Provado'
];

const ENTITY_BLACKLIST = [
  'BANCO', 'CGD', 'SINDICATO', 'SEGURO', 'REFEICOES', 'FILHOS', 'SOCIAL', 'CONTA', 
  'ESTADO', 'REPUBLICA', 'TRIBUNAL', 'MINISTERIO', 'CONSELHO', 'DIRECAO', 'SERVICO',
  'INSTITUTO', 'AUTORIDADE', 'COMISSAO', 'FUNDACAO', 'ASSOCIACAO', 'FEDERACAO',
  'CONFEDERACAO', 'ORDEM', 'COLEGIO', 'CAMARA', 'JUNTA', 'ASSEMBLEIA',
  'GOVERNO', 'PARLAMENTO', 'PRESIDENCIA', 'SECRETARIA', 'INSPECAO', 'GABINETE',
  'DEPARTAMENTO', 'DIVISAO', 'UNIDADE', 'NUCLEO', 'CENTRO', 'AGENCIA', 'EMPRESA',
  'SOCIEDADE', 'LIMITADA', 'ANONIMA', 'UNIPESSOAL', 'COOPERATIVA', 'MUTUALIDADE',
  'MISERICORDIA', 'SANTA', 'CASA', 'HOSPITAL', 'CLINICA', 'SAUDE',
  'ESCOLA', 'AGRUPAMENTO', 'UNIVERSIDADE', 'FACULDADE', 'POLITECNICO',
  'ACADEMIA', 'CONSERVATORIO', 'BIBLIOTECA', 'MUSEU', 'TEATRO', 'ARQUIVO',
  'DIARIO', 'BOLETIM', 'JORNAL', 'REVISTA', 'TELEVISAO', 'RADIO', 'IMPRENSA',
  'CORREIO', 'TELECOM', 'ENERGIA', 'AGUA', 'SANEAMENTO', 'RESIDUOS', 'TRANSPORTES',
  'METRO', 'COMBOIOS', 'AUTOCARROS', 'AVIAO', 'AEROPORTO', 'PORTO', 'ESTRADA',
  'AUTOESTRADA', 'PONTE', 'TUNEL', 'VIADUTO', 'PARQUE', 'JARDIM', 'FLORESTA',
  'RESERVA', 'MONUMENTO', 'PALACIO', 'CASTELO', 'IGREJA', 'CATEDRAL', 'MOSTEIRO',
  'CONVENTO', 'SANTUARIO', 'ERMIDA', 'CAPELA', 'CEMITERIO', 'ESTADIO', 'PAVILHAO',
  'PISCINA', 'GINASIO', 'CAMPO', 'PISTA', 'CIRCUITO', 'ARENA', 'PRACA', 'AVENIDA',
  'RUA', 'TRAVESSA', 'LARGO', 'BECO', 'CALCADA', 'ESCADA', 'PATIO', 'QUINTA',
  'HERDADE', 'CASAL', 'LUGAR', 'ALDEIA', 'VILA', 'CIDADE', 'CONCELHO', 'DISTRITO',
  'REGIAO', 'PAIS', 'CONTINENTE', 'MUNDO', 'ABRIL', 'DOMINGO', 'NORMA', 'FACTO', 'PROVADO',
  'COMISSAO', 'TRABALHADORES', 'SUCURSAL', 'SOCIEDADE'
];

const PII_PATTERNS = {
  NIF: /\b[12356789]\d{8}\b/g,
  CC: /\b\d{8}\s*\d\s*[A-Z]{2}\d\b/gi,
  PASSPORT: /\b[A-Z]{1}\d{6}\b/gi,
  PHONE: /\b(?:(?:\+|00)351\s?)?[29]\d{8}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  IBAN: /\bPT50\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/gi,
  JUIZ: /\bJuiz(?:\(a\))?\s+(?:de\s+Direito\s+)?([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+)*)/g,
  AUTOR: /\bAutor(?:\(a\))?\s+([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+)*)/g,
  // More aggressive name patterns for Portuguese
  NOME_PT: /\b(?:Sr\.|Sra\.|Dr\.|Dra\.|Eng\.|Prof\.|Juiz|Desembargador|Colega|Autor|Réu|Mandatário|Advogado|Advogada)\s+([A-Z][a-zÀ-ÿ]+(?:\s+[A-Z][a-zÀ-ÿ]+)+)/g,
  NOME_CAPS: /\b([A-ZÀ-Ÿ]{2,}(?:\s+[A-ZÀ-Ÿ]{2,}){1,5})\b/g,
  // Generic sequence of capitalized words (2 or more)
  NOME_GENERIC: /\b([A-Z][a-zÀ-ÿ]{2,}(?:\s+(?:de|da|do|dos|das)\s+[A-Z][a-zÀ-ÿ]{2,})?(?:\s+[A-Z][a-zÀ-ÿ]{2,}){1,5})\b/g,
  // Pattern for names with "e" in the middle (often two people)
  NOME_AND: /\b([A-Z][a-zÀ-ÿ]{2,}(?:\s+[A-Z][a-zÀ-ÿ]{2,})*\s+e\s+[A-Z][a-zÀ-ÿ]{2,}(?:\s+[A-Z][a-zÀ-ÿ]{2,})*)\b/g,
  // Legal context patterns
  NOME_LEGAL: /\b(?:pelo|pela|por|contra|entre|com|de|do|da|a|ao|à)\s+([A-Z][a-zÀ-ÿ]{2,}(?:\s+[A-Z][a-zÀ-ÿ]{2,}){1,5})/g,
};

const NAME_TITLES = [
  'Colega', 'Autor', 'Autora', 'Réu', 'Ré', 'Mandatário', 'Advogado', 'Advogada', 
  'Dr.', 'Dra.', 'Sr.', 'Sra.', 'Eng.', 'Prof.', 'Juiz', 'Desembargador', 'Relator', 
  'Relatora', 'Venerando', 'Tribunal', 'Relação', 'Lisboa', 'Porto', 'Coimbra', 
  'Évora', 'Guimarães', 'Cfr.', 'In', 'Págs.', 'Pág.', 'Artigo', 'Art.', 'N.º', 
  'Processo', 'Proc.', 'Data', 'Hora', 'Local', 'Sede', 'Empresa', 'Sociedade'
];

const NAME_CLEAN_REGEX = new RegExp(`^\\s*(?:${NAME_TITLES.join('|')})\\s+|\\s+(?:${NAME_TITLES.join('|')})\\s*$`, 'gi');
const CONJUNCTION_CLEAN_REGEX = /^\s*(?:e|ou|com|contra)\s+|\s+(?:e|ou|com|contra)\s*$/gi;
const PUNCTUATION_CLEAN_REGEX = /^[.,;:\-\s]+|[.,;:\-\s]+$/g;

function cleanName(name: string): string {
  let cleaned = name.trim();
  
  // Repeatedly clean until no more changes (to handle "Colega Dr. António")
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(NAME_CLEAN_REGEX, ' ');
    cleaned = cleaned.replace(CONJUNCTION_CLEAN_REGEX, ' ');
    cleaned = cleaned.replace(PUNCTUATION_CLEAN_REGEX, '');
    cleaned = cleaned.trim();
  } while (cleaned !== prev && cleaned.length > 0);

  return cleaned;
}

export function getNextPseudonym(type: string, existingEntities: PIIEntity[]): string {
  const typeEntities = existingEntities.filter(e => e.type === type);
  const count = new Set(typeEntities.map(e => e.original.toLowerCase())).size + 1;
  
  const prefixes: Record<string, string> = {
    NOME: 'Pessoa',
    LOCAL: 'Local',
    PHONE: 'Tel',
    NIF: 'NIF',
    CC: 'CC',
    PASSPORT: 'Pass',
    EMAIL: 'Email',
    IBAN: 'IBAN',
    AUTOR: 'Autor',
    JUIZ: 'Juiz',
  };

  const prefix = prefixes[type] || 'Entidade';
  return `${prefix} ${count}`;
}

export function scanText(text: string, fileId: string, existingEntities: PIIEntity[] = [], isRelated: boolean = true, globalKnowledge: Record<string, string> = {}): PIIEntity[] {
  const entities: PIIEntity[] = [];
  const foundMatches: { text: string, type: string, start: number, end: number }[] = [];

  // 1. Regex Patterns
  Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const matchText = match[1] || match[0];
      const start = match.index + (match[0].indexOf(matchText));
      foundMatches.push({
        text: matchText,
        type: type.startsWith('NOME') ? 'NOME' : type,
        start: start,
        end: start + matchText.length
      });
    }
  });

  // 2. Portuguese Legal Patterns (Parties)
  const legalPatterns = [
    /(?:Recorrente|Recorrido|Requerente|Requerido|Réu|Participante|Denunciado|Arguido|Assistente|Testemunha|Beneficiário|Executado|Exequente|Oponente|Reclamante|Reclamado|Interveniente|Contrainteressado|Apelante|Apelado|Agravante|Agravado|Embargante|Embargado|Demandante|Demandado):\s*([^,.;\n]+)/gi,
    /(?:Nome|Apelido|Filiação|Naturalidade|Residência|Sede):\s*([^,.;\n]+)/gi,
  ];

  legalPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) {
        const matchText = match[1].trim();
        const index = match.index + match[0].indexOf(matchText);
        
        let type = 'NOME';
        const prefix = match[0].split(':')[0].toLowerCase();
        const autorPrefixes = [
          'recorrente', 'recorrido', 'requerente', 'requerido', 'réu', 'participante', 
          'denunciado', 'arguido', 'assistente', 'beneficiário', 'executado', 'exequente', 
          'oponente', 'reclamante', 'reclamado', 'interveniente', 'contrainteressado', 
          'apelante', 'apelado', 'agravante', 'agravado', 'embargante', 'embargado', 
          'demandante', 'demandado'
        ];
        
        if (autorPrefixes.some(p => prefix.includes(p))) {
          type = 'AUTOR';
        } else if (prefix.includes('juiz') || prefix.includes('desembargador')) {
          type = 'JUIZ';
        }

        foundMatches.push({
          text: matchText,
          type: type,
          start: index,
          end: index + matchText.length
        });
      }
    }
  });

  // 3. NLP Detection (Names and Places)
  const doc = nlp(text);
  doc.people().json().forEach((p: any) => {
    if (p.text.length > 3) {
      foundMatches.push({
        text: p.text,
        type: 'NOME',
        start: p.offset?.start || 0,
        end: (p.offset?.start || 0) + p.text.length
      });
    }
  });

  doc.places().json().forEach((p: any) => {
    if (p.text.length > 3) {
      foundMatches.push({
        text: p.text,
        type: 'LOCAL',
        start: p.offset?.start || 0,
        end: (p.offset?.start || 0) + p.text.length
      });
    }
  });

  // 4. Merge and Deduplicate
  const sortedMatches = foundMatches.sort((a, b) => a.start - b.start);
  const mergedMatches: typeof foundMatches = [];
  
  sortedMatches.forEach(match => {
    if (mergedMatches.length === 0) {
      mergedMatches.push(match);
      return;
    }
    
    const last = mergedMatches[mergedMatches.length - 1];
    if (match.start < last.end) {
      if (match.text.length > last.text.length) {
        mergedMatches[mergedMatches.length - 1] = match;
      }
    } else {
      mergedMatches.push(match);
    }
  });

  const addEntity = (original: string, type: string, start: number, end: number) => {
    let trimmed = original.trim();
    
    // Clean names specifically
    if (type === 'NOME' || type === 'AUTOR' || type === 'JUIZ') {
      trimmed = cleanName(trimmed);
    } else {
      trimmed = trimmed.replace(/[.,;]+$/, '');
    }

    if (trimmed.length < 2) return;

    const lower = trimmed.toLowerCase();
    
    // Check global knowledge
    const knowledgeType = globalKnowledge[lower];
    if (knowledgeType === 'EXCECAO') return;
    
    const finalType = knowledgeType || type;

    if (DEFAULT_GLOBAL_EXCEPTIONS.some(ex => ex.toLowerCase() === lower)) return;
    if (ENTITY_BLACKLIST.includes(trimmed.toUpperCase())) return;

    // Check if exists in existing entities (for grouping)
    const existing = existingEntities.find(e => 
      e.original.toLowerCase() === lower && 
      e.type === finalType &&
      (isRelated || e.fileIds?.includes(fileId))
    );

    if (existing) {
      if (!existing.fileIds?.includes(fileId)) {
        existing.fileIds = [...(existing.fileIds || []), fileId];
      }
      return;
    }

    const before = text.substring(Math.max(0, start - 100), start);
    const after = text.substring(end, Math.min(text.length, end + 100));
    const wordsBefore = before.trim().split(/\s+/).slice(-5).join(' ');
    const wordsAfter = after.trim().split(/\s+/).slice(0, 5).join(' ');
    
    const contextWordsBefore = before.trim().split(/\s+/).slice(-2).join(' ');
    const contextWordsAfter = after.trim().split(/\s+/).slice(0, 2).join(' ');
    const contextSnippet = `${contextWordsBefore} ${trimmed} ${contextWordsAfter}`.trim();

    const id = Math.random().toString(36).substring(7);
    const pseudonym = getNextPseudonym(finalType, [...existingEntities, ...entities]);
    
    entities.push({
      id,
      original: trimmed,
      type: finalType,
      pseudonym,
      enabled: true,
      fileIds: [fileId],
      contextBefore: wordsBefore,
      contextAfter: wordsAfter,
      contextSnippet
    });
  };

  mergedMatches.forEach(m => {
    addEntity(m.text, m.type, m.start, m.end);
  });

  return entities;
}

export function splitEntity(entity: PIIEntity, entities: PIIEntity[]): PIIEntity[] {
  const words = entity.original.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 2) return [entity];

  return words.map(word => {
    const pseudonym = getNextPseudonym(entity.type, entities);
    return {
      ...entity,
      id: Math.random().toString(36).substring(7),
      original: word,
      pseudonym,
      groupId: undefined
    };
  });
}

export function groupSimilarEntities(entities: PIIEntity[], isRelated: boolean = true): PIIEntity[] {
  // Reset groups first
  const newEntities = entities.map(e => ({ ...e, groupId: undefined }));
  const groups: Record<string, { id: string, pseudonym: string, treated: boolean }> = {};

  // 1. Group by exact match (case-insensitive) for all types
  // Sort to prioritize 'treated' entities as group heads
  const sortedEntities = [...newEntities].sort((a, b) => (b.treated ? 1 : 0) - (a.treated ? 1 : 0));
  
  sortedEntities.forEach(entity => {
    // If not related, include fileId in the key to prevent cross-document grouping
    const fileId = entity.fileIds?.[0] || 'unknown';
    const key = isRelated 
      ? `${entity.type}:${entity.original.toLowerCase().trim()}`
      : `${fileId}:${entity.type}:${entity.original.toLowerCase().trim()}`;

    if (!groups[key]) {
      groups[key] = { 
        id: `group-${entity.id}`, 
        pseudonym: entity.pseudonym,
        treated: entity.treated || false
      };
    } else if (entity.treated && !groups[key].treated) {
      // If we find a treated entity for an existing group, update the group's pseudonym
      groups[key].pseudonym = entity.pseudonym;
      groups[key].treated = true;
    }
    
    const originalEntity = newEntities.find(e => e.id === entity.id);
    if (originalEntity) {
      originalEntity.groupId = groups[key].id;
      originalEntity.pseudonym = groups[key].pseudonym;
    }
  });

  // 2. Special handling for NAMES (partial matches and shared words)
  const nameEntities = newEntities.filter(e => e.type === 'NOME');
  
  // Helper to get significant words (length > 2)
  const getWords = (text: string) => 
    text.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  nameEntities.forEach(entity => {
    const words = getWords(entity.original);
    if (words.length < 2) return;

    // Find other names that share at least 2 words
    const match = nameEntities.find(other => {
      if (other.id === entity.id) return false;
      // If not related, only match within the same file
      if (!isRelated && other.fileIds?.[0] !== entity.fileIds?.[0]) return false;
      
      const otherWords = getWords(other.original);
      const commonWords = words.filter(w => otherWords.includes(w));
      return commonWords.length >= 2;
    });

    if (match) {
      // If either has a groupId, use it. If both have, use the one from the 'treated' or longer one.
      const targetGroupId = match.groupId || entity.groupId || `group-${match.id}`;
      const targetPseudonym = match.pseudonym || entity.pseudonym;
      
      entity.groupId = targetGroupId;
      entity.pseudonym = targetPseudonym;
      match.groupId = targetGroupId;
      match.pseudonym = targetPseudonym;
    }
  });

  return newEntities;
}

export function anonymizeText(text: string, entities: PIIEntity[]): string {
  let result = text;
  
  // Sort entities by length descending to avoid partial replacements
  const sortedEntities = [...entities]
    .filter(e => e.enabled && !e.ignored && e.type !== 'AUTOR' && e.type !== 'JUIZ')
    .sort((a, b) => b.original.length - a.original.length);

  sortedEntities.forEach(entity => {
    // Use a regex with word boundaries if possible, but be careful with special characters
    const escaped = entity.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    result = result.replace(regex, entity.pseudonym);
  });

  return result;
}
