import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

export interface ExtractedRecord {
  id: string;
  fileName: string;
  imageUrl: string;
  fields: Record<string, string>;
  rawText: string;
  confidence: number;
  hasError: boolean;
  blockIndex: number;
  pageNumber?: number;
}

export type ProgressCallback = (current: number, total: number, fileName: string) => void;

// ─── Normalização de texto ───────────────────────────────────────────────────

function normalizeOcrText(text: string): string {
  return text
    .replace(/\|/g, 'l')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s{2,}/g, ' ')
    .replace(/[«»]/g, '')
    .trim();
}

// ─── Mapa de sinônimos de rótulos ────────────────────────────────────────────

const LABEL_SYNONYMS: Record<string, string> = {
  nome: 'Nome', name: 'Nome', cliente: 'Nome', comprador: 'Nome',
  vendedor: 'Vendedor', responsavel: 'Responsável', titular: 'Titular',
  tel: 'Telefone', telefone: 'Telefone', fone: 'Telefone', celular: 'Telefone',
  cel: 'Telefone', whatsapp: 'WhatsApp', wpp: 'WhatsApp', contato: 'Contato',
  phone: 'Telefone', ramal: 'Ramal',
  email: 'Email', 'e-mail': 'Email', mail: 'Email', correio: 'Email',
  cpf: 'CPF', cnpj: 'CNPJ', rg: 'RG', documento: 'Documento', doc: 'Documento',
  data: 'Data', date: 'Data', dt: 'Data', dia: 'Data',
  prazo: 'Prazo', vencimento: 'Vencimento', entrega: 'Entrega',
  nascimento: 'Nascimento', validade: 'Validade', hora: 'Hora',
  endereco: 'Endereço', logradouro: 'Endereço',
  rua: 'Rua', av: 'Avenida', avenida: 'Avenida', alameda: 'Alameda',
  travessa: 'Travessa', estrada: 'Estrada', rodovia: 'Rodovia',
  numero: 'Número', nro: 'Número', complemento: 'Complemento',
  bairro: 'Bairro', distrito: 'Distrito', setor: 'Setor',
  cidade: 'Cidade', municipio: 'Cidade', localidade: 'Cidade', city: 'Cidade',
  estado: 'Estado', uf: 'UF', pais: 'País', country: 'País',
  cep: 'CEP', zip: 'CEP',
  produto: 'Produto', item: 'Item', mercadoria: 'Produto', product: 'Produto',
  cor: 'Cor', color: 'Cor', colour: 'Cor',
  tamanho: 'Tamanho', tam: 'Tamanho', size: 'Tamanho', medida: 'Medida',
  peso: 'Peso', largura: 'Largura', altura: 'Altura', comprimento: 'Comprimento',
  quantidade: 'Quantidade', qtd: 'Quantidade', qt: 'Quantidade', qtde: 'Quantidade', qty: 'Quantidade',
  valor: 'Valor', preco: 'Preço', price: 'Preço', total: 'Total',
  subtotal: 'Subtotal', custo: 'Custo', desconto: 'Desconto', frete: 'Frete',
  descricao: 'Descrição', obs: 'Observação', observacao: 'Observação',
  codigo: 'Código', cod: 'Código', code: 'Código', id: 'ID',
  pedido: 'Pedido', ordem: 'Ordem', protocolo: 'Protocolo',
  nota: 'Nota Fiscal', nf: 'Nota Fiscal', nfe: 'NF-e', serie: 'Série',
  marca: 'Marca', modelo: 'Modelo', referencia: 'Referência', sku: 'SKU',
  categoria: 'Categoria', tipo: 'Tipo', status: 'Status', situacao: 'Situação',
  pagamento: 'Pagamento', forma: 'Forma Pagamento', parcelas: 'Parcelas',
  banco: 'Banco', agencia: 'Agência', conta: 'Conta',
};

const CONTEXT_KEYWORDS = new Set(Object.keys(LABEL_SYNONYMS));

function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeKey(raw: string): string {
  return removeAccents(raw.toLowerCase().trim()).replace(/[^a-z0-9]/g, '');
}

function normalizeLabel(raw: string): string {
  const key = normalizeKey(raw);
  if (LABEL_SYNONYMS[key]) return LABEL_SYNONYMS[key];
  return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Detectores de padrões ───────────────────────────────────────────────────

function detectPhone(text: string): string {
  const m =
    text.match(/\+?\d{1,3}?\s*\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/g) ||
    text.match(/\b\d{10,13}\b/g);
  if (!m) return '';
  const best = m.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0];
  const digits = best.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13 ? best.trim() : '';
}

function detectDate(text: string): string {
  const m = text.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/);
  return m ? m[0] : '';
}

function detectEmail(text: string): string {
  const m = text.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-z]{2,}\b/);
  return m ? m[0] : '';
}

function detectCPF(text: string): string {
  const m = text.match(/\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g);
  if (!m) return '';
  const valid = m.find(v => v.replace(/\D/g, '').length === 11);
  return valid || '';
}

function detectCNPJ(text: string): string {
  const m = text.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\.?\d{4}-?\d{2}\b/g);
  if (!m) return '';
  const valid = m.find(v => v.replace(/\D/g, '').length === 14);
  return valid || '';
}

function detectCEP(text: string): string {
  const m = text.match(/\b\d{5}-?\d{3}\b/);
  return m ? m[0] : '';
}

function detectMoney(text: string): string {
  const m = text.match(/R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{1,3}(?:\.\d{3})*,\d{2}/);
  return m ? m[0].trim() : '';
}

function detectName(text: string): string {
  const m = text.match(/([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,}(?:\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,})+)/g);
  if (!m) return '';
  return m
    .map(s => s.trim())
    .filter(s => s.length >= 5)
    .sort((a, b) => b.length - a.length)[0] || '';
}

// ─── Extração de campos de um bloco de texto ─────────────────────────────────

function extractFieldsFromBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 1);

  const addField = (label: string, value: string) => {
    const norm = normalizeLabel(label);
    if (norm && value && !fields[norm]) {
      fields[norm] = value.trim();
    }
  };

  for (const line of lines) {
    const kvMatch = line.match(/^(.{1,50}?)\s*[:=]\s*(.+)$/);
    if (kvMatch) {
      const rawLabel = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (rawLabel.length >= 1 && rawLabel.length <= 40 && !/^\d+$/.test(rawLabel)) {
        addField(rawLabel, value);
        continue;
      }
    }

    const phone = detectPhone(line);
    if (phone && !fields['Telefone']) { fields['Telefone'] = phone; continue; }

    const cnpj = detectCNPJ(line);
    if (cnpj && !fields['CNPJ']) { fields['CNPJ'] = cnpj; continue; }

    const cpf = detectCPF(line);
    if (cpf && !fields['CPF']) { fields['CPF'] = cpf; continue; }

    const cep = detectCEP(line);
    if (cep && !fields['CEP']) { fields['CEP'] = cep; continue; }

    const email = detectEmail(line);
    if (email && !fields['Email']) { fields['Email'] = email; continue; }

    const money = detectMoney(line);
    if (money && !fields['Valor']) { fields['Valor'] = money; continue; }

    const date = detectDate(line);
    if (date && !fields['Data']) { fields['Data'] = date; continue; }

    const keywordMatch = line.match(/^([a-záàâãéèêíïóôõöúçñ]{2,20})\s+(.{1,80})$/i);
    if (keywordMatch) {
      const kw = normalizeKey(keywordMatch[1]);
      if (CONTEXT_KEYWORDS.has(kw)) {
        const label = normalizeLabel(keywordMatch[1]);
        const value = keywordMatch[2].trim();
        if (!fields[label]) addField(keywordMatch[1], value);
        continue;
      }
    }
  }

  if (!fields['Nome']) {
    const name = detectName(block);
    if (name) fields['Nome'] = name;
  }

  return fields;
}

// ─── Divisão em blocos de registros ─────────────────────────────────────────

function splitIntoBlocks(text: string): string[] {
  const parts = text.split(/\n{2,}|[-=_]{3,}/);
  const blocks = parts.map(p => p.trim()).filter(p => p.length > 3);
  if (blocks.length === 1) return [blocks[0]];
  return blocks;
}

// ─── Renderizar página PDF em canvas ─────────────────────────────────────────

async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale = 2.0
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

// ─── Aplicar pré-processamento para OCR (contraste/grayscale) ───────────────

function applyOcrPreprocessing(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const contrast = 1.8;
    const adjusted = ((gray / 255 - 0.5) * contrast + 0.5) * 255;
    const val = Math.max(0, Math.min(255, adjusted));
    d[i] = d[i + 1] = d[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ─── Extrair texto nativo do PDF ─────────────────────────────────────────────

async function extractNativeText(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();
  return content.items
    .filter((item): item is pdfjsLib.TextItem => 'str' in item)
    .map(item => item.str)
    .join(' ')
    .replace(/\s{2,}/g, '\n')
    .trim();
}

// ─── Worker Tesseract ────────────────────────────────────────────────────────

let workerInstance: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerInstance) {
    workerInstance = await createWorker('por');
  }
  return workerInstance;
}

// ─── Processamento principal de PDFs ─────────────────────────────────────────

export async function processPDFs(
  files: File[],
  onProgress: ProgressCallback
): Promise<ExtractedRecord[]> {
  const allRecords: ExtractedRecord[] = [];
  const worker = await getWorker();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i, files.length, file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdfDoc.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        onProgress(i, files.length, `${file.name} — página ${pageNum}/${numPages}`);

        try {
          const page = await pdfDoc.getPage(pageNum);

          // 1. Tenta extrair texto nativo do PDF
          const nativeText = await extractNativeText(page);

          // 2. Renderiza a página para canvas (para preview e OCR)
          const canvas = await renderPageToCanvas(page, 2.0);
          const pageImageUrl = canvas.toDataURL('image/png');

          let finalText = '';
          let confidence = 100;

          // 3. Se o texto nativo é substancial, usa ele; senão, aplica OCR
          if (nativeText.length > 80) {
            finalText = nativeText;
            confidence = 100;
          } else {
            const processedDataUrl = applyOcrPreprocessing(canvas);
            const { data } = await worker.recognize(processedDataUrl);
            finalText = normalizeOcrText(data.text);
            confidence = data.confidence;
          }

          // 4. Tenta combinar: texto nativo + OCR (para PDFs com imagens embutidas)
          if (nativeText.length > 30 && nativeText.length <= 80) {
            const processedDataUrl = applyOcrPreprocessing(canvas);
            const { data } = await worker.recognize(processedDataUrl);
            const ocrText = normalizeOcrText(data.text);
            finalText = [nativeText, ocrText].join('\n');
            confidence = Math.round((100 + data.confidence) / 2);
          }

          const blocks = splitIntoBlocks(finalText);
          let addedAny = false;

          for (let b = 0; b < blocks.length; b++) {
            const fields = extractFieldsFromBlock(blocks[b]);
            if (Object.keys(fields).length === 0) continue;

            allRecords.push({
              id: `${Date.now()}-${i}-${pageNum}-${b}`,
              fileName: file.name,
              imageUrl: pageImageUrl,
              fields,
              rawText: blocks[b],
              confidence,
              hasError: false,
              blockIndex: b + 1,
              pageNumber: pageNum,
            });
            addedAny = true;
          }

          if (!addedAny) {
            allRecords.push({
              id: `${Date.now()}-${i}-${pageNum}-0`,
              fileName: file.name,
              imageUrl: pageImageUrl,
              fields: {},
              rawText: finalText || '(sem texto detectado)',
              confidence,
              hasError: true,
              blockIndex: 0,
              pageNumber: pageNum,
            });
          }
        } catch (pageErr) {
          console.error(`Erro na página ${pageNum} de ${file.name}:`, pageErr);
        }
      }
    } catch (err) {
      console.error(`Erro ao processar ${file.name}:`, err);
      allRecords.push({
        id: `${Date.now()}-${i}-err`,
        fileName: file.name,
        imageUrl: '',
        fields: {},
        rawText: `Erro: ${err instanceof Error ? err.message : 'Falha ao ler PDF'}`,
        confidence: 0,
        hasError: true,
        blockIndex: 0,
      });
    }
  }

  onProgress(files.length, files.length, '');
  return allRecords;
}

export function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
}

// ─── Utilitário: todas as colunas únicas de uma lista de registros ──────────

const PRIORITY_COLUMNS = [
  'Nome', 'CPF', 'CNPJ', 'RG', 'Telefone', 'WhatsApp', 'Contato',
  'Email', 'Data', 'Nascimento', 'Prazo', 'Vencimento', 'Validade',
  'Endereço', 'Rua', 'Avenida', 'Número', 'Complemento', 'Bairro',
  'Cidade', 'UF', 'Estado', 'CEP', 'País',
  'Produto', 'Item', 'Código', 'SKU', 'Referência', 'Marca', 'Modelo',
  'Cor', 'Tamanho', 'Medida', 'Peso', 'Quantidade',
  'Valor', 'Preço', 'Total', 'Subtotal', 'Desconto', 'Frete',
  'Nota Fiscal', 'NF-e', 'Pedido', 'Protocolo',
  'Pagamento', 'Forma Pagamento', 'Parcelas', 'Banco', 'Agência', 'Conta',
  'Descrição', 'Observação', 'Tipo', 'Categoria', 'Status', 'Situação',
];

export function getAllColumns(records: ExtractedRecord[]): string[] {
  const allKeys = new Set<string>();
  for (const r of records) {
    Object.keys(r.fields).forEach(k => allKeys.add(k));
  }

  const sorted = PRIORITY_COLUMNS.filter(p => allKeys.has(p));
  const remaining = Array.from(allKeys)
    .filter(k => !PRIORITY_COLUMNS.includes(k))
    .sort((a, b) => a.localeCompare(b));

  return [...sorted, ...remaining];
}
