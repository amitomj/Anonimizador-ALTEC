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
  reviewed?: boolean; // For ambiguity review
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
  MATRICULA: { bg: [0.8, 0.8, 0], text: [0, 0, 0], hex: '#CCCC00', textHex: '#000000' }, // Amarelo Escuro
  TESTEMUNHA: { bg: [0.5, 0.5, 0.5], text: [1, 1, 1], hex: '#808080', textHex: '#FFFFFF' }, // Cinza
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
  'Norma', 'Comissão', 'Trabalhadores', 'Sucursal', 'Facto', 'Provado',
  'CONSELHEIRO', 'DESEMBARGADOR', 'JUIZ', 'ACORDAM',
  'recorrente', 'recorrida', 'recorrido', 'recorridas', 'recorridos', 'registada', 
  'autor', 'autores', 'autora', 'autoras', 'réu', 'réus', 'ré', 'rés', 
  'requerente', 'requerentes', 'requerida', 'requeridas', 'requerido', 'requeridos',
  'adjunta', 'adjunto', 'desembargadora', 'desembargador', 'conselheira', 'conselheiro',
  'termos em que', 'recurso de apelação', 'termo e duração', 'partes de cima', 'partes de baixo',
  'família de tricotados', 'família dos tricotados', 'rua fernão magalhães',
  'pelo exposto', 'em conformidade', 'nos termos do artigo', 'codigo de processo civil',
  'supremo tribunal de justiça', 'juízo de instrução', 'tribunal da relacao',
  'conforme o disposto', 'nestes termos', 'pede deferimento', 'valor da causa',
  'custas de parte', 'procuradoria', 'taxa de justiça', 'apoio judiciário'
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
  'COMISSAO', 'TRABALHADORES', 'SUCURSAL', 'SOCIEDADE', 'RELATORIO', 'ADVOGADO', 'ADVOGADA',
  'CEDULA', 'PROCESSO', 'PROCEDIMENTO', 'REQUERIMENTO', 'DESPACHO', 'SENTENCA', 'ACORDAO',
  'PAGINA', 'FOLHA', 'DOCUMENTO', 'ANEXO', 'CERTIDAO', 'NOTIFICACAO', 'CITACAO', 'EDITAL',
  'ACORDAM', 'CONSELHEIRO', 'DESEMBARGADOR', 'JUIZ',
  'RECORRENTE', 'RECORRIDA', 'RECORRIDO', 'RECORRIDAS', 'RECORRIDOS', 'REGISTADA', 
  'AUTOR', 'AUTORES', 'AUTORA', 'AUTORAS', 'REU', 'REUS', 'RE', 'RES', 
  'REQUERENTE', 'REQUERENTES', 'REQUERIDA', 'REQUERIDAS', 'REQUERIDO', 'REQUERIDOS',
  'ADJUNTA', 'ADJUNTO', 'DESEMBARGADORA', 'DESEMBARGADOR', 'CONSELHEIRA', 'CONSELHEIRO',
  'TERMOS EM QUE', 'RECURSO DE APELACAO', 'TERMO E DURACAO', 'PARTES DE CIMA', 'PARTES DE BAIXO',
  'FAMILIA DE TRICOTADOS', 'FAMILIA DOS TRICOTADOS', 'RUA FERNAO MAGALHAES',
  'PELO EXPOSTO', 'EM CONFORMIDADE', 'NOS TERMOS DO ARTIGO', 'CODIGO DE PROCESSO CIVIL',
  'NESTES TERMOS', 'PEDE DEFERIMENTO', 'VALOR DA CAUSA', 'TAXA DE JUSTICA'
];

const PII_PATTERNS = {
  NIF: /\b[12356789]\d{8}\b/g,
  CC: /\b\d{8}\s*\d\s*[A-Z]{2}\d\b/gi,
  PASSPORT: /\b[A-Z]{1}\d{6}\b/gi,
  PHONE: /\b(?:(?:\+|00)351\s?)?[29]\d{8}\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  IBAN: /\bPT50\s?\d{21}\b/gi,
  MATRICULA: /\b(?:[A-Z]{2}-\d{2}-\d{2}|\d{2}-\d{2}-[A-Z]{2}|\d{2}-[A-Z]{2}-\d{2}|[A-Z]{2}-\d{2}-[A-Z]{2})\b/g,
  JUIZ: /\bJuiz(?:\(a\))?\s+(?:de\s+Direito\s+)?([A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+(?:de|da|do|dos|das|e)\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)|\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.))*)/g,
  AUTOR: /\bAutor(?:\(a\))?\s+([A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+(?:de|da|do|dos|das|e)\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)|\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.))*)/g,
  // More aggressive name patterns for Portuguese - updated to handle internal spaces like "F erreira"
  NOME_PT: /\b(?:Sr\.|Sra\.|Dr\.|Dra\.|Eng\.|Prof\.|Juiz|Desembargador|Colega|Autor|Réu|Mandatário|Advogado|Advogada|Recorrente|Recorrido)\s+([A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+(?:de|da|do|dos|das|e)\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)|\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.))+)/g,
  NOME_CAPS: /\b([A-ZÀ-Ÿ]{2,}(?:\s+(?:de|da|do|dos|das|e|DE|DA|DO|DOS|DAS|E)\s+[A-ZÀ-Ÿ]{2,}|\s+[A-ZÀ-Ÿ]{2,}){1,8})\b/g,
  // Generic sequence of capitalized words (2 or more) - updated to handle internal spaces
  NOME_GENERIC: /\b([A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+(?:de|da|do|dos|das|e)\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)|\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)){1,8})\b/g,
  // Pattern for names with "e" in the middle (often two people)
  NOME_AND: /\b([A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.))*\s+e\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.))*)\b/g,
  // Legal context patterns
  NOME_LEGAL: /\b(?:pelo|pela|por|contra|entre|com|de|do|da|a|ao|à|recorrente|recorrido)\s+([A-Z](?:\s*[a-zÀ-ÿ]+|\.)(?:\s+(?:de|da|do|dos|das|e)\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)|\s+[A-Z](?:\s*[a-zÀ-ÿ]+|\.)){1,8})/g,
};

const NAME_TITLES = [
  'Colega', 'Autor', 'Autora', 'Réu', 'Ré', 'Mandatário', 'Advogado', 'Advogada', 'Recorrente', 'Recorrido',
  'Dr\\.', 'Dra\\.', 'Sr\\.', 'Sra\\.', 'Eng\\.', 'Prof\\.', 'Juiz', 'Desembargador', 'Relator', 
  'Relatora', 'Venerando', 'Tribunal', 'Relação', 'Cfr\\.', 'In', 'Págs\\.', 'Pág\\.', 'Artigo', 'Art\\.', 'N\\.º', 
  'Processo', 'Proc\\.', 'Data', 'Hora', 'Local', 'Sede', 'Empresa', 'Sociedade', 'Trabalhador', 'Trabalhadora',
  'Funcionário', 'Funcionária', 'Agente', 'Cabo', 'Guarda', 'Sargento', 'Tenente', 'Capitão', 'Major', 'Coronel', 'General',
  'Doutor', 'Doutora', 'Senhor', 'Senhora', 'O', 'A', 'Os', 'As', 'Um', 'Uma', 'Página', 'Folha', 'Documento'
];

const NAME_CLEAN_REGEX = new RegExp(`^\\s*(?:${NAME_TITLES.join('|')})\\s+|\\s+(?:${NAME_TITLES.join('|')})\\s*$`, 'gi');
const CONJUNCTION_CLEAN_REGEX = /^\s*(?:e|ou|com|contra)\s+|\s+(?:e|ou|com|contra)\s*$/gi;
const PUNCTUATION_CLEAN_REGEX = /^[.,;:\-\s\(\)\[\]]+|[.,;:\-\s\(\)\[\]]+$/g;

export function isValidNIF(nif: string): boolean {
  const s = nif.replace(/\s/g, '');
  if (!/^[12356789]\d{8}$/.test(s)) return false;
  let checkDigit = 0;
  for (let i = 0; i < 8; i++) {
    checkDigit += parseInt(s[i]) * (9 - i);
  }
  checkDigit = 11 - (checkDigit % 11);
  if (checkDigit >= 10) checkDigit = 0;
  return checkDigit === parseInt(s[8]);
}

export function isValidCC(cc: string): boolean {
  const s = cc.replace(/\s/g, '').toUpperCase();
  if (!/^\d{9}[A-Z]{2}\d$/.test(s)) return false;
  
  const getCharValue = (c: string) => {
    const code = c.charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48; // 0-9
    return code - 55; // A=10, B=11...
  };

  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let val = getCharValue(s[i]);
    if (i % 2 === 1) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    sum += val;
  }
  return sum % 10 === 0;
}

export function isValidIBAN(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^PT50\d{21}$/.test(s)) return false;
  
  // Move PT50 to the end and convert to numbers (P=25, T=29)
  // PT50 -> 25 29 50
  const rearranged = s.substring(4) + "2529" + s.substring(2, 4);
  
  // Modulo 97 using big integers or string manipulation
  let remainder = 0;
  for (let i = 0; i < rearranged.length; i++) {
    remainder = (remainder * 10 + parseInt(rearranged[i])) % 97;
  }
  return remainder === 1;
}

export function cleanName(name: string): string {
  let cleaned = name.trim();
  
  // Repeatedly clean until no more changes (to handle "Colega Dr. António")
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(NAME_CLEAN_REGEX, ' ');
    cleaned = cleaned.replace(CONJUNCTION_CLEAN_REGEX, ' ');
    // Handle punctuation at start/end, but be careful with abbreviations like "Dr."
    // We only remove punctuation if it's not part of a known title
    cleaned = cleaned.replace(/^[.,;:\-\s\(\)\[\]]+|[.,;:\-\s\(\)\[\]]+$/g, '');
    cleaned = cleaned.trim();
  } while (cleaned !== prev && cleaned.length > 0);

  return cleaned;
}

export function getNextPseudonym(type: string, existingEntities: PIIEntity[]): string {
  const typeEntities = existingEntities.filter(e => e.type === type);
  const count = new Set(typeEntities.map(e => e.original.toLowerCase())).size + 1;
  
  if (type === 'NOME') {
    // Generate AA, BB, CC...
    const charCode = 64 + count; // 65 is 'A'
    if (count <= 26) {
      const char = String.fromCharCode(charCode);
      return `NOME.${char}${char}`;
    } else {
      // Fallback for more than 26 names: AAA, BBB...
      const repeat = Math.floor((count - 1) / 26) + 2;
      const char = String.fromCharCode(65 + ((count - 1) % 26));
      return `NOME.${char.repeat(repeat)}`;
    }
  }

  const prefixes: Record<string, string> = {
    LOCAL: 'LOCAL',
    PHONE: 'TELEFONE',
    NIF: 'NIF',
    CC: 'CC',
    PASSPORT: 'PASSAPORTE',
    EMAIL: 'EMAIL',
    IBAN: 'IBAN',
    MATRICULA: 'MATRICULA',
    AUTOR: 'AUTOR',
    JUIZ: 'JUIZ',
    TESTEMUNHA: 'TESTEMUNHA',
  };

  const prefix = prefixes[type] || type;
  return `${prefix}.${count}`;
}

// Normalização de texto conforme requisitos
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/^[.,;:\-\s\(\)\[\]]+|[.,;:\-\s\(\)\[\]]+$/g, '') // Remove pontuação e símbolos nas extremidades
    .replace(/\s+/g, ' ')           // Colapsa espaços múltiplos
    .trim();
}

// Função para comparar texto ignorando acentos e case
export function isMatchNormalized(text: string, term: string): boolean {
  const normText = normalizeText(text);
  const normTerm = normalizeText(term);
  return normText === normTerm;
}

export interface Safelist {
  words_ignore: string[];
  phrases_ignore: string[];
}

export function scanText(
  text: string, 
  fileId: string, 
  existingEntities: PIIEntity[] = [], 
  isRelated: boolean = true, 
  globalKnowledge: Record<string, string> = {},
  safelist: Safelist = { words_ignore: [], phrases_ignore: [] }
): PIIEntity[] {
  const entities: PIIEntity[] = [];
  const foundMatches: { text: string, type: string, start: number, end: number, reason?: string }[] = [];

  // Pré-processamento: Identificar áreas protegidas pela Safelist
  const protectedRanges: { start: number, end: number, term: string }[] = [];
  
  // Normalizar o texto mantendo o mapeamento de índices (aproximado, lidando com acentos)
  // Para simplificar e manter precisão, vamos usar regex que ignoram acentos
  const getRegexForTerm = (term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Substituir letras com acentos por classes de caracteres
    const withAccents = escaped
      .replace(/[aáàâã]/gi, '[aáàâã]')
      .replace(/[eéèê]/gi, '[eéèê]')
      .replace(/[iíìî]/gi, '[iíìî]')
      .replace(/[oóòôõ]/gi, '[oóòôõ]')
      .replace(/[uúùû]/gi, '[uúùû]')
      .replace(/[cç]/gi, '[cç]');
    
    // Permitir múltiplos espaços entre palavras
    const withSpaces = withAccents.replace(/\s+/g, '\\s+');
    return new RegExp(`\\b${withSpaces}\\b`, 'gi');
  };

  // PASSO A: Expressões a ignorar
  safelist.phrases_ignore.forEach(phrase => {
    const regex = getRegexForTerm(phrase);
    let match;
    while ((match = regex.exec(text)) !== null) {
      protectedRanges.push({ start: match.index, end: match.index + match[0].length, term: phrase });
    }
  });

  // PASSO B: Palavras a ignorar (serão usadas no filtro final dos matches)
  const normalizedWordsIgnore = new Set(safelist.words_ignore.map(w => normalizeText(w)));

  // PASSO C: Conhecimento Global normalizado para busca rápida
  const normalizedKnowledge = new Map<string, string>();
  Object.entries(globalKnowledge).forEach(([k, t]) => {
    normalizedKnowledge.set(normalizeText(k), t);
  });

  // PASSO D: Identificar nomes conhecidos no texto antes de outros padrões
  // Isto garante que nomes completos sejam capturados mesmo que o NLP falhe
  Object.entries(globalKnowledge).forEach(([name, type]) => {
    if (type !== 'EXCECAO') {
      const regex = getRegexForTerm(name);
      let match;
      while ((match = regex.exec(text)) !== null) {
        foundMatches.push({
          text: match[0],
          type: type,
          start: match.index,
          end: match.index + match[0].length,
          reason: 'global-knowledge'
        });
      }
    }
  });

  // 1. Regex Patterns
    Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      while ((match = regex.exec(text)) !== null) {
        const matchText = match[1] || match[0];
        
        // Checksum validation
        if (type === 'NIF' && !isValidNIF(matchText)) continue;
        if (type === 'CC' && !isValidCC(matchText)) continue;
        if (type === 'IBAN' && !isValidIBAN(matchText)) continue;

        const start = match.index + (match[0].indexOf(matchText));
        const end = start + matchText.length;

        // Verificar se está em área protegida (PASSO A)
        if (protectedRanges.some(r => start >= r.start && end <= r.end)) continue;

        // Verificar se é palavra a ignorar (PASSO B)
        if (normalizedWordsIgnore.has(normalizeText(matchText))) continue;

        foundMatches.push({
          text: matchText,
          type: type.startsWith('NOME') ? 'NOME' : type,
          start: start,
          end: end
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
        const end = index + matchText.length;

        // Verificar Safelist
        if (protectedRanges.some(r => index >= r.start && end <= r.end)) continue;
        if (normalizedWordsIgnore.has(normalizeText(matchText))) continue;
        
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
          end: end
        });
      }
    }
  });

  // 4. Merge and Deduplicate
  const sortedMatches = foundMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.text.length - a.text.length;
  });
  
  const mergedMatches: typeof foundMatches = [];
  
  sortedMatches.forEach(match => {
    if (mergedMatches.length === 0) {
      mergedMatches.push(match);
      return;
    }
    
    const last = mergedMatches[mergedMatches.length - 1];
    // Se o match atual está contido no anterior, ignorar
    if (match.start >= last.start && match.end <= last.end) return;
    
    // Se há sobreposição
    if (match.start < last.end) {
      // Se o novo é significativamente mais longo ou começa na mesma posição e é mais longo
      if (match.text.length > last.text.length) {
        mergedMatches[mergedMatches.length - 1] = match;
      }
      return;
    }
    
    mergedMatches.push(match);
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
    const norm = normalizeText(trimmed);
    
    // PASSO B (Reforço): Verificar Safelist novamente após limpeza
    if (normalizedWordsIgnore.has(norm)) return;

    // PASSO C: Listas de anonimização forçada (Exceções Globais)
    // Se estiver nas exceções globais (que agora podem vir do conhecimento global), ignorar.
    const knowledgeType = normalizedKnowledge.get(norm);
    if (knowledgeType === 'EXCECAO') return;
    
    // Check if exists in existing entities (for grouping and property preservation)
    // Prioritize finding by text to respect user decisions even if type would be different
    const existing = existingEntities.find(e => normalizeText(e.original) === norm);

    // Determine the type: 
    // 1. If existing is treated/ignored, use its type
    // 2. Otherwise use knowledgeType if available
    // 3. Otherwise use the detected type
    let identifiedType = (existing && (existing.treated || existing.ignored)) 
      ? existing.type 
      : (knowledgeType || type);

    // Check if we already added this entity in the CURRENT scan of this file
    // This prevents duplicate entities for multiple occurrences in the same file
    const alreadyAdded = entities.find(e => normalizeText(e.original) === norm && e.type === identifiedType);
    if (alreadyAdded) {
      // Just ensure the fileId is included (should already be there)
      if (!alreadyAdded.fileIds?.includes(fileId)) {
        alreadyAdded.fileIds = [...(alreadyAdded.fileIds || []), fileId];
      }
      return;
    }

    if (DEFAULT_GLOBAL_EXCEPTIONS.some(ex => normalizeText(ex) === norm)) return;
    if (ENTITY_BLACKLIST.includes(norm.toUpperCase())) return;

    // Advanced Judge Identification based on globalKnowledge
    // ONLY if not already decided by user (treated) or explicit knowledge
    const nameWords = norm.split(/\s+/).filter(w => w.length > 2);

    if (!knowledgeType && (!existing || (!existing.treated && !existing.ignored)) && 
        identifiedType !== 'JUIZ' && identifiedType !== 'AUTOR' && nameWords.length >= 2) {
      // Calcular scores de correspondência para Juízes e Autores
      let bestJudgeScore = 0;
      let bestAuthorScore = 0;
      
      const judges: string[] = [];
      const authors: string[] = [];
      normalizedKnowledge.forEach((t, k) => {
        if (t === 'JUIZ') judges.push(k);
        if (t === 'AUTOR') authors.push(k);
      });

      judges.forEach(judgeName => {
        const judgeWords = judgeName.split(/\s+/).filter(w => w.length > 2);
        if (judgeWords.length < 2) return;
        const common = nameWords.filter(w => judgeWords.includes(w));
        if (common.length >= 2) {
          const score = common.length / Math.max(nameWords.length, judgeWords.length);
          if (score > bestJudgeScore) bestJudgeScore = score;
        }
      });

      authors.forEach(authorName => {
        const authorWords = authorName.split(/\s+/).filter(w => w.length > 2);
        if (authorWords.length < 2) return;
        const common = nameWords.filter(w => authorWords.includes(w));
        if (common.length >= 2) {
          const score = common.length / Math.max(nameWords.length, authorWords.length);
          if (score > bestAuthorScore) bestAuthorScore = score;
        }
      });

      // Atribuir o tipo com melhor correspondência (mínimo de 2 palavras e score > 0.4)
      if (bestJudgeScore > 0.4 || bestAuthorScore > 0.4) {
        if (bestJudgeScore >= bestAuthorScore) {
          identifiedType = 'JUIZ';
        } else {
          identifiedType = 'AUTOR';
        }
      }
    }

    if (existing && (existing.type === identifiedType || existing.treated || existing.ignored)) {
      // Return a copy with updated fileIds if needed
      const updatedFileIds = existing.fileIds?.includes(fileId) 
        ? existing.fileIds 
        : [...(existing.fileIds || []), fileId];
        
      entities.push({
        ...existing,
        type: identifiedType, // Update type if it was refined but not treated
        pseudonym: existing.type !== identifiedType ? getNextPseudonym(identifiedType, [...existingEntities, ...entities]) : existing.pseudonym,
        fileIds: updatedFileIds,
      });
      return;
    }

    const before = text.substring(Math.max(0, start - 300), start);
    const after = text.substring(end, Math.min(text.length, end + 300));
    
    // Capture more words for better context in modals
    const wordsBefore = before.trim().split(/\s+/).slice(-15).join(' ');
    const wordsAfter = after.trim().split(/\s+/).slice(0, 15).join(' ');
    
    // Context snippet for quick lists (2 words before + entity + 2 words after)
    const contextWordsBefore = before.trim().split(/\s+/).slice(-2).join(' ');
    const contextWordsAfter = after.trim().split(/\s+/).slice(0, 2).join(' ');
    const contextSnippet = `${contextWordsBefore} ${trimmed} ${contextWordsAfter}`.trim();

    const id = Math.random().toString(36).substring(7);
    const pseudonym = getNextPseudonym(identifiedType, [...existingEntities, ...entities]);
    
    entities.push({
      id,
      original: trimmed,
      type: identifiedType,
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
  // 1. Identify manual groups and preserve them
  const newEntities = entities.map(e => ({ 
    ...e, 
    groupId: e.groupId?.startsWith('manual-group-') ? e.groupId : undefined 
  }));
  
  // 2. Group by exact match (case-insensitive) for all types
  const groups: Record<string, { id: string, pseudonym: string, treated: boolean, type: string }> = {};
  
  // Sort: Manual groups first, then treated, then others
  const sortedEntities = [...newEntities].sort((a, b) => {
    const aManual = a.groupId?.startsWith('manual-group-') ? 1 : 0;
    const bManual = b.groupId?.startsWith('manual-group-') ? 1 : 0;
    if (aManual !== bManual) return bManual - aManual;
    
    const aTreated = a.treated ? 1 : 0;
    const bTreated = b.treated ? 1 : 0;
    return bTreated - aTreated;
  });
  
  sortedEntities.forEach(entity => {
    const fileId = entity.fileIds?.[0] || 'unknown';
    const key = isRelated 
      ? `${entity.type}:${entity.original.toLowerCase().trim()}`
      : `${fileId}:${entity.type}:${entity.original.toLowerCase().trim()}`;

    if (!groups[key]) {
      groups[key] = { 
        id: entity.groupId || `group-${entity.id}`, 
        pseudonym: entity.pseudonym,
        treated: entity.treated || false,
        type: entity.type
      };
    } else {
      if (entity.groupId?.startsWith('manual-group-') && !groups[key].id.startsWith('manual-group-')) {
        groups[key].id = entity.groupId;
        groups[key].pseudonym = entity.pseudonym;
        groups[key].treated = true;
      } else if (entity.treated && !groups[key].treated) {
        groups[key].pseudonym = entity.pseudonym;
        groups[key].treated = true;
        groups[key].type = entity.type;
      }
    }
    
    const originalEntity = newEntities.find(e => e.id === entity.id);
    if (originalEntity) {
      originalEntity.groupId = groups[key].id;
      originalEntity.pseudonym = groups[key].pseudonym;
    }
  });

  // 3. Special handling for NAMES (partial matches and shared words)
  const nameEntities = newEntities.filter(e => e.type === 'NOME' || e.type === 'AUTOR' || e.type === 'JUIZ');
  const getWords = (text: string) => 
    text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !NAME_TITLES.some(t => new RegExp(`^${t.replace('.', '\\.')}$`, 'i').test(w)));

  const VERY_COMMON_NAMES = new Set(['maria', 'jose', 'manuel', 'antonio', 'joao', 'francisco', 'carlos', 'paulo', 'pedro', 'luis', 'ana', 'isabel', 'teresa', 'margarida', 'silva', 'santos', 'ferreira', 'pereira', 'oliveira', 'costa', 'rodrigues', 'martins', 'jesus']);

  // Optimization: Use an adjacency list and find connected components to avoid O(N^2) while(changed)
  const adj = new Map<number, number[]>();
  
  for (let i = 0; i < nameEntities.length; i++) {
    for (let j = i + 1; j < nameEntities.length; j++) {
      const e1 = nameEntities[i];
      const e2 = nameEntities[j];
      
      if (!isRelated && e1.fileIds?.[0] !== e2.fileIds?.[0]) continue;

      const w1 = getWords(e1.original);
      const w2 = getWords(e2.original);
      if (w1.length === 0 || w2.length === 0) continue;

      let isMatch = false;
      
      if (e1.original.toLowerCase().trim() === e2.original.toLowerCase().trim()) {
        isMatch = true;
      }

      if (!isMatch) {
        const common = w1.filter(w => w2.includes(w));
        const commonNonGeneric = common.filter(w => !VERY_COMMON_NAMES.has(w));
        const similarity = common.length / Math.max(w1.length, w2.length);
        
        if (similarity >= 0.8) {
          isMatch = true;
        } else if (w1.every(w => w2.includes(w)) || w2.every(w => w1.includes(w))) {
          if (common.length >= 2 && commonNonGeneric.length >= 1) {
            if (Math.abs(w1.length - w2.length) <= 2) {
              isMatch = true;
            }
          }
        } else if (common.length >= 3 && commonNonGeneric.length >= 2) {
          isMatch = true;
        }
      }

      const hasSeparator1 = e1.original.toLowerCase().includes(' e ');
      const hasSeparator2 = e2.original.toLowerCase().includes(' e ');
      if (hasSeparator1 !== hasSeparator2) isMatch = false;

      if (isMatch) {
        if (!adj.has(i)) adj.set(i, []);
        if (!adj.has(j)) adj.set(j, []);
        adj.get(i)!.push(j);
        adj.get(j)!.push(i);
      }
    }
  }

  const visited = new Set<number>();
  for (let i = 0; i < nameEntities.length; i++) {
    if (visited.has(i)) continue;
    
    const component: number[] = [];
    const queue = [i];
    visited.add(i);
    
    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      const neighbors = adj.get(curr) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (component.length > 1) {
      let targetG: string | undefined;
      let targetP: string | undefined;
      let isTreated = false;

      for (const idx of component) {
        const e = nameEntities[idx];
        if (e.groupId?.startsWith('manual-group-')) {
          targetG = e.groupId;
          targetP = e.pseudonym;
          isTreated = true;
          break;
        }
        if (e.treated && !isTreated) {
          targetG = e.groupId;
          targetP = e.pseudonym;
          isTreated = true;
        }
      }

      if (!targetG) {
        const longest = component.reduce((prev, curr) => 
          nameEntities[curr].original.length > nameEntities[prev].original.length ? curr : prev, component[0]);
        targetG = nameEntities[longest].groupId || `group-${nameEntities[longest].id}`;
        targetP = nameEntities[longest].pseudonym;
      }

      for (const idx of component) {
        const e = nameEntities[idx];
        e.groupId = targetG;
        e.pseudonym = targetP || e.pseudonym;
        e.treated = isTreated || e.treated;
      }
    }
  }

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
