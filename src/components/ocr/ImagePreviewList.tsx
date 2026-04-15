import { X, FileText, Files } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PDFPreviewListProps {
  files: File[];
  onRemove: (index: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImagePreviewList({ files, onRemove }: PDFPreviewListProps) {
  if (!files.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Files className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground/80">
          {files.length} {files.length === 1 ? 'PDF selecionado' : 'PDFs selecionados'}
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {files.map((file, i) => (
          <div
            key={`${file.name}-${i}`}
            className="group relative rounded-xl overflow-hidden border border-border/60 bg-secondary/20 card-hover shadow-sm"
          >
            <div className="flex items-center gap-3 p-4">
              <div className="flex-shrink-0 rounded-lg bg-primary/10 border border-primary/20 p-3">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatSize(file.size)}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
