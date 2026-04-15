import { useState } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle, BarChart3, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ExtractedRecord } from '@/lib/ocrProcessor';
import { getAllColumns } from '@/lib/ocrProcessor';

const PAGE_SIZE = 50;

interface DataTableProps {
  records: ExtractedRecord[];
}

export function DataTable({ records }: DataTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  if (!records.length) return null;

  const successRecords = records.filter(r => !r.hasError);
  const errorRecords = records.filter(r => r.hasError);
  const columns = getAllColumns(successRecords);
  const uniqueFiles = new Set(records.map(r => r.fileName)).size;
  const totalPages = Math.ceil(records.length / PAGE_SIZE);
  const pageRecords = records.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">Dados Extraídos</h3>
        </div>
        <div className="flex gap-2 flex-wrap ml-1">
          <Badge className="gap-1.5 bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20 px-3 py-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {successRecords.length} {successRecords.length === 1 ? 'registro' : 'registros'}
          </Badge>
          <Badge variant="secondary" className="gap-1.5 border border-border/60 px-3 py-1">
            {uniqueFiles} {uniqueFiles === 1 ? 'imagem' : 'imagens'}
          </Badge>
          <Badge variant="secondary" className="gap-1.5 border border-primary/20 bg-primary/5 text-primary px-3 py-1">
            {columns.length} {columns.length === 1 ? 'coluna detectada' : 'colunas detectadas'}
          </Badge>
          {errorRecords.length > 0 && (
            <Badge className="gap-1.5 bg-destructive/10 text-destructive border border-destructive/25 px-3 py-1">
              <XCircle className="h-3.5 w-3.5" />
              {errorRecords.length} sem dados
            </Badge>
          )}
        </div>
      </div>

      {/* Colunas detectadas */}
      {columns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {columns.map(col => (
            <span
              key={col}
              className="inline-flex items-center rounded-full bg-secondary/60 border border-border/50 px-2.5 py-0.5 text-xs font-medium text-foreground/70"
            >
              {col}
            </span>
          ))}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-2xl border border-border/60 overflow-auto shadow-sm bg-card/50 max-h-[520px]">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-secondary/80 hover:bg-secondary/80 border-b border-border/60 backdrop-blur">
              <TableHead className="text-muted-foreground font-semibold w-10 text-center sticky left-0 bg-secondary/80">#</TableHead>
              <TableHead className="text-muted-foreground font-semibold min-w-[130px]">Arquivo</TableHead>
              {columns.map(col => (
                <TableHead key={col} className="text-muted-foreground font-semibold min-w-[120px] whitespace-nowrap">
                  {col}
                </TableHead>
              ))}
              <TableHead className="text-muted-foreground font-semibold text-center min-w-[90px]">Confiança</TableHead>
              <TableHead className="text-muted-foreground font-semibold text-center w-12">Img</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRecords.map((r, idx) => (
              <TableRow
                key={r.id}
                className={`border-b border-border/30 transition-colors duration-150 ${
                  r.hasError ? 'bg-destructive/4 hover:bg-destructive/8' : 'hover:bg-primary/4'
                }`}
              >
                <TableCell className="text-xs text-muted-foreground text-center font-mono sticky left-0 bg-card/70">
                  {page * PAGE_SIZE + idx + 1}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[130px]">
                  <span className="block truncate" title={r.fileName}>{r.fileName}</span>
                </TableCell>

                {r.hasError ? (
                  <TableCell colSpan={columns.length} className="py-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                      Nenhum dado detectado — verifique a qualidade da imagem
                    </span>
                  </TableCell>
                ) : (
                  columns.map(col => (
                    <TableCell key={col} className="text-sm max-w-[180px]">
                      {r.fields[col] ? (
                        <span className="block truncate text-foreground/85 font-medium" title={r.fields[col]}>
                          {r.fields[col]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                  ))
                )}

                <TableCell className="text-center">
                  <span className={`
                    inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold min-w-[3rem]
                    ${r.confidence >= 70
                      ? 'bg-primary/15 text-primary border border-primary/25'
                      : r.confidence >= 40
                        ? 'bg-warning/15 text-warning border border-warning/25'
                        : 'bg-destructive/15 text-destructive border border-destructive/25'
                    }
                  `}>
                    {Math.round(r.confidence)}%
                  </span>
                </TableCell>

                <TableCell className="text-center relative">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    {expandedId === r.id ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {expandedId === r.id && (
                    <div className="absolute z-20 mt-2 right-4 w-72 rounded-xl border border-border/60 bg-card p-3 shadow-2xl">
                      <img src={r.imageUrl} alt={r.fileName} className="w-full rounded-lg" />
                      <p className="mt-2 text-xs text-muted-foreground truncate text-center">{r.fileName}</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, records.length)} de {records.length} registros
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page === 0}
              onClick={() => { setPage(p => p - 1); setExpandedId(null); }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-foreground/70 min-w-[5rem] text-center">
              Página {page + 1} de {totalPages}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page >= totalPages - 1}
              onClick={() => { setPage(p => p + 1); setExpandedId(null); }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
