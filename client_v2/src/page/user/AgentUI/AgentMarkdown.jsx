import { Check, Copy } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';
import { downloadAgentReport } from './AgentExport';
import { agentApi } from './agentApi';
import { saveBlob, yieldToBrowser } from './downloadUtils.js';

const calloutKinds = new Set(['important', 'warning', 'success', 'error', 'info', 'tip', 'note']);

// Tool output occasionally wraps a record after its timestamp or before a
// comma. Those are soft wraps, not separate pieces of information, so keep
// each incident readable as one flowing list item.
function normalizeRecordWraps(text) {
  return String(text || '')
    .replace(/(\d{4}-\d{2}-\d{2}\s+\d{1,2}(?::\d{2})?)\s*\n\s*,\s*/g, '$1 — ')
    .replace(/([^\n])\n\s*,\s*/g, '$1, ');
}

// Directives are parsed as Markdown nodes. Only the explicit names below become elements.
function remarkAgentExtensions() {
  return (tree) => {
    const walk = (parent) => {
      if (!parent.children) return;
      parent.children = parent.children.flatMap((node) => {
        // Long backend identifiers are implementation details, not useful answer text.
        // Leave fenced code examples intact.
        if (node.type === 'inlineCode' && /^[a-f\d]{32,64}$/i.test(node.value)) return [];
        if (node.type === 'text') {
          node.value = node.value.replace(/\b[a-f\d]{32,64}\b/gi, '').replace(/\(\s*\)/g, '').replace(/ {2,}/g, ' ');
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
    };
    walk(tree);
  };
}

const remarkPlugins = [remarkGfm, remarkMath, remarkDirective, remarkAgentExtensions];
const rehypePlugins = [[rehypeKatex, { strict: 'ignore', throwOnError: false, trust: false }]];

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

function MarkdownLink({ href, children, node, exportContext, ...props }) {
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
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
    if (downloading) return;
    setDownloading(true);
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
      // Prefer the local formatter whenever the answer includes a resolved
      // period. This prevents a missing/HTML backend response from being
      // saved as the requested .pdf/.xlsx/.csv file.
      if (exportContext) {
        await downloadAgentReport(exportContext, format);
        return;
      }
      if (report?.[1] === 'reports') {
        const [reportId, fileName] = report[2].split('/');
        const file = await agentApi.reportFile(reportId, fileName);
        saveBlob(file, fileName);
        return;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      const file = await response.blob();
      const header = await file.slice(0, 512).text();
      const valid = file.size && !/html|json/i.test(file.type) && (
        format === 'pdf' ? header.startsWith('%PDF-')
          : format === 'xlsx' ? header.startsWith('PK\x03\x04')
            : !/^\s*[<{\[]/.test(header)
      );
      if (!valid) throw new Error();
      const fileName = /\.(pdf|csv|xlsx)$/i.test(basename) ? basename : `${basename || 'agent-report'}.${format}`;
      saveBlob(file, fileName);
    } catch {
      setDownloadError(isRelative && !exportOrigin
        ? 'The report file was not found on this site. Check the agent export host.'
        : 'Could not download the report. Try generating it again.');
    } finally {
      setDownloading(false);
    }
  };

  return <>
    <a {...props} href={destination}
      onClick={isExport ? download : undefined}
      download={isExport ? true : undefined}
      aria-busy={isExport ? downloading : undefined}
      aria-disabled={isExport && downloading ? true : undefined}
      target={/^https?:\/\//i.test(destination || '') ? '_blank' : undefined}
      rel="noopener noreferrer nofollow">{children}</a>
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
  const components = useMemo(() => ({
    ...baseComponents,
    a: (props) => <MarkdownLink {...props} exportContext={exportContext} />,
    code: ({ children, className, node, ...props }) => <code {...props} className={className || 'agent-md-inline-code'}>{children}</code>,
    pre: ({ children }) => <CodeBlock className={children?.props?.className} theme={theme}>{children?.props?.children}</CodeBlock>,
  }), [theme, exportContext]);
  return <div className="agent-message-text agent-markdown" dir="auto"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components} skipHtml>{normalizeRecordWraps(text)}</ReactMarkdown></div>;
}

export default memo(AgentMarkdown);
