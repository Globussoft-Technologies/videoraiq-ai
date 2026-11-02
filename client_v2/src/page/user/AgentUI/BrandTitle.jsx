export default function BrandTitle() {
  return <div aria-label="Videora AI" className="agent-brand-title"><span className="agent-word" aria-hidden="true">{'VIDEORA'.split('').map((letter, i) => <span key={`${letter}-${i}`} style={{ '--agent-i': i }}>{letter}</span>)}</span><span className="agent-ai-tag">AI</span></div>;
}
