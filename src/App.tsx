import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Upload, FileText, Check, X, Trash2, Eye, EyeOff, 
  Layers, Plus, Scissors, Lock, Download, AlertCircle,
  History, Link, ChevronDown, ChevronRight, Search, Filter,
  MoreVertical, Copy, CheckCircle2, User, MapPin, Phone, 
  CreditCard, Mail, Hash, Briefcase, Scale, Trash, RotateCcw, RotateCw,
  Shield, Save, FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { 
  scanText, 
  groupSimilarEntities, 
  anonymizeText,
  splitEntity,
  getNextPseudonym,
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
  const [isRelated, setIsRelated] = useState(true);
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
        } else {
          // Fallback for other types or simple text
          text = await fileData.rawFile.text();
        }

        const fileEntities = scanText(text, fileData.id, allNewEntities, isRelated, globalKnowledge);
        allNewEntities = [...allNewEntities, ...fileEntities];

        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, content: text, status: 'done' } : f));
      } catch (error) {
        console.error(`Error processing file ${fileData.name}:`, error);
        setFiles(prev => prev.map(f => f.id === fileData.id ? { ...f, status: 'error' } : f));
      }
    }

    const grouped = groupSimilarEntities(allNewEntities, isRelated);
    setEntities(grouped);
    setIsProcessing(false);
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items as any[]).map((item: any) => item.str || '').join(' ');
      fullText += pageText + '\n';
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
    setEntities(prev => prev.map(e => 
      selectedIds.has(e.id) ? { ...e, treated: true, ignored: false } : e
    ));
    setSelectedIds(new Set());
  };

  const handleIgnoreSelected = () => {
    setEntities(prev => prev.map(e => 
      selectedIds.has(e.id) ? { ...e, ignored: true, treated: false } : e
    ));
    setSelectedIds(new Set());
  };

  const handleGroupSelected = () => {
    if (selectedIds.size < 2) return;
    
    const selectedEntities = entities.filter(e => selectedIds.has(e.id));
    const groupId = `manual-group-${Date.now()}`;
    const basePseudonym = selectedEntities[0].pseudonym;

    setEntities(prev => prev.map(e => 
      selectedIds.has(e.id) ? { ...e, groupId, pseudonym: basePseudonym } : e
    ));
    setSelectedIds(new Set());
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
    const entity = entities.find(e => e.id === id);
    if (!entity) return;

    setEntities(prev => prev.map(e => {
      if (e.id === id || (entity.groupId && e.groupId === entity.groupId)) {
        return { ...e, pseudonym: newPseudonym };
      }
      return e;
    }));
  };

  const handleSplitEntity = (entity: PIIEntity) => {
    setEditingEntity(entity);
  };

  const handleUpdateEntity = (id: string, updates: Partial<PIIEntity>) => {
    const entityToUpdate = entities.find(e => e.id === id);
    if (!entityToUpdate) return;

    const updated = { ...entityToUpdate, ...updates };
    
    setEntities(prev => prev.map(e => e.id === id ? updated : e));

    // Side effects after state update
    if (updated.type === 'EXCECAO' || updated.type === 'JUIZ' || updated.type === 'AUTOR') {
      addToGlobalKnowledge(updated.original, updated.type);
    }
    if (editingEntity && editingEntity.id === id) {
      setEditingEntity(updated);
    }
  };

  const handleManualSplit = (entity: PIIEntity, separator: string | RegExp) => {
    const parts = entity.original.split(separator).map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length < 2) return;

    const newEntities = parts.map(part => {
      const id = Math.random().toString(36).substring(7);
      const pseudonym = getNextPseudonym(entity.type, entities);
      return {
        ...entity,
        id,
        original: part,
        pseudonym,
        groupId: undefined
      };
    });

    setEntities(prev => {
      const filtered = prev.filter(e => e.id !== entity.id);
      return [...filtered, ...newEntities];
    });
    setEditingEntity(null);
  };

  const addToGlobalKnowledge = (text: string, type: string = 'EXCECAO') => {
    setGlobalKnowledge(prev => ({ ...prev, [text.toLowerCase().trim()]: type }));
    setEntities(prev => prev.filter(e => e.original !== text));
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
    setFiles([]);
    setEntities([]);
    setSelectedIds(new Set());
  };

  const handleReGroup = () => {
    setEntities(prev => groupSimilarEntities(prev, isRelated));
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
    const anonymizedText = anonymizeText(fileData.content, entities);
    const newPdfDoc = await PDFDocument.create();
    const font = await newPdfDoc.embedFont(StandardFonts.Helvetica);
    
    const lines = anonymizedText.split('\n');
    let page = newPdfDoc.addPage();
    let y = page.getHeight() - 50;

    for (const line of lines) {
      if (y < 50) {
        page = newPdfDoc.addPage();
        y = page.getHeight() - 50;
      }
      // Clean line from non-printable chars that might break drawText
      const cleanLine = line.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
      try {
        page.drawText(cleanLine, { x: 50, y, size: 10, font });
      } catch (e) {
        console.warn("Could not draw line:", cleanLine);
      }
      y -= 15;
    }

    return await newPdfDoc.save();
  };

  // --- UI Helpers ---

  const filteredEntities = entities.filter(e => {
    const matchesSearch = e.original.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         e.pseudonym.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || e.type === filterType;
    const matchesIgnored = hideIgnored ? !e.ignored : true;
    return matchesSearch && matchesType && matchesIgnored;
  });

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

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Files & Controls */}
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
              <input type="file" className="hidden" multiple onChange={handleFileUpload} />
            </label>

            <div className="mt-4 space-y-2">
              {files.map(file => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
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

        {/* Right Column: Entities List */}
        <div className="lg:col-span-8 space-y-6">
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
                    Agrupar
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
            {Object.entries(groupedEntities).map(([groupId, group]: [string, PIIEntity[]]) => (
              <motion.div 
                key={groupId}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {group.length > 1 ? (
                  <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox"
                        checked={group.every(e => selectedIds.has(e.id))}
                        onChange={() => toggleSelectGroup(group)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="bg-indigo-100 text-indigo-700 p-1.5 rounded-lg">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold">Grupo: {group[0].original}</h3>
                        <p className="text-xs text-gray-500">{group.length} ocorrências</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleCopyPseudonym(group[0].pseudonym)}
                        className="p-2 hover:bg-white rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                        title="Copiar Pseudónimo"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : null}

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
                            className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border border-transparent focus:border-indigo-300 focus:bg-white outline-none w-32"
                          />
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
              </motion.div>
            ))}
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
              
              <div className="p-6 overflow-y-auto flex-1">
                {Object.entries(globalKnowledge).filter(([_, type]) => type === exceptionsTab).length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhum elemento nesta categoria.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(globalKnowledge)
                      .filter(([_, type]) => type === exceptionsTab)
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
