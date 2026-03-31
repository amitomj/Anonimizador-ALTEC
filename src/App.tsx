import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Upload, FileText, Check, X, Trash2, Eye, EyeOff, 
  Layers, Plus, Scissors, Lock, Download, AlertCircle,
  History, Link, ChevronDown, ChevronRight, Search, Filter,
  MoreVertical, Copy, CheckCircle2, User, MapPin, Phone, 
  CreditCard, Mail, Hash, Briefcase, Scale, Trash, RotateCcw, RotateCw,
  Shield, Save, FolderOpen, XCircle, Zap, Unlink, Type
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { 
  scanText, 
  groupSimilarEntities, 
  anonymizeText,
  splitEntity,
  getNextPseudonym,
  cleanName,
  PIIEntity,
  PII_COLORS,
} from './lib/anonymizer';

// Set up PDF.js worker
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface FileData {
  id: string;
  name: string;
  type: string;
  content: string;
  rawFile: File;
  status: 'pending' | 'processing' | 'done' | 'error';
}

const HighlightText = ({ text, entities, mode }: { text: string, entities: PIIEntity[], mode: 'original' | 'anonymized' }) => {
  if (!text) return null;
  
  // Filter entities that are actually being anonymized
  const activeEntities = entities.filter(e => e.enabled && !e.ignored && e.type !== 'AUTOR' && e.type !== 'JUIZ');
  if (activeEntities.length === 0) return <>{text}</>;

  const patterns = activeEntities.map(e => ({
    pattern: mode === 'original' ? e.original : e.pseudonym,
    entity: e
  })).filter(p => p.pattern.length > 0);

  if (patterns.length === 0) return <>{text}</>;

  // Sort patterns by length descending to match longest first
  patterns.sort((a, b) => b.pattern.length - a.pattern.length);

  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use a map to deduplicate patterns to avoid regex errors or redundant matches
  const uniquePatterns = Array.from(new Set(patterns.map(p => p.pattern)));
  const combinedRegex = new RegExp(`(${uniquePatterns.map(p => escapeRegExp(p)).join('|')})`, 'g');
  
  const parts = text.split(combinedRegex);
  
  return (
    <>
      {parts.map((part, i) => {
        const match = patterns.find(p => p.pattern === part);
        if (match) {
          const color = PII_COLORS[match.entity.type] || { hex: '#E5E7EB', textHex: '#374151' };
          return (
            <span 
              key={i} 
              className="px-0.5 rounded font-bold"
              style={{ backgroundColor: color.hex, color: color.textHex }}
              title={`${match.entity.type}: ${match.entity.original} -> ${match.entity.pseudonym}`}
            >
              {part}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

const DEFAULT_JUDGES = [
  "Maria dos Prazeres Couceiro Pizarro Beleza", "Maria Clara Pereira de Sousa de Santiago Sottomayor", "Mário Belo Morgado",
  "Helena Isabel Gonçalves Moniz Falcão de Oliveira", "Júlio Manuel Vieira Gomes", "Maria da Graça Machado Trigo Franco Frazão",
  "Maria de Fátima Morais Gomes", "Graça Maria Lima de Figueiredo Amaral", "Maria Olinda da Silva Nunes Garcia",
  "Catarina Isabel da Silva Santos Serra", "António José dos Santos Oliveira Abreu", "Maria João Romão Carreiro Vaz Tomé",
  "Nuno António Gonçalves", "Nuno Manuel Pinto Oliveira", "Ricardo Alberto Santos Costa", "Paulo Jorge Fonseca Ferreira da Cunha",
  "José Maria Ferreira Lopes", "José António Pires Teles Pereira", "João Eduardo Cura Mariano Esteves",
  "António Fernando Barateiro Dias Martins", "Fernando Baptista de Oliveira", "Luís Filipe Castelo Branco do Espírito Santo",
  "António Francisco Martins", "Ana Paula da Fonseca Lobo", "Isabel Maria Manso Salgado", "Jorge Manuel Leitão Leal",
  "Luís Miguel Ferreira de Azevedo Mendes", "José Eduardo Miranda Santos Sapateiro", "Fernando Vaz Ventura",
  "Emídio Francisco Santos", "Jorge Manuel Baptista Gonçalves", "Nelson Paulo Martins de Borges Carneiro",
  "Heitor Bernardo Cardoso Vasques Osório", "Celso José das Neves Manata", "Antero Luís", "Maria do Rosário Pita Pegado Gonçalves",
  "Henrique Ataíde Rosa Antunes", "Maria de Deus Simão da Cruz Silva Damasceno Correia", "António Augusto Manso",
  "José Alberto Vaz Carreto", "Anabela Figueiredo Luna de Carvalho", "Orlando dos Santos Nascimento",
  "Cristina Maria Nunes Soares Tavares Coelho", "Carlos Alberto Gameiro de Campos Lobo", "Rui Manuel Duarte Amorim Machado e Moura",
  "Jorge Manuel Ortins de Simões Raposo", "Maria Margarida Costa Pereira Ramos de Almeida", "Carlos Jorge Ferreira Portela",
  "Jorge Manuel de Miranda Natividade Jacob", "Arlindo Martins de Oliveira", "António Domingos Pires Robalo",
  "José Joaquim Aniceto Piedade", "Ernesto de Jesus de Deus Nascimento", "Maria da Graça Martins Pontes dos Santos Silva",
  "Antero Dinis Ramos Veiga", "Leopoldo Miguel Peres Mansinho Soares", "Adelina da Conceição Cardoso Barradas de Oliveira",
  "Maria Isoleta de Almeida Costa", "Maria Eduarda de Mira Branquinho Canas Mendes", "Pedro Álvaro de Sousa Donas Botto Fernando",
  "Maria das Dores Eiró de Araújo", "João Carlos Proença de Oliveira Costa", "Carlos António Paula Moreira",
  "Olga Maria dos Santos Maurício", "Isabel Maria Brás da Fonseca", "Ana Maria Martins Teixeira",
  "Maria Luísa de Meireles Carvalho Franco Duarte Ramos", "Eduardo Manuel Baptista Martins Rodrigues Pires", "Mário João Canelas Brás",
  "Maria Teresa de Sequeira Mendes Pardal", "Joaquim Arménio Correia Gomes", "João Manuel Monteiro Amaro",
  "Maria José da Costa Machado", "António Paulo Esteves Aguiar de Vasconcelos", "Maria Rosa Papança Barroso",
  "Joaquim José Felizardo Paiva", "João Manuel Moreira do Carmo", "Carlos Manuel Gonçalves de Melo Marinho",
  "Márcia Portela", "Manuel Pinto dos Santos", "Nuno Maria Rosa da Silva Garcia", "Anabela Moreira de Sá Cesariny Calafate",
  "Paula Cristina Passos Barradas Guerreiro", "José Eusébio dos Santos Soeiro de Almeida", "João Carlos da Silva Abrunhosa de Carvalho",
  "Pedro Maria Godinho Vaz Pato", "Maria Adelaide de Jesus Domingos", "Rui Manuel Barata Penha", "António José Alves Duarte",
  "Maria Catarina Ramalho Gonçalves", "António Júlio Costa Sobrinho", "Carlos Pereira Gil", "Paulo Alexandre Pereira Guerra",
  "Luís Filipe Brites Lameiras", "Maria José Pais de Sousa da Costa Pinto", "José Manuel da Silva Castela Rio",
  "António Manuel Mendes Coelho", "António Carlos Falcão de Beça Pereira", "José da Fonte Ramos", "Francisco José Rodrigues de Matos",
  "Maria João Fontinha Areias Cardoso", "João Manuel Araújo Ramos Lopes", "Manuela Bento Fialho", "Edgar Gouveia Valente",
  "Paulo Duarte Barreto Ferreira", "Filipe Manuel Nunes Caroço", "António Manuel Fernandes dos Santos",
  "Paulo Jorge Tavares Fernandes da Silva", "António José Moreira Ramos", "Alberto Augusto Vicente Ruço",
  "Pedro Maria Martin Martins", "Ana Paula Pereira de Amorim", "Maria Deolinda Gaudêncio Gomes Dionísio",
  "Maria Luísa Senra Arantes", "António José da Ascensão Ramos", "Judite Lima de Oliveira Pires", "José Manuel Igreja Martins Matos",
  "Nuno Miguel Pereira Ribeiro Coelho", "Aristides Manuel da Silva Rodrigues de Almeida", "Manuel António do Carmo Bargado",
  "Ana Isabel de Azeredo Rodrigues Coelho Fernandes da Silva", "Jorge Manuel da Silva Loureiro", "Edgar Taborda Lopes",
  "Albertina Maria Gomes Pedroso", "Rui Manuel Correia Moreira", "Jorge Manuel Langweg", "Maria Inês Carvalho Brasil de Moura",
  "Manuel Domingos Alves Fernandes", "Renato Amorim Damas Barroso", "José Vítor dos Santos Amaral",
  "Miguel Fernando Baldaia Correia de Morais", "Luís Filipe Dias Cravo", "Paulo Eduardo Cristão Correia",
  "Alcina Maria Cleto Duarte da Costa Ribeiro", "Alda Maria de Oliveira Martins", "Sérgio Manuel da Silva de Almeida",
  "Jorge Miguel Pinto de Seabra", "Maria Amália Pereira dos Santos", "Ana Cristina Aparício de Oliveira Duarte",
  "Francisco João Machado da Cunha Xavier", "Francisca da Mata Mendes", "Luís Antunes Coimbra", "João Diogo de Frias Rodrigues",
  "Maria José Monteiro Guerra", "Anabela Andrade Miranda", "Francisca Micaela Fonseca da Mota Vieira",
  "Maria Dolores da Silva e Sousa", "Luís Filipe Pires de Sousa", "Carla Inês Brás Câmara", "José Manuel Costa Galo Tomé de Carvalho",
  "Manuel Henrique Ramos Soares", "Maria João Vasques de Sousa e Faro", "Helena Isabel Ribeiro Carmelo Dias Bolieiro",
  "Paulo Fernando Dias da Silva", "Maria José de Almeida Costeira", "Nelson Nunes Fernandes", "João Pedro Nunes Maldonado",
  "Manuel Alexandre Teixeira Advínculo Sequeira", "José Francisco Mota Ribeiro", "Helena Maria de Carvalho Gomes de Melo",
  "Mário Jorge dos Santos Branco Coelho", "Isabel Maria Socorro de Matos Peixoto Imaginário", "Higina Maria Almeida Orvalho da Silva Castelo",
  "João António Peres de Oliveira Coelho", "Vítor Manuel Leitão Ribeiro", "Maria Isabel Sousa Ribeiro Silva",
  "Raúl Eduardo Nunes Esteves", "Fernando Manuel Matos de Azevedo Correia Chaves", "José Júlio da Cunha Amorim Pinto",
  "Jorge Manuel Duarte Bispo", "Pedro Miguel Bengala Reis da Cunha Lopes", "Amélia Maria dos Reis Catarino Correia de Almeida",
  "Maria de Fátima Cardoso Bernardes", "Maria Fernanda Lopes Ventura", "Lina Aurora Ramada e Castro Bettencourt Baptista",
  "Pedro Alexandre Damião e Cunha", "Maria de Fátima Almeida Andrade", "Alexandra Maria Rolim Mendes",
  "Ausenda Gonçalves e Alexandre dos Reis", "Maria da Purificação Lopes de Carvalho", "Maria de Fátima Cerveira da Cunha Lopes Furtado",
  "Elsa de Jesus Coelho Paixão", "Maria dos Prazeres Rodrigues da Silva", "Vera Maria Guedes Barbosa de Sottomayor Bismark do Agro",
  "Maria João Marques Pinto de Matos", "Rita Maria Pereira Romeira", "Elisabete de Jesus Ribeiro Assunção", "Álvaro Monteiro",
  "Cláudia Sofia de Jesus Antunes Barata", "José Nuno Ramos Duarte", "Pedro José Esteves de Brito", "Isabel Maria Trocado Monteiro",
  "António José Barrocal Fialho", "Filipe João Aveiro de Sousa Marques", "Augusta Maria Pinto Ferreira Rodrigues Palma",
  "Teresa Manuela Pinto da Silva", "Nuno Marcelo de Nóbrega dos Santos de Freitas Araújo", "Maria de Fátima Silva Viegas",
  "Sónia Maria Fontes de Magalhães de Oliveira Pereira", "Ana Cristina de Jesus Batalha Cardoso", "Carla de Jesus da Costa Fraga Torres",
  "Fernando Alberto Caetano Besteiro", "Ana Cristina Rodrigues Clemente", "Susana Cristina Mendes Santos Martins da Silveira",
  "João Simões Presa Grilo de Amaral", "Alexandra Maria Bandeira Ferraz Lage", "João Filipe Pereira Bártolo",
  "Cristina Isabel Elias Henriques Esteves", "Ana Rute Alves da Costa Pereira", "Ana Lúcia dos Reis Gordinho",
  "Susana Pinto Santos Silva", "Ana Rita Varela Loja", "Filipe Amadeu César Osório Rodrigues Costa", "Sónia Alexandra Sousa de Moura",
  "Susana Isabel Santos Pinto de Oliveira Ferrão da Costa Cabral", "Ricardo Manuel Neto Miranda Peixoto", "Rui Miguel Pereira Poças",
  "Eduardo José Capela de Sousa Paiva", "Maria de Fátima da Rocha Marques Bessa", "Gabriela Lopes Feiteira",
  "Manuela Maria Marques Trocado", "Fernando Miguel Furtado André Alves", "Ana Paula Soares Ferreira Guedes",
  "Sara da Piedade Moreira das Neves de Pina Cabral", "Filipe Duarte Freitas Câmara", "Rosa Maria Cardoso Saraiva",
  "Diogo Coelho de Sousa Leitão", "Rosa dos Remédios Lima Teixeira", "Carlos Alberto Casas Azevedo", "Marlene Fortuna Rodrigues",
  "Pedro Miguel dos Reis Raposo de Figueiredo", "Estrela Aramita Dias Chambel Capelo de Sousa Chaby Rosa", "Maria Emília Guerreiro de Avillez Melo e Castro"
];

const DEFAULT_AUTHORS = [
  "Abrantes Geraldes", "Adriano Vaz Serra", "Alberto dos Reis", "Alberto Xavier", "Albertina Pedroso",
  "Almeida Costa", "Alexandre de Soveral Martins", "Alexandra Leitão", "Alexandra Rodrigues",
  "Ana Cristina Rangel", "Ana Neves", "Ana Paula Dourado", "Ana Rita Gil", "Ana Sofia Fonseca",
  "Anabela Miranda Rodrigues", "André Gonçalves Pereira", "André Lamas Leite", "Anselmo de Castro",
  "António Caeiro", "António Carlos dos Santos", "António Cândido de Oliveira", "António de Oliveira Ascensão",
  "António Henriques Gaspar", "António Joaquim Lobo Xavier", "António Menezes Cordeiro",
  "António Monteiro Fernandes", "António Nunes de Carvalho", "António Pinto Monteiro", "António Santos Justo",
  "António Vitorino", "Armindo Ribeiro Mendes", "Avelãs Nunes", "Benjamim Silva Rodrigues", "Brandão Proença",
  "Carlos Adérito Teixeira", "Carlos Alegre", "Carlos Alberto da Mota Pinto", "Carlos Blanco de Morais",
  "Carlos Ferreira de Almeida", "Carlos Lobo", "Carlos Lopes do Rego", "Carlos Trindade", "Catarina Frade",
  "Catarina Sarmento e Castro", "Cláudia Cruz Santos", "Cláudia Santos", "Cláudia Viana", "Cláudio de Oliveira",
  "Cristina Líbano Monteiro", "Cristina Queiroz", "Daniela Paiano", "David Duarte", "Diogo Freitas do Amaral",
  "Diogo Leite de Campos", "Dulce Lopes", "Dulce M. da Costa", "Eduardo Correia", "Eduardo Paz Ferreira",
  "Edgar Valles", "Eurico Lopes-Cardoso", "Fausto de Quadros", "Fernando Amâncio Ferreira", "Fernando Araújo",
  "Fernando Tomé", "Ferrer Correia", "Figueiredo Dias", "Francisco Amaral", "Francisco Lucas Pires",
  "Francisco Pereira Coutinho", "Francisco Rodrigues Pardal", "Francisco António de M. L. Ferreira de Almeida",
  "Frederico da Costa Pinto", "Freitas do Amaral", "Germano Marques da Silva", "Gonçalo S. de Melo Bandeira",
  "Gomes Canotilho", "Guilherme de Oliveira", "Guilherme Dray", "Guilherme Moreira", "Helena Moniz",
  "Helena Morão", "Helena Morais", "Helena Tomás", "Helena Mota", "Henrique Mesquita", "Isabel Alexandre",
  "Isabel Celeste Fonseca", "Isabel de Magalhães Colaço", "Isabel Ribeiro", "Isabel Alexandra Ponce de Leão",
  "João Calvão da Silva", "João Caupers", "João Conde Correia", "João de Matos Antunes Varela",
  "João Domingos Silva", "João Labareda", "João Leal Amado", "João Rato", "João Rego", "João Salazar",
  "João Tiago Silveira", "João Vaz Rodrigues", "João Zenha Martins", "Jorge Bacelar Gouveia", "Jorge de Brito",
  "Jorge de Figueiredo Dias", "Jorge de Seabra", "Jorge Duarte Pinheiro", "Jorge Leite", "Jorge Lobo Xavier",
  "Jorge Medeiros", "Jorge Miranda", "Jorge Reis Novais", "José Alberto dos Reis", "José António Barreiros",
  "José Carlos Vieira de Andrade", "José Casalta Nabais", "José Cândido de Pinho", "José Damião da Cunha",
  "José de Faria Costa", "José de Oliveira Ascensão", "José Eduardo Figueiredo Dias", "José Engrácia Antunes",
  "José Ferreira Gomes", "José Ferreira Oliveira", "José Gameiro", "José Guilherme Xavier de Basto",
  "José Joaquim de Sousa", "José José Joaquim Gomes Canotilho", "José Lebre de Freitas", "José Luís da Cruz Vilaça",
  "José Manuel Damião da Cunha", "José Manuel de Oliveira", "José Manuel Durão Barroso", "José Manuel Pureza",
  "José Manuel Sérvulo Correia", "José Maria Fernandes Pires", "José Souto de Moura", "José Tavares de Sousa",
  "Joaquim Freitas da Rocha", "Joaquim Sousa Ribeiro", "Jónatas Machado", "Júlio Gomes", "Laurinda Gemas",
  "Lebre de Freitas", "Lino Torgal", "Luís A. Carvalho Fernandes", "Luís Cabral de Moncada", "Luís Filipe Pires de Sousa",
  "Luís Gonçalves da Silva", "Luís Greco", "Luís Menezes Leitão", "Luís S. Cabral de Moncada", "Marcelo Rebelo de Sousa",
  "M. Maia Gonçalves", "Manuel A. Domingues de Andrade", "Manuel de Andrade", "Manuel da Costa Andrade",
  "Manuel Simas Santos", "Margarida Reis", "Margarida Silva Pereira", "Maria Benedita Urbano", "Maria Clara Sottomayor",
  "Maria de Fátima Ribeiro", "Maria do Carmo da Costa", "Maria do Carmo Teles", "Maria do Rosário Palma Ramalho",
  "Maria João Antunes", "Maria João Mimoso", "Maria João Vaz Tomé", "Maria Lúcia Amaral", "Maria Luísa Duarte",
  "Maria Luísa Portela de Sousa", "Maria Teresa de Melo Ribeiro", "Mariana Canotilho", "Mário Esteves de Oliveira",
  "Mário Ferreira Monte", "Mário Júlio de Almeida Costa", "Mário Soares", "Mário Tenreiro", "Miguel Gorjão-Henriques",
  "Miguel Lucas Pires", "Miguel Mesquita", "Miguel Nogueira de Brito", "Miguel Teixeira de Sousa",
  "Mónica G. N. Ferreira", "Nuno Brandão", "Nuno Cordeiro", "Nuno Cremona", "Nuno de Salter Cid",
  "Nuno Ferreira da Cunha", "Nuno Piçarra", "Nuno Sá Gomes", "Olga de Sousa", "Paula Costa e Silva",
  "Paula Quintas", "Paula Rosado Pereira", "Paulo Câmara", "Paulo da Mota Pinto", "Paulo de Sousa Mendes",
  "Paulo de Pitta e Cunha", "Paulo Morgado de Carvalho", "Paulo Mota Pinto", "Paulo Otero", "Paulo Olavo Cunha",
  "Paulo Pimenta", "Paulo Pinto de Albuquerque", "Paulo Pulido Adragão", "Paulo Saragoça da Matta",
  "Pedro Bacelar de Vasconcelos", "Pedro Caeiro", "Pedro Costa Gonçalves", "Pedro Furtado Martins",
  "Pedro Gonçalves", "Pedro Maia", "Pedro Madeira de Brito", "Pedro Martínez", "Pedro Pais de Vasconcelos",
  "Pedro Romano Martinez", "Rita Garcia Pereira", "Rita Lobo Xavier", "Rita Nóbrega", "Ricardo Jorge Bragança de Matos",
  "Rui Assis", "Rui de Alarcão", "Rui Medeiros", "Rui Morais", "Rui Pereira", "Rui Pinto", "Rui Pinto Duarte",
  "Rui M. de Medeiros", "Salvador da Costa", "Saldanha Sanches", "Sandra Barreira", "Sérgio Poças",
  "Sérvulo Correia", "Sinde Monteiro", "Susana Aires de Sousa", "Susana Tavares da Silva", "Suzana Tavares da Silva",
  "Teles de Menezes Leitão", "Teresa Arruda Alvim", "Teresa Coelho Moreira", "Teresa Pizarro Beleza",
  "Teresa Violante", "Tiago Caiado Milheiro", "Tiago Duarte", "Tiago Serrão", "Varela de Matos",
  "Vasco Costa", "Vasco Pereira da Silva", "Vieira de Andrade", "Vítor Gomes", "Vítor Ferreira", "Vital Moreira"
];

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [entities, setEntities] = useState<PIIEntity[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string | 'ALL'>('ALL');
  const [hideIgnored, setHideIgnored] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingEntity, setEditingEntity] = useState<PIIEntity | null>(null);
  const [copiedPseudonym, setCopiedPseudonym] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showExceptionsModal, setShowExceptionsModal] = useState(false);
  const [exceptionsTab, setExceptionsTab] = useState<'EXCECAO' | 'JUIZ' | 'AUTOR'>('EXCECAO');
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [splitView, setSplitView] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [history, setHistory] = useState<{ entities: PIIEntity[], files: FileData[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isHistoryAction = useRef(false);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const handleSyncScroll = (source: 'left' | 'right') => {
    const sourceEl = source === 'left' ? leftScrollRef.current : rightScrollRef.current;
    const targetEl = source === 'left' ? rightScrollRef.current : leftScrollRef.current;
    
    if (sourceEl && targetEl && targetEl.scrollTop !== sourceEl.scrollTop) {
      targetEl.scrollTop = sourceEl.scrollTop;
    }
  };

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  const pushToHistory = useCallback((newEntities: PIIEntity[], newFiles: FileData[]) => {
    if (isHistoryAction.current) {
      isHistoryAction.current = false;
      return;
    }
    const newState = { entities: JSON.parse(JSON.stringify(newEntities)), files: JSON.parse(JSON.stringify(newFiles)) };
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(newState);
      if (next.length > 30) next.shift();
      return next;
    });
    setHistoryIndex(prev => {
      const next = prev + 1;
      return next > 29 ? 29 : next;
    });
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      isHistoryAction.current = true;
      const prevState = history[historyIndex - 1];
      setEntities(prevState.entities);
      setFiles(prevState.files);
      setHistoryIndex(historyIndex - 1);
      showToast("Ação anulada", "info");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      isHistoryAction.current = true;
      const nextState = history[historyIndex + 1];
      setEntities(nextState.entities);
      setFiles(nextState.files);
      setHistoryIndex(historyIndex + 1);
      showToast("Ação refeita", "info");
    }
  };

  const handleExportReport = () => {
    if (entities.length === 0) return;
    
    const reportData = entities
      .filter(e => !e.ignored)
      .map(e => ({
        'Original': e.original,
        'Pseudónimo': e.pseudonym,
        'Tipo': e.type,
        'Estado': e.enabled ? 'Ativo' : 'Inativo',
        'Ficheiros': e.fileIds?.map(id => files.find(f => f.id === id)?.name).join(', ') || ''
      }));

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Correspondências");
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), `relatorio_correspondencias_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast("Relatório exportado com sucesso", "success");
  };

  const [isRelated, setIsRelated] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [globalKnowledge, setGlobalKnowledge] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('pii_global_knowledge');
    return saved ? JSON.parse(saved) : {};
  });

  // Migration script for old global exceptions
  useEffect(() => {
    const oldExceptions = localStorage.getItem('pii_global_exceptions');
    if (oldExceptions) {
      try {
        const parsed: string[] = JSON.parse(oldExceptions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGlobalKnowledge(prev => {
            const next = { ...prev };
            parsed.forEach(ex => {
              const lower = ex.toLowerCase().trim();
              if (!next[lower]) {
                next[lower] = 'EXCECAO';
              }
            });
            return next;
          });
          // Remove old key after successful migration
          localStorage.removeItem('pii_global_exceptions');
        }
      } catch (err) {
        console.error("Migration error:", err);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('pii_global_knowledge', JSON.stringify(globalKnowledge));
  }, [globalKnowledge]);

  // Auto-save project state
  useEffect(() => {
    const saved = localStorage.getItem('pii_project_state');
    if (saved) {
      try {
        const { files: savedFiles, entities: savedEntities } = JSON.parse(saved);
        if (savedFiles && savedEntities) {
          setFiles(savedFiles);
          setEntities(savedEntities);
        }
      } catch (e) {
        console.error("Error loading saved state", e);
      }
    }
  }, []);

  useEffect(() => {
    if (files.length > 0 || entities.length > 0) {
      localStorage.setItem('pii_project_state', JSON.stringify({ files, entities }));
    }
  }, [files, entities]);

  // Initial history state
  useEffect(() => {
    if (history.length === 0 && (files.length > 0 || entities.length > 0)) {
      setHistory([{ entities: JSON.parse(JSON.stringify(entities)), files: JSON.parse(JSON.stringify(files)) }]);
      setHistoryIndex(0);
    }
  }, [files, entities, history.length]);

  // --- File Handling ---

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;

    const newFiles: FileData[] = Array.from(uploadedFiles).map(file => ({
      id: Math.random().toString(36).substring(7),
      name: (file as File).name,
      type: (file as File).type,
      content: '',
      rawFile: file as File,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newFiles]);
    processFiles(newFiles);
  };

  const processFiles = async (filesToProcess: FileData[]) => {
    setIsProcessing(true);
    let allNewEntities = [...entities];

    for (const fileData of filesToProcess) {
      try {
        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, status: 'processing' } : f));
        
        let text = '';
        if (fileData.type === 'application/pdf') {
          text = await extractTextFromPDF(fileData.rawFile);
        } else if (fileData.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileData.name.endsWith('.docx')) {
          text = await extractTextFromDocx(fileData.rawFile);
        } else if (fileData.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileData.name.endsWith('.xlsx')) {
          text = await extractTextFromXlsx(fileData.rawFile);
        } else {
          // Fallback for other types or simple text
          text = await fileData.rawFile.text();
        }

        const fileEntities = scanText(text, fileData.id, allNewEntities, isRelated, globalKnowledge);
        console.log(`Found ${fileEntities.length} entities in file ${fileData.name}`);
        allNewEntities = [...allNewEntities, ...fileEntities];

        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, content: text, status: 'done' } : f));
      } catch (error) {
        console.error(`Error processing file ${fileData.name}:`, error);
        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, status: 'error' } : f));
      }
    }

    const grouped = groupSimilarEntities(allNewEntities, isRelated);
    setEntities(grouped);
    pushToHistory(grouped, filesToProcess);
    setIsProcessing(false);
  };

  const extractTextFromDocx = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (!docXml) throw new Error("Could not find word/document.xml");
      
      // Simple XML to text extraction
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(docXml, "text/xml");
      const paragraphs = xmlDoc.getElementsByTagName("w:p");
      let text = "";
      for (let i = 0; i < paragraphs.length; i++) {
        const texts = paragraphs[i].getElementsByTagName("w:t");
        for (let j = 0; j < texts.length; j++) {
          text += texts[j].textContent;
        }
        text += "\n";
      }
      console.log('DOCX extracted text length:', text.length);
      
      // If manual extraction is too short or empty, try mammoth as fallback
      if (text.trim().length < 10) {
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          return result.value;
        } catch (e) {
          console.warn('Mammoth fallback failed:', e);
        }
      }
      
      return text;
    } catch (error) {
      console.error('Error extracting text from DOCX:', error);
      // Try mammoth as absolute fallback
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
      } catch (mError) {
        console.error('Mammoth also failed:', mError);
        throw error;
      }
    }
  };

  const extractTextFromXlsx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let fullText = '';
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      fullText += XLSX.utils.sheet_to_txt(worksheet) + '\n\n';
    });
    return fullText;
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Sort items by Y descending (top to bottom), then X ascending (left to right)
      // Filter only items that have text (str property)
      const items = (textContent.items as any[])
        .filter(item => typeof item.str === 'string')
        .sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) < 5) { // Same line (threshold of 5 points)
            return a.transform[4] - b.transform[4];
          }
          return yDiff;
        });

      let lastY = -1;
      let pageText = '';
      for (const item of items) {
        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n';
        } else if (lastY !== -1) {
          pageText += ' ';
        }
        pageText += item.str;
        lastY = item.transform[5];
      }
      fullText += pageText + '\n\n';
    }
    return fullText;
  };

  // --- Entity Management ---

  const toggleEntitySelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleValidateSelected = () => {
    const affectedGroupIds = new Set<string>();
    setEntities(prev => prev.map(e => {
      if (selectedIds.has(e.id)) {
        if (e.groupId) affectedGroupIds.add(e.groupId);
        return { ...e, treated: true, ignored: false };
      }
      return e;
    }));
    if (affectedGroupIds.size > 0) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        affectedGroupIds.forEach(gid => next.add(gid));
        return next;
      });
    }
    setSelectedIds(new Set());
  };

  const handleIgnoreSelected = () => {
    const affectedGroupIds = new Set<string>();
    setEntities(prev => prev.map(e => {
      if (selectedIds.has(e.id)) {
        if (e.groupId) affectedGroupIds.add(e.groupId);
        return { ...e, ignored: true, treated: false };
      }
      return e;
    }));
    if (affectedGroupIds.size > 0) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        affectedGroupIds.forEach(gid => next.add(gid));
        return next;
      });
    }
    setSelectedIds(new Set());
  };

  const handleGroupSelected = () => {
    if (selectedIds.size < 2) return;
    
    const selectedEntities = entities.filter(e => selectedIds.has(e.id));
    const groupId = `manual-group-${Date.now()}`;
    
    // Pick the best pseudonym: from a treated entity, or the longest name
    const sorted = [...selectedEntities].sort((a, b) => {
      if (a.treated && !b.treated) return -1;
      if (!a.treated && b.treated) return 1;
      return b.original.length - a.original.length;
    });
    const basePseudonym = sorted[0].pseudonym;

    setEntities(prev => {
      const next = prev.map(e => 
        selectedIds.has(e.id) ? { ...e, groupId, pseudonym: basePseudonym, treated: true } : e
      );
      setTimeout(() => pushToHistory(next, files), 0);
      return next;
    });
    setCollapsedGroups(prev => new Set(prev).add(groupId));
    setSelectedIds(new Set());
    showToast("Elementos agrupados e associados com sucesso.", "success");
  };

  const handleMergeToGroup = (targetGroupId: string) => {
    const targetGroup = entities.find(e => e.groupId === targetGroupId || e.id === targetGroupId);
    if (!targetGroup) return;

    const finalGroupId = targetGroup.groupId || `group-${targetGroup.id}`;
    const finalPseudonym = targetGroup.pseudonym;

    setEntities(prev => prev.map(e => {
      if (selectedIds.has(e.id)) {
        return { ...e, groupId: finalGroupId, pseudonym: finalPseudonym };
      }
      if (e.id === targetGroup.id && !e.groupId) {
        return { ...e, groupId: finalGroupId };
      }
      return e;
    }));
    
    setSelectedIds(new Set());
    setShowMergeModal(false);
  };

  const handleCopyPseudonym = (pseudonym: string) => {
    setCopiedPseudonym(pseudonym);
  };

  const handlePastePseudonym = () => {
    if (!copiedPseudonym || selectedIds.size === 0) return;
    
    const selectedGroupIds = new Set(
      entities
        .filter(e => selectedIds.has(e.id) && e.groupId)
        .map(e => e.groupId)
    );

    setEntities(prev => prev.map(e => {
      if (selectedIds.has(e.id) || (e.groupId && selectedGroupIds.has(e.groupId))) {
        return { ...e, pseudonym: copiedPseudonym };
      }
      return e;
    }));
    setSelectedIds(new Set());
  };

  const updatePseudonym = (id: string, newPseudonym: string) => {
    setEntities(prev => {
      const entity = prev.find(e => e.id === id);
      if (!entity) return prev;

      const next = prev.map(e => {
        if (e.id === id || (entity.groupId && e.groupId === entity.groupId)) {
          return { ...e, pseudonym: newPseudonym };
        }
        return e;
      });
      
      // We call pushToHistory outside or use a timeout to avoid React warnings about state updates during render
      // But since this is an event handler, it's usually fine. 
      // However, to be safe and ensure we use the latest 'files':
      setTimeout(() => pushToHistory(next, files), 0);
      return next;
    });
  };

  const handleSplitEntity = (entity: PIIEntity) => {
    setEditingEntity(entity);
  };

  const handleBulkUpdateType = (newType: string) => {
    if (selectedIds.size === 0) return;
    
    setEntities(prev => {
      const selectedEntities = prev.filter(e => selectedIds.has(e.id));
      const groupIds = new Set(selectedEntities.map(e => e.groupId).filter(Boolean) as string[]);
      
      const byGroup: Record<string, string> = {};
      const byOriginal: Record<string, string> = {};
      
      const next = prev.map(e => {
        const isSelected = selectedIds.has(e.id);
        const isInSelectedGroup = e.groupId && groupIds.has(e.groupId);
        
        if (isSelected || isInSelectedGroup) {
          if (e.groupId) {
            if (!byGroup[e.groupId]) {
              // Generate a pseudonym that isn't used in the new type (excluding this group's current members)
              byGroup[e.groupId] = getNextPseudonym(newType, prev.filter(ent => ent.groupId !== e.groupId));
            }
            return { ...e, type: newType, pseudonym: byGroup[e.groupId], treated: true };
          } else {
            const lowerOrig = e.original.toLowerCase();
            if (!byOriginal[lowerOrig]) {
              byOriginal[lowerOrig] = getNextPseudonym(newType, prev.filter(ent => ent.original.toLowerCase() !== lowerOrig));
            }
            return { ...e, type: newType, pseudonym: byOriginal[lowerOrig], treated: true };
          }
        }
        return e;
      });

      setTimeout(() => pushToHistory(next, files), 0);
      return next;
    });
    
    showToast(`${selectedIds.size} elementos alterados para ${newType}.`, "success");
    setSelectedIds(new Set());
  };

  const reclassifyEntities = () => {
    setEntities(prev => {
      let changed = false;
      const next = prev.map(entity => {
        if (entity.type === 'NOME') {
          const lower = entity.original.toLowerCase().trim();
          const knowledgeType = globalKnowledge[lower];
          
          if (knowledgeType && knowledgeType !== 'EXCECAO' && knowledgeType !== entity.type) {
            changed = true;
            return {
              ...entity,
              type: knowledgeType,
              pseudonym: getNextPseudonym(knowledgeType, prev),
              treated: true
            };
          }

          // Advanced check for partial matches in globalKnowledge
          const judges = Object.entries(globalKnowledge).filter(([_, t]) => t === 'JUIZ').map(([n]) => n.toLowerCase());
          const authors = Object.entries(globalKnowledge).filter(([_, t]) => t === 'AUTOR').map(([n]) => n.toLowerCase());
          const nameWords = lower.split(/\s+/).filter(w => w.length > 2);

          if (nameWords.length >= 2) {
            const isJudgeMatch = judges.some(judgeName => {
              const judgeWords = judgeName.split(/\s+/).filter(w => w.length > 2);
              if (judgeWords.length < 2) return false;
              const common = nameWords.filter(w => judgeWords.includes(w));
              return common.length >= 2;
            });

            if (isJudgeMatch) {
              changed = true;
              return {
                ...entity,
                type: 'JUIZ',
                pseudonym: getNextPseudonym('JUIZ', prev),
                treated: true
              };
            }

            const isAuthorMatch = authors.some(authorName => {
              const authorWords = authorName.split(/\s+/).filter(w => w.length > 2);
              if (authorWords.length < 2) return false;
              const common = nameWords.filter(w => authorWords.includes(w));
              return common.length >= 2;
            });

            if (isAuthorMatch) {
              changed = true;
              return {
                ...entity,
                type: 'AUTOR',
                pseudonym: getNextPseudonym('AUTOR', prev),
                treated: true
              };
            }
          }
        }
        return entity;
      });

      if (changed) {
        const grouped = groupSimilarEntities(next, isRelated);
        setTimeout(() => pushToHistory(grouped, files), 0);
        showToast("Elementos reclassificados com base no conhecimento global.", "success");
        return grouped;
      }
      return prev;
    });
  };

  const handleUpdateGroupType = (groupId: string, newType: string) => {
    setEntities(prev => {
      const groupEntities = prev.filter(e => e.groupId === groupId);
      if (groupEntities.length === 0) return prev;
      
      const newPseudonym = getNextPseudonym(newType, prev.filter(e => e.groupId !== groupId));
      
      const next = prev.map(e => {
        if (e.groupId === groupId) {
          return { ...e, type: newType, pseudonym: newPseudonym, treated: true };
        }
        return e;
      });

      setTimeout(() => pushToHistory(next, files), 0);
      return next;
    });
    showToast(`Categoria do grupo alterada para ${newType}.`, "success");
  };

  const handleUpdateEntity = (id: string, updates: Partial<PIIEntity>) => {
    const entityToUpdate = entities.find(e => e.id === id);
    if (!entityToUpdate) return;

    // If type is changing, update the pseudonym too
    if (updates.type && updates.type !== entityToUpdate.type) {
      updates.pseudonym = getNextPseudonym(updates.type, entities.filter(e => e.id !== id));
      updates.treated = true;
    }

    const updated = { ...entityToUpdate, ...updates };
    const newlySelectedIds: string[] = [];
    
    const nextEntities = entities.map(e => {
      if (e.id === id) return updated;

      // 1. Automatic correction for identical elements (User Request)
      // If the original text is updated, apply the same change to all identical elements
      if (updates.original !== undefined && e.original === entityToUpdate.original) {
        return { ...e, original: updates.original, treated: true };
      }
      
      // 2. Auto-expansion logic for group members when original text is updated
      if (updates.original && updated.groupId && e.groupId === updated.groupId) {
        const words = updated.original.split(/\s+/).filter(w => w.length > 0);
        let curOrig = e.original;
        let curBefore = e.contextBefore || "";
        let curAfter = e.contextAfter || "";
        let changed = false;

        // Expand Start
        while (true) {
          const wordsBefore = curBefore.trim().split(/\s+/);
          const lastWord = wordsBefore[wordsBefore.length - 1];
          if (lastWord && words.some(w => w.toLowerCase() === lastWord.toLowerCase()) && !curOrig.toLowerCase().includes(lastWord.toLowerCase())) {
            curOrig = `${lastWord} ${curOrig}`;
            const lastIdx = curBefore.lastIndexOf(lastWord);
            curBefore = curBefore.substring(0, lastIdx).trimEnd();
            changed = true;
          } else break;
        }

        // Expand End
        while (true) {
          const wordsAfter = curAfter.trim().split(/\s+/);
          const firstWord = wordsAfter[0];
          if (firstWord && words.some(w => w.toLowerCase() === firstWord.toLowerCase()) && !curOrig.toLowerCase().includes(firstWord.toLowerCase())) {
            curOrig = `${curOrig} ${firstWord}`;
            const firstIdx = curAfter.indexOf(firstWord);
            curAfter = curAfter.substring(firstIdx + firstWord.length).trimStart();
            changed = true;
          } else break;
        }

        if (changed) {
          newlySelectedIds.push(e.id);
          return { ...e, original: curOrig, contextBefore: curBefore, contextAfter: curAfter };
        }
      }
      return e;
    });

    setEntities(nextEntities);

    if (newlySelectedIds.length > 0) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        newlySelectedIds.forEach(sid => next.add(sid));
        return next;
      });
    }

    // Side effects after state update
    if (updated.type === 'EXCECAO' || updated.type === 'JUIZ' || updated.type === 'AUTOR') {
      addToGlobalKnowledge(updated.original, updated.type);
    }
    if (editingEntity && editingEntity.id === id) {
      setEditingEntity(updated);
    }
  };

  const handleSplitAllAndEntities = () => {
    setEntities(prev => {
      const next: PIIEntity[] = [];
      let splitCount = 0;
      const affectedGroupIds = new Set<string>();

      prev.forEach(entity => {
        if ((entity.type === 'NOME' || entity.type === 'AUTOR' || entity.type === 'JUIZ') && 
            entity.original.includes(' e ') && 
            !entity.original.toLowerCase().startsWith('e ') && 
            !entity.original.toLowerCase().endsWith(' e')) {
          
          const parts = entity.original.split(/\s+e\s+/i).map(p => p.trim()).filter(p => p.length > 2);
          if (parts.length >= 2) {
            splitCount++;
            if (entity.groupId) affectedGroupIds.add(entity.groupId);

            parts.forEach(part => {
              const id = Math.random().toString(36).substring(7);
              const pseudonym = getNextPseudonym(entity.type, [...prev, ...next]);
              next.push({
                ...entity,
                id,
                original: part,
                pseudonym,
                groupId: undefined,
                treated: false
              });
            });
            return;
          }
        }
        next.push(entity);
      });

      if (splitCount > 0) {
        // Release members of affected groups so they can find their correct homes
        let finalNext = next.map(e => (e.groupId && affectedGroupIds.has(e.groupId)) ? { ...e, groupId: undefined } : e);
        
        // Re-group everything
        finalNext = groupSimilarEntities(finalNext, isRelated);

        showToast(`${splitCount} nomes compostos foram divididos e grupos re-organizados.`, "success");
        setTimeout(() => pushToHistory(finalNext, files), 0);
        return finalNext;
      } else {
        showToast("Nenhum nome composto com 'e' foi encontrado.", "info");
        return prev;
      }
    });
  };
  const handleManualSplit = (entity: PIIEntity, separator: string | RegExp) => {
    const parts = entity.original.split(separator).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length < 2) return;

    const affectedGroupId = entity.groupId;

    const newEntities = parts.map(part => {
      const id = Math.random().toString(36).substring(7);
      const pseudonym = getNextPseudonym(entity.type, entities);
      return {
        ...entity,
        id,
        original: part,
        pseudonym,
        groupId: undefined,
        treated: false
      };
    });

    setEntities(prev => {
      let next = prev.filter(e => e.id !== entity.id);
      
      // If it was in a group, release all members of that group
      if (affectedGroupId) {
        next = next.map(e => e.groupId === affectedGroupId ? { ...e, groupId: undefined } : e);
      }

      next = [...next, ...newEntities];
      
      // Re-group
      const grouped = groupSimilarEntities(next, isRelated);

      setTimeout(() => pushToHistory(grouped, files), 0);
      return grouped;
    });
    setEditingEntity(null);
    showToast(`${parts.length} novos elementos criados e grupos re-organizados.`, "success");
  };

  const handleDissolveGroup = (groupId: string) => {
    setEntities(prev => {
      const next = prev.map(e => e.groupId === groupId ? { ...e, groupId: undefined, treated: false } : e);
      showToast("Grupo dissolvido. Os elementos podem agora ser re-agrupados ou editados individualmente.", "success");
      setTimeout(() => pushToHistory(next, files), 0);
      return next;
    });
  };

  const handleSplitGroup = (groupId: string, strategy: 'e' | 'space' = 'e') => {
    setEntities(prev => {
      const next: PIIEntity[] = [];
      let splitOccurred = false;
      
      prev.forEach(entity => {
        if (entity.groupId === groupId && 
            (entity.type === 'NOME' || entity.type === 'AUTOR' || entity.type === 'JUIZ')) {
          
          let parts: string[] = [];
          if (strategy === 'e' && entity.original.includes(' e ')) {
            parts = entity.original.split(/\s+e\s+/i).map(p => p.trim()).filter(p => p.length > 2);
          } else if (strategy === 'space' && entity.original.includes(' ')) {
            // Heuristic: split if we have multiple capitalized sequences that look like full names
            // For simplicity, we'll just split by double spaces or let the user decide.
            // Let's do a more aggressive split by space but filter out short words
            parts = entity.original.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 2);
            if (parts.length < 2) {
              // Try to split by single space if it's a very long string (e.g. 4+ words)
              const words = entity.original.split(/\s+/);
              if (words.length >= 4) {
                // Split in half as a guess, or just split all words
                parts = words.map(w => w.trim()).filter(w => w.length > 2);
              }
            }
          }

          if (parts.length >= 2) {
            splitOccurred = true;
            parts.forEach(part => {
              const id = Math.random().toString(36).substring(7);
              const pseudonym = getNextPseudonym(entity.type, [...prev, ...next]);
              next.push({
                ...entity,
                id,
                original: part,
                pseudonym,
                groupId: undefined,
                treated: false
              });
            });
            return;
          }
        }
        if (entity.groupId === groupId) {
          next.push({ ...entity, groupId: undefined });
          return;
        }
        next.push(entity);
      });

      if (splitOccurred) {
        const grouped = groupSimilarEntities(next, isRelated);
        showToast("Elementos divididos e re-organizados.", "success");
        setTimeout(() => pushToHistory(grouped, files), 0);
        return grouped;
      }
      return prev;
    });
  };

  const handleUnlockGroup = (groupId: string) => {
    setEntities(prev => {
      const next = prev.map(e => e.groupId === groupId ? { ...e, groupId: undefined } : e);
      const grouped = groupSimilarEntities(next, isRelated);
      showToast("Grupo libertado para re-agrupamento automático.", "success");
      setTimeout(() => pushToHistory(grouped, files), 0);
      return grouped;
    });
  };

  const addToGlobalKnowledge = (text: string, type: string = 'EXCECAO') => {
    setGlobalKnowledge(prev => ({ ...prev, [text.toLowerCase().trim()]: type }));
    // Only remove from entities if it's a generic exception, not a judge/author
    if (type === 'EXCECAO') {
      setEntities(prev => prev.filter(e => e.original.toLowerCase() !== text.toLowerCase()));
    } else {
      // For judges/authors, update their type in the current list
      setEntities(prev => prev.map(e => 
        e.original.toLowerCase() === text.toLowerCase() ? { ...e, type, treated: true } : e
      ));
    }
  };

  const handleImportJudges = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }
      
      if (!text || text.trim().length === 0) {
        showToast("Não foi possível extrair texto do ficheiro. Verifique se o PDF contém texto pesquisável.", "error");
        return;
      }

      // Split by lines and filter
      // Use a more flexible split to catch names separated by various delimiters
      const rawLines = text.split(/[\n\r,;|\t]+/).map(l => l.trim()).filter(l => l.length > 3);
      const newJudges: Record<string, string> = {};
      let count = 0;
      
      rawLines.forEach(line => {
        const cleaned = cleanName(line);
        // Basic validation: at least two words and minimum length
        if (cleaned.length >= 3 && cleaned.split(/\s+/).length >= 2) {
          newJudges[cleaned.toLowerCase()] = 'JUIZ';
          count++;
        }
      });
      
      if (count === 0) {
        showToast("Nenhum nome de juiz válido foi encontrado no ficheiro. Certifique-se de que os nomes estão completos.", "error");
      } else {
        setGlobalKnowledge(prev => {
          const next = { ...prev };
          // The user mentioned "limpa os nomes... que tenho na lista atual" for authors, 
          // but for judges they said "quero que a troques pela que está no documento".
          // So for both, we should probably clear the existing ones of that type.
          Object.keys(next).forEach(key => {
            if (next[key] === 'JUIZ') delete next[key];
          });
          return { ...next, ...newJudges };
        });
        showToast(`${count} juízes importados e lista atualizada.`, "success");
      }
    } catch (err) {
      console.error("Erro ao importar juízes:", err);
      showToast("Erro ao processar o ficheiro de juízes.", "error");
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  const handleImportAuthors = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }
      
      if (!text || text.trim().length === 0) {
        showToast("Não foi possível extrair texto do ficheiro. Verifique se o PDF contém texto pesquisável.", "error");
        return;
      }

      const rawLines = text.split(/[\n\r,;|\t]+/).map(l => l.trim()).filter(l => l.length > 3);
      const newAuthors: Record<string, string> = {};
      let count = 0;
      
      rawLines.forEach(line => {
        const cleaned = cleanName(line);
        if (cleaned.length >= 3 && cleaned.split(/\s+/).length >= 2) {
          newAuthors[cleaned.toLowerCase()] = 'AUTOR';
          count++;
        }
      });
      
      if (count === 0) {
        showToast("Nenhum nome de autor válido foi encontrado no ficheiro.", "error");
      } else {
        setGlobalKnowledge(prev => {
          const next = { ...prev };
          // User specifically asked to clear existing authors: "limpa os nomes de autores que tenho na lista atual"
          Object.keys(next).forEach(key => {
            if (next[key] === 'AUTOR') delete next[key];
          });
          return { ...next, ...newAuthors };
        });
        showToast(`${count} autores importados e lista atualizada.`, "success");
      }
    } catch (err) {
      console.error("Erro ao importar autores:", err);
      showToast("Erro ao processar o ficheiro de autores.", "error");
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  const handleLoadDefaultAuthors = () => {
    setGlobalKnowledge(prev => {
      const next = { ...prev };
      // Clear existing authors
      Object.keys(next).forEach(key => {
        if (next[key] === 'AUTOR') delete next[key];
      });
      // Add default authors
      DEFAULT_AUTHORS.forEach(name => {
        next[name.toLowerCase()] = 'AUTOR';
      });
      return next;
    });
    showToast(`${DEFAULT_AUTHORS.length} autores carregados com sucesso.`, "success");
  };

  const handleLoadDefaultJudges = () => {
    setGlobalKnowledge(prev => {
      const next = { ...prev };
      // Clear existing judges
      Object.keys(next).forEach(key => {
        if (next[key] === 'JUIZ') delete next[key];
      });
      // Add default judges
      DEFAULT_JUDGES.forEach(name => {
        next[name.toLowerCase()] = 'JUIZ';
      });
      return next;
    });
    showToast(`${DEFAULT_JUDGES.length} juízes carregados com sucesso.`, "success");
  };

  const handleClearGlobalKnowledge = (type: string) => {
    setGlobalKnowledge(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (next[key] === type) delete next[key];
      });
      return next;
    });
    const typeName = type === 'EXCECAO' ? 'exceções' : type === 'JUIZ' ? 'juízes' : 'autores';
    showToast(`Lista de ${typeName} limpa com sucesso.`, "info");
  };

  const handleClearAllGlobalKnowledge = () => {
    setGlobalKnowledge({});
    showToast("Todo o conhecimento global foi limpo.", "info");
  };

  const handleSuggestGroups = () => {
    // More aggressive grouping for names
    let next: PIIEntity[] = [];
    setEntities(prev => {
      next = [...prev];
      const nameEntities = next.filter(e => e.type === 'NOME' || e.type === 'JUIZ' || e.type === 'AUTOR');
      
      nameEntities.forEach(entity => {
        if (entity.groupId) return;
        
        const words = entity.original.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (words.length < 2) return;

        const match = nameEntities.find(other => {
          if (other.id === entity.id) return false;
          const otherWords = other.original.toLowerCase().split(/\s+/).filter(w => w.length > 2);
          if (otherWords.length < 2) return false;
          
          // Match if first name + any other name matches
          if (words[0] === otherWords[0]) {
            const otherMatch = words.slice(1).some(w => otherWords.slice(1).includes(w));
            if (otherMatch) return true;
          }
          
          // Or if they share at least 2 significant words
          const common = words.filter(w => otherWords.includes(w));
          return common.length >= 2;
        });

        if (match) {
          const groupId = match.groupId || `suggested-${entity.id}`;
          entity.groupId = groupId;
          match.groupId = groupId;
          
          // Sync type if one is JUIZ or AUTOR
          if (match.type === 'JUIZ' || entity.type === 'JUIZ') {
            entity.type = 'JUIZ';
            match.type = 'JUIZ';
          } else if (match.type === 'AUTOR' || entity.type === 'AUTOR') {
            entity.type = 'AUTOR';
            match.type = 'AUTOR';
          }
          
          // Sync pseudonyms
          entity.pseudonym = match.pseudonym;
        }
      });
      
      return next;
    });
    pushToHistory(next, files);
    showToast("Sugestões de grupos aplicadas", "success");
  };

  const handleExpandStart = () => {
    if (!editingEntity) return;
    const words = editingEntity.contextBefore.trim().split(/\s+/);
    if (words.length === 0) return;
    const lastWord = words[words.length - 1];
    const newOriginal = `${lastWord} ${editingEntity.original}`;
    const newContextBefore = editingEntity.contextBefore.slice(0, editingEntity.contextBefore.lastIndexOf(lastWord)).trim();
    
    const updated = { ...editingEntity, original: newOriginal, contextBefore: newContextBefore };
    setEditingEntity(updated);
    handleUpdateEntity(editingEntity.id, updated);
  };

  const handleShrinkStart = () => {
    if (!editingEntity) return;
    const words = editingEntity.original.trim().split(/\s+/);
    if (words.length < 2) return;
    const firstWord = words[0];
    const newOriginal = words.slice(1).join(' ');
    const newContextBefore = `${editingEntity.contextBefore} ${firstWord}`.trim();
    
    const updated = { ...editingEntity, original: newOriginal, contextBefore: newContextBefore };
    setEditingEntity(updated);
    handleUpdateEntity(editingEntity.id, updated);
  };

  const handleExpandEnd = () => {
    if (!editingEntity) return;
    const words = editingEntity.contextAfter.trim().split(/\s+/);
    if (words.length === 0) return;
    const firstWord = words[0];
    const newOriginal = `${editingEntity.original} ${firstWord}`;
    const newContextAfter = editingEntity.contextAfter.slice(editingEntity.contextAfter.indexOf(firstWord) + firstWord.length).trim();
    
    const updated = { ...editingEntity, original: newOriginal, contextAfter: newContextAfter };
    setEditingEntity(updated);
    handleUpdateEntity(editingEntity.id, updated);
  };

  const handleShrinkEnd = () => {
    if (!editingEntity) return;
    const words = editingEntity.original.trim().split(/\s+/);
    if (words.length < 2) return;
    const lastWord = words[words.length - 1];
    const newOriginal = words.slice(0, -1).join(' ');
    const newContextAfter = `${lastWord} ${editingEntity.contextAfter}`.trim();
    
    const updated = { ...editingEntity, original: newOriginal, contextAfter: newContextAfter };
    setEditingEntity(updated);
    handleUpdateEntity(editingEntity.id, updated);
  };

  const toggleSelectAllFiltered = () => {
    const allFilteredIds = filteredEntities.map(e => e.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
    
    const newSelected = new Set(selectedIds);
    if (allSelected) {
      allFilteredIds.forEach(id => newSelected.delete(id));
    } else {
      allFilteredIds.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectGroup = (groupEntities: PIIEntity[]) => {
    const groupIds = groupEntities.map(e => e.id);
    const allSelected = groupIds.length > 0 && groupIds.every(id => selectedIds.has(id));
    
    const newSelected = new Set(selectedIds);
    if (allSelected) {
      groupIds.forEach(id => newSelected.delete(id));
    } else {
      groupIds.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const clearAll = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      showToast("Clique novamente para confirmar a limpeza total do projeto.", "info");
      setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    
    setFiles([]);
    setEntities([]);
    setSelectedIds(new Set());
    setSelectedFileId(null);
    setHistory([]);
    setHistoryIndex(-1);
    setConfirmingClear(false);
    localStorage.removeItem('pii_project_state');
    showToast("Projeto limpo. Iniciado novo projeto.", "success");
  };

  const handleReGroup = () => {
    const grouped = groupSimilarEntities(entities, isRelated);
    setEntities(grouped);
    pushToHistory(grouped, files);
    showToast("Agrupamentos re-analisados", "success");
  };

  const handleFixAllConflicts = () => {
    setEntities(prev => {
      // 1. Re-calculate conflicts based on the absolute latest state 'prev'
      const pToGroups = new Map<string, Set<string>>();
      prev.forEach(e => {
        if (e.ignored || !e.enabled) return;
        const p = e.pseudonym.trim();
        if (!p) return;
        const groupKey = e.groupId || `single-${e.id}`;
        if (!pToGroups.has(p)) pToGroups.set(p, new Set());
        pToGroups.get(p)!.add(groupKey);
      });
      
      const conflicts = new Set<string>();
      pToGroups.forEach((groups, pseudonym) => {
        if (groups.size > 1) conflicts.add(pseudonym);
      });

      if (conflicts.size === 0) {
        // Use a timeout for side effects like toast/history to avoid issues inside setEntities
        setTimeout(() => showToast("Não foram encontrados conflitos", "info"), 0);
        return prev;
      }

      const next = [...prev];
      // Keep track of how many "new" unique names we've introduced globally in this batch
      // to ensure getNextPseudonym always moves forward
      let extraNamesCount = 0;

      conflicts.forEach(pseudonym => {
        const groups = Array.from(pToGroups.get(pseudonym) || []);
        // Keep the first group with this pseudonym, change the others
        for (let i = 1; i < groups.length; i++) {
          const groupToChange = groups[i];
          
          // Find an entity in this group to get the type
          const sampleEntity = next.find(e => (e.groupId && e.groupId === groupToChange) || (!e.groupId && `single-${e.id}` === groupToChange));
          if (!sampleEntity) continue;
          
          const type = sampleEntity.type;
          
          // Find a new unique pseudonym
          let newP = "";
          let foundUnique = false;
          let safety = 0;
          
          while (!foundUnique && safety < 200) {
            extraNamesCount++;
            safety++;
            
            // Create dummies to force getNextPseudonym to give us a higher count
            const dummies = Array.from({ length: extraNamesCount }, (_, k) => ({
              id: `temp-${k}`,
              original: `TEMP_UNIQUE_NAME_${type}_${k}`,
              type,
              pseudonym: '',
              enabled: true
            } as PIIEntity));
            
            newP = getNextPseudonym(type, [...next, ...dummies]);
            
            // Ensure it doesn't conflict with existing ones in 'next'
            if (!next.some(e => e.pseudonym === newP)) {
              foundUnique = true;
            }
          }

          // Update all entities in this group
          next.forEach((e, idx) => {
            const currentGroupKey = e.groupId || `single-${e.id}`;
            if (currentGroupKey === groupToChange) {
              next[idx] = { ...e, pseudonym: newP, treated: true };
            }
          });
        }
      });

      setTimeout(() => {
        pushToHistory(next, files);
        showToast("Conflitos de pseudónimos resolvidos", "success");
      }, 0);
      
      return next;
    });
  };

  const handleFixSingleConflict = (entity: PIIEntity) => {
    setEntities(prev => {
      const type = entity.type;
      const groupKey = entity.groupId || `single-${entity.id}`;
      
      let newP = "";
      let extra = 0;
      let found = false;
      
      while (!found && extra < 100) {
        extra++;
        const dummies = Array.from({ length: extra }, (_, k) => ({
          id: `temp-${k}`,
          original: `TEMP_SINGLE_FIX_${k}`,
          type,
          pseudonym: '',
          enabled: true
        } as PIIEntity));
        
        newP = getNextPseudonym(type, [...prev, ...dummies]);
        if (!prev.some(e => e.pseudonym === newP)) {
          found = true;
        }
      }
      
      const next = prev.map(e => {
        const currentGroupKey = e.groupId || `single-${e.id}`;
        if (currentGroupKey === groupKey) {
          return { ...e, pseudonym: newP, treated: true };
        }
        return e;
      });
      
      setTimeout(() => {
        pushToHistory(next, files);
        showToast(`Novo pseudónimo atribuído a ${entity.original}`, "success");
      }, 0);
      
      return next;
    });
  };

  const handleExportExceptions = () => {
    const blob = new Blob([JSON.stringify(globalKnowledge, null, 2)], { type: 'application/json' });
    saveAs(blob, 'conhecimento_global.json');
  };

  const handleImportExceptions = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setGlobalKnowledge(prev => ({ ...prev, ...imported }));
      } catch (err) {
        console.error("Erro ao importar conhecimento:", err);
      }
    };
    reader.readAsText(file);
  };

  // --- Export ---

  const handleExport = async () => {
    setIsProcessing(true);
    const zip = new JSZip();
    
    try {
      for (const fileData of files) {
        if (fileData.status !== 'done') continue;

        if (fileData.type === 'application/pdf') {
          const pdfBytes = await exportAnonymizedPDFBytes(fileData);
          zip.file(`anonymized_${fileData.name}`, pdfBytes);
        } else {
          const anonymizedText = anonymizeText(fileData.content, entities);
          zip.file(`anonymized_${fileData.name}.txt`, anonymizedText);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'documentos_anonimizados.zip');
    } catch (error) {
      console.error("Erro ao exportar:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportAnonymizedPDFBytes = async (fileData: FileData): Promise<Uint8Array> => {
    const arrayBuffer = await fileData.rawFile.arrayBuffer();
    
    // Load with pdfjs for rendering
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // Create new PDF with pdf-lib
    const outPdfDoc = await PDFDocument.create();

    // Filter entities for this file
    const fileEntities = entities.filter(e => 
      e.fileIds?.includes(fileData.id) && 
      e.enabled && 
      !e.ignored && 
      e.type !== 'AUTOR' && 
      e.type !== 'JUIZ'
    );

    // Sort entities by length descending
    const sortedEntities = [...fileEntities].sort((a, b) => b.original.length - a.original.length);

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const scale = 2.0; // High resolution for quality
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false })!;
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render original page to canvas
      await page.render({ 
        canvasContext: context, 
        viewport: viewport,
        canvas: canvas
      }).promise;

      // Get text content to find coordinates for redaction
      const textContent = await page.getTextContent();
      
      // Draw redactions directly on the canvas (this physically overwrites the pixels)
      for (const item of textContent.items as any[]) {
        const text = item.str;
        if (!text.trim() || text.trim().length < 2) continue;

        // Find all entities that appear in this text item
        const matchesInItem = sortedEntities
          .filter(entity => text.includes(entity.original))
          .sort((a, b) => text.indexOf(a.original) - text.indexOf(b.original));

        if (matchesInItem.length > 0) {
          // item.transform: [scaleX, skewY, skewX, scaleY, x, y]
          const [scaleX, , , scaleY, x, y] = item.transform;
          const pHeight = viewport.viewBox[3];
          const fontSize = Math.abs(scaleY);
          const charWidth = item.width / text.length;

          // We need to handle multiple matches in the same string
          matchesInItem.forEach(matchingEntity => {
            const original = matchingEntity.original;
            const startIndex = text.indexOf(original);
            if (startIndex === -1) return;

            const cX = (x + (startIndex * charWidth)) * scale;
            const cY = (pHeight - y - fontSize) * scale;
            const cWidth = original.length * charWidth * scale;
            const cHeight = fontSize * 1.2 * scale;

            const colorInfo = PII_COLORS[matchingEntity.type] || { hex: '#FFD700', textHex: '#000000' };

            // Draw the redaction box (Solid color)
            context.fillStyle = colorInfo.hex;
            context.fillRect(cX, cY, cWidth, cHeight);

            // Draw the pseudonym text
            if (original.length > 4 || original === matchingEntity.original) {
              context.fillStyle = colorInfo.textHex;
              const drawFontSize = Math.max(8, fontSize * 0.7 * scale);
              context.font = `bold ${drawFontSize}px Arial, sans-serif`;
              context.textBaseline = 'middle';
              context.textAlign = 'center';
              context.fillText(matchingEntity.pseudonym, cX + (cWidth / 2), cY + (cHeight / 2));
            }
          });
        }
      }

      // Convert canvas to image and add to new PDF
      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      const image = await outPdfDoc.embedJpg(imageData);
      
      const outPage = outPdfDoc.addPage([viewport.width / scale, viewport.height / scale]);
      outPage.drawImage(image, {
        x: 0,
        y: 0,
        width: viewport.width / scale,
        height: viewport.height / scale,
      });
    }

    await pdf.destroy();
    return await outPdfDoc.save();
  };

  // --- UI Helpers ---

  const filteredEntities = entities.filter(e => {
    const matchesSearch = e.original.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         e.pseudonym.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || e.type === filterType;
    const matchesIgnored = hideIgnored ? !e.ignored : true;
    return matchesSearch && matchesType && matchesIgnored;
  });

  const pseudonymAnalysis = useMemo(() => {
    const pToO = new Map<string, Set<string>>();
    const pToGroups = new Map<string, Set<string>>();
    
    entities.forEach(e => {
      if (e.ignored || !e.enabled) return;
      const p = e.pseudonym.trim();
      if (!p) return;
      
      const normalizedOriginal = e.original.toLowerCase().trim();
      if (!pToO.has(p)) pToO.set(p, new Set());
      pToO.get(p)!.add(normalizedOriginal);
      
      const groupKey = e.groupId || `single-${e.id}`;
      if (!pToGroups.has(p)) pToGroups.set(p, new Set());
      pToGroups.get(p)!.add(groupKey);
    });
    
    const conflicts = new Set<string>();
    pToGroups.forEach((groups, pseudonym) => {
      if (groups.size > 1) conflicts.add(pseudonym);
    });
    
    return { conflicts, pToO, pToGroups };
  }, [entities]);

  const groupedEntities = filteredEntities.reduce((acc, entity) => {
    const key = entity.groupId || `single-${entity.id}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entity);
    return acc;
  }, {} as Record<string, PIIEntity[]>);

  const handleExportProject = () => {
    // We omit rawFile as it's not JSON serializable easily
    const projectData = {
      files: files.map(({ rawFile, ...rest }) => rest),
      entities,
      globalKnowledge,
      isRelated,
      version: '1.0'
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    saveAs(blob, `projeto_anonimizacao_${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleImportProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (imported.files && imported.entities) {
          // Note: rawFile will be missing, so PDF re-export won't work without re-upload
          setFiles(imported.files.map((f: any) => ({ ...f, status: 'done' })));
          setEntities(imported.entities);
          if (imported.globalKnowledge) setGlobalKnowledge(imported.globalKnowledge);
          if (imported.isRelated !== undefined) setIsRelated(imported.isRelated);
        }
      } catch (err) {
        console.error("Erro ao importar projeto:", err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Entity Detail Modal */}
      <AnimatePresence>
        {editingEntity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-bold">Tratar Elemento</h3>
                <button onClick={() => setEditingEntity(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-2">Contexto no Documento</label>
                  <div className="p-4 bg-gray-50 rounded-xl text-sm leading-relaxed">
                    <span className="text-gray-400">{editingEntity.contextBefore}</span>
                    <span className="bg-yellow-200 px-1 rounded font-bold mx-1">{editingEntity.original}</span>
                    <span className="text-gray-400">{editingEntity.contextAfter}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">Texto Original</label>
                    <input 
                      type="text" 
                      value={editingEntity.original}
                      onChange={(e) => handleUpdateEntity(editingEntity.id, { original: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">Tipo</label>
                    <select 
                      value={editingEntity.type}
                      onChange={(e) => handleUpdateEntity(editingEntity.id, { type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      {Object.keys(PII_COLORS).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2">Pseudónimo (Sigla)</label>
                    <input 
                      type="text" 
                      value={editingEntity.pseudonym}
                      onChange={(e) => handleUpdateEntity(editingEntity.id, { pseudonym: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-500">Ajustar Limites</label>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={handleExpandStart}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Expandir Início</span>
                    </button>
                    <button 
                      onClick={handleShrinkStart}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs hover:bg-gray-100 transition-colors"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>Reduzir Início</span>
                    </button>
                    <div className="w-px h-6 bg-gray-200 mx-1" />
                    <button 
                      onClick={handleShrinkEnd}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs hover:bg-gray-100 transition-colors"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>Reduzir Fim</span>
                    </button>
                    <button 
                      onClick={handleExpandEnd}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Expandir Fim</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-500">Ações de Limpeza e Associação</label>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => {
                        if (!editingEntity) return;
                        // Remove single spaces between letters, e.g., "S i m õ e s" -> "Simões"
                        let cleaned = editingEntity.original;
                        for (let i = 0; i < 5; i++) {
                          cleaned = cleaned.replace(/(\b\w)\s+(?=\w\b)/g, '$1');
                        }
                        cleaned = cleaned.replace(/\s+/g, ' ').trim();
                        handleUpdateEntity(editingEntity.id, { original: cleaned });
                        showToast("Espaços de OCR limpos.", "info");
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs hover:bg-amber-100 transition-colors border border-amber-200"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Limpar Espaços OCR</span>
                    </button>
                    <button 
                      onClick={() => {
                        if (!editingEntity) return;
                        setShowMergeModal(true);
                        setSelectedIds(new Set([editingEntity.id]));
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs hover:bg-indigo-100 transition-colors border border-indigo-200"
                    >
                      <Link className="w-3 h-3" />
                      <span>Mesclar com outro...</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-500">Ações de Divisão</label>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => handleManualSplit(editingEntity, /\s+/)}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors"
                    >
                      Dividir por Espaço
                    </button>
                    <button 
                      onClick={() => handleManualSplit(editingEntity, /\s+e\s+/i)}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors"
                    >
                      Dividir por "e"
                    </button>
                    <button 
                      onClick={() => handleManualSplit(editingEntity, ',')}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors"
                    >
                      Dividir por Vírgula
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 flex justify-end gap-3">
                <button 
                  onClick={() => setEditingEntity(null)}
                  className="px-6 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Fechar
                </button>
                <button 
                  onClick={() => {
                    handleUpdateEntity(editingEntity.id, { treated: true });
                    setEditingEntity(null);
                  }}
                  className="px-6 py-2 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg transition-colors"
                >
                  Validar e Sair
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Anonimiza PII</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 border-r border-gray-200 pr-4 mr-2">
              <button 
                onClick={undo}
                disabled={historyIndex <= 0}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 disabled:opacity-30"
                title="Anular (Undo)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button 
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 disabled:opacity-30"
                title="Refazer (Redo)"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 border-r border-gray-200 pr-4 mr-2">
              <button 
                onClick={() => setSplitView(!splitView)}
                className={`p-2 rounded-lg transition-colors ${splitView ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-gray-100 text-gray-600'}`}
                title="Visualização Lado-a-Lado (Split View)"
              >
                <Layers className="w-4 h-4" />
              </button>
              <button 
                onClick={handleExportReport}
                disabled={entities.length === 0}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 disabled:opacity-30"
                title="Exportar Relatório de Correspondências (Excel)"
              >
                <FileText className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 border-r border-gray-200 pr-4 mr-2">
              <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600" title="Importar Projeto (JSON)">
                <FolderOpen className="w-4 h-4" />
                <input type="file" accept=".json" className="hidden" onChange={handleImportProject} />
              </label>
              <button 
                onClick={handleExportProject}
                disabled={files.length === 0}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 disabled:opacity-30"
                title="Exportar Projeto (JSON)"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => setShowExceptionsModal(true)}
              className="flex items-center gap-2 text-gray-600 hover:text-indigo-600 px-3 py-2 rounded-lg font-medium transition-colors"
            >
              <Shield className="w-4 h-4" />
              <span>Exceções</span>
            </button>

            <button 
              onClick={clearAll}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all ${
                confirmingClear 
                  ? 'bg-red-600 text-white animate-pulse' 
                  : 'text-red-600 hover:bg-red-50'
              }`}
              title={confirmingClear ? "Confirmar Limpeza" : "Limpar todo o projeto e começar um novo"}
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">
                {confirmingClear ? "Confirmar?" : "Novo Projeto"}
              </span>
            </button>

            <button 
              onClick={handleExport}
              disabled={files.length === 0 || isProcessing}
              title="Gera versões anonimizadas dos ficheiros carregados. PDFs são reconstruídos com pseudónimos."
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Exportar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className={`grid grid-cols-1 ${splitView ? 'lg:grid-cols-1' : 'lg:grid-cols-12'} gap-8`}>
          {/* Left Column: Files & Controls */}
          {!splitView && (
            <div className="lg:col-span-4 space-y-6">
              {/* Search Box */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Procurar</h2>
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Procurar elementos ou pseudónimos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoComplete="off"
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Upload Box */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Documentos</h2>
                  {files.length > 0 && (
                    <button 
                      onClick={clearAll}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar Tudo
                    </button>
                  )}
                </div>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 text-center px-4">Clique ou arraste ficheiros (incluindo relacionados)</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DOCX, XLSX, TXT</p>
                  </div>
                  <input type="file" className="hidden" multiple accept=".pdf,.docx,.xlsx,.txt" onChange={handleFileUpload} />
                </label>

                <div className="mt-4 space-y-2">
                  {files.map(file => (
                    <div 
                      key={file.id} 
                      onClick={() => setSelectedFileId(file.id)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${selectedFileId === file.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-100 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{file.name}</span>
                      </div>
                      {file.status === 'processing' ? (
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      ) : file.status === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : file.status === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right Column: Entities List or Split View */}
          <div className={`${splitView ? 'lg:col-span-12' : 'lg:col-span-8'} space-y-6`}>
            {splitView ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-200px)]">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold text-gray-700">Comparação Lado-a-Lado</h2>
                    <select 
                      value={selectedFileId || ''} 
                      onChange={(e) => setSelectedFileId(e.target.value)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      <option value="">Selecionar Ficheiro...</option>
                      {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <button onClick={() => setSplitView(false)} className="text-xs text-gray-500 hover:text-gray-700">Fechar</button>
                </div>
                
                <div className="flex-1 flex overflow-hidden">
                  {/* Original Text */}
                  <div className="flex-1 border-r border-gray-100 flex flex-col">
                    <div className="p-2 bg-gray-100/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Original</div>
                    <div 
                      ref={leftScrollRef}
                      onScroll={() => handleSyncScroll('left')}
                      className="flex-1 p-6 overflow-y-auto font-mono text-sm whitespace-pre-wrap text-gray-600 bg-white"
                    >
                      {selectedFileId ? (
                        <HighlightText 
                          text={files.find(f => f.id === selectedFileId)?.content || ""} 
                          entities={entities} 
                          mode="original" 
                        />
                      ) : "Selecione um ficheiro para visualizar"}
                    </div>
                  </div>
                  
                  {/* Anonymized Text */}
                  <div className="flex-1 flex flex-col">
                    <div className="p-2 bg-indigo-50 text-[10px] font-bold text-indigo-500 uppercase tracking-wider text-center">Anonimizado</div>
                    <div 
                      ref={rightScrollRef}
                      onScroll={() => handleSyncScroll('right')}
                      className="flex-1 p-6 overflow-y-auto font-mono text-sm whitespace-pre-wrap text-gray-900 bg-white"
                    >
                      {selectedFileId ? (
                        <HighlightText 
                          text={anonymizeText(files.find(f => f.id === selectedFileId)?.content || "", entities)} 
                          entities={entities} 
                          mode="anonymized" 
                        />
                      ) : "Selecione um ficheiro para visualizar"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Search & Bulk Actions Toolbar */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl mr-2">
                  <button 
                    onClick={() => setIsRelated(true)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${isRelated ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    title="Agrupar elementos entre todos os documentos"
                  >
                    Relacionados
                  </button>
                  <button 
                    onClick={() => setIsRelated(false)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${!isRelated ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    title="Agrupar elementos apenas dentro do mesmo documento"
                  >
                    Independentes
                  </button>
                </div>
                <button 
                  onClick={handleSplitAllAndEntities}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors"
                  title="Dividir nomes que contêm ' e ' (ex: Nome1 e Nome2)"
                >
                  <Scissors className="w-4 h-4" />
                  <span>Dividir 'e'</span>
                </button>
                <button 
                  onClick={reclassifyEntities}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors"
                  title="Reclassificar nomes como Juízes ou Autores com base no conhecimento global"
                >
                  <Zap className="w-4 h-4" />
                  <span>Reclassificar (Global)</span>
                </button>
                <button 
                  onClick={handleSuggestGroups}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors"
                  title="Sugerir agrupamentos automáticos para nomes semelhantes"
                >
                  <Plus className="w-4 h-4" />
                  <span>Sugerir Grupos</span>
                </button>
                <button 
                  onClick={handleReGroup}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors"
                  title="Re-analisar agrupamentos com base no tratamento atual"
                >
                  <RotateCw className="w-4 h-4" />
                  <span>Re-agrupar</span>
                </button>
                <button
                  onClick={() => setHideIgnored(!hideIgnored)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors border ${
                    hideIgnored 
                      ? 'bg-amber-50 text-amber-700 border-amber-200' 
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                  title={hideIgnored ? "Mostrar todos os elementos" : "Ocultar elementos ignorados"}
                >
                  {hideIgnored ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{hideIgnored ? "Ocultar Ignorados" : "Ignorados Visíveis"}</span>
                </button>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                {['ALL', ...Object.keys(PII_COLORS)].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                      filterType === type 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {type === 'ALL' ? 'Todos' : type}
                  </button>
                ))}
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold">
                    {selectedIds.size} selecionados
                  </span>
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">
                    Limpar
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-indigo-200">
                    <span className="mr-1">Alterar para:</span>
                    <select 
                      className="bg-transparent border-none focus:outline-none cursor-pointer"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleBulkUpdateType(e.target.value);
                      }}
                    >
                      <option value="" disabled>Selecionar...</option>
                      {Object.keys(PII_COLORS).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    onClick={handleValidateSelected}
                    className="flex items-center gap-1 bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-green-200"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Validar
                  </button>
                  <button 
                    onClick={handleGroupSelected}
                    className="flex items-center gap-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-indigo-200"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Agrupar / Associar
                  </button>
                  {copiedPseudonym && (
                    <button 
                      onClick={handlePastePseudonym}
                      className="flex items-center gap-1 bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-amber-200"
                    >
                      <Link className="w-3.5 h-3.5" />
                      Colar
                    </button>
                  )}
                  <button 
                    onClick={handleIgnoreSelected}
                    className="flex items-center gap-1 bg-gray-50 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-gray-200"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Ignorar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold">Elementos Detetados ({filteredEntities.length})</h2>
                {filteredEntities.length > 0 && (
                  <button 
                    onClick={toggleSelectAllFiltered}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md transition-colors"
                  >
                    {filteredEntities.every(e => selectedIds.has(e.id)) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                )}
              </div>
              {pseudonymAnalysis.conflicts.size > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-red-600 animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-bold">Atenção: Existem {pseudonymAnalysis.conflicts.size} pseudónimos duplicados para nomes diferentes!</span>
                  </div>
                  <button 
                    onClick={handleFixAllConflicts}
                    className="text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 w-fit transition-colors"
                  >
                    Corrigir Todos Automaticamente
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {copiedPseudonym && (
                <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-100">
                  <Copy className="w-3 h-3" />
                  <span>Copiado: {copiedPseudonym}</span>
                  <button onClick={() => setCopiedPseudonym(null)} className="hover:text-indigo-900">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {Object.entries(groupedEntities).map(([groupId, group]: [string, PIIEntity[]]) => {
              const isCollapsed = collapsedGroups.has(groupId);
              const isManualGroup = groupId.startsWith('manual-group-') || groupId.startsWith('group-');
              const isProcessed = group.every(e => e.treated || e.ignored);

              return (
                <motion.div 
                  key={groupId}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {group.length > 1 || isManualGroup ? (
                    <div 
                      className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${
                        isCollapsed ? 'bg-gray-50/80' : 'bg-gray-50/50 border-b border-gray-100'
                      }`}
                      onClick={() => {
                        setCollapsedGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(groupId)) next.delete(groupId);
                          else next.add(groupId);
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectGroup(group);
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={group.every(e => selectedIds.has(e.id))}
                            onChange={() => {}} // Handled by parent div click or stopPropagation
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="bg-indigo-100 text-indigo-700 p-1.5 rounded-lg">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold flex items-center gap-2">
                            Grupo: {group[0].original}
                            {isProcessed && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                            {groupId.startsWith('manual-group-') && (
                              <div className="flex items-center gap-1">
                                <span className="text-[8px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded border border-amber-200 font-bold uppercase tracking-tighter">Manual</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnlockGroup(groupId);
                                  }}
                                  className="p-1 hover:bg-white rounded text-amber-400 hover:text-amber-600 transition-colors"
                                  title="Desbloquear grupo (permitir re-agrupamento automático)"
                                >
                                  <RotateCw className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDissolveGroup(groupId);
                                }}
                                className="p-1 hover:bg-white rounded text-red-400 hover:text-red-600 transition-colors"
                                title="Dissolver grupo (separar todos os elementos)"
                              >
                                <Unlink className="w-3 h-3" />
                              </button>
                              {group.some(e => (e.type === 'NOME' || e.type === 'AUTOR' || e.type === 'JUIZ') && (e.original.includes(' e ') || e.original.includes('  ') || e.original.split(' ').length >= 4)) && (
                                <div className="flex items-center bg-gray-100 rounded p-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSplitGroup(groupId, 'e');
                                    }}
                                    className="p-1 hover:bg-white rounded text-indigo-400 hover:text-indigo-600 transition-colors"
                                    title="Dividir por 'e'"
                                  >
                                    <Scissors className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSplitGroup(groupId, 'space');
                                    }}
                                    className="p-1 hover:bg-white rounded text-indigo-400 hover:text-indigo-600 transition-colors"
                                    title="Dividir por espaços/nomes longos"
                                  >
                                    <Type className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </h3>
                          <div className="text-xs text-gray-500 flex items-center gap-1">
                            {group.length} ocorrências • {group[0].pseudonym}
                            {pseudonymAnalysis.conflicts.has(group[0].pseudonym.trim()) && (
                              <div className="flex items-center gap-1">
                                <AlertCircle 
                                  className="w-3 h-3 text-red-500" 
                                  title={`Aviso: Este pseudónimo também está a ser usado para: ${Array.from(pseudonymAnalysis.pToO.get(group[0].pseudonym.trim()) || []).filter(o => o !== group[0].original.toLowerCase().trim()).join(', ')}`} 
                                />
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFixSingleConflict(group[0]);
                                  }}
                                  className="text-[8px] bg-red-50 text-red-600 hover:bg-red-100 px-1 py-0.5 rounded border border-red-200 font-bold"
                                >
                                  Corrigir
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select 
                          className={`text-[10px] font-bold bg-white border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${group.some(e => e.type !== group[0].type) ? 'text-amber-600 border-amber-200' : ''}`}
                          value={group.every(e => e.type === group[0].type) ? group[0].type : 'MIXED'}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleUpdateGroupType(groupId, e.target.value);
                          }}
                          title="Alterar categoria de todo o grupo"
                        >
                          {group.some(e => e.type !== group[0].type) && (
                            <option value="MIXED" disabled>VÁRIOS</option>
                          )}
                          {Object.keys(PII_COLORS).map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPseudonym(group[0].pseudonym);
                          }}
                          className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Copiar Pseudónimo"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {isCollapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </div>
                  ) : null}

                  {!isCollapsed && (
                    <div className="divide-y divide-gray-100">
                      {group.map((entity: PIIEntity) => (
                        <div 
                          key={entity.id} 
                          className={`p-4 flex items-center gap-4 transition-colors ${
                            selectedIds.has(entity.id) ? 'bg-indigo-50/30' : 'hover:bg-gray-50/30'
                          }`}
                        >
                          <input 
                            type="checkbox"
                            checked={selectedIds.has(entity.id)}
                            onChange={() => toggleEntitySelection(entity.id)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span 
                                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                style={{ 
                                  backgroundColor: PII_COLORS[entity.type]?.hex,
                                  color: PII_COLORS[entity.type]?.textHex || '#000000'
                                }}
                              >
                                {entity.type}
                              </span>
                              <span className="text-sm font-semibold truncate">
                                {['NIF', 'CC', 'PASSPORT', 'IBAN'].includes(entity.type) && entity.contextSnippet ? (
                                  <span className="text-xs italic text-gray-500 font-normal">
                                    ...{entity.contextSnippet}...
                                  </span>
                                ) : (
                                  entity.original
                                )}
                              </span>
                            </div>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="text"
                                  value={entity.pseudonym}
                                  onChange={(e) => updatePseudonym(entity.id, e.target.value)}
                                  className={`text-xs font-mono bg-gray-100 px-2 py-1 rounded border outline-none w-32 ${
                                    pseudonymAnalysis.conflicts.has(entity.pseudonym.trim()) 
                                      ? 'border-red-300 bg-red-50 focus:border-red-500' 
                                      : 'border-transparent focus:border-indigo-300 focus:bg-white'
                                  }`}
                                />
                                {pseudonymAnalysis.conflicts.has(entity.pseudonym.trim()) && (
                                  <div className="flex items-center gap-1">
                                    <AlertCircle 
                                      className="w-3.5 h-3.5 text-red-500" 
                                      title={`Aviso: Este pseudónimo também está a ser usado para: ${Array.from(pseudonymAnalysis.pToO.get(entity.pseudonym.trim()) || []).filter(o => o !== entity.original.toLowerCase().trim()).join(', ')}`} 
                                    />
                                    <button 
                                      onClick={() => handleFixSingleConflict(entity)}
                                      className="text-[9px] bg-red-50 text-red-600 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200 font-bold"
                                    >
                                      Corrigir
                                    </button>
                                  </div>
                                )}
                                {entity.treated && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                {entity.ignored && <EyeOff className="w-3 h-3 text-gray-400" />}
                              </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => addToGlobalKnowledge(entity.original)}
                              className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                              title="Adicionar às exceções globais"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEditingEntity(entity)}
                              className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Ver contexto e editar"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEntities(prev => prev.map(e => e.id === entity.id ? { ...e, treated: !e.treated, ignored: false } : e))}
                              className={`p-2 rounded-lg transition-colors ${entity.treated ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:bg-white hover:text-green-600'}`}
                              title="Validar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEntities(prev => prev.map(e => e.id === entity.id ? { ...e, ignored: !e.ignored, treated: false } : e))}
                              className={`p-2 rounded-lg transition-colors ${entity.ignored ? 'text-red-600 bg-red-50' : 'text-gray-400 hover:bg-white hover:text-red-600'}`}
                              title="Ignorar"
                            >
                              <EyeOff className="w-4 h-4" />
                            </button>
                            {entity.original.includes(' ') && (
                              <button 
                                onClick={() => handleSplitEntity(entity)}
                                className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                                title="Dividir Elemento"
                              >
                                <Scissors className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleCopyPseudonym(entity.pseudonym)}
                              className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Copiar"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedIds(new Set([entity.id]));
                                setShowMergeModal(true);
                              }}
                              className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                              title="Unir a Grupo"
                            >
                              <Link className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  </div>
</main>

      {/* Floating Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-white border border-gray-200 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-6"
          >
            <div className="flex items-center gap-3 border-r border-gray-100 pr-6">
              <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {selectedIds.size}
              </span>
              <span className="text-sm font-medium text-gray-600">Selecionados</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-indigo-600 font-medium">
                Limpar
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleValidateSelected}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-green-200"
              >
                <Check className="w-4 h-4" />
                <span>Validar</span>
              </button>
              <button 
                onClick={handleGroupSelected}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-200"
              >
                <Layers className="w-4 h-4" />
                <span>Agrupar</span>
              </button>
              {copiedPseudonym && (
                <button 
                  onClick={handlePastePseudonym}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-amber-200"
                >
                  <Link className="w-4 h-4" />
                  <span>Colar</span>
                </button>
              )}
              <button 
                onClick={handleIgnoreSelected}
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-gray-200"
              >
                <EyeOff className="w-4 h-4" />
                <span>Ignorar</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-green-50 border-green-100 text-green-800' :
              toast.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
              'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-600" /> :
             toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-600" /> :
             <Shield className="w-5 h-5 text-indigo-600" />}
            <span className="font-bold text-sm">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merge Modal */}
      <AnimatePresence>
        {showMergeModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMergeModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold">Unir a Grupo Existente</h3>
                <button onClick={() => setShowMergeModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                {entities
                  .filter(e => !selectedIds.has(e.id))
                  .reduce((acc, e) => {
                    const key = e.groupId || e.id;
                    if (!acc.find(item => (item.groupId || item.id) === key)) {
                      acc.push(e);
                    }
                    return acc;
                  }, [] as PIIEntity[])
                  .map(groupHead => (
                    <button
                      key={groupHead.id}
                      onClick={() => handleMergeToGroup(groupHead.groupId || groupHead.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-indigo-50 rounded-2xl border border-gray-100 transition-all hover:border-indigo-200 text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 group-hover:bg-white p-2 rounded-xl transition-colors">
                          <Layers className="w-4 h-4 text-gray-500 group-hover:text-indigo-600" />
                        </div>
                        <div>
                          <div className="font-bold text-gray-900">{groupHead.original}</div>
                          <div className="text-xs text-gray-500 font-mono">{groupHead.pseudonym}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-400" />
                    </button>
                  ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exceptions Modal */}
      <AnimatePresence>
        {showExceptionsModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExceptionsModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">Gestão de Conhecimento</h3>
                  <p className="text-xs text-gray-500">Elementos que têm tratamento especial em todos os projetos</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-full transition-colors" title="Importar JSON">
                    <Upload className="w-5 h-5 text-gray-500" />
                    <input type="file" accept=".json" className="hidden" onChange={handleImportExceptions} />
                  </label>
                  <button onClick={handleExportExceptions} className="p-2 hover:bg-gray-100 rounded-full transition-colors" title="Exportar JSON">
                    <Download className="w-5 h-5 text-gray-500" />
                  </button>
                  <button onClick={() => setShowExceptionsModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex border-b border-gray-100">
                <button 
                  onClick={() => setExceptionsTab('EXCECAO')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${exceptionsTab === 'EXCECAO' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Exceções
                </button>
                <button 
                  onClick={() => setExceptionsTab('JUIZ')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${exceptionsTab === 'JUIZ' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Juízes
                </button>
                <button 
                  onClick={() => setExceptionsTab('AUTOR')}
                  className={`flex-1 py-3 text-sm font-bold transition-colors ${exceptionsTab === 'AUTOR' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Autores
                </button>
              </div>
              
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder={`Pesquisar em ${exceptionsTab === 'EXCECAO' ? 'exceções' : exceptionsTab === 'JUIZ' ? 'juízes' : 'autores'}...`}
                    value={knowledgeSearch}
                    onChange={(e) => setKnowledgeSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder={`Adicionar novo(a) ${exceptionsTab === 'EXCECAO' ? 'exceção' : exceptionsTab === 'JUIZ' ? 'juiz' : 'autor'}...`}
                    className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val) {
                          setGlobalKnowledge(prev => ({ ...prev, [val]: exceptionsTab }));
                          e.currentTarget.value = '';
                          showToast(`"${val}" adicionado às ${exceptionsTab === 'EXCECAO' ? 'exceções' : exceptionsTab === 'JUIZ' ? 'juízes' : 'autores'}.`, "success");
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      const val = input.value.trim();
                      if (val) {
                        setGlobalKnowledge(prev => ({ ...prev, [val]: exceptionsTab }));
                        input.value = '';
                        showToast(`"${val}" adicionado às ${exceptionsTab === 'EXCECAO' ? 'exceções' : exceptionsTab === 'JUIZ' ? 'juízes' : 'autores'}.`, "success");
                      }
                    }}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      {Object.entries(globalKnowledge).filter(([text, type]) => type === exceptionsTab && text.toLowerCase().includes(knowledgeSearch.toLowerCase())).length} Elementos
                    </span>
                    {exceptionsTab === 'JUIZ' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleLoadDefaultJudges}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors bg-indigo-50 px-2 py-1 rounded"
                          title="Carregar lista de juízes padrão do sistema"
                        >
                          <FileText className="w-3 h-3" />
                          Carregar Lista Padrão
                        </button>
                        <label className="cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors bg-gray-50 px-2 py-1 rounded" title="Importar novo ficheiro PDF/TXT de juízes">
                          <Upload className="w-3 h-3" />
                          <span>Importar Novo (PDF/TXT)</span>
                          <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleImportJudges} />
                        </label>
                      </div>
                    )}
                    {exceptionsTab === 'AUTOR' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={handleLoadDefaultAuthors}
                          className="text-xs font-bold text-orange-600 hover:text-orange-800 flex items-center gap-1 transition-colors bg-orange-50 px-2 py-1 rounded"
                          title="Carregar lista de autores padrão do sistema"
                        >
                          <FileText className="w-3 h-3" />
                          Carregar Lista Padrão
                        </button>
                        <label className="cursor-pointer text-xs font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors bg-gray-50 px-2 py-1 rounded" title="Importar novo ficheiro PDF/TXT de autores">
                          <Upload className="w-3 h-3" />
                          <span>Importar Novo (PDF/TXT)</span>
                          <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleImportAuthors} />
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => handleClearGlobalKnowledge(exceptionsTab)}
                      className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Limpar {exceptionsTab === 'EXCECAO' ? 'Exceções' : exceptionsTab === 'JUIZ' ? 'Juízes' : 'Autores'}
                    </button>
                    <button 
                      onClick={handleClearAllGlobalKnowledge}
                      className="text-xs font-bold text-red-700 hover:text-red-900 flex items-center gap-1 transition-colors border-l pl-4 border-gray-200"
                    >
                      <XCircle className="w-3 h-3" />
                      Limpar Tudo
                    </button>
                  </div>
                </div>
                {Object.entries(globalKnowledge).filter(([_, type]) => type === exceptionsTab).length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhum elemento nesta categoria.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(globalKnowledge)
                      .filter(([text, type]) => type === exceptionsTab && text.toLowerCase().includes(knowledgeSearch.toLowerCase()))
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([text, type]) => (
                        <div key={text} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 group">
                          <span className="font-medium">{text}</span>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <select 
                              value={type}
                              onChange={(e) => setGlobalKnowledge(prev => ({ ...prev, [text]: e.target.value }))}
                              className="text-xs bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-indigo-300"
                            >
                              <option value="EXCECAO">Exceção</option>
                              <option value="JUIZ">Juiz</option>
                              <option value="AUTOR">Autor</option>
                            </select>
                            <button 
                              onClick={() => setGlobalKnowledge(prev => {
                                const next = { ...prev };
                                delete next[text];
                                return next;
                              })}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
