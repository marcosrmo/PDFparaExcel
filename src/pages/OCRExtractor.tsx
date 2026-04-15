import { useState, useCallback, useRef } from 'react';
import { Play, Download, Trash2, Sparkles } from 'lucide-react';
import logoUrl from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { DropZone } from '@/components/ocr/DropZone';
import { ImagePreviewList } from '@/components/ocr/ImagePreviewList';
import { ProcessingProgress } from '@/components/ocr/ProcessingProgress';
import { DataTable } from '@/components/ocr/DataTable';
import { processPDFs, type ExtractedRecord, type CancellationToken } from '@/lib/ocrProcessor';
import { exportToExcel } from '@/lib/excelExport';
import { useToast } from '@/hooks/use-toast';

export default function OCRExtractor() {
  const [files, setFiles] = useState<File[]>([]);
  const [records, setRecords] = useState<ExtractedRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, fileName: '' });
  const cancellationTokenRef = useRef<CancellationToken | null>(null);
  const { toast } = useToast();

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleRemove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleProcess = useCallback(async () => {
    if (!files.length) return;
    const token: CancellationToken = { cancelled: false };
    cancellationTokenRef.current = token;
    setIsProcessing(true);
    setRecords([]);

    try {
      const results = await processPDFs(files, (current, total, fileName) => {
        setProgress({ current, total, fileName });
      }, token);

      if (token.cancelled) {
        toast({
          title: 'Processamento cancelado',
          description: `${results.length} registro(s) já extraídos foram mantidos.`,
          variant: 'destructive',
        });
        setRecords(results);
        return;
      }

      setRecords(results);
      const successCount = results.filter((r) => !r.hasError).length;
      const colCount = new Set(results.flatMap(r => Object.keys(r.fields))).size;
      toast({
        title: 'Processamento concluído',
        description: `${successCount} registros extraídos com ${colCount} tipos de dados detectados.`,
      });
    } catch (err) {
      toast({
        title: 'Erro no processamento',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      cancellationTokenRef.current = null;
    }
  }, [files, toast]);

  const handleCancel = useCallback(() => {
    if (cancellationTokenRef.current) {
      cancellationTokenRef.current.cancelled = true;
    }
  }, []);

  const handleExport = useCallback(() => {
    const validRecords = records.filter((r) => !r.hasError);
    if (!validRecords.length) {
      toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
      return;
    }
    exportToExcel(validRecords);
    toast({ title: 'Excel exportado com sucesso!', description: 'O arquivo foi baixado.' });
  }, [records, toast]);

  return (
    <div className="min-h-screen gradient-hero">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 glass">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={logoUrl}
                alt="PDF para Excel LeadCompra"
                className="h-11 w-11 rounded-xl object-contain drop-shadow-lg"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                <span className="gradient-text">PDF para Excel</span>{' '}
                <span className="text-foreground/90">LeadCompra</span>
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                Converta PDFs em planilhas Excel automaticamente com OCR
              </p>
            </div>
          </div>

          <a
            href="https://leadcompra.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 hover:bg-primary/15 hover:border-primary/40 transition-all duration-200"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Site da Instituição</span>
          </a>
        </div>
      </header>

      <main className="container mx-auto max-w-5xl px-4 py-10 space-y-8">
        {/* Hero text */}
        {!files.length && !records.length && (
          <div className="text-center space-y-3 pb-2">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              <span className="gradient-text">Transforme seus PDFs</span>
              <br />
              <span className="text-foreground/80">em planilhas Excel</span>
            </h2>
            <p className="text-muted-foreground text-base max-w-md mx-auto">
              Faça upload dos seus PDFs. Extraímos texto nativamente e aplicamos{' '}
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 border border-primary/30 px-2 py-0.5 text-primary font-semibold tracking-wide text-sm">
                OCR
              </span>{' '}
              em imagens para gerar um Excel completo.
            </p>
          </div>
        )}

        {/* Upload */}
        <DropZone onFilesSelected={handleFilesSelected} disabled={isProcessing} />

        {/* Preview */}
        <ImagePreviewList files={files} onRemove={handleRemove} />

        {/* Actions */}
        {files.length > 0 && !isProcessing && (
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={handleProcess}
              className="gradient-primary text-white gap-2 px-6 py-2.5 font-semibold shadow-lg hover:opacity-90 hover:shadow-primary/20 hover:shadow-xl transition-all duration-200"
            >
              <Play className="h-4 w-4" />
              Processar {files.length} {files.length === 1 ? 'PDF' : 'PDFs'}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setFiles([]); setRecords([]); }}
              className="gap-2 border-border/60 hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-all duration-200"
            >
              <Trash2 className="h-4 w-4" /> Limpar tudo
            </Button>
          </div>
        )}

        {/* Progress */}
        {isProcessing && (
          <ProcessingProgress
            current={progress.current}
            total={progress.total}
            currentFileName={progress.fileName}
            onCancel={handleCancel}
          />
        )}

        {/* Results */}
        {!isProcessing && records.length > 0 && (
          <div className="space-y-6">
            <DataTable records={records} />
            <div className="flex justify-end">
              <Button
                onClick={handleExport}
                className="gap-2 gradient-primary text-white font-semibold px-6 py-2.5 shadow-lg hover:opacity-90 hover:shadow-primary/20 hover:shadow-xl transition-all duration-200"
              >
                <Download className="h-4 w-4" />
                Exportar para Excel
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 py-6">
        <p className="text-center text-xs text-muted-foreground">
          LeadCompra &copy; {new Date().getFullYear()} — Processamento 100% local, seus dados não saem do navegador.
        </p>
      </footer>
    </div>
  );
}
