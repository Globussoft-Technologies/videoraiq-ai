import { Check, Copy, Download, LoaderCircle } from 'lucide-react';
import { createContext, memo, useContext, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import moment from 'moment-timezone';
import { useTimezone } from '@/context/TimezoneContext';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import { downloadAgentReport } from './AgentExport';
import { agentApi } from './agentApi';
import CameraInventoryButton, { inventoryLink } from './CameraInventory';
import { saveBlob, yieldToBrowser } from './downloadUtils.js';

const calloutKinds = new Set(['important', 'warning', 'success', 'error', 'info', 'tip', 'note']);

// Tool output occasionally wraps a record after its timestamp or before a
// comma. Those are soft wraps, not separate pieces of information, so keep
// each incident readable as one flowing list item.
export function normalizeRecordWraps(text) {
  return String(text || '')
    // Example incident rows carry a backend record ID between the time and description.
    .replace(/(\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?),[ \t]*(?:Record ID:[ \t]*)?\x60?(?:[0-9a-f]{24}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\x60?(?=:)/gi, '$1')
    // Drop ID-only metadata lines before camera/NVR name resolution.
    .replace(/^[ \t]*(?:[-+*][ \t]+)?[*_\x60]*(?:(?:report|record|source|incident|device)[ \t]+)?ID[*_\x60]*[ \t]*:[ \t]*[*_\x60]*[ \t]*(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{24,64})(?:[ \t]*:[ \t]*[0-9a-f-]{24,64})?[*_\x60. \t]*(?:\r?\n|$)/gim, '')
    .replace(/[ \t]*\((?:(?:report|record|source|incident|device)[ \t]+)?ID[ \t]*:[ \t]*\x60?(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9a-f]{24,64})(?::[0-9a-f-]{24,64})?\x60?\s*\)/gi, '')
    // Source IDs are internal composite values such as UUID:UUID. Remove the
    // whole parenthesized value before individual ID replacement can expose
    // "record" placeholders in the rendered citation.
    // Hide internal composite source/report IDs while removing their whole
    // parenthesized value so no closing parenthesis is left behind.
    .replace(/(^[ \t]*[*_]{0,3}Source[*_]{0,3}:[^\r\n]*?)\s*\(((?:[0-9a-f]{8}-[0-9a-f-]{27,36}|[0-9a-f]{24})(?::(?:[0-9a-f]{8}-[0-9a-f-]{27,36}|[0-9a-f]{24}))?)\)/gim, '$1')
    // A blank line inside the citation can split it into separate paragraphs
    // before the inline Markdown cleanup gets a chance to join it.
    .replace(/(^[ \t]*[*_]{0,2}Source[*_]{0,2}:[^\r\n]*?)[ \t]+\(record(?:\s|<br\s*\/?>|\\(?=\r?\n))*(?:`?(?:[a-f\d]{24,64}|record|(?:Camera|NVR|Device) name unavailable)`?(?:\s|<br\s*\/?>|\\(?=\r?\n))*)?\)/gim, '$1')
    .replace(/(^[ \t]*[*_]{0,3}Source[*_]{0,3}:[^\r\n]*?)\s*\(\s*record\b[^\r\n)]*(?:\r?\n[ \t]*)?\)/gim, '$1')
    .replace(/(\d{4}-\d{2}-\d{2}\s+\d{1,2}(?::\d{2})?)\s*\n\s*,\s*/g, '$1 — ')
    // Model responses sometimes emit punctuation on its own wrapped line
    // (including a literal Markdown hard-break slash). Join it before parsing.
    .replace(/([^\r\n\\])(?:\\[ \t]*)?\r?\n[ \t]*(?=[,.;])/g, '$1');
}

// Directives are parsed as Markdown nodes. Only the explicit names below become elements.
function remarkAgentExtensions({ timezone } = {}) {
  return (tree, file) => {
    const walk = (parent) => {
      if (!parent.children) return;
      parent.children = parent.children.flatMap((node) => {
        // remark-directive reads timestamp seconds and offset minutes as directives.
        if (node.type === 'textDirective' && /^\d/.test(node.name) && node.position) {
          const { start, end } = node.position;
          return [{ type: 'text', value: String(file.value).slice(start.offset, end.offset) }];
        }
        if (node.type === 'text') {
          node.value = node.value
            .replace(/([^\r\n\\])(?:\\[ \t]*)?\r?\n[ \t]*(?=[,.;])/g, '$1')
            .replace(/[^\S\r\n]*\r?\n[^\S\r\n]*(?=[)\]])/g, '')
            .replace(/\(\s*\)/g, '')
            .replace(/ {2,}/g, ' ');
        }
        if (node.type === 'blockquote' && node.children?.[0]?.type === 'paragraph') {
          const first = node.children[0].children?.[0];
          const kind = first?.type === 'text' && /^\[!(IMPORTANT|WARNING|SUCCESS|ERROR|INFO|TIP|NOTE)\](?:\s|$)/i.exec(first.value);
          if (kind) {
            const name = kind[1].toLowerCase();
            node.data = { hName: 'aside', hProperties: { className: `agent-md-callout agent-md-${name}`, 'data-label': name } };
            first.value = first.value.slice(kind[0].length);
          }
        }
        if (node.type === 'paragraph' && node.children?.length === 1 && node.children[0].type === 'text') {
          const definition = /^([^\n]+)\n:\s+([^\n]+)$/.exec(node.children[0].value);
          if (definition) {
            node.data = { hName: 'dl' };
            node.children = [
              { type: 'emphasis', data: { hName: 'dt' }, children: [{ type: 'text', value: definition[1] }] },
              { type: 'emphasis', data: { hName: 'dd' }, children: [{ type: 'text', value: definition[2] }] },
            ];
          }
        }
        if (node.type === 'containerDirective') {
          const name = node.name.toLowerCase();
          if (calloutKinds.has(name)) {
            node.data = { hName: 'aside', hProperties: { className: `agent-md-callout agent-md-${name}`, 'data-label': name } };
          } else if (name === 'details') {
            const title = String(node.attributes?.title || 'Details');
            node.data = { hName: 'details', hProperties: { className: 'agent-md-details' } };
            node.children.unshift({ type: 'paragraph', data: { hName: 'summary' }, children: [{ type: 'text', value: title }] });
          }
        } else if (node.type === 'leafDirective' && node.name === 'kbd') {
          node.data = { hName: 'kbd' };
        }
        walk(node);
        if (node.type !== 'text' || !node.value) return [node];
        // Text-only extensions do not touch code, links, or raw HTML.
        const pattern = /(\+\+([^+\n]+)\+\+|==([^=\n]+)==|_\{([^}\n]+)\}|\^([^\^\n]+)\^|“([^”\n]+)”|"([^"\n]+)")/g;
        const parts = [];
        let last = 0;
        for (const match of node.value.matchAll(pattern)) {
          if (match.index > last) parts.push({ type: 'text', value: node.value.slice(last, match.index) });
          const [raw, , underline, highlight, sub, sup, smartQuote, quote] = match;
          const tag = underline ? 'u' : highlight ? 'mark' : sub ? 'sub' : sup ? 'sup' : 'strong';
          parts.push({ type: 'emphasis', data: { hName: tag, hProperties: tag === 'mark' ? { className: 'agent-md-highlight' } : {} }, children: [{ type: 'text', value: underline || highlight || sub || sup || smartQuote || quote }] });
          last = match.index + raw.length;
        }
        if (!parts.length) return [node];
        if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
        return parts;
      });
      if (parent.type === 'paragraph' || parent.type === 'emphasis' || parent.type === 'strong') {
        const inline = [];
        for (const node of parent.children) {
          if (node.type === 'text' && !node.value) continue;
          if (node.type === 'text' && /^\s*[,.;)\]]/.test(node.value) && inline.at(-1)?.type === 'break') {
            inline.pop();
          }
          const previous = inline.at(-1);
          if (node.type === 'text' && previous?.type === 'text') {
            previous.value += node.value;
          } else {
            inline.push(node);
          }
        }
        parent.children = inline.filter((node) => {
          if (node.type !== 'text') return true;
          node.value = node.value
            .replace(/\s*\(record\s*\)/gi, '')
            .replace(/\(\s*\)/g, '')
            .replace(/\s+(?=[)\]])/g, '')
            .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})\b/g, (timestamp) => {
              const time = moment.utc(timestamp, moment.ISO_8601, true);
              return timezone && time.isValid() ? time.tz(timezone).format('DD MMM YYYY, hh:mm:ss A') : timestamp;
            });
          return Boolean(node.value);
        });
      }
    };
    walk(tree);
  };
}

// Match what the reader sees after Markdown syntax and hidden HTML are removed.
function rehypeCleanSourceCitations() {
  function visibleParts(node) {
    if (node.type === 'text' || node.tagName === 'br') return [node];
    return (node.children || []).flatMap(visibleParts);
  }
  const visibleText = (parts) => parts.map((node) => node.value ?? '\n').join('');

  function walk(parent) {
    const children = parent.children || [];
    parent.children = children.filter((node, index) => {
      if (node.tagName !== 'p') {
        if (node.children) walk(node);
        return true;
      }
      const parts = visibleParts(node);
      const text = visibleText(parts);
      if (/^\s*\)\s*$/.test(text)) {
        const previous = children.slice(0, index).reverse().find((sibling) => sibling.type === 'element');
        if (previous?.tagName === 'p' && previous.emptyAgentRecordCitation) return false;
      }
      const suffix = /\s*\(record\s*(\))?\s*$/i.exec(text);
      if (!/^\s*Source\s*:/i.test(text) || !suffix) return true;
      if (!suffix[1]) {
        const next = children.slice(index + 1).find((sibling) => sibling.type === 'element');
        if (next?.tagName !== 'p' || !/^\s*\)\s*$/.test(visibleText(visibleParts(next)))) return true;
        node.emptyAgentRecordCitation = true;
      }
      let remaining = suffix.index;
      for (const part of parts) {
        if (part.tagName === 'br') {
          if (remaining <= 0) Object.assign(part, { type: 'text', value: '' });
          remaining -= 1;
        } else {
          const length = part.value.length;
          part.value = part.value.slice(0, Math.max(0, remaining));
          remaining -= length;
        }
      }
      return true;
    });
  }
  return walk;
}

const rehypePlugins = [
  rehypeCleanSourceCitations,
  [rehypeKatex, { strict: 'ignore', throwOnError: false, trust: false }],
];

function CodeBlock({ children, className = '', theme }) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const language = /language-([\w+-]+)/.exec(className)?.[1]?.toLowerCase() || 'text';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* Clipboard may be unavailable. */ }
  };
  return <div className="agent-md-codeblock">
    <div className="agent-md-codebar"><span>{language}</span><button type="button" onClick={copy} aria-label={copied ? 'Code copied' : 'Copy code'}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button></div>
    <SyntaxHighlighter language={language} style={theme === 'dark' ? oneDark : oneLight} customStyle={{ margin: 0, padding: '12px 14px', background: 'transparent', fontSize: '12px' }} codeTagProps={{ style: { fontFamily: 'inherit' } }} PreTag="div" useInlineStyles showLineNumbers={false}>{code}</SyntaxHighlighter>
  </div>;
}

const safeHref = (href) => /^(https?:\/\/|mailto:|\/|#)/i.test(href || '') ? href : undefined;

const exportOrigin = import.meta.env.VITE_AGENT_EXPORT_ORIGIN;

const ReportExportContext = createContext(null);

function MarkdownLink({ href, children, node, ...props }) {
  const exportContext = useContext(ReportExportContext);
  const pending = useRef(false);
  const [downloadError, setDownloadError] = useState('');
  const [phase, setPhase] = useState('');
  const downloading = phase === 'Preparing' || phase === 'Downloading';
  const safeUrl = safeHref(href);
  const path = safeUrl?.split(/[?#]/, 1)[0] || '';
  const report = safeUrl?.match(/^\/agent\/(reports|exports)\/([^?#]+\.(?:pdf|xlsx|csv))$/i);
  const linkText = String(children?.props?.children || children || '');
  const isExport = Boolean(report) || /\/(?:agent\/)?exports?\//i.test(path) || /\.(pdf|csv|xlsx)$/i.test(path) || /\b(?:download\s+)?(?:pdf|excel|xlsx|csv)\b/i.test(linkText);
  const isRelative = /^\/(?!\/)/.test(safeUrl || '');
  const destination = report ? `/api/agent/${report[1]}/${report[2]}` : isExport && isRelative && /^https?:\/\//i.test(exportOrigin || '')
    ? exportOrigin.replace(/\/+$/, '') + safeUrl
    : safeUrl;

  const download = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setPhase('Preparing');
    setDownloadError('');
    try {
      await yieldToBrowser();
      const url = new URL(destination, window.location.origin);
      const basename = decodeURIComponent(url.pathname.split('/').pop());
      const labels = { pdf: 'pdf', csv: 'csv', excel: 'xlsx', xlsx: 'xlsx' };
      const linkText = String(children?.props?.children || children || '');
      const format = /\.(pdf|csv|xlsx)$/i.exec(basename)?.[1].toLowerCase()
        || labels[linkText.match(/\b(pdf|excel|xlsx|csv)\b/i)?.[1]?.toLowerCase()]
        || labels[String(url.searchParams.get('format') || children).trim().toLowerCase()];
      if (!['pdf', 'csv', 'xlsx'].includes(format)) throw new Error();
      const storedReport = report?.[1].toLowerCase() === 'reports';
      const generate = async () => {
        setPhase('Preparing');
        await yieldToBrowser();
        await downloadAgentReport(exportContext, format);
      };
      const downloadFile = async () => {
        setPhase('Downloading');
        let file;
        if (storedReport) {
          const [reportId, fileName] = report[2].split('/');
          file = await agentApi.reportFile(reportId, decodeURIComponent(fileName));
        } else {
          const response = await fetch(url);
          if (!response.ok) throw new Error();
          file = await response.blob();
        }
        const header = await file.slice(0, 512).text();
        const valid = file.size && !/html|json/i.test(file.type) && (
          format === 'pdf' ? header.startsWith('%PDF-')
            : format === 'xlsx' ? header.startsWith('PK\x03\x04')
              : !/^\s*[<{\[]/.test(header)
        );
        if (!valid) throw new Error();
        const fileName = /\.(pdf|csv|xlsx)$/i.test(basename) ? basename : `${basename || 'agent-report'}.${format}`;
        saveBlob(file, fileName);
      };
      // Preserve the Agent PDF layout. Reuse stored spreadsheets when available.
      const localFirst = exportContext && (format === 'pdf' || !storedReport);
      try {
        await (localFirst ? generate() : downloadFile());
      } catch (error) {
        if (!exportContext || !storedReport) throw error;
        await (localFirst ? downloadFile() : generate());
      }
    } catch {
      setDownloadError('Could not download this report. Try generating it again.');
    } finally {
      setPhase('');
      pending.current = false;
    }
  };

  const inventory = href?.match(inventoryLink);
  if (inventory) return <CameraInventoryButton inventoryId={inventory[1]}>{children}</CameraInventoryButton>;

  return <>
    <a {...props} href={destination}
      className={isExport ? [props.className, 'agent-md-export-link', /pdf/i.test(path + linkText) ? 'export-pdf' : /xlsx|excel/i.test(path + linkText) ? 'export-xlsx' : 'export-csv'].filter(Boolean).join(' ') : props.className}
      onClick={isExport ? download : undefined}
      download={isExport ? true : undefined}
      aria-busy={isExport ? downloading : undefined}
      aria-disabled={isExport && downloading ? true : undefined}
      target={/^https?:\/\//i.test(destination || '') ? '_blank' : undefined}
      rel="noopener noreferrer nofollow">
      {isExport && (downloading
        ? <LoaderCircle size={13} className="agent-download-spinner" aria-hidden="true" />
        : <Download size={13} aria-hidden="true" />)}
      {isExport && /^excel$/i.test(linkText.trim()) ? 'XLSX' : children}
    </a>
    {downloadError && <span className="agent-download-error" role="alert">{downloadError}</span>}
  </>;
}

const baseComponents = {
  a: MarkdownLink,
  img: ({ alt }) => <span>{alt || ''}</span>,
  table: ({ children }) => <div className="agent-md-table-wrap" tabIndex={0}><table>{children}</table></div>,
  input: ({ type, node, ...props }) => type === 'checkbox' ? <input {...props} type="checkbox" disabled readOnly /> : null,
};

function AgentMarkdown({ text, theme, exportContext }) {
  const { timezone } = useTimezone();
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath, remarkDirective, [remarkAgentExtensions, { timezone }]], [timezone]);
  const components = useMemo(() => ({
    ...baseComponents,
    a: MarkdownLink,
    code: ({ children, className, node, ...props }) => <code {...props} className={className || 'agent-md-inline-code'}>{children}</code>,
    pre: ({ children }) => <CodeBlock className={children?.props?.className} theme={theme}>{children?.props?.children}</CodeBlock>,
  }), [theme]);
  const markdown = normalizeRecordWraps(text);
  return <ReportExportContext.Provider value={exportContext}><div className="agent-message-text agent-markdown" dir="auto"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components} skipHtml>{markdown}</ReactMarkdown></div></ReportExportContext.Provider>;
}

export default memo(AgentMarkdown);
