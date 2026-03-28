/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  FileText, 
  FileSpreadsheet, 
  File as FileIcon, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Lock,
  ArrowRight,
  X,
  Check,
  Users,
  Eye,
  EyeOff,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Plus,
  ExternalLink,
  Trash2,
  Scissors,
  Layers,
  FileJson,
  History,
  Link,
  FolderOpen
} from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { scanText, applyAnonymization, PIIEntity, generatePseudonym, getNextPseudonym, PII_COLORS } from './lib/anonymizer';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface FileStatus {
  id: string;
  file?: File;
  name: string;
  type: string;
  status: 'idle' | 'scanning' | 'reviewing' | 'processing' | 'completed' | 'error';
  error?: string;
  resultBlob?: Blob;
  size?: number;
}

function DocumentViewer({ file, onAddPII, customTypes = [] }: { file?: File, onAddPII: (text: string, type: string) => void, customTypes?: string[] }) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [selection, setSelection] = useState<{ text: string, x: number, y: number } | null>(null);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    const loadPdf = async () => {
      if (file && file.type === 'application/pdf') {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setPageNumber(1);
        } catch (error) {
          console.error('Error loading PDF:', error);
        }
      }
    };
    loadPdf();
  }, [file]);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;
    
    // Cancel previous render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }
    
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context!,
        viewport: viewport,
      };
      
      const renderTask = page.render(renderContext as any);
      renderTaskRef.current = renderTask;
      
      try {
        await renderTask.promise;
      } catch (error: any) {
        if (error.name === 'RenderingCancelledException') {
          return;
        }
        console.error('Render error:', error);
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      }
    }

    const textLayer = textLayerRef.current;
    if (textLayer) {
      textLayer.innerHTML = '';
      textLayer.style.height = `${viewport.height}px`;
      textLayer.style.width = `${viewport.width}px`;
      
      const textContent = await page.getTextContent();
      const textLayerInstance = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport: viewport
      });
      await textLayerInstance.render();
    }
  }, [pdfDoc]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNumber);
    }
  }, [pdfDoc, pageNumber, renderPage]);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      
      if (containerRect) {
        setSelection({
          text: sel.toString().trim(),
          x: rect.left - containerRect.left + rect.width / 2,
          y: rect.top - containerRect.top - 10
        });
        setShowTypeMenu(true);
      }
    } else {
      setShowTypeMenu(false);
      setSelection(null);
    }
  };

  const addManual = (type: PIIEntity['type']) => {
    if (selection) {
      onAddPII(selection.text, type);
      setSelection(null);
      setShowTypeMenu(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  if (!file) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 h-full flex flex-col items-center justify-center text-slate-400">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-medium">Ficheiro original não carregado.</p>
        <p className="text-xs mt-1">Carregue o ficheiro para ver a pré-visualização.</p>
      </div>
    );
  }

  if (file.type !== 'application/pdf') {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 h-full flex flex-col items-center justify-center text-slate-400">
        <FileText className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-sm font-medium">Pré-visualização disponível apenas para PDF.</p>
        <p className="text-xs mt-1">Word e Excel podem ser anonimizados normalmente.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
      <div className="bg-white border-b border-slate-200 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(p => p - 1)}
            className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-slate-600">
            Página {pageNumber} de {numPages}
          </span>
          <button 
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber(p => p + 1)}
            className="p-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">
            PDF Viewer
          </div>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-8 relative flex justify-center bg-slate-500/10"
        onMouseUp={handleMouseUp}
      >
        <div className="relative shadow-2xl bg-white h-fit">
          <canvas ref={canvasRef} />
          <div 
            ref={textLayerRef} 
            className="textLayer absolute top-0 left-0 opacity-20 pointer-events-auto"
            style={{ mixBlendMode: 'multiply' }}
          />
          
          {showTypeMenu && selection && (
            <div 
              className="absolute z-50 bg-white shadow-2xl rounded-xl border border-slate-200 p-2 flex flex-col gap-1 animate-in fade-in zoom-in duration-200"
              style={{ left: selection.x, top: selection.y, transform: 'translateX(-50%) translateY(-100%)' }}
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase px-2 py-1 mb-1 border-b border-slate-100">
                Anonimizar como:
              </div>
              {[
                { type: 'NOME', label: 'Nome' },
                { type: 'LOCAL', label: 'Morada' },
                { type: 'PHONE', label: 'Telefone' },
                { type: 'NIF', label: 'NIF' },
                { type: 'CC', label: 'CC' },
                { type: 'PASSPORT', label: 'Passaporte' },
                { type: 'AUTOR', label: 'Autor (Exceção)' },
                { type: 'JUIZ', label: 'Juiz (Exceção)' },
                ...customTypes.map(t => ({ type: t, label: t }))
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => addManual(item.type as PIIEntity['type'])}
                  className="text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 px-3 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between group"
                >
                  {item.label}
                  <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface GlobalException {
  id: string;
  text: string;
  type: 'JUIZ' | 'AUTOR' | 'OUTRO';
}

const EntityItem: React.FC<{
  entity: PIIEntity;
  toggleSelect: (id: string) => void;
  toggleEntity: (id: string) => void;
  openRefineModal: (entity: PIIEntity) => Promise<void>;
  addToGlobalExceptions: (text: string, type?: 'JUIZ' | 'AUTOR' | 'OUTRO') => void;
  deleteEntity: (id: string) => void;
  updateOriginal: (id: string, text: string) => void;
}> = ({ entity, toggleSelect, toggleEntity, openRefineModal, addToGlobalExceptions, deleteEntity, updateOriginal }) => (
  <div key={entity.id} className={`p-4 flex items-center gap-3 transition-colors ${entity.ignored ? 'bg-slate-50 opacity-50' : entity.enabled ? 'bg-white' : 'bg-slate-50 opacity-60'}`}>
    <input 
      type="checkbox" 
      checked={entity.selected} 
      onChange={() => toggleSelect(entity.id)}
      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
    />
    
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <button onClick={() => toggleEntity(entity.id)} className={`p-2 rounded-lg transition-colors ${entity.enabled ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-200'}`}>
        {entity.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 overflow-hidden">
          {entity.context && (
            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded uppercase tracking-tighter shrink-0" title="Palavra que precede este elemento">
              {entity.context}
            </span>
          )}
          <p 
            className="font-mono text-xs text-slate-900 truncate font-bold cursor-pointer hover:text-blue-600"
            onClick={() => openRefineModal(entity)}
            title={
              ['PHONE', 'NIF', 'CC', 'PASSPORT', 'IBAN'].includes(entity.type) && (entity.contextBefore || entity.contextAfter)
                ? `Contexto: ...${entity.contextBefore?.slice(-50)}${entity.original}${entity.contextAfter?.slice(0, 50)}...`
                : `Contexto: ${entity.context || 'N/A'}. Clique para refinar seleção`
            }
          >
            {entity.original}
          </p>
          {entity.fileIds && entity.fileIds.length > 1 && (
            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded-md border border-blue-100 shrink-0" title={`Encontrado em ${entity.fileIds.length} ficheiros`}>
              {entity.fileIds.length} DOCS
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${
            entity.type === 'NOME' ? 'bg-blue-50 text-blue-600 border-blue-100' :
            entity.type === 'LOCAL' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            entity.type === 'PHONE' ? 'bg-amber-50 text-amber-600 border-amber-100' :
            entity.type === 'AUTOR' ? 'bg-purple-50 text-purple-600 border-purple-100' :
            entity.type === 'JUIZ' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
            'bg-slate-50 text-slate-600 border-slate-100'
          }`}>
            {entity.type}
          </span>
          {entity.pseudonym && (
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100 truncate max-w-[150px]">
              {entity.pseudonym}
            </span>
          )}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-1">
      <button 
        onClick={() => openRefineModal(entity)}
        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
        title="Refinar seleção de texto"
      >
        <Maximize2 className="w-4 h-4" />
      </button>
      <button 
        onClick={() => addToGlobalExceptions(entity.original, (entity.type === 'JUIZ' || entity.type === 'AUTOR') ? entity.type : 'OUTRO')}
        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
        title="Mandar para exceções globais"
      >
        <Lock className="w-4 h-4" />
      </button>
      <button 
        onClick={() => deleteEntity(entity.id)}
        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
        title="Eliminar permanentemente"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  </div>
);

export default function App() {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [entities, setEntities] = useState<PIIEntity[]>([]);
  const [globalExceptions, setGlobalExceptions] = useState<GlobalException[]>(() => {
    const saved = localStorage.getItem('globalExceptions');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      // Migration for old string[] format
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
        return parsed.map(text => ({
          id: Math.random().toString(36).substring(7),
          text,
          type: 'OUTRO'
        }));
      }
      return parsed;
    } catch (e) {
      return [];
    }
  });
  const [customTypes, setCustomTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem('customTypes');
    return saved ? JSON.parse(saved) : [];
  });
  const [projectType, setProjectType] = useState<'related' | 'unrelated'>('related');
  const [step, setStep] = useState<'upload' | 'review' | 'completed'>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [showExceptionsModal, setShowExceptionsModal] = useState(false);
  const [showConsolidationModal, setShowConsolidationModal] = useState(false);
  const [activeExceptionTab, setActiveExceptionTab] = useState<'JUIZ' | 'AUTOR' | 'OUTRO'>('OUTRO');
  const [isExportingLLM, setIsExportingLLM] = useState(false);
  
  // Refine Modal State
  const [refineEntity, setRefineEntity] = useState<PIIEntity | null>(null);
  const [refineText, setRefineText] = useState('');
  const [refineContext, setRefineContext] = useState({ before: '', after: '' });
  const [similarEntities, setSimilarEntities] = useState<PIIEntity[]>([]);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitIndex, setSplitIndex] = useState<number | null>(null);

  useEffect(() => {
    localStorage.setItem('globalExceptions', JSON.stringify(globalExceptions));
  }, [globalExceptions]);

  useEffect(() => {
    localStorage.setItem('customTypes', JSON.stringify(customTypes));
  }, [customTypes]);

  const clearProject = () => {
    if (confirm('Tem a certeza que deseja limpar todo o projeto atual? Isto removerá todos os ficheiros e entidades identificadas.')) {
      setFiles([]);
      setEntities([]);
      setStep('upload');
      setPreviewFileId(null);
      localStorage.removeItem('filesMetadata');
      localStorage.removeItem('entities');
      localStorage.removeItem('step');
    }
  };

  const clearGlobalExceptions = () => {
    if (confirm('Tem a certeza que deseja limpar todas as exceções globais, autores e juízes?')) {
      setGlobalExceptions([]);
      setCustomTypes([]);
      localStorage.removeItem('globalExceptions');
      localStorage.removeItem('customTypes');
    }
  };

  const previewFile = useMemo(() => files.find(f => f.id === previewFileId), [files, previewFileId]);

  const addToGlobalExceptions = (text: string, type: 'JUIZ' | 'AUTOR' | 'OUTRO' = 'OUTRO') => {
    const exists = globalExceptions.find(e => e.text.toLowerCase() === text.toLowerCase());
    if (!exists) {
      setGlobalExceptions(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        text,
        type
      }]);
      // Also remove from current entities if it exists
      setEntities(prev => prev.filter(e => e.original !== text));
    }
  };

  const removeFromGlobalExceptions = (id: string) => {
    setGlobalExceptions(prev => prev.filter(ex => ex.id !== id));
  };

  const updateGlobalException = (id: string, newText: string) => {
    setGlobalExceptions(prev => prev.map(ex => ex.id === id ? { ...ex, text: newText } : ex));
  };

  const changeGlobalExceptionType = (id: string, newType: 'JUIZ' | 'AUTOR' | 'OUTRO') => {
    setGlobalExceptions(prev => prev.map(ex => ex.id === id ? { ...ex, type: newType } : ex));
  };

  const exportGlobalExceptions = () => {
    const data = { 
      globalExceptions,
      customTypes 
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `excecoes_globais_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importGlobalExceptions = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.globalExceptions) {
          setGlobalExceptions(data.globalExceptions);
        }
        if (data.customTypes) {
          setCustomTypes(data.customTypes);
        }
        alert('Exceções globais importadas com sucesso!');
      } catch (e) {
        alert('Erro ao importar exceções globais. Verifique o ficheiro.');
      }
    };
    reader.readAsText(file);
  };

  const exportProject = () => {
    const data = { 
      entities: entities.map(e => ({
        original: e.original,
        type: e.type,
        pseudonym: e.pseudonym,
        enabled: e.enabled,
        ignored: e.ignored,
        context: e.context,
        groupId: e.groupId,
        treated: e.treated
      })),
      projectType,
      filesMetadata: files.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projeto_anonimizacao_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.entities) {
          const newEntities = data.entities.map((ent: any) => ({
            id: Math.random().toString(36).substring(7),
            ...ent
          }));
          setEntities(newEntities);
        }
        if (data.projectType) {
          setProjectType(data.projectType);
        }
        if (data.filesMetadata) {
          setFiles(data.filesMetadata.map((f: any) => ({
            ...f,
            status: 'reviewing'
          })));
        }
        setStep('review');
        alert('Projeto importado com sucesso! Lembre-se que precisa de carregar os ficheiros originais se quiser gerar as versões anonimizadas.');
      } catch (e) {
        alert('Erro ao importar projeto. Verifique o ficheiro.');
      }
    };
    reader.readAsText(file);
  };

  const exportProjectProfile = () => {
    const data = { 
      entities: entities.map(e => ({
        original: e.original,
        type: e.type,
        pseudonym: e.pseudonym,
        enabled: e.enabled,
        ignored: e.ignored,
        context: e.context
      })),
      globalExceptions,
      customTypes 
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perfil_processo_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importProjectProfile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.entities) {
          const newEntities = data.entities.map((ent: any) => ({
            id: Math.random().toString(36).substring(7),
            fileIds: [],
            ...ent,
            treated: true
          }));
          setEntities(prev => {
            const merged = [...prev];
            newEntities.forEach((ne: any) => {
              if (!merged.some(me => me.original.toLowerCase() === ne.original.toLowerCase())) {
                merged.push(ne);
              }
            });
            return merged;
          });
        }
        if (data.globalExceptions) {
          const formatted = data.globalExceptions.map((ex: any) => {
            if (typeof ex === 'string') return { id: Math.random().toString(36).substring(7), text: ex, type: 'OUTRO' };
            return { id: ex.id || Math.random().toString(36).substring(7), text: ex.text, type: ex.type || 'OUTRO' };
          });
          setGlobalExceptions(formatted);
        }
        if (data.customTypes) setCustomTypes(data.customTypes);
        alert('Perfil do processo importado com sucesso!');
      } catch (err) {
        alert('Erro ao importar ficheiro.');
      }
    };
    reader.readAsText(file);
  };

  const exportForLLM = async () => {
    if (isExportingLLM) return;
    setIsExportingLLM(true);
    
    try {
      const zip = new JSZip();
      const glossary: string[] = ["# Glossário de Contexto para LLM\n"];
      glossary.push("Este documento contém a correspondência entre as siglas de anonimização e o seu papel no processo.\n");
      
      const sortedEntities = [...entities]
        .filter(e => e.enabled && !e.ignored && e.type !== 'AUTOR' && e.type !== 'JUIZ')
        .sort((a, b) => a.pseudonym.localeCompare(b.pseudonym));

      const uniquePseudonyms = new Map<string, PIIEntity>();
      sortedEntities.forEach(e => {
        if (!uniquePseudonyms.has(e.pseudonym)) {
          uniquePseudonyms.set(e.pseudonym, e);
        }
      });

      glossary.push("## Entidades Anonimizadas\n");
      uniquePseudonyms.forEach((entity, pseudonym) => {
        let role = "Entidade";
        if (entity.type === 'NOME') role = "Pessoa/Entidade";
        else if (entity.type === 'LOCAL') role = "Localização/Morada";
        else if (entity.type === 'EMAIL') role = "Contacto de Email";
        else if (entity.type === 'PHONE') role = "Contacto Telefónico";
        else if (entity.type === 'NIF') role = "Número de Identificação Fiscal";
        
        glossary.push(`- **${pseudonym}**: ${role}`);
      });

      glossary.push("\n## Instruções para o LLM\n");
      glossary.push("1. Utilize as siglas (ex: NOME.AA) como identificadores persistentes.");
      glossary.push("2. Mantenha a consistência das relações entre as entidades conforme descrito nos documentos.");
      glossary.push("3. Não tente adivinhar os nomes reais; foque-se na lógica e nos factos do processo.");

      zip.file("GLOSSARIO_CONTEXTO.md", glossary.join("\n"));

      // Process each file and add to zip
      for (const fileStatus of files) {
        try {
          let blobToUse = fileStatus.resultBlob;
          
          if (!blobToUse && fileStatus.file) {
            // Generate anonymized blob on the fly if missing
            blobToUse = await generateAnonymizedBlob(fileStatus, entities);
          }

          if (blobToUse) {
            zip.file(`anonimizado_${fileStatus.name}`, blobToUse);
          } else {
            zip.file(`original_${fileStatus.name}`, fileStatus.file);
          }
        } catch (err) {
          console.error(`Erro ao processar ${fileStatus.name} para LLM:`, err);
          zip.file(`original_${fileStatus.name}`, fileStatus.file);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exportacao_llm_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro na exportação para LLM:", error);
      alert("Ocorreu um erro ao gerar o ficheiro para LLM. Por favor, verifique se os documentos foram processados corretamente.");
    } finally {
      setIsExportingLLM(false);
    }
  };

  const commonEntities = useMemo(() => {
    return entities.filter(e => e.fileIds && e.fileIds.length > 1 && e.enabled && !e.ignored);
  }, [entities]);

  const openRefineModal = async (entity: PIIEntity) => {
    setRefineEntity(entity);
    setRefineText(entity.original);
    setIsSplitMode(false);
    setSplitIndex(null);
    
    // Find similar entities with more relaxed logic
    const words = entity.original.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const similar = entities.filter(e => {
      if (e.id === entity.id || e.ignored) return false;
      
      // If unrelated, only suggest if they share at least one file
      if (projectType !== 'related') {
        const commonFiles = entity.fileIds?.filter(fid => e.fileIds?.includes(fid));
        if (!commonFiles || commonFiles.length === 0) return false;
      }

      const eLower = e.original.toLowerCase();
      const entityLower = entity.original.toLowerCase();
      
      // Exact substring match
      if (eLower.includes(entityLower) || entityLower.includes(eLower)) return true;
      
      // Word overlap match (at least 2 words or 50% of words)
      const eWords = eLower.split(/\s+/);
      const overlap = words.filter(w => eWords.includes(w));
      return overlap.length >= 2 || (words.length > 0 && overlap.length / words.length >= 0.5);
    });
    setSimilarEntities(similar);
    
    // Use stored context if available
    if (entity.contextBefore || entity.contextAfter) {
      setRefineContext({
        before: entity.contextBefore || '',
        after: entity.contextAfter || ''
      });
      return;
    }

    // Fallback: Try to find context in the current preview file
    if (previewFile) {
      try {
        let fullText = "";
        const extension = previewFile.name.split('.').pop()?.toLowerCase();
        if (extension === 'pdf') {
          const arrayBuffer = await previewFile.file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map((item: any) => item.str).join(" ");
          }
        }
        
        const index = fullText.indexOf(entity.original);
        if (index !== -1) {
          setRefineContext({
            before: fullText.substring(Math.max(0, index - 200), index),
            after: fullText.substring(index + entity.original.length, Math.min(fullText.length, index + entity.original.length + 200))
          });
        }
      } catch (e) {
        console.error("Context error", e);
      }
    }
  };

  const saveRefine = () => {
    if (refineEntity) {
      setEntities(prev => prev.map(e => {
        if (e.id === refineEntity.id) {
          // If type changed, regenerate pseudonym
          const typeChanged = e.type !== refineEntity.type;
          let newPseudonym = refineEntity.pseudonym;
          if (typeChanged) {
            newPseudonym = getNextPseudonym(refineEntity.type, prev);
          }
          return { ...refineEntity, original: refineText, pseudonym: newPseudonym, treated: true };
        }
        return e;
      }));
      setRefineEntity(null);
    }
  };

  const splitRefine = (delimiter: string) => {
    if (!refineEntity || !refineText.includes(delimiter)) return;
    
    const parts = refineText.split(delimiter).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length < 2) return;

    setEntities(prev => {
      const filtered = prev.filter(e => e.id !== refineEntity.id);
      const newEntities = parts.map((part, idx) => {
        const tempEntities = [...filtered, ...parts.slice(0, idx).map((p, i) => ({ ...refineEntity, id: `temp-${i}`, original: p, pseudonym: '' }))];
        return {
          ...refineEntity,
          id: Math.random().toString(36).substring(7),
          original: part,
          pseudonym: getNextPseudonym(refineEntity.type, tempEntities)
        };
      });
      return [...filtered, ...newEntities];
    });
    setRefineEntity(null);
  };

  const manualSplit = () => {
    setIsSplitMode(true);
    setSplitIndex(null);
  };

  const confirmSplit = () => {
    if (!refineEntity || splitIndex === null) return;
    
    const tokens = refineText.match(/[^\s.,;:!?()\[\]{}/]+|[.,;:!?()\[\]{}/]/g) || [];
    
    const joinTokens = (tks: string[]) => {
      return tks.reduce((acc, token, i) => {
        if (i === 0) return token;
        if (/[.,;:!?()\]}]/.test(token)) return acc + token;
        return acc + ' ' + token;
      }, '');
    };

    const part1 = joinTokens(tokens.slice(0, splitIndex));
    const part2 = joinTokens(tokens.slice(splitIndex));
    
    setEntities(prev => {
      const filtered = prev.filter(e => e.id !== refineEntity.id);
      const newEntities = [part1, part2].map((part, idx) => {
        const tempEntities = [...filtered, ...idx === 1 ? [{ ...refineEntity, id: 'temp-0', original: part1, pseudonym: '' }] : []];
        return {
          ...refineEntity,
          id: Math.random().toString(36).substring(7),
          original: part.trim(),
          pseudonym: getNextPseudonym(refineEntity.type, tempEntities)
        };
      });
      return [...filtered, ...newEntities];
    });
    setRefineEntity(null);
    setIsSplitMode(false);
  };

  const mergeWithSimilar = (target: PIIEntity) => {
    if (!refineEntity) return;
    setEntities(prev => prev.map(e => 
      e.id === refineEntity.id ? { 
        ...e, 
        pseudonym: target.pseudonym, 
        type: target.type,
        groupId: target.groupId || `group-${Math.random().toString(36).substring(7)}`,
        treated: true 
      } : 
      e.id === target.id ? { 
        ...e, 
        groupId: e.groupId || `group-${Math.random().toString(36).substring(7)}`,
        treated: true 
      } : e
    ));
    // Remove from suggestions
    setSimilarEntities(prev => prev.filter(s => s.id !== target.id));
    setRefineEntity(null);
  };

  const cleanAndMerge = (similar: PIIEntity) => {
    if (!refineEntity) return;
    setEntities(prev => prev.map(e => {
      if (e.id === similar.id) {
        return { ...e, original: refineText, pseudonym: refineEntity.pseudonym, treated: true };
      }
      if (e.id === refineEntity.id) {
        return { ...e, treated: true };
      }
      return e;
    }));
    // Remove from suggestions
    setSimilarEntities(prev => prev.filter(s => s.id !== similar.id));
  };

  const switchRefine = (entity: PIIEntity) => {
    openRefineModal(entity);
  };

  const expandSelection = (side: 'before' | 'after') => {
    if (side === 'before') {
      const context = refineContext.before.trimEnd();
      if (context.length === 0) return;
      
      const lastChar = context[context.length - 1];
      if (/[.,;:!?()\[\]{}/]/.test(lastChar)) {
        setRefineText(prev => lastChar + prev);
        setRefineContext(prev => ({
          ...prev,
          before: prev.before.slice(0, prev.before.lastIndexOf(lastChar))
        }));
        return;
      }

      const words = context.split(/\s+/);
      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        setRefineText(prev => lastWord + ' ' + prev);
        setRefineContext(prev => ({
          ...prev,
          before: prev.before.substring(0, prev.before.lastIndexOf(lastWord))
        }));
      }
    } else {
      const context = refineContext.after.trimStart();
      if (context.length === 0) return;

      const firstChar = context[0];
      if (/[.,;:!?()\[\]{}/]/.test(firstChar)) {
        setRefineText(prev => prev + firstChar);
        setRefineContext(prev => ({
          ...prev,
          after: prev.after.slice(prev.after.indexOf(firstChar) + 1)
        }));
        return;
      }

      const words = context.split(/\s+/);
      if (words.length > 0) {
        const firstWord = words[0];
        setRefineText(prev => prev + ' ' + firstWord);
        setRefineContext(prev => ({
          ...prev,
          after: prev.after.substring(prev.after.indexOf(firstWord) + firstWord.length)
        }));
      }
    }
  };

  const shrinkSelection = (side: 'start' | 'end') => {
    const text = refineText.trim();
    if (text.length <= 1) return;

    if (side === 'end') {
      const lastChar = text[text.length - 1];
      if (/[.,;:!?()\[\]{}/]/.test(lastChar)) {
        setRefineText(prev => prev.trim().slice(0, -1).trim());
        setRefineContext(prev => ({
          ...prev,
          after: lastChar + prev.after
        }));
        return;
      }

      const words = text.split(/\s+/);
      if (words.length > 1) {
        const lastWord = words[words.length - 1];
        setRefineText(prev => prev.trim().slice(0, -lastWord.length).trim());
        setRefineContext(prev => ({
          ...prev,
          after: ' ' + lastWord + prev.after
        }));
      } else {
        // Single word: shrink by one character
        const lastChar = text[text.length - 1];
        setRefineText(prev => prev.slice(0, -1));
        setRefineContext(prev => ({
          ...prev,
          after: lastChar + prev.after
        }));
      }
    } else {
      const firstChar = text[0];
      if (/[.,;:!?()\[\]{}/]/.test(firstChar)) {
        setRefineText(prev => prev.trim().slice(1).trim());
        setRefineContext(prev => ({
          ...prev,
          before: prev.before + firstChar
        }));
        return;
      }

      const words = text.split(/\s+/);
      if (words.length > 1) {
        const firstWord = words[0];
        setRefineText(prev => prev.trim().slice(firstWord.length).trim());
        setRefineContext(prev => ({
          ...prev,
          before: prev.before + firstWord + ' '
        }));
      } else {
        // Single word: shrink by one character
        const firstChar = text[0];
        setRefineText(prev => prev.slice(1));
        setRefineContext(prev => ({
          ...prev,
          before: prev.before + firstChar
        }));
      }
    }
  };

  const changeEntityType = (id: string, newType: string) => {
    setEntities(prev => prev.map(e => {
      if (e.id === id) {
        // If it's an exception type, add to global exceptions
        if (newType === 'AUTOR' || newType === 'JUIZ') {
          const exists = globalExceptions.find(ge => ge.text.toLowerCase() === e.original.toLowerCase());
          if (!exists) {
            addToGlobalExceptions(e.original, newType as any);
          }
        }

        const typeEntities = prev.filter(ent => ent.type === newType);
        return { 
          ...e, 
          type: newType, 
          pseudonym: getNextPseudonym(newType, prev),
          ignored: newType === 'AUTOR' || newType === 'JUIZ'
        };
      }
      return e;
    }));
  };

  const addNewType = () => {
    const name = prompt('Nome do novo tipo de dado (ex: EMPRESA):');
    if (name && !customTypes.includes(name.toUpperCase())) {
      setCustomTypes(prev => [...prev, name.toUpperCase()]);
    }
  };

  const addManualPII = (text: string, type: PIIEntity['type']) => {
    // Trim trailing punctuation (comma, semicolon, period)
    const trimmedText = text.replace(/[.,;]+$/, '').trim();
    if (!trimmedText) return;

    const lower = trimmedText.toLowerCase();
    const exists = entities.find(e => e.original.toLowerCase() === lower);
    
    // If it's an exception type, add to global exceptions
    if (type === 'AUTOR' || type === 'JUIZ') {
      const exists = globalExceptions.find(ge => ge.text.toLowerCase() === trimmedText.toLowerCase());
      if (!exists) {
        addToGlobalExceptions(trimmedText, type as any);
      }
    }

    if (exists) {
      setEntities(prev => prev.map(e => 
        e.original.toLowerCase() === lower ? { ...e, original: trimmedText, enabled: true, ignored: false } : e
      ));
      return;
    }

    const pseudonym = getNextPseudonym(type, entities);
    
    const newEntity: PIIEntity = {
      id: Math.random().toString(36).substring(7),
      original: trimmedText,
      type,
      pseudonym,
      enabled: true,
      selected: false,
      ignored: type === 'AUTOR' || type === 'JUIZ'
    };

    setEntities(prev => [...prev, newEntity]);
  };

  const toggleTreated = (id: string) => {
    setEntities(prev => prev.map(e => 
      e.id === id ? { ...e, treated: !e.treated } : e
    ));
  };

  const [showTreated, setShowTreated] = useState(false);

  const filteredEntities = useMemo(() => {
    return entities.filter(e => {
      if (!showTreated && e.treated) return false;
      if (showTreated && !e.treated) return false;
      
      // Hide entities that are in a group and not yet treated (they show in the group block)
      if (!showTreated && e.groupId) {
        const groupMembers = entities.filter(m => m.groupId === e.groupId && !m.treated && !m.ignored);
        if (groupMembers.length > 1) return false;
      }

      const matchesType = filterType === 'ALL' || e.type === filterType;
      const matchesSearch = e.original.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           e.pseudonym.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [entities, filterType, searchTerm, showTreated]);

  const entitiesByFile = useMemo(() => {
    if (projectType === 'related') return null;
    const groups: Record<string, PIIEntity[]> = {};
    entities.forEach(e => {
      const fileId = e.fileIds?.[0];
      if (fileId) {
        if (!groups[fileId]) groups[fileId] = [];
        groups[fileId].push(e);
      }
    });
    return groups;
  }, [entities, projectType]);

  const selectedCount = useMemo(() => entities.filter(e => e.selected).length, [entities]);

  const mergeSelected = () => {
    const selected = entities.filter(e => e.selected);
    if (selected.length < 2) return;

    const firstPseudonym = selected[0].pseudonym;
    setEntities(prev => prev.map(e => 
      e.selected ? { ...e, pseudonym: firstPseudonym, selected: false, treated: true } : e
    ));
  };

  const toggleSelect = (id: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, selected: !e.selected } : e));
  };

  const toggleIgnored = (id: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, ignored: !e.ignored, enabled: e.ignored ? true : false } : e));
  };

  const groupedEntities = useMemo(() => {
    const groups: Record<string, PIIEntity[]> = {};
    entities.forEach(e => {
      if (e.groupId && !e.treated && !e.ignored) {
        if (!groups[e.groupId]) groups[e.groupId] = [];
        groups[e.groupId].push(e);
      }
    });
    // Only return groups with more than 1 member
    return Object.entries(groups).filter(([_, members]) => members.length > 1);
  }, [entities]);

  const removeFromGroup = (id: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, groupId: undefined } : e));
  };

  const deleteEntity = (id: string) => {
    setEntities(prev => prev.filter(e => e.id !== id));
  };

  const updateGroupPseudonym = (groupId: string, newPseudonym: string) => {
    setEntities(prev => prev.map(e => e.groupId === groupId ? { ...e, pseudonym: newPseudonym } : e));
  };

  const saveGroup = (groupId: string) => {
    setEntities(prev => prev.map(e => e.groupId === groupId ? { ...e, treated: true } : e));
  };

  const disableGroupAnonymization = (groupId: string) => {
    setEntities(prev => prev.map(e => e.groupId === groupId ? { ...e, enabled: false, treated: true } : e));
  };

  const sendGroupToExceptions = (groupId: string) => {
    const groupMembers = entities.filter(e => e.groupId === groupId);
    const textsToRemove = new Set(groupMembers.map(m => m.original.toLowerCase()));
    
    const newExceptions = groupMembers.map(member => ({
      id: Math.random().toString(36).substring(7),
      text: member.original,
      type: (member.type === 'JUIZ' || member.type === 'AUTOR') ? member.type : 'OUTRO' as any
    })).filter(ne => !globalExceptions.some(ge => ge.text.toLowerCase() === ne.text.toLowerCase()));

    if (newExceptions.length > 0) {
      setGlobalExceptions(prev => [...prev, ...newExceptions]);
    }
    setEntities(prev => prev.filter(e => !textsToRemove.has(e.original.toLowerCase())));
  };

  const deleteGroup = (groupId: string) => {
    if (confirm('Tem a certeza que deseja eliminar todos os elementos deste grupo?')) {
      setEntities(prev => prev.filter(e => e.groupId !== groupId));
    }
  };

  const scanFiles = async (newFiles: File[]) => {
    setStep('review');
    let allEntities: PIIEntity[] = [...entities];
    let currentFiles = [...files];

    for (const file of newFiles) {
      // Check if this file was already imported via JSON (exists in files but has no File object)
      const existingFileIndex = currentFiles.findIndex(f => f.name === file.name && !f.file);
      
      let id: string;
      if (existingFileIndex !== -1) {
        id = currentFiles[existingFileIndex].id;
        currentFiles[existingFileIndex] = {
          ...currentFiles[existingFileIndex],
          file,
          status: 'scanning'
        };
      } else {
        id = Math.random().toString(36).substring(7);
        const fileStatus: FileStatus = {
          id,
          file,
          name: file.name,
          type: file.type || file.name.split('.').pop() || 'unknown',
          status: 'scanning'
        };
        currentFiles.push(fileStatus);
      }
      
      if (!previewFileId) setPreviewFileId(id);
      setFiles([...currentFiles]);

      try {
        let text = "";
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'docx') {
          const arrayBuffer = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          const docXml = await zip.file("word/document.xml")?.async("string");
          if (docXml) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(docXml, "application/xml");
            text = xmlDoc.documentElement.textContent || "";
          }
        } else if (extension === 'xlsx' || extension === 'xls') {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);
          workbook.SheetNames.forEach(name => {
            const sheet = workbook.Sheets[name];
            text += XLSX.utils.sheet_to_txt(sheet);
          });
        } else if (extension === 'pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => item.str).join(" ");
          }
        }

        const scannedEntities = scanText(text, allEntities, globalExceptions.map(e => e.text), id, projectType === 'related');
        
        // Automatically add auto-detected JUIZ/AUTOR to global exceptions
        const newExceptions = scannedEntities
          .filter(e => (e.type === 'AUTOR' || e.type === 'JUIZ'))
          .filter(e => !globalExceptions.some(ge => ge.text.toLowerCase() === e.original.toLowerCase()))
          .map(e => ({
            id: Math.random().toString(36).substring(7),
            text: e.original,
            type: e.type as 'JUIZ' | 'AUTOR'
          }));
          
        if (newExceptions.length > 0) {
          setGlobalExceptions(prev => {
            const updated = [...prev];
            newExceptions.forEach(ex => {
              if (!updated.some(u => u.text.toLowerCase() === ex.text.toLowerCase())) {
                updated.push(ex);
              }
            });
            return updated;
          });
        }

        allEntities = scannedEntities;
        setEntities([...allEntities]);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'reviewing' } : f));
      } catch (error: any) {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: error.message } : f));
      }
    }
  };

  const sanitizeForPdf = (text: string) => {
    return text
      .replace(/\u2011/g, '-') // Non-breaking hyphen
      .replace(/[\u2012\u2013\u2014\u2015]/g, '-') // Various dashes
      .replace(/[\u2018\u2019]/g, "'") // Smart single quotes
      .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
      .replace(/\u00A0/g, ' ') // Non-breaking space
      .replace(/[^\x00-\x7F\xA0-\xFF]/g, ' '); // Replace anything outside ASCII and ISO-8859-1 with space
  };

  const generateAnonymizedBlob = async (fileStatus: FileStatus, currentEntities: PIIEntity[]) => {
    const extension = fileStatus.name.split('.').pop()?.toLowerCase();
    const file = fileStatus.file;
    let resultBlob: Blob;

    if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (!docXml) throw new Error("Documento Word inválido");

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(docXml, "application/xml");
      const textNodes = xmlDoc.getElementsByTagName("w:t");
      for (let i = 0; i < textNodes.length; i++) {
        const node = textNodes[i];
        if (node.textContent) {
          node.textContent = applyAnonymization(node.textContent, currentEntities);
        }
      }
      const serializer = new XMLSerializer();
      zip.file("word/document.xml", serializer.serializeToString(xmlDoc));
      resultBlob = await zip.generateAsync({ type: "blob" });
    } else if (extension === 'xlsx' || extension === 'xls') {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
            if (cell && cell.t === 's' && typeof cell.v === 'string') {
              cell.v = applyAnonymization(cell.v, currentEntities);
            }
          }
        }
      });
      const outBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      resultBlob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } else if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const outPdf = await PDFDocument.create();
      
      let font;
      try {
        const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/v2/Roboto-Regular.ttf';
        const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
        font = await outPdf.embedFont(fontBytes);
      } catch (e) {
        font = await outPdf.embedFont(StandardFonts.Helvetica);
      }

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      for (let i = 0; i < pdf.numPages; i++) {
        const pdfPage = await pdf.getPage(i + 1);
        const scale = 4.0;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await pdfPage.render({ canvasContext: context, viewport } as any).promise;
        
        const textContent = await pdfPage.getTextContent();
        const filteredEntities = currentEntities.filter(e => e.enabled && !e.ignored);
        const pageItems = textContent.items as any[];
        
        pageItems.forEach(item => {
          const str = item.str;
          if (!str || !str.trim()) return;

          const fontSize = Math.abs(item.transform[0]) * scale;
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const x = tx[4];
          const y = tx[5];
          const itemWidth = item.width * scale;
          
          filteredEntities.forEach(entity => {
            const searchStr = str.toLowerCase().replace(/\s+/g, ' ').trim();
            const searchTarget = entity.original.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!searchStr || !searchTarget) return;

            const targetWords = searchTarget.split(' ');
            let isMatch = false;
            let matchOffset = 0;
            let matchWidth = itemWidth;

            if (searchStr.includes(searchTarget)) {
              isMatch = true;
              const pos = searchStr.indexOf(searchTarget);
              const ratio = pos / searchStr.length;
              matchOffset = itemWidth * ratio;
              matchWidth = (searchTarget.length / searchStr.length) * itemWidth;
            } else if (targetWords.includes(searchStr)) {
              isMatch = true;
              matchOffset = 0;
              matchWidth = itemWidth;
            } else if (searchTarget.includes(searchStr) && searchStr.length > 3) {
              isMatch = true;
              matchOffset = 0;
              matchWidth = itemWidth;
            }

            if (isMatch) {
              const colorConfig = PII_COLORS[entity.type] || PII_COLORS.DEFAULT;
              const [r, g, b] = colorConfig.bg;
              const rectHeight = fontSize * 1.6; 
              const rectY = y - (fontSize * 1.1);
              const pillX = x + matchOffset - 2;
              const pillW = matchWidth + 4;
              const radius = rectHeight / 2;
              
              context.fillStyle = `rgb(${r*255}, ${g*255}, ${b*255})`;
              context.beginPath();
              context.roundRect(pillX, rectY, pillW, rectHeight, radius);
              context.fill();

              if (pillW > 20) {
                context.fillStyle = 'black';
                const displayFontSize = Math.max(fontSize * 0.65, 8);
                context.font = `bold ${displayFontSize}px sans-serif`;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                let displayText = entity.pseudonym;
                if (context.measureText(displayText).width > pillW - 4) {
                  if (displayText.startsWith('NOME.')) displayText = displayText.replace('NOME.', '');
                }
                context.fillText(displayText, pillX + pillW/2, rectY + rectHeight/2 + 1);
              }
            }
          });
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const img = await outPdf.embedJpg(imgData);
        const page = outPdf.addPage([viewport.width / scale, viewport.height / scale]);
        page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });

        pageItems.forEach(item => {
          const rawStr = item.str;
          let processedStr = rawStr;
          filteredEntities.forEach(entity => {
            processedStr = processedStr.split(entity.original).join(entity.pseudonym);
          });
          const sanitizedStr = sanitizeForPdf(processedStr);
          const fontSize = Math.abs(item.transform[0]);
          const x = item.transform[4];
          const y = item.transform[5];
          if (sanitizedStr.trim()) {
            page.drawText(sanitizedStr, {
              x, y,
              size: fontSize > 0 ? fontSize : 10,
              font,
              color: rgb(0, 0, 0),
              opacity: 0,
            });
          }
        });
        canvas.width = 0;
        canvas.height = 0;
      }
      const pdfBytes = await outPdf.save();
      resultBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    } else {
      throw new Error("Formato não suportado");
    }
    return resultBlob;
  };

  const processFiles = async () => {
    setStep('completed');
    setFiles(prev => prev.map(f => ({ ...f, status: 'processing' })));
    const filesToProcess = [...files];
    
    for (const fileStatus of filesToProcess) {
      if (fileStatus.status === 'error') continue;
      try {
        const resultBlob = await generateAnonymizedBlob(fileStatus, entities);
        setFiles(prev => prev.map(f => f.id === fileStatus.id ? { ...f, status: 'completed', resultBlob } : f));
      } catch (error: any) {
        setFiles(prev => prev.map(f => f.id === fileStatus.id ? { ...f, status: 'error', error: error.message } : f));
      }
    }
  };

  const toggleEntity = (id: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e));
  };

  const updatePseudonym = (id: string, newPseudonym: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, pseudonym: newPseudonym } : e));
  };

  const updateOriginal = (id: string, newOriginal: string) => {
    setEntities(prev => prev.map(e => e.id === id ? { ...e, original: newOriginal } : e));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files) as File[];
    scanFiles(droppedFiles);
  }, [entities]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      scanFiles(Array.from(e.target.files));
    }
  };

  const isInitialMount = useRef(true);

  // Persistence
  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  const downloadFile = (file: FileStatus) => {
    if (!file.resultBlob) return;
    const url = URL.createObjectURL(file.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anonimizado_${file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFiles([]);
    setStep('upload');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans selection:bg-blue-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="w-full mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900">AnonimizaLocal</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full border border-green-100 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" />
              PROCESSAMENTO LOCAL
            </div>
            {step !== 'upload' && (
              <button onClick={reset} className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1">
                <X className="w-4 h-4" /> Cancelar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="w-full mx-auto px-6 py-12">
        {step === 'upload' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-12 text-center max-w-2xl mx-auto">
              <h2 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                Anonimização Inteligente
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                Selecione o tipo de projeto para começar a detetar dados sensíveis.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
              <button 
                onClick={() => {
                  setProjectType('related');
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = '.docx,.xlsx,.xls,.pdf';
                  input.onchange = (e) => {
                    const files = Array.from((e.target as HTMLInputElement).files || []);
                    if (files.length > 0) scanFiles(files);
                  };
                  input.click();
                }}
                className="group p-8 bg-white border-2 border-slate-200 rounded-3xl hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left flex flex-col gap-4"
              >
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Link className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Documentos Relacionados</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Ideal para processos com vários documentos sobre o mesmo caso. Os elementos são agrupados entre todos os ficheiros.
                  </p>
                </div>
              </button>

              <button 
                onClick={() => {
                  setProjectType('unrelated');
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = '.docx,.xlsx,.xls,.pdf';
                  input.onchange = (e) => {
                    const files = Array.from((e.target as HTMLInputElement).files || []);
                    if (files.length > 0) scanFiles(files);
                  };
                  input.click();
                }}
                className="group p-8 bg-white border-2 border-slate-200 rounded-3xl hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left flex flex-col gap-4"
              >
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-8 h-8 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Documentos Sem Relação</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    Ideal para anonimizar vários documentos independentes ao mesmo tempo. Os agrupamentos são feitos apenas dentro de cada documento.
                  </p>
                </div>
              </button>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) importProject(file);
                    };
                    input.click();
                  }}
                  className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 font-bold shadow-sm"
                >
                  <FolderOpen className="w-5 h-5" /> Importar Projeto (JSON)
                </button>
                <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) importGlobalExceptions(file);
                    };
                    input.click();
                  }}
                  className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 font-bold shadow-sm"
                >
                  <Upload className="w-5 h-5" /> Importar Exceções Globais
                </button>
              </div>
              
              <div 
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const droppedFiles = Array.from(e.dataTransfer.files) as File[];
                  if (droppedFiles.length > 0) {
                    // Default to related if dropped directly
                    setProjectType('related');
                    scanFiles(droppedFiles);
                  }
                }}
                className={`
                  w-full max-w-4xl border-2 border-dashed rounded-3xl p-12 transition-all duration-300
                  flex flex-col items-center justify-center gap-4
                  ${isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'}
                `}
              >
                <p className="text-slate-500 font-medium">Ou arraste ficheiros aqui para começar (Relacionados)</p>
              </div>
            </div>
          </motion.div>
        )}

        {step === 'review' && (
          <div className="flex flex-col gap-8 h-[calc(100vh-160px)]">
            {files.some(f => !f.file) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3 text-amber-800">
                  <div className="bg-amber-100 p-2 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Projeto Importado: Ficheiros em falta</p>
                    <p className="text-xs text-amber-700">Alguns ficheiros originais não estão carregados. Carregue-os para pré-visualizar e processar.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.onchange = (e) => {
                      const newFiles = Array.from((e.target as HTMLInputElement).files || []);
                      if (newFiles.length > 0) scanFiles(newFiles);
                    };
                    input.click();
                  }}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all shadow-sm flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" /> Carregar Ficheiros Originais
                </button>
              </div>
            )}
            <div className="grid lg:grid-cols-12 gap-8 flex-1 min-h-0">
              <div className="lg:col-span-5 flex flex-col gap-6 min-h-0">
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg flex items-center gap-2 text-slate-900">
                        <Users className="w-5 h-5 text-blue-600" />
                        Elementos Detetados ({entities.length})
                      </h3>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setShowExceptionsModal(true)}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 text-xs font-bold"
                          title="Gerir Exceções Globais"
                        >
                          <Lock className="w-4 h-4" /> Configurações
                        </button>
                        <button 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.multiple = true;
                            input.onchange = (e) => {
                              const newFiles = Array.from((e.target as HTMLInputElement).files || []);
                              if (newFiles.length > 0) scanFiles(newFiles);
                            };
                            input.click();
                          }}
                          className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-2 text-xs font-bold"
                          title="Adicionar mais documentos ao projeto"
                        >
                          <Plus className="w-4 h-4" /> Adicionar Documentos
                        </button>
                        <button 
                          onClick={exportProject}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 text-xs font-bold"
                          title="Exportar Projeto Completo (JSON)"
                        >
                          <Download className="w-4 h-4" /> Exportar Projeto
                        </button>
                        <button 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.json';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) importProject(file);
                            };
                            input.click();
                          }}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 text-xs font-bold"
                          title="Importar Projeto Completo (JSON)"
                        >
                          <Upload className="w-4 h-4" /> Importar Projeto
                        </button>
                        <button 
                          onClick={clearProject}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2 text-xs font-bold"
                          title="Limpar todos os dados do projeto atual"
                        >
                          <Trash2 className="w-4 h-4" /> Limpar Projeto
                        </button>
                        {selectedCount > 1 && (
                          <button 
                            onClick={mergeSelected}
                            className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-sm"
                          >
                            <Users className="w-3.5 h-3.5" /> Unir ({selectedCount})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <input 
                          type="checkbox" 
                          id="showTreated"
                          checked={showTreated} 
                          onChange={(e) => setShowTreated(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor="showTreated" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                          Ver Tratados ({entities.filter(e => e.treated).length})
                        </label>
                      </div>
                      <div className="flex-1 min-w-[140px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Pesquisar..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <select 
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="ALL">Todos</option>
                        <option value="NOME">Nomes</option>
                        <option value="LOCAL">Moradas</option>
                        <option value="PHONE">Telefones</option>
                        <option value="NIF">NIF</option>
                        <option value="CC">CC</option>
                        <option value="PASSPORT">Passaporte</option>
                        <option value="AUTOR">Autores</option>
                        <option value="JUIZ">Juízes</option>
                        {customTypes.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button 
                        onClick={addNewType}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                        title="Adicionar novo tipo"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                    {projectType === 'related' ? (
                      <>
                        {groupedEntities.length > 0 && !showTreated && (
                          <div className="p-4 space-y-4 bg-blue-50/50 border-b border-blue-100">
                            <div className="flex items-center gap-2 text-blue-700 font-bold text-[10px] uppercase tracking-widest">
                              <Layers className="w-3.5 h-3.5" />
                              Grupos de Nomes para Verificação
                            </div>
                            {groupedEntities.map(([groupId, members]) => (
                              <div key={groupId} className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                  <div className="flex-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Sigla Comum</label>
                                    <input 
                                      type="text" 
                                      value={members[0].pseudonym} 
                                      onChange={(e) => updateGroupPseudonym(groupId, e.target.value)}
                                      className="w-full bg-blue-50 border-none rounded-lg px-3 py-2 text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 mt-5">
                                    <button 
                                      onClick={() => saveGroup(groupId)}
                                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-2"
                                      title="Validar todos os elementos com a sigla acima"
                                    >
                                      <Check className="w-4 h-4" /> Validar
                                    </button>
                                    <button 
                                      onClick={() => disableGroupAnonymization(groupId)}
                                      className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
                                      title="Desativar anonimização para todos os elementos deste grupo"
                                    >
                                      <EyeOff className="w-4 h-4" /> Ignorar
                                    </button>
                                    <button 
                                      onClick={() => sendGroupToExceptions(groupId)}
                                      className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all flex items-center gap-2"
                                      title="Mandar todos os elementos deste grupo para as exceções globais"
                                    >
                                      <Lock className="w-4 h-4" /> Exceções
                                    </button>
                                    <button 
                                      onClick={() => deleteGroup(groupId)}
                                      className="bg-slate-100 text-red-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-50 transition-all flex items-center gap-2"
                                      title="Eliminar todos os elementos deste grupo"
                                    >
                                      <Trash2 className="w-4 h-4" /> Eliminar
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Elementos no Grupo</label>
                                  <div className="flex flex-wrap gap-2">
                                    {members.map(member => (
                                      <div key={member.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg pl-2 pr-1 py-1 group focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                                        <input 
                                          type="text"
                                          value={member.original}
                                          onChange={(e) => updateOriginal(member.id, e.target.value)}
                                          className="text-xs font-mono font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 w-auto min-w-[100px]"
                                          style={{ width: `${Math.max(member.original.length, 10)}ch` }}
                                        />
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                            onClick={() => toggleEntity(member.id)}
                                            className={`p-1 rounded-md transition-all ${member.enabled ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-200'}`}
                                            title={member.enabled ? "Desativar anonimização" : "Ativar anonimização"}
                                          >
                                            {member.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                          </button>
                                          <button 
                                            onClick={() => addToGlobalExceptions(member.original, (member.type === 'JUIZ' || member.type === 'AUTOR') ? member.type : 'OUTRO')}
                                            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-all"
                                            title="Mandar para exceções globais"
                                          >
                                            <Lock className="w-3.5 h-3.5" />
                                          </button>
                                          <button 
                                            onClick={() => deleteEntity(member.id)}
                                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                                            title="Eliminar permanentemente"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button 
                                            onClick={() => removeFromGroup(member.id)}
                                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                                            title="Remover do grupo"
                                          >
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {filteredEntities.length === 0 && groupedEntities.length === 0 ? (
                          <div className="p-12 text-center text-slate-400 italic">Nenhum dado sensível detetado.</div>
                        ) : (
                          filteredEntities.map((entity) => (
                            <EntityItem 
                              key={entity.id} 
                              entity={entity} 
                              toggleSelect={toggleSelect}
                              toggleEntity={toggleEntity}
                              openRefineModal={openRefineModal}
                              addToGlobalExceptions={addToGlobalExceptions}
                              deleteEntity={deleteEntity}
                              updateOriginal={updateOriginal}
                            />
                          ))
                        )}
                      </>
                    ) : (
                      <div className="space-y-8 p-4">
                        {files.map(file => {
                          const fileEntities = entities.filter(e => e.fileIds?.includes(file.id));
                          const fileFilteredEntities = filteredEntities.filter(e => e.fileIds?.includes(file.id));
                          const fileGroupedEntities = groupedEntities.filter(([_, members]) => members[0].fileIds?.includes(file.id));
                          
                          if (fileEntities.length === 0) return null;

                          return (
                            <div key={file.id} className="space-y-4">
                              <div className="flex items-center gap-2 text-slate-900 font-bold text-xs border-b border-slate-100 pb-2">
                                <FileText className="w-4 h-4 text-blue-600" />
                                {file.name} ({fileEntities.length})
                              </div>
                              
                              {fileGroupedEntities.length > 0 && !showTreated && (
                                <div className="space-y-3">
                                  {fileGroupedEntities.map(([groupId, members]) => (
                                    <div key={groupId} className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm space-y-3">
                                      <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Sigla Comum</label>
                                          <input 
                                            type="text" 
                                            value={members[0].pseudonym} 
                                            onChange={(e) => updateGroupPseudonym(groupId, e.target.value)}
                                            className="w-full bg-blue-50 border-none rounded-lg px-3 py-2 text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                                          />
                                        </div>
                                        <div className="flex items-center gap-2 mt-5">
                                          <button onClick={() => saveGroup(groupId)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-all"><Check className="w-4 h-4" /></button>
                                          <button onClick={() => disableGroupAnonymization(groupId)} className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all"><EyeOff className="w-4 h-4" /></button>
                                          <button onClick={() => sendGroupToExceptions(groupId)} className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all"><Lock className="w-4 h-4" /></button>
                                          <button onClick={() => deleteGroup(groupId)} className="bg-slate-100 text-red-600 px-3 py-2 rounded-lg text-xs font-bold hover:bg-red-50 transition-all"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {members.map(member => (
                                          <div key={member.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg pl-2 pr-1 py-1 group">
                                            <input 
                                              type="text"
                                              value={member.original}
                                              onChange={(e) => updateOriginal(member.id, e.target.value)}
                                              className="text-xs font-mono font-bold text-slate-700 bg-transparent border-none p-0 focus:ring-0 w-auto min-w-[80px]"
                                              style={{ width: `${Math.max(member.original.length, 8)}ch` }}
                                            />
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <button onClick={() => toggleEntity(member.id)} className="p-1 text-blue-600 hover:bg-blue-50 rounded-md"><Eye className="w-3.5 h-3.5" /></button>
                                              <button onClick={() => deleteEntity(member.id)} className="p-1 text-slate-300 hover:text-red-500 rounded-md"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="space-y-1">
                                {fileFilteredEntities.map(entity => (
                                  <EntityItem 
                                    key={entity.id} 
                                    entity={entity} 
                                    toggleSelect={toggleSelect}
                                    toggleEntity={toggleEntity}
                                    openRefineModal={openRefineModal}
                                    addToGlobalExceptions={addToGlobalExceptions}
                                    deleteEntity={deleteEntity}
                                    updateOriginal={updateOriginal}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col gap-6 min-h-0">
                <div className="flex items-center gap-4 overflow-x-auto pb-2">
                  {files.map(file => (
                    <button
                      key={file.id}
                      onClick={() => setPreviewFileId(file.id)}
                      className={`
                        flex items-center gap-2 px-4 py-2 rounded-xl border transition-all whitespace-nowrap text-sm font-bold
                        ${previewFileId === file.id 
                          ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}
                      `}
                    >
                      {file.name.endsWith('pdf') ? <FileIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      {file.name}
                    </button>
                  ))}
                </div>

                <div className="flex-1 min-h-0">
                  {previewFile ? (
                    <DocumentViewer file={previewFile.file} onAddPII={addManualPII} customTypes={customTypes} />
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 h-full flex flex-col items-center justify-center text-slate-400 italic">
                      Selecione um ficheiro para pré-visualizar.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <div className="w-2 h-2 rounded-full bg-blue-600" />
                  <span>{entities.filter(e => e.enabled && !e.ignored).length} Elementos a Anonimizar</span>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                  <span>{entities.filter(e => e.ignored).length} Exemplos (Ignorados)</span>
                </div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest border-l border-slate-200 pl-6">
                  Dica: Selecione texto no documento para adicionar manualmente
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={exportForLLM}
                  disabled={files.some(f => f.status === 'scanning') || entities.length === 0 || isExportingLLM}
                  className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center gap-2 border border-slate-200 disabled:opacity-50"
                  title="Exportar documentos anonimizados e glossário para LLM"
                >
                  {isExportingLLM ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileJson className="w-4 h-4" />
                  )}
                  {isExportingLLM ? 'Exportando...' : 'Exportar para LLM'}
                </button>
                <button 
                  onClick={() => {
                    if (files.length > 1 && commonEntities.length > 0) {
                      setShowConsolidationModal(true);
                    } else {
                      processFiles();
                    }
                  }}
                  disabled={files.some(f => f.status === 'scanning')}
                  className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50 flex items-center gap-2"
                >
                  {files.some(f => f.status === 'scanning') ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Analisando...</>
                  ) : (
                    <>Aplicar Anonimização <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'completed' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto">
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xl">
              {files.every(f => f.status === 'completed') ? (
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Check className="w-10 h-10" />
                </div>
              ) : files.some(f => f.status === 'error') ? (
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-10 h-10" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-10 h-10 animate-spin" />
                </div>
              )}
              
              <h2 className="text-3xl font-bold text-slate-900 mb-2">
                {files.every(f => f.status === 'completed') 
                  ? 'Concluído com Sucesso!' 
                  : files.some(f => f.status === 'error')
                  ? 'Processamento com Erros'
                  : 'Processando Documentos...'}
              </h2>
              <p className="text-slate-500 mb-12">
                {files.every(f => f.status === 'completed')
                  ? 'Seus documentos foram anonimizados localmente e estão prontos para download.'
                  : files.some(f => f.status === 'error')
                  ? 'Alguns documentos não puderam ser processados. Verifique os erros abaixo.'
                  : 'Aguarde enquanto aplicamos a anonimização nos seus arquivos.'}
              </p>
              
              <div className="space-y-4 mb-12">
                {files.map(file => (
                  <div key={file.id} className="bg-slate-50 rounded-2xl p-4 flex flex-col border border-slate-100">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <FileIcon className="w-6 h-6 text-slate-400" />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-slate-900 truncate max-w-[250px]">{file.name}</p>
                          <p className="text-xs text-slate-400 font-medium">
                            {file.status === 'completed' ? 'Anonimizado' : file.status === 'error' ? 'Erro no processamento' : 'Processando...'}
                          </p>
                        </div>
                      </div>
                      {file.status === 'completed' ? (
                        <button onClick={() => downloadFile(file)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
                          <Download className="w-4 h-4" /> Baixar
                        </button>
                      ) : file.status === 'processing' ? (
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    {file.status === 'error' && file.error && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl text-left">
                        <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-1">Detalhes do Erro</p>
                        <p className="text-xs text-red-600 font-mono">{file.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button 
                  onClick={exportForLLM}
                  disabled={isExportingLLM}
                  className="bg-slate-100 text-slate-700 px-8 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all flex items-center gap-2 border border-slate-200 disabled:opacity-50"
                >
                  {isExportingLLM ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileJson className="w-4 h-4" />
                  )}
                  {isExportingLLM ? 'Exportando...' : 'Exportar para LLM'}
                </button>
                <button 
                  onClick={() => setStep('review')} 
                  className="bg-white text-blue-600 px-8 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all border border-blue-100"
                >
                  Rever e Adicionar Documentos
                </button>
                <button 
                  onClick={clearProject}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Novo Projeto
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Refine Selection Modal */}
      <AnimatePresence>
        {refineEntity && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Refinar Seleção
                </h3>
                <button onClick={() => setRefineEntity(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              
              <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contexto no Documento</label>
                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 font-mono text-sm leading-relaxed text-slate-600 relative">
                    <div className="max-h-40 overflow-y-auto">
                      <span className="opacity-40">{refineContext.before}</span>
                      <span className="bg-blue-100 text-blue-700 font-bold px-1 rounded border border-blue-200">{refineText}</span>
                      <span className="opacity-40">{refineContext.after}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo de Dado</label>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(PII_COLORS).filter(t => t !== 'DEFAULT').map(type => (
                        <button
                          key={type}
                          onClick={() => setRefineEntity(prev => prev ? { ...prev, type } : null)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border-2 ${
                            refineEntity?.type === type 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                      {customTypes.map(type => (
                        <button
                          key={type}
                          onClick={() => setRefineEntity(prev => prev ? { ...prev, type } : null)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border-2 ${
                            refineEntity?.type === type 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          const newType = prompt('Nome do novo tipo (ex: TESTEMUNHA):');
                          if (newType) {
                            const upper = newType.toUpperCase().trim();
                            if (upper && !customTypes.includes(upper)) {
                              setCustomTypes(prev => [...prev, upper]);
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-400 border-2 border-dashed border-slate-300 transition-all flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Novo Tipo
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ajustar Seleção</label>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <button 
                          onClick={() => expandSelection('before')}
                          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                          title="Expandir para a esquerda"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => shrinkSelection('start')}
                          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                          title="Encolher pela esquerda"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {isSplitMode ? (
                        <div className="flex-1 flex flex-wrap items-center justify-center gap-2 p-4 bg-slate-50 rounded-xl border-2 border-dashed border-blue-200">
                          {(refineText.match(/[^\s.,;:!?()\[\]{}/]+|[.,;:!?()\[\]{}/]/g) || []).map((token, i, arr) => (
                            <React.Fragment key={i}>
                              <span className={`px-2 py-1 rounded font-bold transition-all ${splitIndex !== null && i >= splitIndex ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                {token}
                              </span>
                              {i < arr.length - 1 && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSplitIndex(i + 1);
                                  }}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${splitIndex === i + 1 ? 'bg-blue-600 text-white scale-110 shadow-md' : 'bg-white border border-slate-200 text-slate-400 hover:bg-blue-100 hover:text-blue-600'}`}
                                  title="Dividir aqui"
                                >
                                  <Scissors className="w-4 h-4" />
                                </button>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      ) : (
                        <input 
                          type="text" 
                          value={refineText}
                          onChange={(e) => setRefineText(e.target.value)}
                          className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:border-blue-500 outline-none transition-all text-center"
                        />
                      )}

                      <div className="flex flex-col gap-1">
                        <button 
                          onClick={() => expandSelection('after')}
                          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                          title="Expandir para a direita"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => shrinkSelection('end')}
                          className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-all"
                          title="Encolher pela direita"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                    <div className="flex flex-wrap gap-2">
                      {isSplitMode ? (
                        <>
                          <button 
                            onClick={confirmSplit}
                            disabled={splitIndex === null}
                            className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${splitIndex !== null ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                          >
                            <Check className="w-4 h-4" /> Confirmar Divisão
                          </button>
                          <button 
                            onClick={() => setIsSplitMode(false)}
                            className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-50 transition-all"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => splitRefine(' e ')}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-[10px] font-bold text-blue-700 transition-all border border-blue-100"
                          >
                            Dividir por " e "
                          </button>
                          <button 
                            onClick={() => splitRefine(', ')}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-[10px] font-bold text-blue-700 transition-all border border-blue-100"
                          >
                            Dividir por vírgula
                          </button>
                          <button 
                            onClick={manualSplit}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 rounded-lg text-[10px] font-bold text-amber-700 transition-all border border-amber-100"
                          >
                            Dividir em 2 Distintos
                          </button>
                        </>
                      )}
                    </div>
                  
                  {similarEntities.length > 0 && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-amber-700 uppercase flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Sugestões de União
                        </p>
                        <div className="flex gap-4 text-[9px] text-amber-600 font-medium">
                          <span title="Edita o item sugerido diretamente">● Corrigir: Editar sugestão</span>
                          <span title="O item atual assume a sigla da sugestão">● Usar Sigla: Unir à sugestão</span>
                          <span title="A sugestão assume o texto atual e a mesma sigla">● Limpar e Unir: Corrigir e Unir</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-amber-600">Encontrámos termos semelhantes. Escolha uma ação para unificar os dados:</p>
                      <div className="space-y-2">
                        {similarEntities.map(similar => (
                          <div key={similar.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-200">
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-mono font-bold text-slate-700 truncate max-w-[200px]">{similar.original}</span>
                              <span className="text-[9px] text-slate-400 italic">Atual: {similar.pseudonym}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => switchRefine(similar)}
                                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-[10px] font-bold transition-all"
                                title="Corrigir este item individualmente"
                              >
                                Corrigir
                              </button>
                              <button 
                                onClick={() => mergeWithSimilar(similar)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md text-[10px] font-bold transition-all"
                                title="Usar a mesma sigla deste item"
                              >
                                Usar Sigla
                              </button>
                              <button 
                                onClick={() => cleanAndMerge(similar)}
                                className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-md text-[10px] font-bold transition-all"
                                title="Limpar para o texto atual e usar a mesma sigla"
                              >
                                Limpar e Unir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <div className="flex-1 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs font-bold text-blue-700 uppercase mb-2">Dica de Precisão</p>
                      <p className="text-xs text-blue-600 leading-relaxed">
                        Remova títulos (ex: "Dr.", "Eng.") ou cargos (ex: "médico") se não quiser que sejam anonimizados. 
                        Mantenha apenas o dado sensível real.
                      </p>
                    </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => {
                            addToGlobalExceptions(refineText);
                            setRefineEntity(null);
                          }}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-all"
                          title="Adicionar às exceções globais (não será mais detetado)"
                        >
                          <Lock className="w-4 h-4" /> Exceção Global
                        </button>
                        <button 
                          onClick={() => {
                            if (refineEntity) {
                              toggleEntity(refineEntity.id);
                              setRefineEntity(null);
                            }
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${refineEntity?.enabled ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200' : 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700'}`}
                          title={refineEntity?.enabled ? "Desativar anonimização (fechar olho)" : "Ativar anonimização (abrir olho)"}
                        >
                          {refineEntity?.enabled ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          {refineEntity?.enabled ? 'Ignorar' : 'Ativar'}
                        </button>
                      </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={() => setRefineEntity(null)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={saveRefine}
                  className="px-8 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Guardar Alterações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Consolidation Modal */}
      <AnimatePresence>
        {showConsolidationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                    <Layers className="w-5 h-5 text-blue-600" />
                    Consolidação de Processo ({commonEntities.length} Elementos Comuns)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Estes elementos foram encontrados em múltiplos documentos. Verifique se as siglas estão consistentes.
                  </p>
                </div>
                <button onClick={() => setShowConsolidationModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
                {commonEntities.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 italic">
                    Não foram encontrados elementos comuns entre os documentos carregados.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {commonEntities.map(entity => (
                      <div key={entity.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-200 transition-all group">
                        <div className="flex items-center justify-between mb-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            entity.type === 'NOME' ? 'bg-yellow-100 text-yellow-700' :
                            entity.type === 'LOCAL' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {entity.type}
                          </span>
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                            {entity.fileIds?.length} DOCUMENTOS
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Texto Original</label>
                            <div className="font-mono text-sm font-bold text-slate-700 truncate bg-slate-50 p-2 rounded-lg border border-slate-100">
                              {entity.original}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 mt-4" />
                          <div className="flex-1 min-w-0">
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Sigla Aplicada</label>
                            <input 
                              type="text"
                              value={entity.pseudonym}
                              onChange={(e) => updatePseudonym(entity.id, e.target.value)}
                              className="w-full bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                          <div className="flex -space-x-2 overflow-hidden">
                            {entity.fileIds?.slice(0, 3).map((fid, i) => {
                              const f = files.find(file => file.id === fid);
                              return (
                                <div key={fid} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600" title={f?.name}>
                                  {f?.name.charAt(0).toUpperCase()}
                                </div>
                              );
                            })}
                            {(entity.fileIds?.length || 0) > 3 && (
                              <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[8px] font-bold text-slate-400">
                                +{(entity.fileIds?.length || 0) - 3}
                              </div>
                            )}
                          </div>
                          <button 
                            onClick={() => openRefineModal(entity)}
                            className="text-[10px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                          >
                            <Maximize2 className="w-3 h-3" /> Refinar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={() => setShowConsolidationModal(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                >
                  Continuar Revisão
                </button>
                <button 
                  onClick={() => {
                    setShowConsolidationModal(false);
                    processFiles();
                  }}
                  className="px-8 py-2.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" /> Confirmar e Processar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Exceptions Modal */}
      <AnimatePresence>
        {showExceptionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-blue-600" />
                  Exceções Globais ({globalExceptions.length})
                </h3>
                <button onClick={() => setShowExceptionsModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
              
              <div className="flex border-b border-slate-100">
                {(['JUIZ', 'AUTOR', 'OUTRO'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveExceptionTab(tab)}
                    className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                      activeExceptionTab === tab 
                        ? 'border-blue-600 text-blue-600 bg-blue-50/30' 
                        : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {tab === 'JUIZ' ? 'Juízes' : tab === 'AUTOR' ? 'Autores' : 'Restantes Termos'}
                    <span className="ml-2 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">
                      {globalExceptions.filter(ex => ex.type === tab).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <p className="text-sm text-slate-500 mb-6">
                  Estes termos nunca serão anonimizados. {activeExceptionTab === 'OUTRO' ? 'Útil para instituições ou palavras comuns.' : `Lista de ${activeExceptionTab === 'JUIZ' ? 'juízes' : 'autores'} que devem ser preservados.`}
                </p>
                
                <div className="space-y-2">
                  {globalExceptions.filter(ex => ex.type === activeExceptionTab).length === 0 ? (
                    <div className="text-center py-12 text-slate-400 italic bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      Nenhuma exceção definida nesta categoria.
                    </div>
                  ) : (
                    globalExceptions.filter(ex => ex.type === activeExceptionTab).map((ex) => (
                      <div key={ex.id} className="flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-xl hover:border-slate-200 transition-colors group">
                        <select
                          value={ex.type}
                          onChange={(e) => changeGlobalExceptionType(ex.id, e.target.value as any)}
                          className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border border-slate-100 rounded px-1.5 py-1 cursor-pointer hover:text-slate-600 outline-none"
                        >
                          <option value="JUIZ">JUIZ</option>
                          <option value="AUTOR">AUTOR</option>
                          <option value="OUTRO">OUTRO</option>
                        </select>
                        <input 
                          type="text"
                          value={ex.text}
                          onChange={(e) => updateGlobalException(ex.id, e.target.value)}
                          className="flex-1 bg-transparent border-none font-mono text-sm font-bold text-slate-700 focus:ring-0 p-1"
                        />
                        <button 
                          onClick={() => removeFromGlobalExceptions(ex.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Remover exceção"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                <div className="flex gap-2">
                  <button 
                    onClick={exportGlobalExceptions}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                    title="Exportar exceções globais (JSON)"
                  >
                    <Download className="w-4 h-4" /> Exportar
                  </button>
                  <button 
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.json';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) importGlobalExceptions(file);
                      };
                      input.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
                    title="Importar exceções globais (JSON)"
                  >
                    <Upload className="w-4 h-4" /> Importar
                  </button>
                  <button 
                    onClick={clearGlobalExceptions}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-red-100 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> Limpar Tudo
                  </button>
                </div>
                <button 
                  onClick={() => setShowExceptionsModal(false)}
                  className="px-8 py-2.5 rounded-xl font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all"
                >
                  Fechar e Guardar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3">
        {files.length > 1 && commonEntities.length > 0 && (
          <button 
            onClick={() => setShowConsolidationModal(true)}
            className="bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-all flex items-center gap-2 group"
            title="Consolidar Processo (Elementos Comuns)"
          >
            <Layers className="w-5 h-5" />
            <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 text-xs font-bold whitespace-nowrap uppercase">
              Consolidar Processo
            </span>
          </button>
        )}
        <button 
          onClick={() => setShowExceptionsModal(true)}
          className="bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-all flex items-center gap-2 group"
          title="Gerir Exceções Globais"
        >
          <Lock className="w-5 h-5" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 text-xs font-bold whitespace-nowrap uppercase">
            Exceções Globais
          </span>
        </button>
      </div>

      <footer className="max-w-6xl mx-auto px-6 py-12 text-center text-slate-400 text-xs border-t border-slate-100 mt-12 font-medium">
        &copy; 2026 AnonimizaLocal • Privacidade Total • Processamento Local via Browser
      </footer>
    </div>
  );
}
