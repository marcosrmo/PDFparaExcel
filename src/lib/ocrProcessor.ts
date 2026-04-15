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

export interface CancellationToken {
  cancelled: boolean;
}

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
  // Pessoa
  nome: 'Nome', name: 'Nome', cliente: 'Nome', comprador: 'Nome', proprietario: 'Nome',
  segurado: 'Nome', paciente: 'Nome', funcionario: 'Nome', colaborador: 'Nome',
  vendedor: 'Vendedor', responsavel: 'Responsável', titular: 'Titular',
  socio: 'Sócio', representante: 'Representante', diretor: 'Diretor',
  nascimento: 'Nascimento', dtnasc: 'Nascimento', datanasc: 'Nascimento',
  naturalidade: 'Naturalidade', nacionalidade: 'Nacionalidade',
  sexo: 'Sexo', genero: 'Sexo', estadocivil: 'Estado Civil',
  profissao: 'Profissão', ocupacao: 'Profissão', cargo: 'Cargo',
  // Contato — Telefone fixo e Celular em colunas separadas
  tel: 'Telefone', telefone: 'Telefone', fone: 'Telefone',
  phone: 'Telefone', ramal: 'Ramal', fax: 'Fax',
  celular: 'Celular', cel: 'Celular', movel: 'Celular', mobile: 'Celular',
  whatsapp: 'WhatsApp', wpp: 'WhatsApp', contato: 'Contato',
  email: 'Email', 'e-mail': 'Email', mail: 'Email', correio: 'Email',
  site: 'Site', website: 'Site', url: 'Site',
  // Documentos pessoais
  cpf: 'CPF', cnpj: 'CNPJ', rg: 'RG', cnh: 'CNH', ctps: 'CTPS',
  pis: 'PIS', pasep: 'PIS', nit: 'NIT', matricula: 'Matrícula',
  documento: 'Documento', doc: 'Documento', identidade: 'RG', habilitacao: 'CNH',
  passaporte: 'Passaporte', titulo: 'Título Eleitor',
  // Empresa
  empresa: 'Empresa', razaosocial: 'Razão Social', nomefantasia: 'Nome Fantasia',
  fantasia: 'Nome Fantasia', fornecedor: 'Fornecedor', fabricante: 'Fabricante',
  transportadora: 'Transportadora', parceiro: 'Parceiro',
  // Data/Hora
  data: 'Data', date: 'Data', dt: 'Data', dia: 'Data',
  dataemissao: 'Data Emissão', dataentrega: 'Data Entrega',
  prazo: 'Prazo', vencimento: 'Vencimento', entrega: 'Entrega',
  validade: 'Validade', hora: 'Hora', horario: 'Horário',
  // Endereço — todas as variações sem acento mapeadas
  endereco: 'Endereço', logradouro: 'Endereço', address: 'Endereço',
  rua: 'Rua', av: 'Avenida', avenida: 'Avenida', alameda: 'Alameda',
  travessa: 'Travessa', estrada: 'Estrada', rodovia: 'Rodovia',
  numero: 'Número', nro: 'Número', complemento: 'Complemento', apto: 'Complemento',
  bairro: 'Bairro', distrito: 'Distrito', setor: 'Setor',
  cidade: 'Cidade', municipio: 'Cidade', localidade: 'Cidade', city: 'Cidade',
  // UF/Estado: uf, estado, provincia todos → UF
  estado: 'UF', uf: 'UF', provincia: 'UF', pais: 'País', country: 'País',
  cep: 'CEP', zip: 'CEP',
  // Produto / Objeto — inclui aliases com e sem acento e variações de digitação
  produto: 'Produto', product: 'Produto', mercadoria: 'Produto',
  item: 'Item', intem: 'Item', itens: 'Item', items: 'Item',
  servico: 'Serviço', bem: 'Bem', ativo: 'Ativo',
  cor: 'Cor', color: 'Cor', colour: 'Cor',
  tamanho: 'Tamanho', tam: 'Tamanho', size: 'Tamanho', medida: 'Medida',
  peso: 'Peso', largura: 'Largura', altura: 'Altura', comprimento: 'Comprimento',
  quantidade: 'Quantidade', qtd: 'Quantidade', qt: 'Quantidade', qtde: 'Quantidade', qty: 'Quantidade',
  unidade: 'Unidade', un: 'Unidade', und: 'Unidade',
  // Financeiro
  valor: 'Valor', preco: 'Preço', price: 'Preço', total: 'Total',
  subtotal: 'Subtotal', custo: 'Custo', desconto: 'Desconto', frete: 'Frete',
  acrescimo: 'Acréscimo', juros: 'Juros', multa: 'Multa',
  salario: 'Salário', remuneracao: 'Salário', rendimento: 'Rendimento',
  // Identificadores
  codigo: 'Código', cod: 'Código', code: 'Código', id: 'ID',
  pedido: 'Pedido', ordem: 'Ordem', protocolo: 'Protocolo', processo: 'Processo',
  nota: 'Nota Fiscal', nf: 'Nota Fiscal', nfe: 'NF-e', serie: 'Série', chave: 'Chave',
  contrato: 'Contrato', apolice: 'Apólice', sinistro: 'Sinistro',
  // Produto/Objeto (atributos)
  marca: 'Marca', modelo: 'Modelo', referencia: 'Referência', sku: 'SKU',
  categoria: 'Categoria', tipo: 'Tipo', status: 'Status', situacao: 'Situação',
  descricao: 'Descrição', obs: 'Observação', observacao: 'Observação',
  especificacao: 'Especificação', caracteristica: 'Característica',
  lote: 'Lote', fabricacao: 'Fabricação', garantia: 'Garantia',
  // Pagamento
  pagamento: 'Pagamento', forma: 'Forma Pagamento', parcelas: 'Parcelas',
  banco: 'Banco', agencia: 'Agência', conta: 'Conta', pix: 'PIX',
  boleto: 'Boleto', cartao: 'Cartão',
};

const CONTEXT_KEYWORDS = new Set(Object.keys(LABEL_SYNONYMS));

// UFs brasileiras válidas
const VALID_UF = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);

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

function detectRG(text: string): string {
  const m = text.match(/\b\d{1,2}\.?\d{3}\.?\d{3}[-]?[\dXx]\b/g);
  if (!m) return '';
  const valid = m.find(v => {
    const d = v.replace(/\D/g, '');
    return d.length >= 7 && d.length <= 9;
  });
  return valid || '';
}

function detectUF(text: string): string {
  const m = text.match(/\b([A-Z]{2})\b/g);
  if (!m) return '';
  return m.find(uf => VALID_UF.has(uf)) || '';
}

function detectCompany(text: string): string {
  const m = text.match(
    /([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][A-Za-záàâãéèêíïóôõöúçñ\s&,\.\-]{3,60}?(?:Ltda\.?|S\.?A\.?|S\.?A\.?S\.?|ME\b|EIRELI\b|EPP\b|SS\b|SC\b|LTDA\b|SA\b))/g
  );
  if (!m) return '';
  return m[0].trim();
}

function detectName(text: string): string {
  // Nomes em caixa alta (ex: JOÃO SILVA)
  const upper = text.match(/([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,}(?:\s+[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]{2,})+)/g);
  // Nomes em capitalização normal (ex: João Silva)
  const proper = text.match(
    /\b([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ]{1,}(?:\s+(?:da?|de|do|dos|das|e|[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ][a-záàâãéèêíïóôõöúçñ]{1,})){1,6})\b/g
  );

  const candidates = [
    ...(upper || []).filter(s => s.length >= 8 && s.split(' ').length >= 2),
    ...(proper || []).filter(s => s.length >= 8 && s.split(' ').length >= 2),
  ];

  if (!candidates.length) return '';
  return candidates.sort((a, b) => b.length - a.length)[0];
}

// ─── Separação de múltiplos campos na mesma linha ─────────────────────────────
// Resolve: "Cidade: Anápolis UF: MG" → [["Cidade","Anápolis"], ["UF","MG"]]
// Aceita QUALQUER token-palavra seguido de : ou = — não exige dicionário.
// Ativado quando há 2+ pares na mesma linha (1 par sozinho é tratado no step 2).

function parseMultipleKVsFromLine(line: string): Array<[string, string]> {
  // Captura qualquer palavra (com letras, pontos, hífen) seguida de : ou =
  // O separador pode ser tanto : quanto =
  const labelRe = /([A-Za-záàâãéèêíïóôõöúçñ][A-Za-záàâãéèêíïóôõöúçñ\-\.]{0,35})\s*[:=]\s*/g;
  const positions: Array<{ label: string; valueStart: number; matchStart: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(line)) !== null) {
    const label = m[1].trim();
    // Descarta tokens puramente numéricos ou muito curtos (1 char) para evitar falsos positivos
    if (label.length < 2 || /^\d+$/.test(label)) continue;
    positions.push({
      label,
      valueStart: m.index + m[0].length,
      matchStart: m.index,
    });
  }

  // Só aplica divisão se houver 2 ou mais pares na linha
  if (positions.length < 2) return [];

  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].valueStart;
    const end = i + 1 < positions.length ? positions[i + 1].matchStart : line.length;
    let value = line.slice(start, end).replace(/[,;]\s*$/, '').trim();
    if (value) pairs.push([positions[i].label, value]);
  }

  return pairs;
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

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // ── 1. Tenta separar múltiplos KV na mesma linha (ex: "Cidade: Anápolis, UF: MG")
    //      `:` e `=` são os separadores primários — verificados antes de qualquer outra lógica
    const multiPairs = parseMultipleKVsFromLine(line);
    if (multiPairs.length >= 2) {
      for (const [lbl, val] of multiPairs) {
        if (lbl.length >= 1 && lbl.length <= 40 && !/^\d+$/.test(lbl)) {
          addField(lbl, val);
        }
      }
      continue;
    }

    // ── 2. KV simples com valor na mesma linha: "Chave: Valor" ou "Chave = Valor"
    //      Prioridade máxima para separadores `:` e `=`
    const kvMatch = line.match(/^(.{1,50}?)\s*[:=]\s*(.+)$/);
    if (kvMatch) {
      const rawLabel = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (rawLabel.length >= 1 && rawLabel.length <= 40 && !/^\d+$/.test(rawLabel)) {
        addField(rawLabel, value);
        continue;
      }
    }

    // ── 2b. Rótulo sozinho na linha (ex: "cidade:") + valor na próxima linha
    //       Suporta o padrão: "cidade:\nanápolis" — aceita : ou = como separador,
    //       qualquer token (não exige dicionário)
    const labelOnlyMatch = line.match(/^([A-Za-záàâãéèêíïóôõöúçñ][A-Za-záàâãéèêíïóôõöúçñ\s\-\.]{1,35})\s*[:=]\s*$/);
    if (labelOnlyMatch) {
      const rawLabel = labelOnlyMatch[1].trim();
      if (rawLabel.length >= 2 && li + 1 < lines.length) {
        const nextLine = lines[li + 1].trim();
        // Próxima linha não pode ser outro rótulo
        const nextIsLabel = /^(.{1,50}?)\s*[:=]\s*(.*)$/.test(nextLine);
        if (!nextIsLabel && nextLine.length > 0 && nextLine.length <= 100) {
          addField(rawLabel, nextLine);
          li++; // pula a linha do valor
          continue;
        }
      }
    }

    // ── 3. Padrões automáticos sem rótulo explícito
    const cnpj = detectCNPJ(line);
    if (cnpj && !fields['CNPJ']) { fields['CNPJ'] = cnpj; continue; }

    const cpf = detectCPF(line);
    if (cpf && !fields['CPF']) { fields['CPF'] = cpf; continue; }

    const cep = detectCEP(line);
    if (cep && !fields['CEP']) { fields['CEP'] = cep; continue; }

    const phone = detectPhone(line);
    if (phone && !fields['Telefone']) { fields['Telefone'] = phone; continue; }

    const email = detectEmail(line);
    if (email && !fields['Email']) { fields['Email'] = email; continue; }

    const money = detectMoney(line);
    if (money && !fields['Valor']) { fields['Valor'] = money; continue; }

    const date = detectDate(line);
    if (date && !fields['Data']) { fields['Data'] = date; continue; }

    const rg = detectRG(line);
    if (rg && !fields['RG'] && !fields['CPF']) { fields['RG'] = rg; continue; }

    const uf = detectUF(line);
    if (uf && !fields['UF']) { fields['UF'] = uf; }

    // ── 4. Keyword no início da linha sem separador: "cidade Anápolis"
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

  // ── 5. Fallbacks: entidades não detectadas via rótulo
  if (!fields['Nome']) {
    const name = detectName(block);
    if (name) fields['Nome'] = name;
  }

  if (!fields['Empresa'] && !fields['Razão Social']) {
    const company = detectCompany(block);
    if (company) fields['Empresa'] = company;
  }

  if (!fields['RG'] && !fields['CPF']) {
    const rg = detectRG(block);
    if (rg) fields['RG'] = rg;
  }

  if (!fields['UF']) {
    const uf = detectUF(block);
    if (uf) fields['UF'] = uf;
  }

  return fields;
}

// ─── Chaves âncora que identificam início de nova entidade ───────────────────
// Quando uma dessas chaves aparece pela segunda vez num mesmo bloco,
// o bloco é dividido, garantindo que cada linha do Excel = 1 entidade.

const ENTITY_ANCHOR_KEYS = new Set([
  'nome', 'name', 'cliente', 'comprador', 'segurado', 'paciente',
  'funcionario', 'colaborador', 'cpf', 'cnpj',
  'empresa', 'razaosocial', 'nomefantasia',
]);

function splitBlockByEntities(block: string): string[] {
  const lines = block.split('\n');
  const segments: string[][] = [];
  let current: string[] = [];
  let anchorsSeen = new Set<string>();

  for (const line of lines) {
    // Detecta se a linha começa com uma chave âncora seguida de : ou =
    const kvMatch = line.match(/^(.{1,50}?)\s*[:=]\s*/);
    if (kvMatch) {
      const key = normalizeKey(kvMatch[1]);
      if (ENTITY_ANCHOR_KEYS.has(key)) {
        if (anchorsSeen.has(key) && current.length > 0) {
          // Nova entidade detectada — inicia novo segmento
          segments.push(current);
          current = [line];
          anchorsSeen = new Set([key]);
          continue;
        }
        anchorsSeen.add(key);
      }
    }
    current.push(line);
  }
  if (current.length > 0) segments.push(current);
  return segments.map(s => s.join('\n').trim()).filter(s => s.length > 3);
}

// ─── Divisão em blocos de registros ─────────────────────────────────────────

function splitIntoBlocks(text: string): string[] {
  // Primeiro divide por linhas em branco ou separadores visuais
  const parts = text.split(/\n{2,}|[-=_]{3,}/);
  const rawBlocks = parts.map(p => p.trim()).filter(p => p.length > 3);

  // Depois subdivide cada bloco por entidades âncora repetidas
  const result: string[] = [];
  for (const block of rawBlocks) {
    const subBlocks = splitBlockByEntities(block);
    result.push(...subBlocks);
  }

  return result.length > 0 ? result : rawBlocks;
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

// ─── Gerar miniatura de baixa resolução para preview ─────────────────────────

async function renderPageThumbnail(
  page: pdfjsLib.PDFPageProxy,
  maxWidth = 300
): Promise<string> {
  const rawViewport = page.getViewport({ scale: 1.0 });
  const scale = maxWidth / rawViewport.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  const thumb = canvas.toDataURL('image/jpeg', 0.6);
  // Libera o canvas da memória
  canvas.width = 0;
  canvas.height = 0;
  return thumb;
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
  onProgress: ProgressCallback,
  cancellationToken?: CancellationToken
): Promise<ExtractedRecord[]> {
  const allRecords: ExtractedRecord[] = [];
  const worker = await getWorker();

  for (let i = 0; i < files.length; i++) {
    if (cancellationToken?.cancelled) break;

    const file = files[i];
    onProgress(i, files.length, file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdfDoc.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancellationToken?.cancelled) break;

        onProgress(i, files.length, `${file.name} — página ${pageNum}/${numPages}`);

        try {
          const page = await pdfDoc.getPage(pageNum);

          // 1. Tenta extrair texto nativo do PDF
          const nativeText = await extractNativeText(page);

          // 2. Gera miniatura leve para preview (baixa resolução)
          const pageImageUrl = await renderPageThumbnail(page, 300);

          let finalText = '';
          let confidence = 100;

          // 3. Se o texto nativo é substancial, usa ele diretamente (sem OCR)
          if (nativeText.length > 80) {
            finalText = nativeText;
            confidence = 100;
          } else {
            // Renderiza em alta resolução APENAS para OCR, depois libera da memória
            const hiResCanvas = await renderPageToCanvas(page, 2.0);
            const processedDataUrl = applyOcrPreprocessing(hiResCanvas);
            // Libera o canvas de alta resolução imediatamente
            hiResCanvas.width = 0;
            hiResCanvas.height = 0;

            const { data } = await worker.recognize(processedDataUrl);
            const ocrText = normalizeOcrText(data.text);

            if (nativeText.length > 30) {
              finalText = [nativeText, ocrText].join('\n');
              confidence = Math.round((100 + data.confidence) / 2);
            } else {
              finalText = ocrText;
              confidence = data.confidence;
            }
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
  // Pessoa
  'Nome', 'CPF', 'RG', 'CNH', 'PIS', 'Matrícula', 'Nascimento', 'Sexo', 'Estado Civil',
  'Naturalidade', 'Nacionalidade', 'Profissão', 'Cargo',
  // Empresa
  'Empresa', 'Razão Social', 'Nome Fantasia', 'CNPJ',
  // Contato
  'Telefone', 'Celular', 'WhatsApp', 'Fax', 'Email', 'Site', 'Contato',
  // Endereço
  'Endereço', 'Rua', 'Avenida', 'Número', 'Complemento', 'Bairro',
  'Cidade', 'UF', 'CEP', 'País',
  // Datas
  'Data', 'Data Emissão', 'Data Entrega', 'Nascimento', 'Validade', 'Prazo', 'Vencimento', 'Entrega',
  // Produto / Objeto
  'Produto', 'Serviço', 'Item', 'Código', 'SKU', 'Referência', 'Marca', 'Modelo',
  'Cor', 'Tamanho', 'Medida', 'Peso', 'Quantidade', 'Unidade',
  'Largura', 'Altura', 'Comprimento', 'Série', 'Lote', 'Fabricação', 'Garantia',
  'Especificação', 'Característica', 'Descrição', 'Categoria', 'Tipo',
  // Financeiro
  'Valor', 'Preço', 'Total', 'Subtotal', 'Desconto', 'Frete', 'Acréscimo', 'Juros', 'Multa',
  'Salário', 'Custo',
  // Documentos fiscais
  'Nota Fiscal', 'NF-e', 'Chave', 'Pedido', 'Ordem', 'Protocolo', 'Processo', 'Contrato', 'Apólice',
  // Pagamento
  'Pagamento', 'Forma Pagamento', 'Parcelas', 'Banco', 'Agência', 'Conta', 'PIX', 'Boleto', 'Cartão',
  // Misc
  'Status', 'Situação', 'Observação', 'Responsável', 'Titular', 'Vendedor',
  'Fornecedor', 'Fabricante', 'Transportadora',
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
